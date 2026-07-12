#![allow(dead_code)]
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::domain::{Alarm, AlarmDraft, AppSettings, DomainResult, ExecutionLog, LogFilter};

/// Cooperative cancel flag shared by scheduler/UI/CLI.
#[derive(Debug, Default)]
pub struct CancelFlag(AtomicBool);

impl CancelFlag {
    pub fn new() -> Arc<Self> {
        Arc::new(Self(AtomicBool::new(false)))
    }

    pub fn request(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn is_requested(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }

    pub fn clear(&self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// Callback for live process output chunks: (text, is_stderr).
pub type OutputChunkFn = dyn Fn(&str, bool) + Send + Sync;

/// Persistence port for alarms + logs + settings.
pub trait AlarmStore: Send + Sync {
    fn list_alarms(&self) -> DomainResult<Vec<Alarm>>;
    fn get_alarm(&self, id: &str) -> DomainResult<Option<Alarm>>;
    fn upsert_alarm(&self, alarm: &Alarm) -> DomainResult<()>;
    fn delete_alarm(&self, id: &str) -> DomainResult<()>;
    fn insert_log(&self, log: &ExecutionLog) -> DomainResult<i64>;
    fn update_log(&self, log: &ExecutionLog) -> DomainResult<()>;
    fn list_logs(&self, filter: &LogFilter) -> DomainResult<Vec<ExecutionLog>>;
    fn delete_log(&self, id: i64) -> DomainResult<()>;
    fn delete_logs(&self, ids: &[i64]) -> DomainResult<u64>;
    fn get_settings(&self) -> DomainResult<AppSettings>;
    fn save_settings(&self, settings: &AppSettings) -> DomainResult<()>;
    fn purge_old_logs(&self, retention_days: u32) -> DomainResult<u64>;
}

/// Execute a binary with args and env.
pub trait ProcessRunner: Send + Sync {
    fn run(
        &self,
        binary: &str,
        args: &[String],
        env: &[(String, String)],
        timeout_secs: u32,
        cancel: Option<Arc<CancelFlag>>,
        on_chunk: Option<&OutputChunkFn>,
    ) -> DomainResult<ProcessOutput>;

    fn which(&self, binary: &str) -> DomainResult<Option<String>>;
}

#[derive(Debug, Clone)]
pub struct ProcessOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: i64,
    pub canceled: bool,
    pub timed_out: bool,
}

impl ProcessOutput {
    pub fn simple(exit_code: i32, stdout: impl Into<String>, stderr: impl Into<String>) -> Self {
        Self {
            exit_code,
            stdout: stdout.into(),
            stderr: stderr.into(),
            duration_ms: 0,
            canceled: false,
            timed_out: false,
        }
    }
}

/// Clock abstraction for tests.
pub trait Clock: Send + Sync {
    fn now_utc(&self) -> chrono::DateTime<chrono::Utc>;
}

/// Sleep abstraction so production can wait between retries without making unit tests slow.
pub trait Sleeper: Send + Sync {
    fn sleep_secs(&self, secs: u64);
}

/// Config backup port.
pub trait ConfigBackup: Send + Sync {
    fn backup_now(&self) -> DomainResult<String>;
    fn list_backups(&self) -> DomainResult<Vec<String>>;
    fn restore(&self, backup_name: &str) -> DomainResult<()>;
    fn delete_backup(&self, backup_name: &str) -> DomainResult<()>;
    fn export_toml(&self, alarms: &[Alarm], settings: &AppSettings) -> DomainResult<()>;
    fn import_toml_if_needed(&self) -> DomainResult<Option<(Vec<AlarmDraft>, AppSettings)>>;
}
