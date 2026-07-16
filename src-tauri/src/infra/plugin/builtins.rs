//! Built-in plugin catalog: embedded under `templates/builtin_plugins/`.
//!
//! Seed / upgrade policy:
//! - New catalog ids not yet offered → install once (marker).
//! - Deleted after offer → do not reinstall automatically.
//! - Installed builtin with newer catalog version and **not** user-edited → upgrade ui+manifest (keep data.db).
//! - `restore_builtin` force-overwrites ui+manifest from catalog (keeps data unless wipe_data).

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::domain::{
    DomainError, DomainResult, ErrorCode, PluginDraft, PluginManifest, PluginPermission,
    PluginSummary,
};

use super::manager::PluginManager;
use super::package::{ui_fingerprint, version_cmp};

pub const SEED_MARKER_VERSION: u32 = 1;
const MARKER_NAME: &str = ".callai_builtins_seeded.json";

#[derive(Debug, Clone)]
pub struct BuiltinPluginSpec {
    pub id: &'static str,
    pub manifest_json: &'static str,
    pub ui_html: &'static str,
}

pub static CATALOG: &[BuiltinPluginSpec] = &[
    BuiltinPluginSpec {
        id: "todo",
        manifest_json: include_str!("../../../templates/builtin_plugins/todo/manifest.json"),
        ui_html: include_str!("../../../templates/builtin_plugins/todo/ui.html"),
    },
    BuiltinPluginSpec {
        id: "pomodoro",
        manifest_json: include_str!("../../../templates/builtin_plugins/pomodoro/manifest.json"),
        ui_html: include_str!("../../../templates/builtin_plugins/pomodoro/ui.html"),
    },
    BuiltinPluginSpec {
        id: "meal-spin",
        manifest_json: include_str!("../../../templates/builtin_plugins/meal-spin/manifest.json"),
        ui_html: include_str!("../../../templates/builtin_plugins/meal-spin/ui.html"),
    },
    BuiltinPluginSpec {
        id: "work-report",
        manifest_json: include_str!("../../../templates/builtin_plugins/work-report/manifest.json"),
        ui_html: include_str!("../../../templates/builtin_plugins/work-report/ui.html"),
    },
];

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SeedMarker {
    #[serde(default = "default_marker_version")]
    version: u32,
    #[serde(default)]
    seeded: Vec<String>,
}

fn default_marker_version() -> u32 {
    SEED_MARKER_VERSION
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuiltinCatalogItem {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub installed: bool,
    pub installed_version: Option<String>,
    pub update_available: bool,
    pub user_edited: bool,
    pub blocked_by_user_edit: bool,
}

impl BuiltinPluginSpec {
    pub fn draft(&self) -> DomainResult<PluginDraft> {
        let mut manifest: PluginManifest =
            serde_json::from_str(self.manifest_json).map_err(|e| {
                DomainError::new(
                    ErrorCode::ConfigCorrupt,
                    format!("builtin {} manifest: {e}", self.id),
                )
            })?;
        manifest.id = self.id.to_string();
        if manifest.ui.trim().is_empty() {
            manifest.ui = "ui.html".into();
        }
        if manifest.permissions.is_empty() {
            manifest.permissions = vec![PluginPermission::Storage];
        }
        let draft = PluginDraft {
            manifest,
            ui_html: self.ui_html.to_string(),
        };
        draft.validate()?;
        if draft.manifest.id != self.id {
            return Err(DomainError::new(
                ErrorCode::InvalidArgs,
                format!(
                    "builtin catalog id mismatch: catalog={} manifest={}",
                    self.id, draft.manifest.id
                ),
            ));
        }
        Ok(draft)
    }
}

pub fn list_builtin_drafts() -> DomainResult<Vec<PluginDraft>> {
    CATALOG.iter().map(|s| s.draft()).collect()
}

pub fn catalog_ids() -> Vec<&'static str> {
    CATALOG.iter().map(|s| s.id).collect()
}

pub fn find_spec(id: &str) -> Option<&'static BuiltinPluginSpec> {
    CATALOG.iter().find(|s| s.id == id)
}

fn marker_path(root: &Path) -> PathBuf {
    root.join(MARKER_NAME)
}

