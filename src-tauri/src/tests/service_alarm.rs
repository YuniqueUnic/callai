use std::sync::{Arc, Mutex};

use crate::app::{
    AlarmService, AlarmStore, CancelFlag, Clock, ConfigBackup, NoopSleeper, ProcessOutput,
    ProcessRunner, Sleeper, SystemClock,
};
use crate::domain::{
    Alarm, AlarmDraft, AppSettings, DomainResult, ExecutionStatus, LogFilter, RetryPolicy,
    ScheduleSpec,
};
use crate::infra::SqliteStore;

struct FakeRunner {
    results: Mutex<Vec<ProcessOutput>>,
}

impl ProcessRunner for FakeRunner {
    fn run(
        &self,
        _binary: &str,
        _args: &[String],
        _env: &[(String, String)],
        _timeout_secs: u32,
        _cancel: Option<Arc<CancelFlag>>,
        _on_chunk: Option<&crate::app::OutputChunkFn>,
    ) -> DomainResult<ProcessOutput> {
        let mut g = self.results.lock().unwrap();
        if g.is_empty() {
            Ok(ProcessOutput {
                exit_code: 0,
                stdout: "ok".into(),
                stderr: String::new(),
                duration_ms: 1,
                canceled: false,
                timed_out: false,
            })
        } else {
            Ok(g.remove(0))
        }
    }

    fn which(&self, binary: &str) -> DomainResult<Option<String>> {
        Ok(Some(format!("/bin/{binary}")))
    }
}

struct NoopBackup;

impl ConfigBackup for NoopBackup {
    fn backup_now(&self) -> DomainResult<String> {
        Ok(String::new())
    }
    fn list_backups(&self) -> DomainResult<Vec<String>> {
        Ok(vec![])
    }
    fn restore(&self, _backup_name: &str) -> DomainResult<()> {
        Ok(())
    }
    fn delete_backup(&self, _backup_name: &str) -> DomainResult<()> {
        Ok(())
    }
    fn export_toml(&self, _alarms: &[Alarm], _settings: &AppSettings) -> DomainResult<()> {
        Ok(())
    }
    fn import_toml_if_needed(&self) -> DomainResult<Option<(Vec<AlarmDraft>, AppSettings)>> {
        Ok(None)
    }
}

struct RecordingSleeper {
    sleeps: Mutex<Vec<u64>>,
}

impl Sleeper for RecordingSleeper {
    fn sleep_secs(&self, secs: u64) {
        self.sleeps.lock().unwrap().push(secs);
    }
}

fn service_with(results: Vec<ProcessOutput>) -> AlarmService {
    let store = Arc::new(SqliteStore::open_in_memory().unwrap());
    let runner = Arc::new(FakeRunner {
        results: Mutex::new(results),
    });
    let clock: Arc<dyn Clock> = Arc::new(SystemClock);
    let backup = Arc::new(NoopBackup);
    let sleeper: Arc<dyn Sleeper> = Arc::new(NoopSleeper);
    AlarmService::new(store, runner, clock, backup, sleeper)
}

fn draft() -> AlarmDraft {
    AlarmDraft {
        name: "t".into(),
        enabled: true,
        schedule: ScheduleSpec::Daily {
            times: vec!["09:00".into()],
        },
        binary: "echo".into(),
        args: vec!["hi".into()],
        env_vars: vec![],
        retry: RetryPolicy::default(),
        timeout_secs: 20,
        notification: Default::default(),
    }
}

#[test]
fn create_list_delete() {
    let svc = service_with(vec![]);
    let a = svc.create_alarm(draft()).unwrap();
    assert_eq!(svc.list_alarms().unwrap().len(), 1);
    svc.delete_alarm(&a.id).unwrap();
    assert!(svc.list_alarms().unwrap().is_empty());
}

