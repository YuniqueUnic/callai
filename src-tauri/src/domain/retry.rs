use serde::{Deserialize, Serialize};

use super::{DomainError, DomainResult, ErrorCode};

/// Allowed retry intervals (product constraint).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RetryInterval {
    #[serde(rename = "1m")]
    OneMinute,
    #[default]
    #[serde(rename = "2m")]
    TwoMinutes,
    #[serde(rename = "5m")]
    FiveMinutes,
    #[serde(rename = "10m")]
    TenMinutes,
}

impl RetryInterval {
    pub const MAX_ATTEMPTS: u32 = 3;

    pub fn as_str(self) -> &'static str {
        match self {
            Self::OneMinute => "1m",
            Self::TwoMinutes => "2m",
            Self::FiveMinutes => "5m",
            Self::TenMinutes => "10m",
        }
    }

    pub fn seconds(self) -> u64 {
        match self {
            Self::OneMinute => 60,
            Self::TwoMinutes => 120,
            Self::FiveMinutes => 300,
            Self::TenMinutes => 600,
        }
    }

    pub fn parse(raw: &str) -> DomainResult<Self> {
        match raw.trim() {
            "1m" | "1min" | "1" => Ok(Self::OneMinute),
            "2m" | "2min" | "2" | "" => Ok(Self::TwoMinutes),
            "5m" | "5min" | "5" => Ok(Self::FiveMinutes),
            "10m" | "10min" | "10" => Ok(Self::TenMinutes),
            other => Err(DomainError::new(
                ErrorCode::Internal,
                format!("unsupported retry interval: {other}"),
            )),
        }
    }
}

/// Retry policy: max 3 attempts, fixed interval choices.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RetryPolicy {
    pub interval: RetryInterval,
    pub max_attempts: u32,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            interval: RetryInterval::TwoMinutes,
            max_attempts: RetryInterval::MAX_ATTEMPTS,
        }
    }
}

impl RetryPolicy {
    pub fn new(interval: RetryInterval) -> Self {
        Self {
            interval,
            max_attempts: RetryInterval::MAX_ATTEMPTS,
        }
    }

    /// Returns wait seconds before the next attempt for the given 0-based retry index.
    /// `attempt` 0 means first failure → wait before 2nd try.
    pub fn wait_seconds_for_attempt(&self, attempt: u32) -> Option<u64> {
        if attempt >= self.max_attempts {
            return None;
        }
        Some(self.interval.seconds())
    }
}
