//! PluginManager: install/list/delete plugins and route `plugin_invoke`.
mod compose;
mod invoke;
mod package_io;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::{DateTime, Utc};
use serde_json::Value;

use crate::domain::{
    DomainError, DomainResult, ErrorCode, PluginDraft, PluginHistoryEntry, PluginManifest,
    PluginSummary,
};
use crate::infra::paths::AppPaths;

use super::storage::PluginDb;

pub struct PluginManager {
    /// id -> (mtime_secs, composed_html)
    pub(super) compose_cache: std::sync::Mutex<std::collections::HashMap<String, (u64, String)>>,
    pub(super) root: PathBuf,
    pub(super) dbs: Mutex<HashMap<String, PluginDb>>,
}

impl PluginManager {
    pub fn new(paths: &AppPaths) -> DomainResult<Self> {
        let root = paths.plugins_dir().to_path_buf();
        std::fs::create_dir_all(&root).map_err(|e| {
            DomainError::new(ErrorCode::StorageFailed, format!("mkdir plugins: {e}"))
        })?;
        Ok(Self {
            root,
            compose_cache: std::sync::Mutex::new(HashMap::new()),
            dbs: Mutex::new(HashMap::new()),
        })
    }

    #[allow(dead_code)]
    pub fn from_root(root: PathBuf) -> DomainResult<Self> {
        std::fs::create_dir_all(&root).map_err(|e| {
            DomainError::new(ErrorCode::StorageFailed, format!("mkdir plugins: {e}"))
        })?;
        Ok(Self {
            root,
            compose_cache: std::sync::Mutex::new(HashMap::new()),
            dbs: Mutex::new(HashMap::new()),
        })
    }

    pub fn plugins_root(&self) -> &Path {
        &self.root
    }

    pub fn plugin_dir(&self, id: &str) -> PathBuf {
        self.root.join(id)
    }

    pub(super) fn manifest_path(dir: &Path) -> PathBuf {
        dir.join("manifest.json")
    }

    pub(super) fn db_path(dir: &Path) -> PathBuf {
        dir.join("data.db")
    }

    pub fn read_manifest(&self, id: &str) -> DomainResult<PluginManifest> {
        crate::domain::validate_plugin_id(id)?;
        let path = Self::manifest_path(&self.plugin_dir(id));
        let raw = std::fs::read_to_string(&path).map_err(|e| {
            DomainError::new(
                ErrorCode::AlarmNotFound,
                format!("plugin not found ({id}): {e}"),
            )
        })?;
        let manifest: PluginManifest = serde_json::from_str(&raw).map_err(|e| {
            DomainError::new(ErrorCode::ConfigCorrupt, format!("manifest json: {e}"))
        })?;
        manifest.validate()?;
        Ok(manifest)
    }

    pub(super) fn unique_display_name(&self, desired: &str) -> String {
        let base = desired.trim();
        let base = if base.is_empty() { "plugin" } else { base };
        let existing: Vec<String> = self
            .list()
            .unwrap_or_default()
            .into_iter()
            .map(|p| p.name)
            .collect();
        if !existing.iter().any(|n| n == base) {
            return base.to_string();
        }
        for i in 1..1000 {
            let candidate = format!("{base}（{i}）");
            if !existing.iter().any(|n| n == &candidate) {
                return candidate;
            }
        }
        format!("{base}（{}）", uuid::Uuid::new_v4())
    }

    pub(super) fn unique_plugin_id(&self, desired: &str) -> String {
        let base = desired.trim();
        let base = if base.is_empty() { "plugin" } else { base };
        if self.get_summary(base).is_err() {
            return base.to_string();
        }
        for i in 1..1000 {
            let candidate = format!("{base}-{i}");
            if self.get_summary(&candidate).is_err() {
                return candidate;
            }
        }
        format!("{base}-{}", &uuid::Uuid::new_v4().to_string()[..8])
    }
    pub fn install(&self, mut draft: PluginDraft) -> DomainResult<PluginSummary> {
        draft.validate()?;
        draft.manifest.name = self.unique_display_name(&draft.manifest.name);
        draft.manifest.id = self.unique_plugin_id(&draft.manifest.id);
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
        // Ensure data.db exists.
        let db = self.open_db(&id)?;
        let installed_at = Utc::now();
        db.set_meta("installed_at", &installed_at.to_rfc3339())?;
        self.summary_for(&draft.manifest, &db, installed_at, None)
    }

    pub fn delete(&self, id: &str) -> DomainResult<()> {
        crate::domain::validate_plugin_id(id)?;
        let dir = self.plugin_dir(id);
        if !dir.exists() {
            return Err(DomainError::new(
                ErrorCode::AlarmNotFound,
                format!("plugin not found: {id}"),
            ));
        }
        {
            let mut map = self.dbs.lock().unwrap();
            map.remove(id);
        }
        std::fs::remove_dir_all(&dir).map_err(|e| {
            DomainError::new(ErrorCode::StorageFailed, format!("delete plugin: {e}"))
        })?;
        Ok(())
    }