#[test]
fn run_success() {
    let svc = service_with(vec![ProcessOutput {
        exit_code: 0,
        stdout: "hello".into(),
        stderr: String::new(),
        duration_ms: 3,
        canceled: false,
        timed_out: false,
    }]);
    let a = svc.create_alarm(draft()).unwrap();
    let log = svc.run_alarm_once(&a.id).unwrap();
    assert!(matches!(log.status, ExecutionStatus::Success));
    assert_eq!(log.stdout, "hello");
}

#[test]
fn run_retries_then_fails_and_sleeps() {
    let fail = ProcessOutput {
        exit_code: 1,
        stdout: String::new(),
        stderr: "boom".into(),
        duration_ms: 1,
        canceled: false,
        timed_out: false,
    };
    let store = Arc::new(SqliteStore::open_in_memory().unwrap());
    let runner = Arc::new(FakeRunner {
        results: Mutex::new(vec![fail.clone(), fail.clone(), fail]),
    });
    let clock: Arc<dyn Clock> = Arc::new(SystemClock);
    let backup = Arc::new(NoopBackup);
    let sleeper = Arc::new(RecordingSleeper {
        sleeps: Mutex::new(Vec::new()),
    });
    let svc = AlarmService::new(store, runner, clock, backup, sleeper.clone());
    let a = svc.create_alarm(draft()).unwrap();
    let log = svc.run_alarm_once(&a.id).unwrap();
    assert!(matches!(log.status, ExecutionStatus::Failed));
    assert_eq!(log.retry_count, 2);
    // two waits between 3 attempts; cooperative cancel polls 1s chunks
    let sleeps = sleeper.sleeps.lock().unwrap().clone();
    assert_eq!(sleeps.iter().sum::<u64>(), 240);
    assert!(
        sleeps.iter().all(|&s| s == 1),
        "expected 1s cancelable slices, got {sleeps:?}"
    );
}

#[test]
fn timeout_does_not_retry() {
    let timed = ProcessOutput {
        exit_code: -1,
        stdout: String::new(),
        stderr: "timed out".into(),
        duration_ms: 20_000,
        canceled: false,
        timed_out: true,
    };
    let svc = service_with(vec![timed]);
    let a = svc.create_alarm(draft()).unwrap();
    let log = svc.run_alarm_once(&a.id).unwrap();
    assert!(matches!(log.status, ExecutionStatus::Timeout));
    assert_eq!(log.retry_count, 0);
}

#[test]
fn cancel_marks_canceled_status() {
    let canceled = ProcessOutput {
        exit_code: -1,
        stdout: String::new(),
        stderr: "canceled".into(),
        duration_ms: 10,
        canceled: true,
        timed_out: false,
    };
    let svc = service_with(vec![canceled]);
    let a = svc.create_alarm(draft()).unwrap();
    let log = svc.run_alarm_once(&a.id).unwrap();
    assert!(matches!(log.status, ExecutionStatus::Canceled));
}

#[test]
fn delete_log_works() {
    let svc = service_with(vec![ProcessOutput {
        exit_code: 0,
        stdout: "x".into(),
        stderr: String::new(),
        duration_ms: 1,
        canceled: false,
        timed_out: false,
    }]);
    let a = svc.create_alarm(draft()).unwrap();
    let log = svc.run_alarm_once(&a.id).unwrap();
    svc.delete_log(log.id).unwrap();
    let logs = svc
        .list_logs(LogFilter {
            alarm_id: Some(a.id),
            status: None,
            query: None,
            limit: 10,
        })
        .unwrap();
    assert!(logs.is_empty());
}

#[test]
fn settings_roundtrip() {
    let svc = service_with(vec![]);
    let mut s = svc.get_settings().unwrap();
    s.log_retention_days = 7;
    let saved = svc.save_settings(s).unwrap();
    assert_eq!(saved.log_retention_days, 7);
}