fn load_marker(root: &Path) -> SeedMarker {
    let path = marker_path(root);
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return SeedMarker {
            version: SEED_MARKER_VERSION,
            seeded: Vec::new(),
        };
    };
    serde_json::from_str(&raw).unwrap_or(SeedMarker {
        version: SEED_MARKER_VERSION,
        seeded: Vec::new(),
    })
}

fn save_marker(root: &Path, marker: &SeedMarker) -> DomainResult<()> {
    std::fs::create_dir_all(root).map_err(|e| {
        DomainError::new(ErrorCode::StorageFailed, format!("mkdir plugins root: {e}"))
    })?;
    let raw = serde_json::to_string_pretty(marker).map_err(|e| {
        DomainError::new(
            ErrorCode::StorageFailed,
            format!("serialize seed marker: {e}"),
        )
    })?;
    std::fs::write(marker_path(root), raw).map_err(|e| {
        DomainError::new(ErrorCode::StorageFailed, format!("write seed marker: {e}"))
    })?;
    Ok(())
}

fn mark_seeded(root: &Path, id: &str) -> DomainResult<()> {
    let mut marker = load_marker(root);
    if !marker.seeded.iter().any(|s| s == id) {
        marker.seeded.push(id.to_string());
    }
    marker.version = SEED_MARKER_VERSION;
    save_marker(root, &marker)
}

fn is_user_edited(mgr: &PluginManager, id: &str) -> bool {
    let Ok(db) = mgr.open_db_public(id) else {
        return false;
    };
    matches!(
        db.get_meta("user_edited_ui").ok().flatten().as_deref(),
        Some("1") | Some("true")
    )
}

fn installed_catalog_version(mgr: &PluginManager, id: &str) -> Option<String> {
    let db = mgr.open_db_public(id).ok()?;
    db.get_meta("builtin_version")
        .ok()
        .flatten()
        .or_else(|| mgr.read_manifest(id).ok().map(|m| m.version))
}

fn install_from_catalog(
    mgr: &PluginManager,
    spec: &BuiltinPluginSpec,
) -> DomainResult<PluginSummary> {
    let draft = spec.draft()?;
    let fp = ui_fingerprint(&draft.ui_html);
    let ver = draft.manifest.version.clone();
    let meta = [
        ("source", "builtin"),
        ("user_edited_ui", "0"),
        ("builtin_version", ver.as_str()),
        ("builtin_ui_fp", fp.as_str()),
    ];
    mgr.write_plugin_files(&draft, None, &meta)
}

/// Seed new catalog ids + auto-upgrade eligible builtins.
pub fn ensure_builtin_plugins(mgr: &PluginManager) -> DomainResult<Vec<PluginSummary>> {
    let root = mgr.plugins_root().to_path_buf();
    let _ = list_builtin_drafts()?;
    let _ = catalog_ids();
    let mut marker = load_marker(&root);
    let mut seeded: BTreeSet<String> = marker.seeded.iter().cloned().collect();
    let mut changed = Vec::new();

    for spec in CATALOG {
        let installed = mgr.get_summary(spec.id).is_ok();
        if !seeded.contains(spec.id) {
            if !installed {
                match install_from_catalog(mgr, spec) {
                    Ok(s) => {
                        tracing::info!(plugin_id = %s.id, "seeded builtin plugin");
                        changed.push(s);
                    }
                    Err(e) => {
                        tracing::warn!(
                            catalog_id = spec.id,
                            error = %e.message,
                            "failed to seed builtin plugin"
                        );
                        continue;
                    }
                }
            }
            seeded.insert(spec.id.to_string());
            continue;
        }

        // Already offered: maybe upgrade.
        if installed {
            if let Some(s) = try_auto_upgrade(mgr, spec)? {
                changed.push(s);
            }
        }
    }

    marker.version = SEED_MARKER_VERSION;
    marker.seeded = seeded.into_iter().collect();
    save_marker(&root, &marker)?;
    Ok(changed)
}

