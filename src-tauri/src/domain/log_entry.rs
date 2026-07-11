use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionStatus {
    Running,
    Success,
    Failed,
    Retrying,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionLog {
    pub id: i64,
    pub alarm_id: String,
    pub alarm_name: String,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub status: ExecutionStatus,
    pub exit_code: Option<i32>,
    pub duration_ms: Option<i64>,
    pub retry_count: u32,
    pub command_preview: String,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogFilter {
    pub alarm_id: Option<String>,
    pub status: Option<ExecutionStatus>,
    pub query: Option<String>,
    pub limit: u32,
}

impl Default for LogFilter {
    fn default() -> Self {
        Self {
            alarm_id: None,
            status: None,
            query: None,
            limit: 100,
        }
    }
}
