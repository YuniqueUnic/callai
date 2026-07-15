#![allow(dead_code)]
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{DomainError, DomainResult, ErrorCode, RetryPolicy, ScheduleSpec};

pub const DEFAULT_TIMEOUT_SECS: u32 = 20;

/// Portable built-in alarm binary id (resolved at run time by infra).
pub const BUILTIN_ALARM_BINARY: &str = "__callai_alarm__";
pub const BUILTIN_ALARM_ALIAS: &str = "callai-alarm";
/// Built-in: schedule-open / notify an installed plugin.
pub const BUILTIN_PLUGIN_BINARY: &str = "__callai_plugin__";
pub const BUILTIN_PLUGIN_ALIAS: &str = "callai-plugin";

pub const MIN_TIMEOUT_SECS: u32 = 1;
pub const MAX_TIMEOUT_SECS: u32 = 3600;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum NotificationType {
    SystemOnly,
    #[default]
    WithSound,
}

/// Algorithmically generated built-in attention sounds (no static audio files).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum BuiltinSoundId {
    #[default]
    SoftChime,
    IslandBell,
    WoodKnock,
    WarmRise,
    GentlePing,
}

impl BuiltinSoundId {
    pub const ALL: [Self; 5] = [
        Self::SoftChime,
        Self::IslandBell,
        Self::WoodKnock,
        Self::WarmRise,
        Self::GentlePing,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::SoftChime => "soft_chime",
            Self::IslandBell => "island_bell",
            Self::WoodKnock => "wood_knock",
            Self::WarmRise => "warm_rise",
            Self::GentlePing => "gentle_ping",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.trim() {
            "soft_chime" | "default" | "" => Some(Self::SoftChime),
            "island_bell" => Some(Self::IslandBell),
            "wood_knock" => Some(Self::WoodKnock),
            "warm_rise" => Some(Self::WarmRise),
            "gentle_ping" => Some(Self::GentlePing),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AlarmNotificationSettings {
    /// Whether to send a notification when the alarm triggers.
    pub enabled: bool,
    pub notification_type: NotificationType,
    /// Built-in sound id when type is `with_sound`. `None` = default sound.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sound_id: Option<String>,
}

impl Default for AlarmNotificationSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            notification_type: NotificationType::WithSound,
            sound_id: None,
        }
    }
}

impl AlarmNotificationSettings {
    pub fn resolved_sound(&self) -> BuiltinSoundId {
        self.sound_id
            .as_deref()
            .and_then(BuiltinSoundId::parse)
            .unwrap_or_default()
    }

    pub fn wants_sound(&self) -> bool {
        self.enabled && matches!(self.notification_type, NotificationType::WithSound)
    }

    pub fn wants_notification(&self) -> bool {
        self.enabled
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AlarmLifecycle {
    Idle,
    Running,
    Retrying { attempt: u32 },
}

/// Schedule config when binary is `__callai_plugin__`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AlarmPluginConfig {
    pub plugin_id: String,
    /// Open independent plugin window when the alarm fires.
    #[serde(default = "plugin_cfg_true")]
    pub popup: bool,
    /// If any window is fullscreen, skip popup and only notify.
    #[serde(default = "plugin_cfg_true")]
    pub suppress_when_fullscreen: bool,
    /// Free-form params for the plugin (JSON object, string values preferred).
    #[serde(default)]
    pub params: serde_json::Map<String, serde_json::Value>,
}

fn plugin_cfg_true() -> bool {
    true
}

impl Default for AlarmPluginConfig {
    fn default() -> Self {
        Self {
            plugin_id: String::new(),
            popup: true,
            suppress_when_fullscreen: true,
            params: serde_json::Map::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Alarm {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub schedule: ScheduleSpec,
    pub binary: String,
    pub args: Vec<String>,
    pub env_vars: Vec<EnvVar>,
    pub retry: RetryPolicy,
    /// Soft wall-clock timeout for one attempt (seconds). Default 20.
    pub timeout_secs: u32,
    /// Per-alarm desktop notification / sound when triggered.
    pub notification: AlarmNotificationSettings,
    /// When binary is `__callai_plugin__`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plugin: Option<AlarmPluginConfig>,
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
    pub timeout_secs: u32,
    #[serde(default)]
    pub notification: AlarmNotificationSettings,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plugin: Option<AlarmPluginConfig>,
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
        if self.timeout_secs == 0 || self.timeout_secs > 3600 {
            return Err(DomainError::new(
                ErrorCode::InvalidArgs,
                "timeout must be between 1 and 3600 seconds",
            ));
        }
        let bin = self.binary.trim();
        if bin == BUILTIN_PLUGIN_BINARY || bin.eq_ignore_ascii_case(BUILTIN_PLUGIN_ALIAS) {
            let pid = self
                .plugin
                .as_ref()
                .map(|p| p.plugin_id.trim())
                .filter(|s| !s.is_empty())
                .or_else(|| self.args.first().map(|s| s.trim()).filter(|s| !s.is_empty()));
            if pid.is_none() {
                return Err(DomainError::new(
                    ErrorCode::InvalidArgs,
                    "plugin alarm requires plugin_id (plugin.plugin_id or args[0])",
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
            timeout_secs: draft.timeout_secs,
            notification: draft.notification,
            plugin: draft.plugin,
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
        self.timeout_secs = draft.timeout_secs;
        self.notification = draft.notification;
        self.plugin = draft.plugin;
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
