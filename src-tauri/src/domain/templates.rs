use super::{AlarmDraft, RetryPolicy, ScheduleSpec, BUILTIN_ALARM_BINARY, DEFAULT_TIMEOUT_SECS};

/// Built-in task templates for quick fill.
pub struct TaskTemplate {
    pub id: &'static str,
    pub name_zh: &'static str,
    pub name_en: &'static str,
    pub binary: &'static str,
    pub args: &'static [&'static str],
}

pub const TEMPLATES: &[TaskTemplate] = &[
    TaskTemplate {
        id: "cozy_alarm",
        name_zh: "小闹钟提醒",
        name_en: "Cozy alarm clock",
        // Portable built-in — same config on macOS/Windows/Linux.
        binary: BUILTIN_ALARM_BINARY,
        args: &[
            "叮咚～闹钟响啦！现在是 callai 小闹钟提醒你一下。",
            "callai 小闹钟",
        ],
    },
    TaskTemplate {
        id: "codex_hi",
        name_zh: "Codex 轻量占位",
        name_en: "Codex light warmup",
        binary: "codex",
        args: &["exec", "hi"],
    },
    TaskTemplate {
        id: "claude_hi",
        name_zh: "Claude 简单问候",
        name_en: "Claude simple hello",
        binary: "claude",
        args: &["-p", "hi"],
    },
    TaskTemplate {
        id: "osascript_rest",
        name_zh: "macOS 休息弹窗",
        name_en: "macOS rest dialog",
        binary: "osascript",
        args: &[
            r#"-e 'display dialog "已经连续写代码 2 小时了，喝口水？" buttons {"已喝", "等会"} default button 1 with icon caution'"#,
        ],
    },
    TaskTemplate {
        id: "say_remind",
        name_zh: "macOS 语音提醒",
        name_en: "macOS spoken reminder",
        binary: "say",
        args: &[r#"-v Mei-Jia "该休息一下啦""#],
    },
    TaskTemplate {
        id: "echo_warmup",
        name_zh: "本地 echo 测试",
        name_en: "Local echo test",
        binary: "echo",
        args: &["callai warmup {{date}}"],
    },
];

fn cozy_alarm_draft() -> AlarmDraft {
    AlarmDraft {
        name: "小闹钟提醒".into(),
        enabled: true,
        schedule: ScheduleSpec::Daily {
            times: vec!["07:30".into(), "12:00".into(), "21:00".into()],
        },
        binary: BUILTIN_ALARM_BINARY.into(),
        args: vec![
            "叮咚～闹钟响啦！现在是 callai 小闹钟提醒你一下。".into(),
            "callai 小闹钟".into(),
        ],
        env_vars: vec![],
        retry: RetryPolicy::default(),
        timeout_secs: 120,
        notification: Default::default(),
    }
}

pub fn draft_from_template(template_id: &str) -> Option<AlarmDraft> {
    if template_id == "cozy_alarm" {
        return Some(cozy_alarm_draft());
    }
    let t = TEMPLATES.iter().find(|x| x.id == template_id)?;
    Some(AlarmDraft {
        name: t.name_zh.to_string(),
        enabled: true,
        schedule: ScheduleSpec::Daily {
            times: vec!["08:00".into(), "13:00".into(), "18:00".into()],
        },
        binary: t.binary.to_string(),
        args: t.args.iter().map(|s| (*s).to_string()).collect(),
        env_vars: vec![],
        retry: RetryPolicy::default(),
        timeout_secs: DEFAULT_TIMEOUT_SECS,
        notification: Default::default(),
    })
}

/// Expand simple template variables in args.
pub fn expand_arg_templates(args: &[String], now: chrono::DateTime<chrono::Utc>) -> Vec<String> {
    let date = now.format("%Y-%m-%d").to_string();
    let datetime = now.format("%Y-%m-%d %H:%M:%S").to_string();
    let timestamp = now.timestamp().to_string();
    args.iter()
        .map(|a| {
            a.replace("{{date}}", &date)
                .replace("{{datetime}}", &datetime)
                .replace("{{timestamp}}", &timestamp)
        })
        .collect()
}
