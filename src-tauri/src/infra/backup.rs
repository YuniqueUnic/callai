use std::fs;
use std::path::Path;

use chrono::Local;
use serde::{Deserialize, Serialize};

use crate::app::ConfigBackup;
use crate::domain::{
    Alarm, AlarmDraft, AppSettings, DomainError, DomainResult, EnvVar, ErrorCode, LocaleCode,
    RetryInterval, RetryPolicy, ScheduleSpec, ThemeMode,
};
use crate::infra::AppPaths;

#[derive(Debug, Serialize, Deserialize)]
struct TomlRoot {
    settings: TomlSettings,
    alarms: Vec<TomlAlarm>,
}

#[derive(Debug, Serialize, Deserialize)]
struct TomlSettings {
    theme: String,
    locale: String,
    launch_minimized: bool,
    log_retention_days: u32,
    notify_on_failure: bool,
    #[serde(default = "default_true")]
    sound_enabled: bool,
    auto_backup_on_start: bool,
    backup_keep_count: u32,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize, Deserialize)]
struct TomlAlarm {
    id: String,
    name: String,
    enabled: bool,
    schedule_mode: String,
    schedule_value: String,
    binary: String,
    args: Vec<String>,
    env_vars: Vec<TomlEnv>,
    retry_interval: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct TomlEnv {
    key: String,
    value: String,
}

pub struct TomlConfigBackup {
    paths: AppPaths,
}

impl TomlConfigBackup {
    /// Product rule: keep at most 10 backups.
    pub const MAX_BACKUP_FILES: usize = 10;

    pub fn new(paths: AppPaths) -> Self {
        Self { paths }
    }

    fn prune_backups(&self, keep: usize) -> DomainResult<()> {
        let keep = keep.min(Self::MAX_BACKUP_FILES);
        let mut entries: Vec<_> = fs::read_dir(&self.paths.backups_dir)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path()
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with("config.toml.") && n.ends_with(".bak"))
                    .unwrap_or(false)
            })
            .collect();
        entries.sort_by_key(|e| e.file_name());
        while entries.len() > keep {
            if let Some(old) = entries.first() {
                let _ = fs::remove_file(old.path());
                entries.remove(0);
            } else {
                break;
            }
        }
        Ok(())
    }
}

