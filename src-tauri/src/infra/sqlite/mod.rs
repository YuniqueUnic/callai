//! SQLite adapter. SQL lives only in this module tree.
#![allow(dead_code, clippy::too_many_arguments, clippy::type_complexity)]
use std::sync::Mutex;

use rusqlite::Connection;

use crate::domain::{DomainError, DomainResult, ErrorCode};

mod ai_chat;
mod alarms_logs;
mod helpers;
mod migrate;

pub struct SqliteStore {
    pub(crate) conn: Mutex<Connection>,
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
        migrate::migrate_schema(&conn)
    }
}
