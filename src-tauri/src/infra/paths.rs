use std::path::PathBuf;

use crate::domain::{DomainError, DomainResult, ErrorCode};

#[derive(Clone)]
pub struct AppPaths {
    pub config_dir: PathBuf,
    pub data_dir: PathBuf,
    pub config_file: PathBuf,
    pub backups_dir: PathBuf,
    pub db_file: PathBuf,
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
        let backups_dir = config_dir.join("backups");
        let config_file = config_dir.join("config.toml");
        let db_file = data_dir.join("callai.db");
        Self {
            config_dir,
            data_dir,
            config_file,
            backups_dir,
            db_file,
        }
    }

    pub fn ensure(&self) -> DomainResult<()> {
        std::fs::create_dir_all(&self.config_dir).map_err(|e| {
            DomainError::new(ErrorCode::StorageFailed, format!("mkdir config: {e}"))
        })?;
        std::fs::create_dir_all(&self.data_dir)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("mkdir data: {e}")))?;
        std::fs::create_dir_all(&self.backups_dir).map_err(|e| {
            DomainError::new(ErrorCode::StorageFailed, format!("mkdir backups: {e}"))
        })?;
        Ok(())
    }
}