impl ConfigBackup for TomlConfigBackup {
    fn backup_now(&self) -> DomainResult<String> {
        self.paths.ensure()?;
        if !self.paths.config_file.exists() {
            return Ok(String::new());
        }
        let stamp = Local::now().format("%Y-%m-%d_%H-%M-%S");
        let name = format!("config.toml.{stamp}.bak");
        let dest = self.paths.backups_dir.join(&name);
        fs::copy(&self.paths.config_file, &dest)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("backup copy: {e}")))?;
        self.prune_backups(Self::MAX_BACKUP_FILES)?;
        Ok(name)
    }

    fn list_backups(&self) -> DomainResult<Vec<String>> {
        self.paths.ensure()?;
        let mut names: Vec<String> = fs::read_dir(&self.paths.backups_dir)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, e.to_string()))?
            .filter_map(|e| e.ok())
            .filter_map(|e| e.file_name().into_string().ok())
            .filter(|n| n.starts_with("config.toml.") && n.ends_with(".bak"))
            .collect();
        names.sort();
        names.reverse();
        Ok(names)
    }

    fn restore(&self, backup_name: &str) -> DomainResult<()> {
        let src = self.paths.backups_dir.join(backup_name);
        if !src.exists() {
            return Err(DomainError::new(
                ErrorCode::StorageFailed,
                "backup not found",
            ));
        }
        // backup current first
        let _ = self.backup_now();
        fs::copy(&src, &self.paths.config_file)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("restore: {e}")))?;
        Ok(())
    }

    fn delete_backup(&self, backup_name: &str) -> DomainResult<()> {
        self.paths.ensure()?;
        // prevent path traversal
        let name = Path::new(backup_name)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        if name.is_empty()
            || !name.starts_with("config.toml.")
            || !name.ends_with(".bak")
            || name != backup_name
        {
            return Err(DomainError::new(
                ErrorCode::StorageFailed,
                "invalid backup name",
            ));
        }
        let path = self.paths.backups_dir.join(name);
        if !path.exists() {
            return Err(DomainError::new(
                ErrorCode::StorageFailed,
                "backup not found",
            ));
        }
        fs::remove_file(&path).map_err(|e| {
            DomainError::new(ErrorCode::StorageFailed, format!("delete backup: {e}"))
        })?;
        Ok(())
    }

    fn export_toml(&self, alarms: &[Alarm], settings: &AppSettings) -> DomainResult<()> {
        self.paths.ensure()?;
        let root = TomlRoot {
            settings: TomlSettings {
                theme: match settings.theme {
                    ThemeMode::System => "system".into(),
                    ThemeMode::Light => "light".into(),
                    ThemeMode::Dark => "dark".into(),
                },
                locale: settings.locale.as_str().into(),
                launch_minimized: settings.launch_minimized,
                log_retention_days: settings.log_retention_days,
                notify_on_failure: settings.notify_on_failure,
                sound_enabled: settings.sound_enabled,
                auto_backup_on_start: settings.auto_backup_on_start,
                backup_keep_count: settings.backup_keep_count,
            },
            alarms: alarms
                .iter()
                .map(|a| {
                    let (mode, value) = match &a.schedule {
                        ScheduleSpec::Daily { times } => ("daily".into(), times.join(",")),
                        ScheduleSpec::Cron { expression } => ("cron".into(), expression.clone()),
                    };
                    TomlAlarm {
                        id: a.id.clone(),
                        name: a.name.clone(),
                        enabled: a.enabled,
                        schedule_mode: mode,
                        schedule_value: value,
                        binary: a.binary.clone(),
                        args: a.args.clone(),
                        env_vars: a
                            .env_vars
                            .iter()
                            .map(|e| TomlEnv {
                                key: e.key.clone(),
                                value: e.value.clone(),
                            })
                            .collect(),
                        retry_interval: a.retry.interval.as_str().into(),
                    }
                })
                .collect(),
        };
        let text = toml::to_string_pretty(&root)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("toml encode: {e}")))?;
        fs::write(&self.paths.config_file, text).map_err(|e| {
            DomainError::new(ErrorCode::StorageFailed, format!("write config: {e}"))
        })?;
        Ok(())
    }

    fn import_toml_if_needed(&self) -> DomainResult<Option<(Vec<AlarmDraft>, AppSettings)>> {
        if !self.paths.config_file.exists() {
            return Ok(None);
        }
        let text = fs::read_to_string(&self.paths.config_file)
            .map_err(|e| DomainError::new(ErrorCode::ConfigCorrupt, format!("read config: {e}")))?;
        let root: TomlRoot = toml::from_str(&text).map_err(|e| {
            DomainError::new(ErrorCode::ConfigCorrupt, format!("parse config: {e}"))
        })?;
        let settings = AppSettings {
            theme: match root.settings.theme.as_str() {
                "light" => ThemeMode::Light,
                "dark" => ThemeMode::Dark,
                _ => ThemeMode::System,
            },
            locale: LocaleCode::parse(&root.settings.locale),
            launch_minimized: root.settings.launch_minimized,
            log_retention_days: root.settings.log_retention_days,
            notify_on_failure: root.settings.notify_on_failure,
            sound_enabled: root.settings.sound_enabled,
            auto_backup_on_start: root.settings.auto_backup_on_start,
            backup_keep_count: root.settings.backup_keep_count,
        };
        let drafts = root
            .alarms
            .into_iter()
            .map(|a| {
                let schedule = if a.schedule_mode == "cron" {
                    ScheduleSpec::Cron {
                        expression: a.schedule_value,
                    }
                } else {
                    ScheduleSpec::Daily {
                        times: a
                            .schedule_value
                            .split(',')
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty())
                            .collect(),
                    }
                };
                AlarmDraft {
                    name: a.name,
                    enabled: a.enabled,
                    schedule,
                    binary: a.binary,
                    args: a.args,
                    env_vars: a
                        .env_vars
                        .into_iter()
                        .map(|e| EnvVar {
                            key: e.key,
                            value: e.value,
                        })
                        .collect(),
                    retry: RetryPolicy::new(
                        RetryInterval::parse(&a.retry_interval).unwrap_or_default(),
                    ),
                    timeout_secs: 20,
                }
            })
            .collect();
        Ok(Some((drafts, settings)))
    }
}

#[allow(dead_code)]
pub fn path_exists(p: &Path) -> bool {
    p.exists()
}
