//! App filesystem layout: composed config + data path groups.
use std::path::{Path, PathBuf};

use crate::domain::{DomainError, DomainResult, ErrorCode};

/// XDG-style config layout (`~/.config/callai`).
#[derive(Clone, Debug)]
pub struct ConfigPaths {
    pub dir: PathBuf,
    pub config_file: PathBuf,
    pub backups_dir: PathBuf,
}

impl ConfigPaths {
    pub fn from_dir(dir: PathBuf) -> Self {
        let config_file = dir.join("config.toml");
        let backups_dir = dir.join("backups");
        Self {
            dir,
            config_file,
            backups_dir,
        }
    }

    pub fn ensure(&self) -> DomainResult<()> {
        std::fs::create_dir_all(&self.dir).map_err(|e| {
            DomainError::new(ErrorCode::StorageFailed, format!("mkdir config: {e}"))
        })?;
        std::fs::create_dir_all(&self.backups_dir).map_err(|e| {
            DomainError::new(ErrorCode::StorageFailed, format!("mkdir backups: {e}"))
        })?;
        Ok(())
    }
}

/// Local data layout (`~/.local/share/callai`): main DB, plugins, MCP audit.
#[derive(Clone, Debug)]
pub struct DataPaths {
    pub dir: PathBuf,
    pub db_file: PathBuf,
    pub plugins_dir: PathBuf,
    pub mcp_log_file: PathBuf,
}

impl DataPaths {
    pub fn from_dir(dir: PathBuf) -> Self {
        let db_file = dir.join("callai.db");
        let plugins_dir = dir.join("plugins");
        let mcp_log_file = dir.join("mcp_logs.db");
        Self {
            dir,
            db_file,
            plugins_dir,
            mcp_log_file,
        }
    }

    pub fn ensure(&self) -> DomainResult<()> {
        std::fs::create_dir_all(&self.dir)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("mkdir data: {e}")))?;
        std::fs::create_dir_all(&self.plugins_dir).map_err(|e| {
            DomainError::new(ErrorCode::StorageFailed, format!("mkdir plugins: {e}"))
        })?;
        Ok(())
    }
}

/// Composed application paths (config + data).
#[derive(Clone, Debug)]
pub struct AppPaths {
    pub config: ConfigPaths,
    pub data: DataPaths,
}

impl AppPaths {
    pub fn resolve() -> DomainResult<Self> {
        let config_dir = dirs::config_dir()
            .ok_or_else(|| DomainError::new(ErrorCode::StorageFailed, "no config dir"))?
            .join("callai");
        let data_dir = dirs::data_local_dir()
            .ok_or_else(|| DomainError::new(ErrorCode::StorageFailed, "no data dir"))?
            .join("callai");
        Ok(Self::from_dirs(config_dir, data_dir))
    }

    pub fn from_dirs(config_dir: PathBuf, data_dir: PathBuf) -> Self {
        Self {
            config: ConfigPaths::from_dir(config_dir),
            data: DataPaths::from_dir(data_dir),
        }
    }

    pub fn ensure(&self) -> DomainResult<()> {
        self.config.ensure()?;
        self.data.ensure()?;
        Ok(())
    }

    // --- Convenience accessors (thin, stable call sites) ---

    #[allow(dead_code)]
    pub fn config_dir(&self) -> &Path {
        &self.config.dir
    }

    #[allow(dead_code)]
    pub fn data_dir(&self) -> &Path {
        &self.data.dir
    }

    pub fn config_file(&self) -> &Path {
        &self.config.config_file
    }

    pub fn backups_dir(&self) -> &Path {
        &self.config.backups_dir
    }

    pub fn db_file(&self) -> &Path {
        &self.data.db_file
    }

    pub fn plugins_dir(&self) -> &Path {
        &self.data.plugins_dir
    }

    pub fn mcp_log_file(&self) -> &Path {
        &self.data.mcp_log_file
    }
}
