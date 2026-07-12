use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Stable error codes consumed by the frontend i18n layer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    InvalidName,
    InvalidBinary,
    InvalidSchedule,
    InvalidCron,
    InvalidArgs,
    AlarmNotFound,
    AlarmBusy,
    ExecutionFailed,
    ExecutionTimeout,
    BinaryNotFound,
    PermissionDenied,
    ConfigCorrupt,
    StorageFailed,
    Internal,
}

#[derive(Debug, Error, Clone, Serialize, Deserialize)]
#[error("{code:?}: {message}")]
pub struct DomainError {
    pub code: ErrorCode,
    pub message: String,
}

impl DomainError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

pub type DomainResult<T> = Result<T, DomainError>;
