use std::sync::{Arc, Mutex};

use crate::app::{
    AlarmService, CancelFlag, Clock, ConfigBackup, NoopSleeper, ProcessOutput, ProcessRunner,
    Sleeper, SystemClock,
};
use crate::domain::{Alarm, AlarmDraft, AppSettings, DomainResult, RetryPolicy, ScheduleSpec};
use crate::infra::{AlarmScheduler, SqliteStore};

struct HangRunner {
    started: Mutex<u32>,
}

impl ProcessRunner for HangRunner {
    fn run(
        &self,
        _binary: &str,
        _args: &[String],
        _env: &[(String, String)],
        _timeout_secs: u32,
        _cancel: Option<Arc<CancelFlag>>,
        _on_chunk: Option<&crate::app::OutputChunkFn>,
    ) -> DomainResult<ProcessOutput> {
        *self.started.lock().unwrap() += 1;
        // Simulate a long-running task without sleeping minutes.
        std::thread::sleep(std::time::Duration::from_millis(80));
        Ok(ProcessOutput {
            exit_code: 0,
            stdout: "ok".into(),
            stderr: String::new(),
            duration_ms: 80,
            canceled: false,
            timed_out: false,
        })
    }

    fn which(&self, binary: &str) -> DomainResult<Option<String>> {
        Ok(Some(binary.to_string()))
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
    fn restore(&self, _: &str) -> DomainResult<()> {
        Ok(())
    }
    fn delete_backup(&self, _: &str) -> DomainResult<()> {
        Ok(())
    }
    fn export_toml(&self, _: &[Alarm], _: &AppSettings) -> DomainResult<()> {
        Ok(())
    }
    fn import_toml_if_needed(&self) -> DomainResult<Option<(Vec<AlarmDraft>, AppSettings)>> {
        Ok(None)
    }
}

#[test]
fn enqueue_dedupes_while_running() {
    let store = Arc::new(SqliteStore::open_in_memory().unwrap());
    let runner = Arc::new(HangRunner {
        started: Mutex::new(0),
    });
    let clock: Arc<dyn Clock> = Arc::new(SystemClock);
    let backup = Arc::new(NoopBackup);
    let sleeper: Arc<dyn Sleeper> = Arc::new(NoopSleeper);
    let service = Arc::new(AlarmService::new(
        store,
        runner.clone(),
        clock,
        backup,
        sleeper,
    ));
    let alarm = service
        .create_alarm(AlarmDraft {
            name: "q".into(),
            enabled: true,
            schedule: ScheduleSpec::Daily {
                times: vec!["09:00".into()],
            },
            binary: "echo".into(),
            args: vec!["x".into()],
            env_vars: vec![],
            retry: RetryPolicy::default(),
            timeout_secs: 20,
            notification: Default::default(),
            plugin: None,
        })
        .unwrap();

    let scheduler = Arc::new(AlarmScheduler::new(service));
    scheduler.start();

    assert!(scheduler.enqueue(alarm.id.clone()));
    // while first job is running or queued, second enqueue should be rejected
    std::thread::sleep(std::time::Duration::from_millis(20));
    assert!(!scheduler.enqueue(alarm.id.clone()));

    // wait for completion
    std::thread::sleep(std::time::Duration::from_millis(200));
    assert_eq!(*runner.started.lock().unwrap(), 1);

    // after finish, can enqueue again
    assert!(scheduler.enqueue(alarm.id));
    std::thread::sleep(std::time::Duration::from_millis(200));
    assert_eq!(*runner.started.lock().unwrap(), 2);

    scheduler.stop();
}
