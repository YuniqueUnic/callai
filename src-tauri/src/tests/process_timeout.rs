use std::sync::Arc;
use std::time::Instant;

use crate::app::{CancelFlag, ProcessRunner};
use crate::infra::SystemProcessRunner;

#[test]
fn system_runner_times_out_long_sleep() {
    let runner = SystemProcessRunner;
    let started = Instant::now();
    let out = runner
        .run("sleep", &["5".into()], &[], 1, None, None)
        .expect("run sleep");
    assert!(out.timed_out, "expected timed_out, got {:?}", out);
    assert_eq!(out.exit_code, -1);
    assert!(started.elapsed().as_secs_f64() < 3.0);
}

#[test]
fn system_runner_cancels_long_sleep() {
    let runner = SystemProcessRunner;
    let flag = CancelFlag::new();
    let flag2 = Arc::clone(&flag);
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(150));
        flag2.request();
    });
    let started = Instant::now();
    let out = runner
        .run("sleep", &["10".into()], &[], 30, Some(flag), None)
        .expect("run sleep");
    assert!(out.canceled, "expected canceled, got {:?}", out);
    assert!(started.elapsed().as_secs_f64() < 3.0);
}
