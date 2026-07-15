use crate::domain::{
    expand_arg_templates, Alarm, AlarmDraft, AlarmLifecycle, RetryPolicy, ScheduleSpec,
};

fn sample_draft() -> AlarmDraft {
    AlarmDraft {
        name: "morning".into(),
        enabled: true,
        schedule: ScheduleSpec::Daily {
            times: vec!["08:00".into()],
        },
        binary: "echo".into(),
        args: vec!["hi {{date}}".into()],
        env_vars: vec![],
        retry: RetryPolicy::default(),
        timeout_secs: 20,
        notification: Default::default(),
        plugin: None,
    }
}

#[test]
fn create_alarm_from_draft() {
    let alarm = Alarm::from_draft(sample_draft()).unwrap();
    assert_eq!(alarm.name, "morning");
    assert!(matches!(alarm.lifecycle, AlarmLifecycle::Idle));
}

#[test]
fn empty_name_rejected() {
    let mut d = sample_draft();
    d.name = "  ".into();
    assert!(Alarm::from_draft(d).is_err());
}

#[test]
fn expand_templates() {
    let now = chrono::Utc::now();
    let out = expand_arg_templates(&["x {{date}}".into()], now);
    assert!(out[0].contains(&now.format("%Y-%m-%d").to_string()));
}

#[test]
fn busy_alarm_cannot_edit() {
    let mut alarm = Alarm::from_draft(sample_draft()).unwrap();
    alarm.mark_running();
    let err = alarm.apply_draft(sample_draft()).unwrap_err();
    assert!(matches!(err.code, crate::domain::ErrorCode::AlarmBusy));
}

#[test]
fn notification_defaults_enabled_with_sound() {
    let alarm = Alarm::from_draft(sample_draft()).unwrap();
    assert!(alarm.notification.enabled);
    assert!(matches!(
        alarm.notification.notification_type,
        crate::domain::NotificationType::WithSound
    ));
    assert_eq!(alarm.notification.resolved_sound().as_str(), "soft_chime");
}

#[test]
fn notification_sound_parse_and_wants() {
    use crate::domain::{AlarmNotificationSettings, BuiltinSoundId, NotificationType};
    let mut n = AlarmNotificationSettings::default();
    assert!(n.wants_notification());
    assert!(n.wants_sound());
    n.notification_type = NotificationType::SystemOnly;
    assert!(!n.wants_sound());
    n.enabled = false;
    assert!(!n.wants_notification());
    assert_eq!(
        BuiltinSoundId::parse("island_bell"),
        Some(BuiltinSoundId::IslandBell)
    );
    assert_eq!(
        BuiltinSoundId::parse("default"),
        Some(BuiltinSoundId::SoftChime)
    );
}
