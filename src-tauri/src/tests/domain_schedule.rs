use chrono::{Local, NaiveTime};

use crate::domain::{daily_from_times, ScheduleSpec};

#[test]
fn daily_validates_times() {
    let s = ScheduleSpec::Daily {
        times: vec!["08:00".into(), "13:00".into()],
    };
    s.validate().unwrap();
    let cron = s.to_cron_expression().unwrap();
    assert!(cron.contains('8') || cron.contains("08"));
}

#[test]
fn invalid_time_rejected() {
    let s = ScheduleSpec::Daily {
        times: vec!["25:00".into()],
    };
    assert!(s.validate().is_err());
}

#[test]
fn cron_5_field_accepted() {
    let s = ScheduleSpec::Cron {
        expression: "0 8,13,18 * * *".into(),
    };
    s.validate().unwrap();
}

#[test]
fn next_trigger_exists_for_daily() {
    let times = [NaiveTime::from_hms_opt(8, 0, 0).unwrap()];
    let s = daily_from_times(&times);
    let next = s.next_trigger_after(Local::now()).unwrap();
    assert!(next.is_some());
    // Next fire should be in the future (or equal within a second).
    let n = next.unwrap();
    assert!(n >= Local::now() - chrono::Duration::seconds(1));
}
