//! Schema bootstrap + additive migrations.
#![allow(dead_code)]
use crate::domain::{DomainError, DomainResult, ErrorCode};

const BOOTSTRAP_SQL: &str = r#"
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
                updated_at TEXT NOT NULL,
                notification_json TEXT NOT NULL DEFAULT '{"enabled":true,"notification_type":"with_sound"}'
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
                sound_enabled INTEGER NOT NULL DEFAULT 1,
                timezone TEXT NOT NULL DEFAULT 'system',
                auto_backup_on_start INTEGER NOT NULL,
                backup_keep_count INTEGER NOT NULL
            );

            -- Insert without sound_enabled so pre-migration DBs (missing the column)
            -- still accept this statement; DEFAULT applies on fresh CREATE TABLE.
            INSERT OR IGNORE INTO app_settings (
                id, theme, locale, launch_minimized, log_retention_days,
                notify_on_failure, auto_backup_on_start, backup_keep_count
            ) VALUES (1, 'system', 'zh-CN', 0, 30, 0, 1, 10);
"#;

const AI_CHAT_SQL: &str = r#"
            CREATE TABLE IF NOT EXISTS ai_chat_messages (
                id TEXT PRIMARY KEY,
                role TEXT NOT NULL,
                kind TEXT NOT NULL,
                content TEXT NOT NULL,
                payload_json TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                applied INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_ai_chat_created_at
                ON ai_chat_messages(created_at DESC);
"#;

fn try_add_column(conn: &rusqlite::Connection, sql: &str) {
    let _ = conn.execute(sql, []);
}

pub(crate) fn migrate_schema(conn: &rusqlite::Connection) -> DomainResult<()> {
    conn.execute_batch(BOOTSTRAP_SQL)
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("migrate: {e}")))?;

    // Additive columns for existing installs (must run after CREATE/INSERT batch).
    try_add_column(
        conn,
        "ALTER TABLE alarms ADD COLUMN timeout_secs INTEGER NOT NULL DEFAULT 20",
    );
    try_add_column(
        conn,
        "ALTER TABLE app_settings ADD COLUMN sound_enabled INTEGER NOT NULL DEFAULT 1",
    );
    try_add_column(
        conn,
        "ALTER TABLE app_settings ADD COLUMN timezone TEXT NOT NULL DEFAULT 'system'",
    );
    try_add_column(
        conn,
        "ALTER TABLE alarms ADD COLUMN notification_json TEXT NOT NULL DEFAULT '{\"enabled\":true,\"notification_type\":\"with_sound\"}'",
    );
    try_add_column(conn, "ALTER TABLE alarms ADD COLUMN plugin_json TEXT");
    try_add_column(
        conn,
        "ALTER TABLE app_settings ADD COLUMN ai_base_url TEXT NOT NULL DEFAULT ''",
    );
    try_add_column(
        conn,
        "ALTER TABLE app_settings ADD COLUMN ai_api_key TEXT NOT NULL DEFAULT ''",
    );
    try_add_column(
        conn,
        "ALTER TABLE app_settings ADD COLUMN ai_model TEXT NOT NULL DEFAULT 'gpt-4o-mini'",
    );
    try_add_column(
        conn,
        "ALTER TABLE app_settings ADD COLUMN ai_provider TEXT NOT NULL DEFAULT 'openai'",
    );
    try_add_column(
        conn,
        "ALTER TABLE app_settings ADD COLUMN mcp_enabled INTEGER NOT NULL DEFAULT 0",
    );
    try_add_column(
        conn,
        "ALTER TABLE app_settings ADD COLUMN mcp_listen_host TEXT NOT NULL DEFAULT '127.0.0.1'",
    );
    try_add_column(
        conn,
        "ALTER TABLE app_settings ADD COLUMN mcp_port INTEGER NOT NULL DEFAULT 3927",
    );
    try_add_column(
        conn,
        "ALTER TABLE app_settings ADD COLUMN mcp_auth_token TEXT NOT NULL DEFAULT ''",
    );

    // One-shot bump of retired OpenAI defaults (idempotent; ignores missing column).
    let _ = conn.execute(
        "UPDATE app_settings SET ai_model = 'gpt-5.6-terra' WHERE ai_model IN ('gpt-4o-mini','gpt-4o','gpt-4.1-mini')",
        [],
    );

    let _ = conn.execute_batch(AI_CHAT_SQL);
    Ok(())
}
