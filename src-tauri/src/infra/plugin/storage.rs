//! Per-plugin isolated SQLite (`data.db`): KV store + invoke history.
use std::path::Path;
use std::sync::Mutex;

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};

use crate::domain::{DomainError, DomainResult, ErrorCode, PluginHistoryEntry, MCP_LOG_MAX};

pub struct PluginDb {
    conn: Mutex<Connection>,
}

impl PluginDb {
    pub fn open(path: &Path) -> DomainResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                DomainError::new(ErrorCode::StorageFailed, format!("mkdir plugin db: {e}"))
            })?;
        }
        let conn = Connection::open(path).map_err(|e| {
            DomainError::new(ErrorCode::StorageFailed, format!("open plugin db: {e}"))
        })?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> DomainResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS kv (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                method TEXT NOT NULL,
                args_preview TEXT NOT NULL,
                result_preview TEXT NOT NULL,
                ok INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            "#,
        )
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("plugin migrate: {e}")))?;
        Ok(())
    }

    pub fn get(&self, key: &str) -> DomainResult<Option<String>> {
        let conn = self.conn.lock().unwrap();
        conn.query_row("SELECT value FROM kv WHERE key = ?1", params![key], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))
    }

    pub fn set(&self, key: &str, value: &str) -> DomainResult<()> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO kv(key, value, updated_at) VALUES(?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value, now],
        )
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        Ok(())
    }

    pub fn delete(&self, key: &str) -> DomainResult<bool> {
        let conn = self.conn.lock().unwrap();
        let n = conn
            .execute("DELETE FROM kv WHERE key = ?1", params![key])
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        Ok(n > 0)
    }

    pub fn list_keys(&self, prefix: Option<&str>) -> DomainResult<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let mut out = Vec::new();
        if let Some(p) = prefix {
            let like = format!("{p}%");
            let mut stmt = conn
                .prepare("SELECT key FROM kv WHERE key LIKE ?1 ORDER BY key")
                .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
            let rows = stmt
                .query_map(params![like], |row| row.get::<_, String>(0))
                .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
            for r in rows {
                out.push(r.map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?);
            }
        } else {
            let mut stmt = conn
                .prepare("SELECT key FROM kv ORDER BY key")
                .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
            let rows = stmt
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
            for r in rows {
                out.push(r.map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?);
            }
        }
        Ok(out)
    }

    pub fn append_history(
        &self,
        method: &str,
        args_preview: &str,
        result_preview: &str,
        ok: bool,
    ) -> DomainResult<i64> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO history(method, args_preview, result_preview, ok, created_at)
             VALUES(?1, ?2, ?3, ?4, ?5)",
            params![method, args_preview, result_preview, ok as i64, now],
        )
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        let id = conn.last_insert_rowid();
        // Keep last 200 history rows per plugin.
        let _ = conn.execute(
            "DELETE FROM history WHERE id NOT IN (
                SELECT id FROM history ORDER BY id DESC LIMIT 200
            )",
            [],
        );
        Ok(id)
    }

    pub fn list_history(&self, limit: u32) -> DomainResult<Vec<PluginHistoryEntry>> {
        let limit = limit.clamp(1, 200) as i64;
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT id, method, args_preview, result_preview, ok, created_at
                 FROM history ORDER BY id DESC LIMIT ?1",
            )
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        let rows = stmt
            .query_map(params![limit], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        let mut out = Vec::new();
        for r in rows {
            let (id, method, args_preview, result_preview, ok, created_at) =
                r.map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
            out.push(PluginHistoryEntry {
                id,
                method,
                args_preview,
                result_preview,
                ok: ok != 0,
                created_at: parse_dt(&created_at)?,
            });
        }
        Ok(out)
    }

    pub fn record_count(&self) -> DomainResult<u64> {
        let conn = self.conn.lock().unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM kv", [], |row| row.get(0))
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        Ok(n as u64)
    }

    pub fn set_meta(&self, key: &str, value: &str) -> DomainResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO meta(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        Ok(())
    }

    pub fn get_meta(&self, key: &str) -> DomainResult<Option<String>> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT value FROM meta WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))
    }
}

fn parse_dt(s: &str) -> DomainResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s)
        .map(|d| d.with_timezone(&Utc))
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("bad datetime: {e}")))
}

/// App-level MCP audit log store (shared DB table).
pub struct McpLogStore {
    conn: Mutex<Connection>,
}

impl McpLogStore {
    pub fn open(path: &Path) -> DomainResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                DomainError::new(ErrorCode::StorageFailed, format!("mkdir mcp log: {e}"))
            })?;
        }
        let conn = Connection::open(path).map_err(|e| {
            DomainError::new(ErrorCode::StorageFailed, format!("open mcp log: {e}"))
        })?;
        let store = Self {
            conn: Mutex::new(conn),
        };
        store.migrate()?;
        Ok(store)
    }

    #[allow(dead_code)]
    pub fn open_in_memory() -> DomainResult<Self> {
        let conn = Connection::open_in_memory()
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
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
            CREATE TABLE IF NOT EXISTS mcp_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tool TEXT NOT NULL,
                args_preview TEXT NOT NULL,
                result_preview TEXT NOT NULL,
                ok INTEGER NOT NULL,
                source TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            "#,
        )
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        Ok(())
    }

    pub fn append(
        &self,
        tool: &str,
        args_preview: &str,
        result_preview: &str,
        ok: bool,
        source: &str,
    ) -> DomainResult<i64> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO mcp_logs(tool, args_preview, result_preview, ok, source, created_at)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                tool,
                truncate(args_preview, 500),
                truncate(result_preview, 800),
                ok as i64,
                source,
                now
            ],
        )
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        let id = conn.last_insert_rowid();
        let _ = conn.execute(
            &format!(
                "DELETE FROM mcp_logs WHERE id NOT IN (
                    SELECT id FROM mcp_logs ORDER BY id DESC LIMIT {MCP_LOG_MAX}
                )"
            ),
            [],
        );
        Ok(id)
    }

    pub fn list(&self, limit: u32) -> DomainResult<Vec<crate::domain::McpLogEntry>> {
        let limit = limit.clamp(1, MCP_LOG_MAX as u32) as i64;
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT id, tool, args_preview, result_preview, ok, source, created_at
                 FROM mcp_logs
                 WHERE source = 'mcp'
                 ORDER BY id DESC LIMIT ?1",
            )
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        let rows = stmt
            .query_map(params![limit], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            })
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        let mut out = Vec::new();
        for r in rows {
            let (id, tool, args_preview, result_preview, ok, source, created_at) =
                r.map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
            out.push(crate::domain::McpLogEntry {
                id,
                tool,
                args_preview,
                result_preview,
                ok: ok != 0,
                source,
                created_at: parse_dt(&created_at)?,
            });
        }
        Ok(out)
    }

    pub fn clear(&self) -> DomainResult<u64> {
        let conn = self.conn.lock().unwrap();
        let n = conn
            .execute("DELETE FROM mcp_logs", [])
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        Ok(n as u64)
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let t: String = s.chars().take(max).collect();
        format!("{t}…")
    }
}
