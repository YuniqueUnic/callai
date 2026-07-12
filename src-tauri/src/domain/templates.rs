use super::{AlarmDraft, RetryPolicy, ScheduleSpec};

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
        id: "echo_warmup",
        name_zh: "本地 echo 测试",
        name_en: "Local echo test",
        binary: "echo",
        args: &["callai warmup {{date}}"],
    },
];

pub fn draft_from_template(template_id: &str) -> Option<AlarmDraft> {
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
        timeout_secs: super::DEFAULT_TIMEOUT_SECS,
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
