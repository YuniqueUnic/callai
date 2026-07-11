use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ThemeMode {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum LocaleCode {
    #[default]
    #[serde(rename = "zh-CN")]
    ZhCn,
    #[serde(rename = "en")]
    En,
}

impl LocaleCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ZhCn => "zh-CN",
            Self::En => "en",
        }
    }

    pub fn parse(raw: &str) -> Self {
        match raw {
            "en" | "en-US" | "en-GB" => Self::En,
            _ => Self::ZhCn,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: ThemeMode,
    pub locale: LocaleCode,
    pub launch_minimized: bool,
    pub log_retention_days: u32,
    pub notify_on_failure: bool,
    pub auto_backup_on_start: bool,
    pub backup_keep_count: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: ThemeMode::System,
            locale: LocaleCode::ZhCn,
            launch_minimized: false,
            log_retention_days: 30,
            notify_on_failure: false,
            auto_backup_on_start: true,
            backup_keep_count: 10,
        }
    }
}
