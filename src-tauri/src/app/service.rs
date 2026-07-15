#![allow(dead_code)]
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use chrono::Utc;

use crate::domain::{
    resolve_timezone, Alarm, AlarmDraft, AlarmLifecycle, AppSettings, DomainError, DomainResult,
    ErrorCode, ExecutionLog, LogFilter,
};

use super::{
    AlarmStore, CancelFlag, Clock, ConfigBackup, OutputChunkFn, ProcessRunner, Sleeper,
};

pub struct AlarmService {
    pub(crate) store: Arc<dyn AlarmStore>,
    pub(crate) runner: Arc<dyn ProcessRunner>,
    pub(crate) clock: Arc<dyn Clock>,
    pub(crate) backup: Arc<dyn ConfigBackup>,
    pub(crate) sleeper: Arc<dyn Sleeper>,
    /// Active run cancel tokens keyed by alarm id.
    pub(crate) active: Mutex<HashMap<String, Arc<CancelFlag>>>,
}

impl AlarmService {
    pub fn new(
        store: Arc<dyn AlarmStore>,
        runner: Arc<dyn ProcessRunner>,
        clock: Arc<dyn Clock>,
        backup: Arc<dyn ConfigBackup>,
        sleeper: Arc<dyn Sleeper>,
    ) -> Self {
        Self {
            store,
            runner,
            clock,
            backup,
            sleeper,
            active: Mutex::new(HashMap::new()),
        }
    }

    pub fn list_alarms(&self) -> DomainResult<Vec<Alarm>> {
        self.store.list_alarms()
    }

    pub fn get_alarm(&self, id: &str) -> DomainResult<Alarm> {
        self.store
            .get_alarm(id)?
            .ok_or_else(|| DomainError::new(ErrorCode::AlarmNotFound, "alarm not found"))
    }

    pub fn create_alarm(&self, draft: AlarmDraft) -> DomainResult<Alarm> {
        let alarm = Alarm::from_draft(draft)?;
        self.store.upsert_alarm(&alarm)?;
        self.sync_export()?;
        Ok(alarm)
    }

    pub fn update_alarm(&self, id: &str, draft: AlarmDraft) -> DomainResult<Alarm> {
        let mut alarm = self.get_alarm(id)?;
        alarm.apply_draft(draft)?;
        self.store.upsert_alarm(&alarm)?;
        self.sync_export()?;
        Ok(alarm)
    }

    pub fn delete_alarm(&self, id: &str) -> DomainResult<()> {
        let mut alarm = self.get_alarm(id)?;
        // If a previous run left a stale "running" flag (app crash), unlock then delete.
        if matches!(
            alarm.lifecycle,
            AlarmLifecycle::Running | AlarmLifecycle::Retrying { .. }
        ) {
            // Soft unlock: treat as idle so user is never stuck forever.
            alarm.mark_idle();
            self.store.upsert_alarm(&alarm)?;
        }
        self.store.delete_alarm(id)?;
        self.sync_export()?;
        Ok(())
    }

    pub fn set_enabled(&self, id: &str, enabled: bool) -> DomainResult<Alarm> {
        let mut alarm = self.get_alarm(id)?;
        alarm.set_enabled(enabled);
        self.store.upsert_alarm(&alarm)?;
        self.sync_export()?;
        Ok(alarm)
    }

    pub fn set_enabled_all(&self, enabled: bool) -> DomainResult<Vec<Alarm>> {
        let mut out = Vec::new();
        for mut alarm in self.store.list_alarms()? {
            alarm.set_enabled(enabled);
            self.store.upsert_alarm(&alarm)?;
            out.push(alarm);
        }
        self.sync_export()?;
        Ok(out)
    }

    pub fn list_logs(&self, filter: LogFilter) -> DomainResult<Vec<ExecutionLog>> {
        self.store.list_logs(&filter)
    }

    pub fn delete_log(&self, id: i64) -> DomainResult<()> {
        self.store.delete_log(id)
    }

    pub fn delete_logs(&self, ids: &[i64]) -> DomainResult<u64> {
        self.store.delete_logs(ids)
    }

    pub fn get_settings(&self) -> DomainResult<AppSettings> {
        self.store.get_settings()
    }

    pub fn schedule_timezone(&self) -> DomainResult<chrono_tz::Tz> {
        let settings = self.store.get_settings()?;
        resolve_timezone(settings.timezone())
    }

    pub fn next_trigger_utc(
        &self,
        id: &str,
    ) -> DomainResult<Option<chrono::DateTime<chrono::Utc>>> {
        let alarm = self.get_alarm(id)?;
        let tz = self.schedule_timezone()?;
        alarm
            .schedule
            .next_trigger_after_in_tz(chrono::Utc::now(), tz)
    }

    pub fn save_settings(&self, settings: AppSettings) -> DomainResult<AppSettings> {
        // Validate IANA / system token early.
        let _ = resolve_timezone(settings.timezone())?;
        self.store.save_settings(&settings)?;
        self.sync_export()?;
        Ok(settings)
    }

    pub fn check_binary(&self, binary: &str) -> DomainResult<Option<String>> {
        self.runner.which(binary)
    }

    pub fn backup_now(&self) -> DomainResult<String> {
        self.backup.backup_now()
    }

