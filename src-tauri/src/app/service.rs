#![allow(dead_code)]
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use chrono::Utc;

use crate::domain::{
    expand_arg_templates, resolve_process_argv, Alarm, AlarmDraft, AlarmLifecycle, AppSettings,
    DomainError, DomainResult, ErrorCode, ExecutionLog, ExecutionStatus, LogFilter,
};

use super::{
    AlarmStore, CancelFlag, Clock, ConfigBackup, OutputChunkFn, ProcessOutput, ProcessRunner,
    Sleeper,
};

pub struct AlarmService {
    store: Arc<dyn AlarmStore>,
    runner: Arc<dyn ProcessRunner>,
    clock: Arc<dyn Clock>,
    backup: Arc<dyn ConfigBackup>,
    sleeper: Arc<dyn Sleeper>,
    /// Active run cancel tokens keyed by alarm id.
    active: Mutex<HashMap<String, Arc<CancelFlag>>>,
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

    pub fn save_settings(&self, settings: AppSettings) -> DomainResult<AppSettings> {
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

    fn execute_alarm_loop(
        &self,
        alarm: &mut Alarm,
        cancel: Arc<CancelFlag>,
        on_chunk: Option<&OutputChunkFn>,
    ) -> DomainResult<ExecutionLog> {
        alarm.mark_running();
        self.store.upsert_alarm(alarm)?;

        let started = self.clock.now_utc();
        let templated = expand_arg_templates(&alarm.args, started);
        let (resolved_binary, expanded_args) = resolve_process_argv(&alarm.binary, &templated)?;
        let env: Vec<(String, String)> = alarm
            .env_vars
            .iter()
            .map(|e| (e.key.clone(), e.value.clone()))
            .collect();

        let mut log = ExecutionLog {
            id: 0,
            alarm_id: alarm.id.clone(),
            alarm_name: alarm.name.clone(),
            started_at: started,
            finished_at: None,
            status: ExecutionStatus::Running,
            exit_code: None,
            duration_ms: None,
            retry_count: 0,
            command_preview: crate::domain::preview_command(&resolved_binary, &expanded_args),
            stdout: String::new(),
            stderr: String::new(),
        };
        log.id = self.store.insert_log(&log)?;

        let mut attempt: u32 = 0;
        #[allow(unused_assignments)]
        let mut last_output: Option<ProcessOutput> = None;
        let mut success = false;
        let mut canceled = false;
        let mut timed_out = false;

        loop {
            if cancel.is_requested() {
                canceled = true;
                last_output = Some(ProcessOutput {
                    exit_code: -1,
                    stdout: String::new(),
                    stderr: "execution canceled by user".into(),
                    duration_ms: 0,
                    canceled: true,
                    timed_out: false,
                });
                break;
            }

            match self.runner.run(
                &resolved_binary,
                &expanded_args,
                &env,
                alarm.timeout_secs,
                Some(Arc::clone(&cancel)),
                on_chunk,
            ) {
                Ok(out) if out.exit_code == 0 && !out.canceled && !out.timed_out => {
                    last_output = Some(out);
                    success = true;
                    break;
                }
                Ok(out) => {
                    canceled = out.canceled;
                    timed_out = out.timed_out;
                    last_output = Some(out);
                    // Cancel / timeout: do not retry.
                    if canceled || timed_out {
                        break;
                    }
                }
                Err(err) => {
                    last_output = Some(ProcessOutput {
                        exit_code: -1,
                        stdout: String::new(),
                        stderr: err.message,
                        duration_ms: 0,
                        canceled: false,
                        timed_out: false,
                    });
                }
            }

            if attempt + 1 >= alarm.retry.max_attempts {
                break;
            }
            attempt += 1;
            alarm.mark_retrying(attempt);
            self.store.upsert_alarm(alarm)?;
            log.status = ExecutionStatus::Retrying;
            log.retry_count = attempt;
            self.store.update_log(&log)?;

            if let Some(secs) = alarm.retry.wait_seconds_for_attempt(attempt - 1) {
                // Cooperative cancel during retry wait (poll, no long uninterruptible sleep).
                let mut remaining = secs;
                while remaining > 0 {
                    if cancel.is_requested() {
                        canceled = true;
                        last_output = Some(ProcessOutput {
                            exit_code: -1,
                            stdout: last_output
                                .as_ref()
                                .map(|o| o.stdout.clone())
                                .unwrap_or_default(),
                            stderr: {
                                let mut s = last_output
                                    .as_ref()
                                    .map(|o| o.stderr.clone())
                                    .unwrap_or_default();
                                if !s.is_empty() {
                                    s.push('\n');
                                }
                                s.push_str("execution canceled by user");
                                s
                            },
                            duration_ms: last_output.as_ref().map(|o| o.duration_ms).unwrap_or(0),
                            canceled: true,
                            timed_out: false,
                        });
                        break;
                    }
                    let step = remaining.min(1);
                    self.sleeper.sleep_secs(step);
                    remaining = remaining.saturating_sub(step);
                }
                if canceled {
                    break;
                }
            }
        }

        let finished = self.clock.now_utc();
        let out = last_output.unwrap_or(ProcessOutput {
            exit_code: -1,
            stdout: String::new(),
            stderr: "no output".into(),
            duration_ms: 0,
            canceled: false,
            timed_out: false,
        });

        log.finished_at = Some(finished);
        log.exit_code = Some(out.exit_code);
        log.duration_ms = Some((finished - started).num_milliseconds().max(out.duration_ms));
        log.retry_count = attempt;
        log.stdout = out.stdout;
        log.stderr = out.stderr;
        log.status = if success {
            ExecutionStatus::Success
        } else if canceled || out.canceled {
            ExecutionStatus::Canceled
        } else if timed_out || out.timed_out {
            ExecutionStatus::Timeout
        } else {
            ExecutionStatus::Failed
        };
        self.store.update_log(&log)?;

        alarm.mark_idle();
        self.store.upsert_alarm(alarm)?;
        Ok(log)
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
        let _ = self.store.get_settings()?;
        let settings = self.store.get_settings()?;
        if settings.auto_backup_on_start {
            let _ = self.backup.backup_now();
        }
        let _ = self.store.purge_old_logs(settings.log_retention_days);
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
