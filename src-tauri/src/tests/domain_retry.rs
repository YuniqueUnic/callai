use crate::domain::{RetryInterval, RetryPolicy};

#[test]
fn retry_interval_seconds() {
    assert_eq!(RetryInterval::OneMinute.seconds(), 60);
    assert_eq!(RetryInterval::TwoMinutes.seconds(), 120);
    assert_eq!(RetryInterval::FiveMinutes.seconds(), 300);
    assert_eq!(RetryInterval::TenMinutes.seconds(), 600);
}

#[test]
fn wait_stops_after_max() {
    let p = RetryPolicy::default();
    assert_eq!(p.wait_seconds_for_attempt(0), Some(120));
    assert_eq!(p.wait_seconds_for_attempt(2), Some(120));
    assert_eq!(p.wait_seconds_for_attempt(3), None);
}

#[test]
fn parse_intervals() {
    assert_eq!(
        RetryInterval::parse("1m").unwrap(),
        RetryInterval::OneMinute
    );
    assert_eq!(
        RetryInterval::parse("10m").unwrap(),
        RetryInterval::TenMinutes
    );
}
