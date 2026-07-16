use chrono::{Datelike, TimeZone, Timelike, Utc};
use chrono_tz::Asia::Shanghai;

use crate::domain::{daily_from_times, detect_system_timezone, resolve_timezone, ScheduleSpec};
use chrono::NaiveTime;

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
    let next = s.next_trigger_after(chrono::Local::now()).unwrap();
    assert!(next.is_some());
    let n = next.unwrap();
    assert!(n >= chrono::Local::now() - chrono::Duration::seconds(1));
}

#[test]
fn daily_times_are_wall_clock_in_timezone_not_utc() {
    // 08:00, 13:00, 18:00 Asia/Shanghai must NOT become UTC 08/13/18 (→ 16/21/02 local).
    let s = ScheduleSpec::Daily {
        times: vec!["08:00".into(), "13:00".into(), "18:00".into()],
    };
    // 2026-07-12 12:00 Shanghai = 04:00 UTC → next should be 13:00 Shanghai same day.
    let after = Shanghai
        .with_ymd_and_hms(2026, 7, 12, 12, 0, 0)
        .single()
        .unwrap()
        .with_timezone(&Utc);
    let next = s
        .next_trigger_after_in_tz(after, Shanghai)
        .unwrap()
        .expect("next");
    let local = next.with_timezone(&Shanghai);
    assert_eq!(local.hour(), 13, "got {}", local);
    assert_eq!(local.minute(), 0);
    assert_eq!(local.day(), 12);
}

#[test]
fn weekly_only_selected_weekdays() {
    // Mon(1) only at 09:00
    let s = ScheduleSpec::Weekly {
        days: vec![1],
        times: vec!["09:00".into()],
    };
    s.validate().unwrap();
    // 2026-07-12 is Sunday → next Mon 09:00 Shanghai = Jul 13
    let after = Shanghai
        .with_ymd_and_hms(2026, 7, 12, 10, 0, 0)
        .single()
        .unwrap()
        .with_timezone(&Utc);
    let expr = s.to_cron_expression().unwrap();
    assert_eq!(expr, "0 9 * * 2", "expr={expr}");
    let next = s
        .next_trigger_after_in_tz(after, Shanghai)
        .unwrap()
        .expect("next");
    let local = next.with_timezone(&Shanghai);
    assert_eq!(
        (
            local.year(),
            local.month(),
            local.day(),
            local.hour(),
            local.weekday().num_days_from_sunday()
        ),
        (2026, 7, 13, 9, 1),
        "local={local}"
    );
}

#[test]
fn monthly_day_of_month() {
    let s = ScheduleSpec::Monthly {
        days: vec![15],
        times: vec!["10:00".into()],
    };
    let after = Shanghai
        .with_ymd_and_hms(2026, 7, 12, 8, 0, 0)
        .single()
        .unwrap()
        .with_timezone(&Utc);
    let next = s
        .next_trigger_after_in_tz(after, Shanghai)
        .unwrap()
        .expect("next");
    let local = next.with_timezone(&Shanghai);
    assert_eq!(local.day(), 15);
    assert_eq!(local.hour(), 10);
}

#[test]
fn resolve_system_timezone_is_valid() {
    let tz = detect_system_timezone();
    assert!(!tz.name().is_empty());
    assert!(resolve_timezone("system").is_ok());
    assert!(resolve_timezone("Asia/Shanghai").is_ok());
    assert!(resolve_timezone("Not/AZone").is_err());
}

#[test]
fn probe_system_tz_and_daily_20_remaining() {
    let tz = detect_system_timezone();
    eprintln!("detect_system_timezone = {}", tz.name());
    let s = ScheduleSpec::Daily {
        times: vec!["20:00".into()],
    };
    let now = chrono::Utc::now();
    let next = s.next_trigger_after_in_tz(now, tz).unwrap().expect("next");
    let mins = (next - now).num_minutes();
    eprintln!("now_utc={now}");
    eprintln!("next_utc={next}");
    eprintln!("mins_remaining={mins} hours={:.2}", mins as f64 / 60.0);
    eprintln!("next_in_tz={}", next.with_timezone(&tz));
    eprintln!("next_shanghai={}", next.with_timezone(&Shanghai));
    // On Asia/Shanghai host ~15:00, daily 20:00 should be ~5h not ~13h
    if tz.name() == "Asia/Shanghai" || tz.name() == "Asia/Chongqing" {
        assert!(
            mins < 8 * 60,
            "expected <8h to 20:00 Shanghai from afternoon, got {mins} min (tz={})",
            tz.name()
        );
    }
}
