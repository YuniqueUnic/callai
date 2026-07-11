use std::sync::{Arc, Mutex};

use crate::app::{
    AlarmService, Clock, ConfigBackup, NoopSleeper, ProcessOutput, ProcessRunner, Sleeper,
    SystemClock,
};
use crate::domain::{
    Alarm, AlarmDraft, AppSettings, DomainResult, LogFilter, RetryPolicy, ScheduleSpec,
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
    ) -> DomainResult<ProcessOutput> {
        let mut g = self.results.lock().unwrap();
        if g.is_empty() {
            Ok(ProcessOutput {
                exit_code: 0,
                stdout: "ok".into(),
                stderr: String::new(),
                duration_ms: 1,
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
    }]);
    let a = svc.create_alarm(draft()).unwrap();
    let log = svc.run_alarm_once(&a.id).unwrap();
    assert!(matches!(
        log.status,
        crate::domain::ExecutionStatus::Success
    ));
    assert_eq!(log.stdout, "hello");
}

#[test]
fn run_retries_then_fails_and_sleeps() {
    let fail = ProcessOutput {
        exit_code: 1,
        stdout: String::new(),
        stderr: "boom".into(),
        duration_ms: 1,
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
    assert!(matches!(log.status, crate::domain::ExecutionStatus::Failed));
    assert_eq!(log.retry_count, 2);
    // two waits between 3 attempts
    assert_eq!(sleeper.sleeps.lock().unwrap().as_slice(), &[120, 120]);
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