fn try_auto_upgrade(
    mgr: &PluginManager,
    spec: &BuiltinPluginSpec,
) -> DomainResult<Option<PluginSummary>> {
    let draft = spec.draft()?;
    let catalog_ver = draft.manifest.version.clone();
    let Some(cur) = installed_catalog_version(mgr, spec.id) else {
        return Ok(None);
    };
    if version_cmp(&catalog_ver, &cur) != std::cmp::Ordering::Greater {
        return Ok(None);
    }
    if is_user_edited(mgr, spec.id) {
        tracing::info!(
            plugin_id = spec.id,
            catalog = %catalog_ver,
            installed = %cur,
            "builtin update available but blocked by user_edited_ui"
        );
        return Ok(None);
    }
    // Also skip if current ui fingerprint != last known builtin fp but flag missing:
    // if file content differs from catalog and from stored fp, treat as edited.
    if let Ok(ui) = mgr.read_ui_html(spec.id) {
        let cur_fp = ui_fingerprint(&ui);
        if let Ok(Some(stored)) = mgr
            .open_db_public(spec.id)
            .and_then(|db| db.get_meta("builtin_ui_fp"))
        {
            if cur_fp != stored && cur_fp != ui_fingerprint(&draft.ui_html) {
                return Ok(None);
            }
        }
    }
    let s = install_from_catalog(mgr, spec)?;
    tracing::info!(plugin_id = spec.id, version = %catalog_ver, "upgraded builtin plugin");
    Ok(Some(s))
}

/// Force restore catalog files for one id (keeps data.db unless wipe_data).
pub fn restore_builtin(
    mgr: &PluginManager,
    id: &str,
    wipe_data: bool,
) -> DomainResult<PluginSummary> {
    let spec = find_spec(id).ok_or_else(|| {
        DomainError::new(ErrorCode::AlarmNotFound, format!("not a builtin id: {id}"))
    })?;
    let draft = spec.draft()?;
    let data = if wipe_data {
        None
    } else {
        let path = mgr.plugin_dir(id).join("data.db");
        if path.is_file() {
            Some(std::fs::read(&path).map_err(|e| {
                DomainError::new(ErrorCode::StorageFailed, format!("read data.db: {e}"))
            })?)
        } else {
            None
        }
    };
    // If wiping, delete data.db explicitly after write without data
    if wipe_data {
        let path = mgr.plugin_dir(id).join("data.db");
        let _ = std::fs::remove_file(path);
    }
    let fp = ui_fingerprint(&draft.ui_html);
    let ver = draft.manifest.version.clone();
    let restored = chrono::Utc::now().to_rfc3339();
    let meta = [
        ("source", "builtin"),
        ("user_edited_ui", "0"),
        ("builtin_version", ver.as_str()),
        ("builtin_ui_fp", fp.as_str()),
        ("restored_at", restored.as_str()),
    ];
    let summary = mgr.write_plugin_files(&draft, data.as_deref(), &meta)?;
    let _ = mark_seeded(mgr.plugins_root(), id);
    Ok(summary)
}

pub fn list_catalog(mgr: &PluginManager) -> DomainResult<Vec<BuiltinCatalogItem>> {
    let mut out = Vec::new();
    for spec in CATALOG {
        let draft = spec.draft()?;
        let installed = mgr.get_summary(spec.id).ok();
        let installed_version = installed.as_ref().map(|s| s.version.clone());
        let user_edited = installed.is_some() && is_user_edited(mgr, spec.id);
        let update_available = match &installed_version {
            Some(v) => version_cmp(&draft.manifest.version, v) == std::cmp::Ordering::Greater,
            None => false,
        };
        out.push(BuiltinCatalogItem {
            id: draft.manifest.id,
            name: draft.manifest.name,
            version: draft.manifest.version,
            description: draft.manifest.description,
            installed: installed.is_some(),
            installed_version,
            update_available,
            user_edited,
            blocked_by_user_edit: update_available && user_edited,
        });
    }
    Ok(out)
}

/// Upgrade all eligible builtins (same rules as ensure).
pub fn upgrade_builtins(mgr: &PluginManager) -> DomainResult<Vec<PluginSummary>> {
    ensure_builtin_plugins(mgr)
}

#[cfg(test)]
mod unit {
    use super::*;

    #[test]
    fn catalog_drafts_validate() {
        let drafts = list_builtin_drafts().expect("drafts");
        assert_eq!(drafts.len(), CATALOG.len());
    }

    #[test]
    fn catalog_ids_are_unique() {
        let mut seen = BTreeSet::new();
        for id in catalog_ids() {
            assert!(seen.insert(id));
        }
    }
}