    pub fn list_backups(&self) -> DomainResult<Vec<String>> {
        self.backup.list_backups()
    }

    pub fn restore_backup(&self, name: &str) -> DomainResult<()> {
        self.backup.restore(name)
    }

    pub fn delete_backup(&self, name: &str) -> DomainResult<()> {
        self.backup.delete_backup(name)
    }

    /// Request cooperative cancel for a running alarm. Returns true if a run was active.
    pub fn cancel_alarm_run(&self, id: &str) -> DomainResult<bool> {
        let map = self.active.lock().unwrap();
        if let Some(flag) = map.get(id) {
            flag.request();
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn is_alarm_running(&self, id: &str) -> bool {
        self.active.lock().unwrap().contains_key(id)
    }

    pub fn run_alarm_now_blocking(&self, id: &str) -> DomainResult<ExecutionLog> {
        self.run_alarm_once(id)
    }

    /// Run alarm once with retry policy. Uses injected sleeper between retries.
    pub fn run_alarm_once(&self, id: &str) -> DomainResult<ExecutionLog> {
        self.run_alarm_once_with(id, None)
    }

    /// Same as run_alarm_once, optionally streaming live process chunks (CLI).
    pub fn run_alarm_once_with(
        &self,
        id: &str,
        on_chunk: Option<&OutputChunkFn>,
    ) -> DomainResult<ExecutionLog> {
        let mut alarm = self.get_alarm(id)?;
        if matches!(
            alarm.lifecycle,
            AlarmLifecycle::Running | AlarmLifecycle::Retrying { .. }
        ) {
            return Err(DomainError::new(
                ErrorCode::AlarmBusy,
                "alarm is already running",
            ));
        }
        {
            let map = self.active.lock().unwrap();
            if map.contains_key(id) {
                return Err(DomainError::new(
                    ErrorCode::AlarmBusy,
                    "alarm is already running",
                ));
            }
        }

        let cancel = CancelFlag::new();
        {
            let mut map = self.active.lock().unwrap();
            map.insert(id.to_string(), Arc::clone(&cancel));
        }

        let result = self.execute_alarm_loop(&mut alarm, Arc::clone(&cancel), on_chunk);

        {
            let mut map = self.active.lock().unwrap();
            map.remove(id);
        }

        // Always release lifecycle even if execute failed hard.
        if let Ok(mut a) = self.get_alarm(id) {
            a.mark_idle();
            let _ = self.store.upsert_alarm(&a);
        }

        result
    }

    /// Import alarms from config.toml into SQLite (by name upsert semantics: create new drafts).
    pub fn import_toml_alarms(&self) -> DomainResult<usize> {
        let Some((drafts, settings)) = self.backup.import_toml_if_needed()? else {
            return Ok(0);
        };
        let _ = self.store.save_settings(&settings);
        let mut n = 0;
        for draft in drafts {
            // skip if same name exists
            let exists = self
                .store
                .list_alarms()?
                .into_iter()
                .any(|a| a.name == draft.name);
            if exists {
                continue;
            }
            let alarm = Alarm::from_draft(draft)?;
            self.store.upsert_alarm(&alarm)?;
            n += 1;
        }
        self.sync_export()?;
        Ok(n)
    }

    pub fn find_alarm_by_name(&self, name: &str) -> DomainResult<Alarm> {
        self.store
            .list_alarms()?
            .into_iter()
            .find(|a| a.name == name || a.id == name)
            .ok_or_else(|| {
                DomainError::new(ErrorCode::AlarmNotFound, format!("alarm not found: {name}"))
            })
    }

    pub fn bootstrap(&self) -> DomainResult<()> {
        let mut settings = self.store.get_settings()?;
        let mut dirty = false;
        // MCP bearer: always have a system-generated token (stdio ignores it).
        if settings.mcp.auth_token.trim().is_empty() {
            settings.mcp.auth_token = crate::domain::generate_secret_token();
            dirty = true;
        }
        // Bump retired default model ids to current provider default.
        if crate::domain::is_legacy_ai_model(&settings.ai.model) {
            settings.ai.model = settings.ai.provider.default_model().into();
            dirty = true;
        }
        if dirty {
            self.store.save_settings(&settings)?;
            let _ = self.sync_export();
        }
        if settings.auto_backup_on_start() {
            let _ = self.backup.backup_now();
        }
        let _ = self.store.purge_old_logs(settings.log_retention_days());
        Ok(())
    }

    fn sync_export(&self) -> DomainResult<()> {
        let alarms = self.store.list_alarms()?;
        let settings = self.store.get_settings()?;
        self.backup.export_toml(&alarms, &settings)
    }
}

pub struct SystemClock;

impl Clock for SystemClock {
    fn now_utc(&self) -> chrono::DateTime<Utc> {
        Utc::now()
    }
}

pub struct SystemSleeper;

impl Sleeper for SystemSleeper {
    fn sleep_secs(&self, secs: u64) {
        if secs > 0 {
            std::thread::sleep(std::time::Duration::from_secs(secs));
        }
    }
}

pub struct NoopSleeper;

impl Sleeper for NoopSleeper {
    fn sleep_secs(&self, _secs: u64) {}
}