#[test]
fn list_logs_filter() {
    let svc = service_with(vec![ProcessOutput {
        exit_code: 0,
        stdout: "x".into(),
        stderr: String::new(),
        duration_ms: 1,
        canceled: false,
        timed_out: false,
    }]);
    let a = svc.create_alarm(draft()).unwrap();
    svc.run_alarm_once(&a.id).unwrap();
    let logs = svc
        .list_logs(LogFilter {
            alarm_id: Some(a.id),
            status: None,
            query: None,
            limit: 10,
        })
        .unwrap();
    assert_eq!(logs.len(), 1);
}

#[test]
fn migrate_adds_sound_enabled_on_legacy_db() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("legacy.db");
    {
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE app_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                theme TEXT NOT NULL,
                locale TEXT NOT NULL,
                launch_minimized INTEGER NOT NULL,
                log_retention_days INTEGER NOT NULL,
                notify_on_failure INTEGER NOT NULL,
                auto_backup_on_start INTEGER NOT NULL,
                backup_keep_count INTEGER NOT NULL
            );
            INSERT INTO app_settings VALUES (1, 'system', 'zh-CN', 0, 30, 0, 1, 10);
            CREATE TABLE alarms (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                enabled INTEGER NOT NULL,
                schedule_json TEXT NOT NULL,
                binary_path TEXT NOT NULL,
                args_json TEXT NOT NULL,
                env_json TEXT NOT NULL,
                retry_interval TEXT NOT NULL,
                lifecycle_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE execution_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alarm_id TEXT NOT NULL,
                alarm_name TEXT NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                status TEXT NOT NULL,
                exit_code INTEGER,
                duration_ms INTEGER,
                retry_count INTEGER NOT NULL DEFAULT 0,
                command_preview TEXT NOT NULL,
                stdout TEXT NOT NULL DEFAULT '',
                stderr TEXT NOT NULL DEFAULT ''
            );
            "#,
        )
        .unwrap();
    }
    let store = SqliteStore::open(&path).expect("migrate legacy db");
    let s = store.get_settings().unwrap();
    assert!(s.sound_enabled);
}

#[test]
fn migrate_adds_notification_json_on_legacy_alarms() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("legacy_notify.db");
    {
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE app_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                theme TEXT NOT NULL,
                locale TEXT NOT NULL,
                launch_minimized INTEGER NOT NULL,
                log_retention_days INTEGER NOT NULL,
                notify_on_failure INTEGER NOT NULL,
                auto_backup_on_start INTEGER NOT NULL,
                backup_keep_count INTEGER NOT NULL
            );
            INSERT INTO app_settings VALUES (1, 'system', 'zh-CN', 0, 30, 0, 1, 10);
            CREATE TABLE alarms (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                enabled INTEGER NOT NULL,
                schedule_json TEXT NOT NULL,
                binary_path TEXT NOT NULL,
                args_json TEXT NOT NULL,
                env_json TEXT NOT NULL,
                retry_interval TEXT NOT NULL,
                timeout_secs INTEGER NOT NULL DEFAULT 20,
                lifecycle_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            INSERT INTO alarms VALUES (
                'a1', 'old', 1, '{"mode":"daily","times":["08:00"]}', 'echo', '["hi"]', '[]',
                '2m', 20, '"idle"', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            CREATE TABLE execution_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alarm_id TEXT NOT NULL,
                alarm_name TEXT NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                status TEXT NOT NULL,
                exit_code INTEGER,
                duration_ms INTEGER,
                retry_count INTEGER NOT NULL DEFAULT 0,
                command_preview TEXT NOT NULL,
                stdout TEXT NOT NULL DEFAULT '',
                stderr TEXT NOT NULL DEFAULT ''
            );
            "#,
        )
        .unwrap();
    }
    let store = SqliteStore::open(&path).expect("migrate legacy db");
    let a = store.get_alarm("a1").unwrap().expect("alarm");
    assert!(a.notification.enabled);
    assert!(matches!(
        a.notification.notification_type,
        crate::domain::NotificationType::WithSound
    ));
}
