//! AI chat message persistence on SqliteStore.
#![allow(dead_code)]
use super::SqliteStore;
use crate::domain::{DomainError, DomainResult, ErrorCode};
use rusqlite::params;

fn ai_role_str(r: &crate::domain::AiChatRole) -> &'static str {
    match r {
        crate::domain::AiChatRole::User => "user",
        crate::domain::AiChatRole::Assistant => "assistant",
    }
}

fn ai_kind_str(k: &crate::domain::AiChatKind) -> &'static str {
    match k {
        crate::domain::AiChatKind::Text => "text",
        crate::domain::AiChatKind::Error => "error",
        crate::domain::AiChatKind::AlarmDraft => "alarm_draft",
        crate::domain::AiChatKind::PluginDraft => "plugin_draft",
    }
}

fn parse_ai_role(s: &str) -> crate::domain::AiChatRole {
    match s {
        "user" => crate::domain::AiChatRole::User,
        _ => crate::domain::AiChatRole::Assistant,
    }
}

fn parse_ai_kind(s: &str) -> crate::domain::AiChatKind {
    match s {
        "error" => crate::domain::AiChatKind::Error,
        "alarm_draft" => crate::domain::AiChatKind::AlarmDraft,
        "plugin_draft" => crate::domain::AiChatKind::PluginDraft,
        _ => crate::domain::AiChatKind::Text,
    }
}

fn map_ai_chat_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<crate::domain::AiChatMessage> {
    let role: String = row.get(1)?;
    let kind: String = row.get(2)?;
    Ok(crate::domain::AiChatMessage {
        id: row.get(0)?,
        role: parse_ai_role(&role),
        kind: parse_ai_kind(&kind),
        content: row.get(3)?,
        payload_json: row.get(4)?,
        created_at: row.get(5)?,
        applied: row.get::<_, i64>(6)? != 0,
    })
}

impl SqliteStore {
    pub fn upsert_ai_chat_message(&self, msg: &crate::domain::AiChatMessage) -> DomainResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"INSERT INTO ai_chat_messages
                (id, role, kind, content, payload_json, created_at, applied)
               VALUES (?1,?2,?3,?4,?5,?6,?7)
               ON CONFLICT(id) DO UPDATE SET
                 role=excluded.role,
                 kind=excluded.kind,
                 content=excluded.content,
                 payload_json=excluded.payload_json,
                 created_at=excluded.created_at,
                 applied=excluded.applied"#,
            params![
                msg.id.as_str(),
                ai_role_str(&msg.role),
                ai_kind_str(&msg.kind),
                msg.content.as_str(),
                msg.payload_json.as_str(),
                msg.created_at.as_str(),
                if msg.applied { 1 } else { 0 },
            ],
        )
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        Ok(())
    }

    /// If `before` is set, load messages older than that created_at (DESC page).
    pub fn list_ai_chat_messages(
        &self,
        before: Option<&str>,
        limit: u32,
    ) -> DomainResult<crate::domain::AiChatPage> {
        let limit = limit.clamp(1, 100) as i64;
        let fetch = limit + 1;
        let conn = self.conn.lock().unwrap();
        let rows = if let Some(b) = before.filter(|s| !s.trim().is_empty()) {
            let mut stmt = conn
                .prepare(
                    r#"SELECT id, role, kind, content, payload_json, created_at, applied
                       FROM ai_chat_messages
                       WHERE created_at < ?1
                       ORDER BY created_at DESC
                       LIMIT ?2"#,
                )
                .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
            let mapped = stmt
                .query_map(params![b, fetch], map_ai_chat_row)
                .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
            mapped
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?
        } else {
            let mut stmt = conn
                .prepare(
                    r#"SELECT id, role, kind, content, payload_json, created_at, applied
                       FROM ai_chat_messages
                       ORDER BY created_at DESC
                       LIMIT ?1"#,
                )
                .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
            let mapped = stmt
                .query_map(params![fetch], map_ai_chat_row)
                .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
            mapped
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?
        };

        let has_more = (rows.len() as i64) > limit;
        let mut messages: Vec<crate::domain::AiChatMessage> =
            rows.into_iter().take(limit as usize).collect();
        messages.reverse(); // chronological for UI
        Ok(crate::domain::AiChatPage { messages, has_more })
    }

    pub fn delete_ai_chat_messages(&self, ids: &[String]) -> DomainResult<u64> {
        if ids.is_empty() {
            return Ok(0);
        }
        let conn = self.conn.lock().unwrap();
        let mut n = 0u64;
        for id in ids {
            let c = conn
                .execute("DELETE FROM ai_chat_messages WHERE id = ?1", params![id])
                .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
            n += c as u64;
        }
        Ok(n)
    }

    pub fn clear_ai_chat_messages(&self) -> DomainResult<u64> {
        let conn = self.conn.lock().unwrap();
        let n = conn
            .execute("DELETE FROM ai_chat_messages", [])
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        Ok(n as u64)
    }

    pub fn set_ai_chat_applied(&self, id: &str, applied: bool) -> DomainResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE ai_chat_messages SET applied = ?1 WHERE id = ?2",
            params![if applied { 1 } else { 0 }, id],
        )
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?;
        Ok(())
    }
}
