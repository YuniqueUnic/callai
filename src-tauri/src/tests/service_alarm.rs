use std::sync::{Arc, Mutex};

use crate::app::{
    AlarmService, CancelFlag, Clock, ConfigBackup, NoopSleeper, ProcessOutput, ProcessRunner,
    Sleeper, SystemClock,
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
