//! Shared SQLite row helpers.
#![allow(dead_code, clippy::too_many_arguments, clippy::type_complexity)]
use crate::domain::{
    Alarm, AlarmLifecycle, AlarmNotificationSettings, AlarmPluginConfig, DomainError, DomainResult,
    EnvVar, ErrorCode, ExecutionLog, ExecutionStatus, RetryInterval, RetryPolicy, ScheduleSpec,
};
use chrono::{DateTime, Utc};

pub(crate) fn dt_to_str(dt: DateTime<Utc>) -> String {
    dt.to_rfc3339()
}

pub(crate) fn str_to_dt(s: &str) -> DomainResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s)
        .map(|d| d.with_timezone(&Utc))
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("bad datetime: {e}")))
}

pub(crate) fn alarm_from_row(
    id: String,
    name: String,
    enabled: i64,
    schedule_json: String,
    binary_path: String,
    args_json: String,
    env_json: String,
    retry_interval: String,
    timeout_secs: i64,
    lifecycle_json: String,
    created_at: String,
    updated_at: String,
    notification_json: String,
    plugin_json: String,
) -> DomainResult<Alarm> {
    let schedule: ScheduleSpec = serde_json::from_str(&schedule_json)
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("schedule json: {e}")))?;
    let args: Vec<String> = serde_json::from_str(&args_json)
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("args json: {e}")))?;
    let env_vars: Vec<EnvVar> = serde_json::from_str(&env_json)
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("env json: {e}")))?;
    let lifecycle: AlarmLifecycle = serde_json::from_str(&lifecycle_json)
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("lifecycle json: {e}")))?;
    let notification: AlarmNotificationSettings = if notification_json.trim().is_empty() {
        AlarmNotificationSettings::default()
    } else {
        serde_json::from_str(&notification_json).unwrap_or_default()
    };
    let plugin: Option<AlarmPluginConfig> = if plugin_json.trim().is_empty() {
        None
    } else {
        serde_json::from_str(&plugin_json).ok()
    };
    Ok(Alarm {
        id,
        name,
        enabled: enabled != 0,
        schedule,
        binary: binary_path,
        args,
        env_vars,
        retry: RetryPolicy::new(RetryInterval::parse(&retry_interval)?),
        timeout_secs: timeout_secs.clamp(1, 3600) as u32,
        notification,
        plugin,
        lifecycle,
        created_at: str_to_dt(&created_at)?,
        updated_at: str_to_dt(&updated_at)?,
    })
}

pub(crate) fn status_str(s: ExecutionStatus) -> &'static str {
    match s {
        ExecutionStatus::Running => "running",
        ExecutionStatus::Success => "success",
        ExecutionStatus::Failed => "failed",
        ExecutionStatus::Retrying => "retrying",
        ExecutionStatus::Canceled => "canceled",
        ExecutionStatus::Timeout => "timeout",
    }
}

pub(crate) fn parse_status(s: &str) -> ExecutionStatus {
    match s {
        "success" => ExecutionStatus::Success,
        "failed" => ExecutionStatus::Failed,
        "retrying" => ExecutionStatus::Retrying,
        "canceled" | "cancelled" => ExecutionStatus::Canceled,
        "timeout" => ExecutionStatus::Timeout,
        _ => ExecutionStatus::Running,
    }
}

pub(crate) fn map_log_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<(
    i64,
    String,
    String,
    String,
    Option<String>,
    String,
    Option<i32>,
    Option<i64>,
    i64,
    String,
    String,
    String,
)> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
        row.get(8)?,
        row.get(9)?,
        row.get(10)?,
        row.get(11)?,
    ))
}

pub(crate) fn map_logs(
    rows: impl Iterator<
        Item = Result<
            (
                i64,
                String,
                String,
                String,
                Option<String>,
                String,
                Option<i32>,
                Option<i64>,
                i64,
                String,
                String,
                String,
            ),
            rusqlite::Error,
        >,
    >,
) -> DomainResult<Vec<ExecutionLog>> {
    let mut out = Vec::new();
    for r in rows {
        let t = r.map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        out.push(ExecutionLog {
            id: t.0,
            alarm_id: t.1,
            alarm_name: t.2,
            started_at: str_to_dt(&t.3)?,
            finished_at: match t.4 {
                Some(s) => Some(str_to_dt(&s)?),
                None => None,
            },
            status: parse_status(&t.5),
            exit_code: t.6,
            duration_ms: t.7,
            retry_count: t.8 as u32,
            command_preview: t.9,
            stdout: t.10,
            stderr: t.11,
        });
    }
    Ok(out)
}
