//! Alarm / log / settings store methods.
#![allow(dead_code, clippy::too_many_arguments, clippy::type_complexity)]
use super::helpers::{alarm_from_row, dt_to_str, map_log_row, map_logs, status_str};
use super::SqliteStore;
use crate::app::AlarmStore;
use crate::domain::{
    Alarm, AppSettings, DomainError, DomainResult, ErrorCode, ExecutionLog, LocaleCode, LogFilter,
    ThemeMode,
};
use chrono::Utc;
use rusqlite::{params, OptionalExtension};

const SQL_LIST_ALARMS: &str = concat!(
    "SELECT id, name, enabled, schedule_json, binary_path, args_json, env_json, ",
    "retry_interval, timeout_secs, lifecycle_json, created_at, updated_at, notification_json, ",
    "COALESCE(plugin_json, '') ",
    "FROM alarms ORDER BY created_at DESC"
);
const SQL_GET_ALARM: &str = concat!(
    "SELECT id, name, enabled, schedule_json, binary_path, args_json, env_json, ",
    "retry_interval, timeout_secs, lifecycle_json, created_at, updated_at, notification_json, ",
    "COALESCE(plugin_json, '') ",
    "FROM alarms WHERE id = ?1"
);
const SQL_DELETE_LOG: &str = "DELETE FROM execution_logs WHERE id = ?1";
const SQL_DELETE_LOGS_BY_ALARM: &str = "DELETE FROM execution_logs WHERE alarm_id = ?1";
const SQL_DELETE_ALARM: &str = "DELETE FROM alarms WHERE id = ?1";

