//! Package install/export IO for PluginManager.
use std::path::Path;

use chrono::{DateTime, Utc};

use super::PluginManager;
use crate::domain::{DomainError, DomainResult, ErrorCode, PluginDraft, PluginSummary};
use crate::infra::plugin::package::{self, InstallConflictMode, PluginPackage, version_cmp};

/// Options for installing a zip package (marketplace / drag-drop).
#[derive(Debug, Clone, Copy)]
pub struct InstallPackageOpts {
    pub conflict: InstallConflictMode,
    /// Allow package.version < installed.version (explicit downgrade).
    pub force_downgrade: bool,
    /// When package includes data.db, write it over existing data (destructive).
    /// Default false: overwrite UI/manifest only, keep local data.db.
    pub replace_data: bool,
}

impl Default for InstallPackageOpts {
    fn default() -> Self {
        Self {
            conflict: InstallConflictMode::Rename,
            force_downgrade: false,
            replace_data: false,
        }
    }
}

impl InstallPackageOpts {
    #[inline]
    #[allow(dead_code)]
    pub const fn from_conflict(conflict: InstallConflictMode) -> Self {
        Self {
            conflict,
            force_downgrade: false,
            replace_data: false,
        }
    }
}

impl PluginManager {
    /// Write plugin files for a known id (no rename). Optionally replace data.db.
    pub fn write_plugin_files(
        &self,
        draft: &PluginDraft,
        data_db: Option<&[u8]>,
        meta_pairs: &[(&str, &str)],
    ) -> DomainResult<PluginSummary> {
        draft.validate()?;
        let id = draft.manifest.id.clone();
        let dir = self.plugin_dir(&id);
        std::fs::create_dir_all(&dir).map_err(|e| {
            DomainError::new(ErrorCode::StorageFailed, format!("mkdir plugin: {e}"))
        })?;
        let manifest_json = serde_json::to_string_pretty(&draft.manifest).map_err(|e| {
            DomainError::new(ErrorCode::StorageFailed, format!("serialize manifest: {e}"))
        })?;
        std::fs::write(Self::manifest_path(&dir), manifest_json).map_err(|e| {
            DomainError::new(ErrorCode::StorageFailed, format!("write manifest: {e}"))
        })?;
        let ui_name = draft.manifest.ui.clone();
        std::fs::write(dir.join(&ui_name), &draft.ui_html)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("write ui: {e}")))?;

        {
            let mut map = self.dbs.lock().unwrap();
            map.remove(&id);
        }
        if let Ok(mut cache) = self.compose_cache.lock() {
            cache.remove(&id);
        }
        let db_path = Self::db_path(&dir);
        if let Some(blob) = data_db {
            std::fs::write(&db_path, blob).map_err(|e| {
                DomainError::new(ErrorCode::StorageFailed, format!("write data.db: {e}"))
            })?;
        }

        let db = self.open_db(&id)?;
        let installed_at = db
            .get_meta("installed_at")?
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|d| d.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);
        db.set_meta("installed_at", &installed_at.to_rfc3339())?;
        for (k, v) in meta_pairs {
            db.set_meta(k, v)?;
        }
        let last_run_at = db
            .get_meta("last_run_at")?
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|d| d.with_timezone(&Utc));
        self.summary_for(&draft.manifest, &db, installed_at, last_run_at)
    }

    /// Install from a validated zip package.
    /// Returns `None` when conflict mode is Skip and id already exists.
    ///
    /// Rules:
    /// - same plugin ⇔ same `manifest.id`
    /// - overwrite keeps data.db unless `replace_data` and package includes data
    /// - package.version < installed.version blocked unless `force_downgrade`
    pub fn install_package(
        &self,
        package: PluginPackage,
        opts: InstallPackageOpts,
    ) -> DomainResult<Option<PluginSummary>> {
        package.draft.validate()?;
        let mut draft = package.draft;
        let desired_id = draft.manifest.id.clone();
        let existing = self.read_manifest(&desired_id).ok();
        let exists = existing.is_some();

        match (exists, opts.conflict) {
            (true, InstallConflictMode::Skip) => return Ok(None),
            (true, InstallConflictMode::Fail) => {
                return Err(DomainError::new(
                    ErrorCode::InvalidArgs,
                    format!("plugin already exists: {desired_id}"),
                ));
            }
            (true, InstallConflictMode::Overwrite) => {
                if let Some(ref cur) = existing {
                    let cmp = version_cmp(&draft.manifest.version, &cur.version);
                    if cmp == std::cmp::Ordering::Less && !opts.force_downgrade {
                        return Err(DomainError::new(
                            ErrorCode::InvalidArgs,
                            format!(
                                "downgrade blocked: installed {} > package {} (pass force_downgrade)",
                                cur.version, draft.manifest.version
                            ),
                        ));
                    }
                }
                // keep id; replace ui/manifest only
            }
            (true, InstallConflictMode::Rename) | (false, _) => {
                if exists {
                    draft.manifest.name = self.unique_display_name(&draft.manifest.name);
                    draft.manifest.id = self.unique_plugin_id(&draft.manifest.id);
                } else {
                    draft.manifest.name = self.unique_display_name(&draft.manifest.name);
                }
            }
        }

        // Overwrite without replace_data: never write data.db (preserve local settings/records).
        // New install: write data if package includes it.
        let data_blob: Option<&[u8]> = if package.meta.includes_data {
            if !exists || opts.conflict != InstallConflictMode::Overwrite || opts.replace_data {
                package.data_db.as_deref()
            } else {
                None
            }
        } else {
            None
        };

        let mut meta = vec![
            ("imported_at", Utc::now().to_rfc3339()),
            ("source", "import".to_string()),
            ("user_edited_ui", "0".to_string()),
        ];
        if package.meta.includes_data && data_blob.is_some() {
            meta.push(("imported_with_data", "1".to_string()));
        }
        let meta_ref: Vec<(&str, &str)> = meta.iter().map(|(k, v)| (*k, v.as_str())).collect();
        let summary = self.write_plugin_files(&draft, data_blob, &meta_ref)?;
        Ok(Some(summary))
    }

    pub fn import_zip_bytes(
        &self,
        bytes: &[u8],
        opts: InstallPackageOpts,
    ) -> DomainResult<Option<PluginSummary>> {
        let package = package::parse_plugin_zip(bytes)?;
        self.install_package(package, opts)
    }

    pub fn import_zip_path(
        &self,
        path: &Path,
        opts: InstallPackageOpts,
    ) -> DomainResult<Option<PluginSummary>> {
        let bytes = std::fs::read(path).map_err(|e| {
            DomainError::new(
                ErrorCode::StorageFailed,
                format!("read zip {}: {e}", path.display()),
            )
        })?;
        self.import_zip_bytes(&bytes, opts)
    }

    /// Export installed plugin as zip bytes. `include_data` copies data.db when present.
    pub fn export_zip_bytes(&self, id: &str, include_data: bool) -> DomainResult<Vec<u8>> {
        crate::domain::validate_plugin_id(id)?;
        let manifest = self.read_manifest(id)?;
        let ui_html = self.read_ui_html(id)?;
        let data = if include_data {
            let path = Self::db_path(&self.plugin_dir(id));
            if path.is_file() {
                Some(std::fs::read(&path).map_err(|e| {
                    DomainError::new(ErrorCode::StorageFailed, format!("read data.db: {e}"))
                })?)
            } else {
                None
            }
        } else {
            None
        };
        package::build_plugin_zip(&manifest, &ui_html, data.as_deref())
    }

    pub fn export_zip_path(&self, id: &str, include_data: bool, dest: &Path) -> DomainResult<()> {
        let bytes = self.export_zip_bytes(id, include_data)?;
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                DomainError::new(ErrorCode::StorageFailed, format!("mkdir export: {e}"))
            })?;
        }
        std::fs::write(dest, bytes).map_err(|e| {
            DomainError::new(
                ErrorCode::StorageFailed,
                format!("write zip {}: {e}", dest.display()),
            )
        })?;
        Ok(())
    }
}