    pub fn list(&self) -> DomainResult<Vec<PluginSummary>> {
        let mut out = Vec::new();
        let entries = match std::fs::read_dir(&self.root) {
            Ok(e) => e,
            Err(_) => return Ok(out),
        };
        for ent in entries.flatten() {
            let path = ent.path();
            if !path.is_dir() {
                continue;
            }
            let Some(id) = path.file_name().and_then(|s| s.to_str()) else {
                continue;
            };
            if crate::domain::validate_plugin_id(id).is_err() {
                continue;
            }
            match self.get_summary(id) {
                Ok(s) => out.push(s),
                Err(_) => continue,
            }
        }
        out.sort_by_key(|b| std::cmp::Reverse(b.installed_at));
        Ok(out)
    }

    pub fn get_summary(&self, id: &str) -> DomainResult<PluginSummary> {
        let manifest = self.read_manifest(id)?;
        let db = self.open_db(id)?;
        let installed_at = db
            .get_meta("installed_at")?
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|d| d.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);
        let last_run_at = db
            .get_meta("last_run_at")?
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|d| d.with_timezone(&Utc));
        self.summary_for(&manifest, &db, installed_at, last_run_at)
    }

    pub(super) fn summary_for(
        &self,
        manifest: &PluginManifest,
        db: &PluginDb,
        installed_at: DateTime<Utc>,
        last_run_at: Option<DateTime<Utc>>,
    ) -> DomainResult<PluginSummary> {
        Ok(PluginSummary {
            id: manifest.id.clone(),
            name: manifest.name.clone(),
            version: manifest.version.clone(),
            description: manifest.description.clone(),
            permissions: manifest.permissions.clone(),
            ui: manifest.ui.clone(),
            installed_at,
            last_run_at,
            record_count: db.record_count()?,
        })
    }

    pub fn read_ui_html(&self, id: &str) -> DomainResult<String> {
        let manifest = self.read_manifest(id)?;
        let path = self.plugin_dir(id).join(&manifest.ui);
        std::fs::read_to_string(&path)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("read ui.html: {e}")))
    }

    pub fn write_ui_html(&self, id: &str, html: &str) -> DomainResult<()> {
        crate::domain::validate_plugin_id(id)?;
        if html.trim().is_empty() {
            return Err(DomainError::new(ErrorCode::InvalidArgs, "ui html is empty"));
        }
        if html.len() > 1024 * 1024 {
            return Err(DomainError::new(
                ErrorCode::InvalidArgs,
                "ui html too large (max 1MiB)",
            ));
        }
        let manifest = self.read_manifest(id)?;
        let path = self.plugin_dir(id).join(&manifest.ui);
        let sanitized = Self::sanitize_plugin_html(html);
        std::fs::write(&path, sanitized).map_err(|e| {
            DomainError::new(ErrorCode::StorageFailed, format!("write ui.html: {e}"))
        })?;
        // User (or AI fix) edited UI — block silent builtin auto-upgrade.
        if let Ok(db) = self.open_db(id) {
            let _ = db.set_meta("user_edited_ui", "1");
            let _ = db.set_meta("source", "user");
        }
        if let Ok(mut cache) = self.compose_cache.lock() {
            cache.remove(id);
        }
        Ok(())
    }

    pub fn mark_run(&self, id: &str) -> DomainResult<()> {
        let db = self.open_db(id)?;
        db.set_meta("last_run_at", &Utc::now().to_rfc3339())
    }

    pub fn list_history(&self, id: &str, limit: u32) -> DomainResult<Vec<PluginHistoryEntry>> {
        let db = self.open_db(id)?;
        db.list_history(limit)
    }

    pub fn open_db_public(&self, id: &str) -> DomainResult<PluginDb> {
        crate::domain::validate_plugin_id(id)?;
        self.open_db(id)
    }

    pub(super) fn open_db(&self, id: &str) -> DomainResult<PluginDb> {
        // Re-open each time is fine for correctness; cache open handles for speed.
        {
            let map = self.dbs.lock().unwrap();
            if map.contains_key(id) {
                // Cannot return reference out of lock easily with PluginDb not Clone.
                // Drop lock and open path again — PluginDb holds Connection, so we
                // keep cache but need to restructure. For simplicity: always open
                // from path without long-lived cache when Mutex would block.
            }
        }
        // Always open from disk path; SQLite handles concurrent access via Mutex inside PluginDb.
        // Drop unused cache to avoid holding multiple connections poorly.
        let path = Self::db_path(&self.plugin_dir(id));
        PluginDb::open(&path)
    }
}

pub(super) fn truncate_json(v: &Value, max: usize) -> String {
    let s = v.to_string();
    if s.chars().count() <= max {
        s
    } else {
        let t: String = s.chars().take(max).collect();
        format!("{t}…")
    }
}
