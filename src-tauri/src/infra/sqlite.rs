//! SQLite adapter. SQL lives only in this module (constants + helpers);
//! call sites must not embed ad-hoc SQL strings.
#![allow(dead_code, clippy::too_many_arguments, clippy::type_complexity)]
use std::sync::Mutex;

use chrono::{DateTime, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension};

use crate::app::AlarmStore;
use crate::domain::{
    Alarm, AlarmLifecycle, AppSettings, DomainError, DomainResult, EnvVar, ErrorCode, ExecutionLog,
    ExecutionStatus, LocaleCode, LogFilter, RetryInterval, RetryPolicy, ScheduleSpec, ThemeMode,
};

const SQL_LIST_ALARMS: &str = concat!(
    "SELECT id, name, enabled, schedule_json, binary_path, args_json, env_json, ",
    "retry_interval, timeout_secs, lifecycle_json, created_at, updated_at ",
    "FROM alarms ORDER BY created_at DESC"
);
const SQL_GET_ALARM: &str = concat!(
    "SELECT id, name, enabled, schedule_json, binary_path, args_json, env_json, ",
    "retry_interval, timeout_secs, lifecycle_json, created_at, updated_at ",
    "FROM alarms WHERE id = ?1"
);
const SQL_DELETE_LOG: &str = "DELETE FROM execution_logs WHERE id = ?1";
const SQL_DELETE_LOGS_BY_ALARM: &str = "DELETE FROM execution_logs WHERE alarm_id = ?1";
const SQL_DELETE_ALARM: &str = "DELETE FROM alarms WHERE id = ?1";

pub struct SqliteStore {
    conn: Mutex<Connection>,
}

impl SqliteStore {
    pub fn open(path: &std::path::Path) -> DomainResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                DomainError::new(ErrorCode::StorageFailed, format!("mkdir db: {e}"))
            })?;
        }
        let conn = Connection::open(path)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("open db: {e}")))?;
        let store = Self {
            conn: Mutex::new(conn),
        };
        store.migrate()?;
        Ok(store)
    }

    pub fn open_in_memory() -> DomainResult<Self> {
        let conn = Connection::open_in_memory()
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("open mem db: {e}")))?;
        let store = Self {
            conn: Mutex::new(conn),
        };
        store.migrate()?;
        Ok(store)
    }

    fn migrate(&self) -> DomainResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS alarms (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                enabled INTEGER NOT NULL,
                schedule_json TEXT NOT NULL,
                binary_path TEXT NOT NULL,
                args_json TEXT NOT NULL,
                env_json TEXT NOT NULL,
                retry_interval TEXT NOT NULL,
                timeout_secs INTEGER NOT NULL DEFAULT 20,
                lifecycle_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS execution_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alarm_id TEXT NOT NULL,
                alarm_name TEXT NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                status TEXT NOT NULL,
                exit_code INTEGER,
                duration_ms INTEGER,
                retry_count INTEGER NOT NULL DEFAULT 0,
                command_preview TEXT NOT NULL,
                stdout TEXT NOT NULL DEFAULT '',
                stderr TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                theme TEXT NOT NULL,
                locale TEXT NOT NULL,
                launch_minimized INTEGER NOT NULL,
                log_retention_days INTEGER NOT NULL,
                notify_on_failure INTEGER NOT NULL,
                auto_backup_on_start INTEGER NOT NULL,
                backup_keep_count INTEGER NOT NULL
            );

            INSERT OR IGNORE INTO app_settings (
                id, theme, locale, launch_minimized, log_retention_days,
                notify_on_failure, auto_backup_on_start, backup_keep_count
            ) VALUES (1, 'system', 'zh-CN', 0, 30, 0, 1, 10);
            "#,
        )
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("migrate: {e}")))?;
        // Additive columns for existing installs.
        let _ = conn.execute(
            "ALTER TABLE alarms ADD COLUMN timeout_secs INTEGER NOT NULL DEFAULT 20",
            [],
        );
        Ok(())
    }
}

fn dt_to_str(dt: DateTime<Utc>) -> String {
    dt.to_rfc3339()
}