impl AlarmStore for SqliteStore {
    fn list_alarms(&self) -> DomainResult<Vec<Alarm>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare(SQL_LIST_ALARMS)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, i64>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, String>(10)?,
                    row.get::<_, String>(11)?,
                    row.get::<_, String>(12)?,
                    row.get::<_, String>(13)?,
                ))
            })
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;

        let mut out = Vec::new();
        for r in rows {
            let t = r.map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
            out.push(alarm_from_row(
                t.0, t.1, t.2, t.3, t.4, t.5, t.6, t.7, t.8, t.9, t.10, t.11, t.12, t.13,
            )?);
        }
        Ok(out)
    }

    fn get_alarm(&self, id: &str) -> DomainResult<Option<Alarm>> {
        let conn = self.conn.lock().unwrap();
        let row = conn
            .query_row(SQL_GET_ALARM, params![id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, i64>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, String>(10)?,
                    row.get::<_, String>(11)?,
                    row.get::<_, String>(12)?,
                    row.get::<_, String>(13)?,
                ))
            })
            .optional()
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        match row {
            Some(t) => Ok(Some(alarm_from_row(
                t.0, t.1, t.2, t.3, t.4, t.5, t.6, t.7, t.8, t.9, t.10, t.11, t.12, t.13,
            )?)),
            None => Ok(None),
        }
    }

    fn upsert_alarm(&self, alarm: &Alarm) -> DomainResult<()> {
        let conn = self.conn.lock().unwrap();
        let schedule_json = serde_json::to_string(&alarm.schedule)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        let args_json = serde_json::to_string(&alarm.args)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        let env_json = serde_json::to_string(&alarm.env_vars)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        let lifecycle_json = serde_json::to_string(&alarm.lifecycle)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        let notification_json = serde_json::to_string(&alarm.notification)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        let plugin_json = match &alarm.plugin {
            Some(p) => serde_json::to_string(p)
                .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?,
            None => String::new(),
        };
        conn.execute(
            "INSERT INTO alarms (
                id, name, enabled, schedule_json, binary_path, args_json, env_json,
                retry_interval, timeout_secs, lifecycle_json, created_at, updated_at,
                notification_json, plugin_json
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
             ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,
                enabled=excluded.enabled,
                schedule_json=excluded.schedule_json,
                binary_path=excluded.binary_path,
                args_json=excluded.args_json,
                env_json=excluded.env_json,
                retry_interval=excluded.retry_interval,
                timeout_secs=excluded.timeout_secs,
                lifecycle_json=excluded.lifecycle_json,
                updated_at=excluded.updated_at,
                notification_json=excluded.notification_json,
                plugin_json=excluded.plugin_json",
            params![
                alarm.id,
                alarm.name,
                if alarm.enabled { 1 } else { 0 },
                schedule_json,
                alarm.binary,
                args_json,
                env_json,
                alarm.retry.interval.as_str(),
                alarm.timeout_secs as i64,
                lifecycle_json,
                dt_to_str(alarm.created_at),
                dt_to_str(alarm.updated_at),
                notification_json,
                plugin_json,
            ],
        )
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        Ok(())
    }

    fn delete_alarm(&self, id: &str) -> DomainResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(SQL_DELETE_LOGS_BY_ALARM, params![id])
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        let n = conn
            .execute(SQL_DELETE_ALARM, params![id])
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        if n == 0 {
            return Err(DomainError::new(
                ErrorCode::AlarmNotFound,
                "alarm not found",
            ));
        }
        Ok(())
    }

    fn insert_log(&self, log: &ExecutionLog) -> DomainResult<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO execution_logs (
                alarm_id, alarm_name, started_at, finished_at, status, exit_code,
                duration_ms, retry_count, command_preview, stdout, stderr
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                log.alarm_id,
                log.alarm_name,
                dt_to_str(log.started_at),
                log.finished_at.map(dt_to_str),
                status_str(log.status),
                log.exit_code,
                log.duration_ms,
                log.retry_count as i64,
                log.command_preview,
                log.stdout,
                log.stderr,
            ],
        )
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        Ok(conn.last_insert_rowid())
    }

    fn update_log(&self, log: &ExecutionLog) -> DomainResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE execution_logs SET
                finished_at=?1, status=?2, exit_code=?3, duration_ms=?4,
                retry_count=?5, stdout=?6, stderr=?7
             WHERE id=?8",
            params![
                log.finished_at.map(dt_to_str),
                status_str(log.status),
                log.exit_code,
                log.duration_ms,
                log.retry_count as i64,
                log.stdout,
                log.stderr,
                log.id,
            ],
        )
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        Ok(())
    }

    fn list_logs(&self, filter: &LogFilter) -> DomainResult<Vec<ExecutionLog>> {
        let conn = self.conn.lock().unwrap();
        let mut sql = String::from(
            "SELECT id, alarm_id, alarm_name, started_at, finished_at, status, exit_code,
                    duration_ms, retry_count, command_preview, stdout, stderr
             FROM execution_logs WHERE 1=1",
        );
        let mut bind_alarm: Option<String> = None;
        let mut bind_status: Option<String> = None;
        let mut bind_query: Option<String> = None;

        if let Some(aid) = &filter.alarm_id {
            sql.push_str(" AND alarm_id = ?");
            bind_alarm = Some(aid.clone());
        }
        if let Some(st) = filter.status {
            sql.push_str(" AND status = ?");
            bind_status = Some(status_str(st).into());
        }
        if let Some(q) = &filter.query {
            if !q.trim().is_empty() {
                sql.push_str(" AND (alarm_name LIKE ? OR command_preview LIKE ? OR stdout LIKE ? OR stderr LIKE ?)");
                bind_query = Some(format!("%{}%", q.trim()));
            }
        }
        sql.push_str(" ORDER BY started_at DESC LIMIT ?");

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;

        // Build params dynamically is awkward with rusqlite; use simplified path.
        let limit = filter.limit as i64;
        let rows: Vec<ExecutionLog> = match (bind_alarm, bind_status, bind_query) {
            (None, None, None) => map_logs(
                stmt.query_map(params![limit], map_log_row)
                    .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?,
            )?,
            (Some(a), None, None) => map_logs(
                stmt.query_map(params![a, limit], map_log_row)
                    .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?,
            )?,
            (None, Some(s), None) => map_logs(
                stmt.query_map(params![s, limit], map_log_row)
                    .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?,
            )?,
            (None, None, Some(q)) => map_logs(
                stmt.query_map(params![q, q, q, q, limit], map_log_row)
                    .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?,
            )?,
            (Some(a), Some(s), None) => map_logs(
                stmt.query_map(params![a, s, limit], map_log_row)
                    .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?,
            )?,
            (Some(a), None, Some(q)) => map_logs(
                stmt.query_map(params![a, q, q, q, q, limit], map_log_row)
                    .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?,
            )?,
            (None, Some(s), Some(q)) => map_logs(
                stmt.query_map(params![s, q, q, q, q, limit], map_log_row)
                    .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?,
            )?,
            (Some(a), Some(s), Some(q)) => map_logs(
                stmt.query_map(params![a, s, q, q, q, q, limit], map_log_row)
                    .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?,
            )?,
        };
        Ok(rows)
    }

    fn delete_log(&self, id: i64) -> DomainResult<()> {
        let conn = self.conn.lock().unwrap();
        let n = conn
            .execute(SQL_DELETE_LOG, params![id])
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        if n == 0 {
            return Err(DomainError::new(ErrorCode::StorageFailed, "log not found"));
        }
        Ok(())
    }

    fn delete_logs(&self, ids: &[i64]) -> DomainResult<u64> {
        if ids.is_empty() {
            return Ok(0);
        }
        let conn = self.conn.lock().unwrap();
        let mut total = 0u64;
        for id in ids {
            let n = conn
                .execute(SQL_DELETE_LOG, params![id])
                .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
            total += n as u64;
        }
        Ok(total)
    }

    fn get_settings(&self) -> DomainResult<AppSettings> {
        use crate::domain::{
            AiProvider, AiSettings, AppearanceSettings, BackupSettings, McpSettings,
            NotifySettings, RuntimeSettings,
        };
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT theme, locale, launch_minimized, log_retention_days,
                    notify_on_failure, sound_enabled, timezone, auto_backup_on_start, backup_keep_count,
                    COALESCE(ai_base_url, ''), COALESCE(ai_api_key, ''), COALESCE(ai_model, 'gpt-5.6-terra'),
                    COALESCE(ai_provider, 'openai'),
                    COALESCE(mcp_enabled, 0), COALESCE(mcp_listen_host, '127.0.0.1'),
                    COALESCE(mcp_port, 33927), COALESCE(mcp_auth_token, '')
             FROM app_settings WHERE id = 1",
            [],
            |row| {
                let theme = match row.get::<_, String>(0)?.as_str() {
                    "light" => ThemeMode::Light,
                    "dark" => ThemeMode::Dark,
                    _ => ThemeMode::System,
                };
                let locale = LocaleCode::parse(&row.get::<_, String>(1)?);
                let timezone: String = {
                    let tz: String = row.get(6)?;
                    if tz.trim().is_empty() {
                        "system".into()
                    } else {
                        tz
                    }
                };
                let provider = AiProvider::parse(&row.get::<_, String>(12)?);
                let model: String = {
                    let m: String = row.get(11)?;
                    if m.trim().is_empty() {
                        provider.default_model().into()
                    } else {
                        m
                    }
                };
                let port = row.get::<_, i64>(15)?.clamp(1, 65535) as u16;
                Ok(AppSettings {
                    appearance: AppearanceSettings { theme, locale },
                    runtime: RuntimeSettings {
                        launch_minimized: row.get::<_, i64>(2)? != 0,
                        log_retention_days: row.get::<_, i64>(3)? as u32,
                        timezone,
                    },
                    notify: NotifySettings {
                        notify_on_failure: row.get::<_, i64>(4)? != 0,
                        sound_enabled: row.get::<_, i64>(5)? != 0,
                    },
                    backup: BackupSettings {
                        auto_backup_on_start: row.get::<_, i64>(7)? != 0,
                        backup_keep_count: row.get::<_, i64>(8)? as u32,
                    },
                    ai: AiSettings {
                        provider,
                        base_url: row.get::<_, String>(9)?,
                        api_key: row.get::<_, String>(10)?,
                        model,
                    },
                    mcp: McpSettings {
                        enabled: row.get::<_, i64>(13)? != 0,
                        listen_host: {
                            let h: String = row.get(14)?;
                            if h.trim().is_empty() {
                                "127.0.0.1".into()
                            } else {
                                h
                            }
                        },
                        port,
                        auth_token: row.get::<_, String>(16)?,
                    },
                })
            },
        )
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))
    }

    fn save_settings(&self, settings: &AppSettings) -> DomainResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE app_settings SET
                theme=?1, locale=?2, launch_minimized=?3, log_retention_days=?4,
                notify_on_failure=?5, sound_enabled=?6, timezone=?7,
                auto_backup_on_start=?8, backup_keep_count=?9,
                ai_base_url=?10, ai_api_key=?11, ai_model=?12, ai_provider=?13,
                mcp_enabled=?14, mcp_listen_host=?15, mcp_port=?16, mcp_auth_token=?17
             WHERE id=1",
            params![
                match settings.appearance.theme {
                    ThemeMode::System => "system",
                    ThemeMode::Light => "light",
                    ThemeMode::Dark => "dark",
                },
                settings.appearance.locale.as_str(),
                if settings.runtime.launch_minimized {
                    1
                } else {
                    0
                },
                settings.runtime.log_retention_days as i64,
                if settings.notify.notify_on_failure {
                    1
                } else {
                    0
                },
                if settings.notify.sound_enabled { 1 } else { 0 },
                settings.runtime.timezone.as_str(),
                if settings.backup.auto_backup_on_start {
                    1
                } else {
                    0
                },
                settings.backup.backup_keep_count as i64,
                settings.ai.base_url.as_str(),
                settings.ai.api_key.as_str(),
                settings.ai.resolved_model(),
                settings.ai.provider.as_str(),
                if settings.mcp.enabled { 1 } else { 0 },
                settings.mcp.listen_host.as_str(),
                settings.mcp.port as i64,
                settings.mcp.auth_token.as_str(),
            ],
        )
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        Ok(())
    }

    fn purge_old_logs(&self, retention_days: u32) -> DomainResult<u64> {
        let conn = self.conn.lock().unwrap();
        let cutoff = Utc::now() - chrono::Duration::days(retention_days as i64);
        let n = conn
            .execute(
                "DELETE FROM execution_logs WHERE started_at < ?1",
                params![dt_to_str(cutoff)],
            )
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        Ok(n as u64)
    }
}
