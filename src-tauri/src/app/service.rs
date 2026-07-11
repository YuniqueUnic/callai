#![allow(dead_code)]
use std::sync::Arc;

use chrono::Utc;

use crate::domain::{
    expand_arg_templates, Alarm, AlarmDraft, AlarmLifecycle, AppSettings, DomainError,
    DomainResult, ErrorCode, ExecutionLog, ExecutionStatus, LogFilter,
};

use super::{AlarmStore, Clock, ConfigBackup, ProcessOutput, ProcessRunner, Sleeper};

pub struct AlarmService {
    store: Arc<dyn AlarmStore>,
    runner: Arc<dyn ProcessRunner>,
    clock: Arc<dyn Clock>,
    backup: Arc<dyn ConfigBackup>,
    sleeper: Arc<dyn Sleeper>,
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
        let alarm = self.get_alarm(id)?;
        if matches!(
            alarm.lifecycle,
            AlarmLifecycle::Running | AlarmLifecycle::Retrying { .. }
        ) {
            return Err(DomainError::new(
                ErrorCode::AlarmBusy,
                "cannot delete while running",
            ));
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

    /// Run alarm once with retry policy. Uses injected sleeper between retries.
    pub fn run_alarm_once(&self, id: &str) -> DomainResult<ExecutionLog> {
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

        alarm.mark_running();
        self.store.upsert_alarm(&alarm)?;

        let started = self.clock.now_utc();
        let expanded_args = expand_arg_templates(&alarm.args, started);
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
            command_preview: {
                let mut parts = vec![alarm.binary.clone()];
                parts.extend(expanded_args.iter().cloned());
                parts.join(" ")
            },
            stdout: String::new(),
            stderr: String::new(),
        };
        log.id = self.store.insert_log(&log)?;

        let mut attempt: u32 = 0;
        #[allow(unused_assignments)]
        let mut last_output: Option<ProcessOutput> = None;
        let mut success = false;

        loop {
            match self.runner.run(&alarm.binary, &expanded_args, &env) {
                Ok(out) if out.exit_code == 0 => {
                    last_output = Some(out);
                    success = true;
                    break;
                }
                Ok(out) => {
                    last_output = Some(out);
                }
                Err(err) => {
                    last_output = Some(ProcessOutput {
                        exit_code: -1,
                        stdout: String::new(),
                        stderr: err.message,
                        duration_ms: 0,
                    });
                }
            }

            if attempt + 1 >= alarm.retry.max_attempts {
                break;
            }
            attempt += 1;
            alarm.mark_retrying(attempt);
            self.store.upsert_alarm(&alarm)?;
            log.status = ExecutionStatus::Retrying;
            log.retry_count = attempt;
            self.store.update_log(&log)?;

            if let Some(secs) = alarm.retry.wait_seconds_for_attempt(attempt - 1) {
                self.sleeper.sleep_secs(secs);
            }
        }

        let finished = self.clock.now_utc();
        let out = last_output.unwrap_or(ProcessOutput {
            exit_code: -1,
            stdout: String::new(),
            stderr: "no output".into(),
            duration_ms: 0,
        });

        log.finished_at = Some(finished);
        log.exit_code = Some(out.exit_code);
        log.duration_ms = Some((finished - started).num_milliseconds().max(out.duration_ms));
        log.retry_count = attempt;
        log.stdout = out.stdout;
        log.stderr = out.stderr;
        log.status = if success {
            ExecutionStatus::Success
        } else {
            ExecutionStatus::Failed
        };
        self.store.update_log(&log)?;

        alarm.mark_idle();
        self.store.upsert_alarm(&alarm)?;
        Ok(log)
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
