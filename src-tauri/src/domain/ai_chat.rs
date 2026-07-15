//! Persisted AI assistant chat messages (single shared thread for now).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiChatRole {
    User,
    Assistant,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiChatKind {
    /// Plain user or assistant text
    Text,
    /// Assistant parse/runtime error (payload may hold raw model output)
    Error,
    /// Alarm draft preview (payload = AlarmDraft JSON)
    AlarmDraft,
    /// Plugin draft preview (payload = PluginDraft JSON)
    PluginDraft,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChatMessage {
    pub id: String,
    pub role: AiChatRole,
    pub kind: AiChatKind,
    pub content: String,
    /// Optional JSON payload (draft / raw result). Empty string if none.
    #[serde(default)]
    pub payload_json: String,
    pub created_at: String,
    /// Soft flag: draft was applied (alarm created / plugin installed).
    #[serde(default)]
    pub applied: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChatPage {
    pub messages: Vec<AiChatMessage>,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct AiChatUpsert {
    pub id: String,
    pub role: AiChatRole,
    pub kind: AiChatKind,
    pub content: String,
    #[serde(default)]
    pub payload_json: String,
    #[serde(default)]
    pub applied: bool,
}
