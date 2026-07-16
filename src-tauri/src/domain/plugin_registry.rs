//! Remote plugin registry index (marketplace prep).
use serde::{Deserialize, Serialize};

use super::{DomainError, DomainResult, ErrorCode};

pub const REGISTRY_SCHEMA: u32 = 1;

/// Default community index (can be overridden in UI).
/// Host a `registry.json` in a GitHub repo and point here, or use raw.githubusercontent.com.
pub const DEFAULT_PLUGIN_REGISTRY_URL: &str =
    "https://raw.githubusercontent.com/YuniqueUnic/callai-plugin-registry/main/registry.json";


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryIndex {
    pub schema: u32,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub plugins: Vec<RegistryPluginEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryPluginEntry {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: Option<String>,
    /// HTTPS zip download URL (callai plugin package).
    pub zip_url: String,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub repository: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

impl RegistryIndex {
    pub fn validate(&self) -> DomainResult<()> {
        if self.schema == 0 || self.schema > REGISTRY_SCHEMA {
            return Err(DomainError::new(
                ErrorCode::InvalidArgs,
                format!(
                    "unsupported registry schema {} (supported 1..={REGISTRY_SCHEMA})",
                    self.schema
                ),
            ));
        }
        for p in &self.plugins {
            crate::domain::validate_plugin_id(&p.id)?;
            if p.name.trim().is_empty() {
                return Err(DomainError::new(
                    ErrorCode::InvalidName,
                    format!("registry entry {} missing name", p.id),
                ));
            }
            if p.zip_url.trim().is_empty() {
                return Err(DomainError::new(
                    ErrorCode::InvalidArgs,
                    format!("registry entry {} missing zip_url", p.id),
                ));
            }
            let u = p.zip_url.trim();
            if !(u.starts_with("https://")
                || u.starts_with("http://127.0.0.1")
                || u.starts_with("http://localhost"))
            {
                return Err(DomainError::new(
                    ErrorCode::InvalidArgs,
                    format!("registry zip_url must be https (or localhost): {}", p.id),
                ));
            }
        }
        Ok(())
    }
}

pub fn parse_registry_index(raw: &str) -> DomainResult<RegistryIndex> {
    let idx: RegistryIndex = serde_json::from_str(raw).map_err(|e| {
        DomainError::new(ErrorCode::ConfigCorrupt, format!("registry json: {e}"))
    })?;
    idx.validate()?;
    Ok(idx)
}
