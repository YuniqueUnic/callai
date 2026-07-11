#![allow(dead_code)]
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{DomainError, DomainResult, ErrorCode, RetryPolicy, ScheduleSpec};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AlarmLifecycle {
    Idle,
    Running,
    Retrying { attempt: u32 },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Alarm {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub schedule: ScheduleSpec,
    pub binary: String,
    pub args: Vec<String>,
    pub env_vars: Vec<EnvVar>,
    pub retry: RetryPolicy,
    pub lifecycle: AlarmLifecycle,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlarmDraft {
    pub name: String,
    pub enabled: bool,
    pub schedule: ScheduleSpec,
    pub binary: String,
    pub args: Vec<String>,
    pub env_vars: Vec<EnvVar>,
    pub retry: RetryPolicy,
}

impl AlarmDraft {
    pub fn validate(&self) -> DomainResult<()> {
        let name = self.name.trim();
        if name.is_empty() {
            return Err(DomainError::new(
                ErrorCode::InvalidName,
                "alarm name is required",
            ));
        }
        if self.binary.trim().is_empty() {
            return Err(DomainError::new(
                ErrorCode::InvalidBinary,
                "binary is required",
            ));
        }
        self.schedule.validate()?;
        for env in &self.env_vars {
            if env.key.trim().is_empty() {
                return Err(DomainError::new(
                    ErrorCode::InvalidArgs,
                    "env var key cannot be empty",
                ));
            }
        }
        Ok(())
    }
}

impl Alarm {
    pub fn from_draft(draft: AlarmDraft) -> DomainResult<Self> {
        draft.validate()?;
        let now = Utc::now();
        Ok(Self {
            id: Uuid::new_v4().to_string(),
            name: draft.name.trim().to_string(),
            enabled: draft.enabled,
            schedule: draft.schedule,
            binary: draft.binary.trim().to_string(),
            args: draft.args,
            env_vars: draft.env_vars,
            retry: draft.retry,
            lifecycle: AlarmLifecycle::Idle,
            created_at: now,
            updated_at: now,
        })
    }

    pub fn apply_draft(&mut self, draft: AlarmDraft) -> DomainResult<()> {
        if matches!(
            self.lifecycle,
            AlarmLifecycle::Running | AlarmLifecycle::Retrying { .. }
        ) {
            return Err(DomainError::new(
                ErrorCode::AlarmBusy,
                "alarm is currently running",
            ));
        }
        draft.validate()?;
        self.name = draft.name.trim().to_string();
        self.enabled = draft.enabled;
        self.schedule = draft.schedule;
        self.binary = draft.binary.trim().to_string();
        self.args = draft.args;
        self.env_vars = draft.env_vars;
        self.retry = draft.retry;
        self.updated_at = Utc::now();
        Ok(())
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
        self.updated_at = Utc::now();
    }

    pub fn mark_running(&mut self) {
        self.lifecycle = AlarmLifecycle::Running;
        self.updated_at = Utc::now();
    }

    pub fn mark_retrying(&mut self, attempt: u32) {
        self.lifecycle = AlarmLifecycle::Retrying { attempt };
        self.updated_at = Utc::now();
    }

    pub fn mark_idle(&mut self) {
        self.lifecycle = AlarmLifecycle::Idle;
        self.updated_at = Utc::now();
    }

    pub fn command_preview(&self) -> String {
        let mut parts = vec![self.binary.clone()];
        parts.extend(self.args.iter().cloned());
        parts.join(" ")
    }
}