fn str_to_dt(s: &str) -> DomainResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s)
        .map(|d| d.with_timezone(&Utc))
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("bad datetime: {e}")))
}

fn alarm_from_row(
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
) -> DomainResult<Alarm> {
    let schedule: ScheduleSpec = serde_json::from_str(&schedule_json)
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("schedule json: {e}")))?;
    let args: Vec<String> = serde_json::from_str(&args_json)
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("args json: {e}")))?;
    let env_vars: Vec<EnvVar> = serde_json::from_str(&env_json)
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("env json: {e}")))?;
    let lifecycle: AlarmLifecycle = serde_json::from_str(&lifecycle_json)
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("lifecycle json: {e}")))?;
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
        lifecycle,
        created_at: str_to_dt(&created_at)?,
        updated_at: str_to_dt(&updated_at)?,
    })
}

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
                ))
            })
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;

        let mut out = Vec::new();
        for r in rows {
            let t = r.map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
            out.push(alarm_from_row(
                t.0, t.1, t.2, t.3, t.4, t.5, t.6, t.7, t.8, t.9, t.10, t.11,
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
                ))
            })
            .optional()
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        match row {
            Some(t) => Ok(Some(alarm_from_row(
                t.0, t.1, t.2, t.3, t.4, t.5, t.6, t.7, t.8, t.9, t.10, t.11,
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
        conn.execute(
            "INSERT INTO alarms (
                id, name, enabled, schedule_json, binary_path, args_json, env_json,
                retry_interval, timeout_secs, lifecycle_json, created_at, updated_at
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
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
                updated_at=excluded.updated_at",
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
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT theme, locale, launch_minimized, log_retention_days,
                    notify_on_failure, auto_backup_on_start, backup_keep_count
             FROM app_settings WHERE id = 1",
            [],
            |row| {
                Ok(AppSettings {
                    theme: match row.get::<_, String>(0)?.as_str() {
                        "light" => ThemeMode::Light,
                        "dark" => ThemeMode::Dark,
                        _ => ThemeMode::System,
                    },
                    locale: LocaleCode::parse(&row.get::<_, String>(1)?),
                    launch_minimized: row.get::<_, i64>(2)? != 0,
                    log_retention_days: row.get::<_, i64>(3)? as u32,
                    notify_on_failure: row.get::<_, i64>(4)? != 0,
                    auto_backup_on_start: row.get::<_, i64>(5)? != 0,
                    backup_keep_count: row.get::<_, i64>(6)? as u32,
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
                notify_on_failure=?5, auto_backup_on_start=?6, backup_keep_count=?7
             WHERE id=1",
            params![
                match settings.theme {
                    ThemeMode::System => "system",
                    ThemeMode::Light => "light",
                    ThemeMode::Dark => "dark",
                },
                settings.locale.as_str(),
                if settings.launch_minimized { 1 } else { 0 },
                settings.log_retention_days as i64,
                if settings.notify_on_failure { 1 } else { 0 },
                if settings.auto_backup_on_start { 1 } else { 0 },
                settings.backup_keep_count as i64,
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

fn status_str(s: ExecutionStatus) -> &'static str {
    match s {
        ExecutionStatus::Running => "running",
        ExecutionStatus::Success => "success",
        ExecutionStatus::Failed => "failed",
        ExecutionStatus::Retrying => "retrying",
        ExecutionStatus::Canceled => "canceled",
        ExecutionStatus::Timeout => "timeout",
    }
}

fn parse_status(s: &str) -> ExecutionStatus {
    match s {
        "success" => ExecutionStatus::Success,
        "failed" => ExecutionStatus::Failed,
        "retrying" => ExecutionStatus::Retrying,
        "canceled" | "cancelled" => ExecutionStatus::Canceled,
        "timeout" => ExecutionStatus::Timeout,
        _ => ExecutionStatus::Running,
    }
}

fn map_log_row(
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

fn map_logs(
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

#[allow(dead_code)]
fn _unused_tz() {
    let _ = Utc.timestamp_opt(0, 0);
}
