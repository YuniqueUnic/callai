//! PluginManager: install/list/delete plugins and route `plugin_invoke`.
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::{DateTime, Utc};
use serde_json::{json, Value};

use super::templates;
use crate::domain::{
    methods, permission_for_method, DomainError, DomainResult, ErrorCode, PluginDraft,
    PluginHistoryEntry, PluginManifest, PluginSummary,
};
use crate::infra::paths::AppPaths;

use super::storage::PluginDb;

pub struct PluginManager {
    /// id -> (mtime_secs, composed_html)
    compose_cache: std::sync::Mutex<std::collections::HashMap<String, (u64, String)>>,
    root: PathBuf,
    dbs: Mutex<HashMap<String, PluginDb>>,
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

    #[allow(dead_code)]
    pub fn plugins_root(&self) -> &Path {
        &self.root
    }

    pub fn plugin_dir(&self, id: &str) -> PathBuf {
        self.root.join(id)
    }

    fn manifest_path(dir: &Path) -> PathBuf {
        dir.join("manifest.json")
    }

    fn db_path(dir: &Path) -> PathBuf {
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

    fn unique_display_name(&self, desired: &str) -> String {
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

    fn unique_plugin_id(&self, desired: &str) -> String {
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

    fn summary_for(
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
        if let Ok(mut cache) = self.compose_cache.lock() {
            cache.remove(id);
        }
        Ok(())
    }

    /// Compose host HTML that injects the callai bridge + host chrome CSS.
    /// Snippets live under `src-tauri/templates/plugin/` and are rendered via minijinja.
    pub fn compose_host_html(&self, id: &str) -> DomainResult<String> {
        let ui_path = {
            let manifest = self.read_manifest(id)?;
            self.plugin_dir(id).join(&manifest.ui)
        };
        let mtime = std::fs::metadata(&ui_path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if let Ok(cache) = self.compose_cache.lock() {
            if let Some((mt, html)) = cache.get(id) {
                if *mt == mtime {
                    return Ok(html.clone());
                }
            }
        }

        let body = Self::sanitize_plugin_html(&self.read_ui_html(id)?);
        let bridge = templates::render_bridge(id);
        let chrome = templates::host_chrome_style_tag();

        // Prefer injecting chrome + bridge before </head> so CSP/fonts stay intact.
        let lower = body.to_lowercase();
        let out = if lower.contains("</head>") {
            let injected = format!("{chrome}{bridge}");
            body.replacen("</head>", &format!("{injected}</head>"), 1)
        } else if lower.contains("<body") {
            format!("{chrome}{body}{bridge}")
        } else {
            templates::wrap_bare_document(&body, &bridge)
        };
        if let Ok(mut cache) = self.compose_cache.lock() {
            cache.insert(id.to_string(), (mtime, out.clone()));
        }
        Ok(out)
    }

    /// Fix common model-output HTML issues before sandbox execution.
    ///
    /// Critical: modern `@babel/standalone` defaults React JSX to **automatic**
    /// runtime (`import { jsx } from "react/jsx-runtime"`). That cannot run in a
    /// classic `<script>` / UMD page. We inject `babel_boot.html` which registers
    /// `react-classic` (`runtime: "classic"` → `React.createElement`).
    fn sanitize_plugin_html(html: &str) -> String {
        let mut s = html.to_string();

        for old in [
            r#"data-presets="react,typescript""#,
            r#"data-presets="typescript,react""#,
            r#"data-presets="react""#,
            "data-presets='react,typescript'",
            "data-presets='react'",
        ] {
            s = s.replace(old, r#"data-presets="react-classic""#);
        }

        let babel_boot = templates::babel_boot_html();
        if s.contains("registerPreset(\"react-classic\"")
            || s.contains("registerPreset('react-classic'")
        {
            // already bootstrapped (e.g. re-saved source)
            return s;
        }

        let babel_markers = [
            r#"@babel/standalone/babel.min.js"></script>"#,
            r#"babel.min.js"></script>"#,
            r#"babel.js"></script>"#,
        ];
        let mut injected = false;
        for m in babel_markers {
            if let Some(idx) = s.find(m) {
                let at = idx + m.len();
                s.insert_str(at, babel_boot);
                injected = true;
                break;
            }
        }
        if !injected {
            if let Some(idx) = s.find(r#"type="text/babel""#) {
                let head = s[..idx].rfind("<script").unwrap_or(idx);
                s.insert_str(head, babel_boot);
            } else if let Some(idx) = s.to_lowercase().find("</head>") {
                s.insert_str(idx, babel_boot);
            }
        }

        // Ensure host chrome CSS is present once (hide scrollbars, tight shell).
        let chrome = templates::host_chrome_style_tag();
        if !s.contains("/* Injected into plugin host document") {
            if let Some(idx) = s.to_lowercase().find("</head>") {
                s.insert_str(idx, &chrome);
            } else {
                s = format!("{chrome}{s}");
            }
        }

        s
    }

    pub fn mark_run(&self, id: &str) -> DomainResult<()> {
        let db = self.open_db(id)?;
        db.set_meta("last_run_at", &Utc::now().to_rfc3339())
    }

    pub fn list_history(&self, id: &str, limit: u32) -> DomainResult<Vec<PluginHistoryEntry>> {
        let db = self.open_db(id)?;
        db.list_history(limit)
    }

    pub fn invoke(&self, plugin_id: &str, method: &str, args: Value) -> DomainResult<Value> {
        crate::domain::validate_plugin_id(plugin_id)?;
        let method = method.trim();
        if method.is_empty() {
            return Err(DomainError::new(
                ErrorCode::InvalidArgs,
                "method is required",
            ));
        }
        let manifest = self.read_manifest(plugin_id)?;
        match permission_for_method(method) {
            Some(perm) => {
                if !manifest.allows(perm) {
                    return Err(DomainError::new(
                        ErrorCode::PermissionDenied,
                        format!("plugin lacks permission: {}", perm.as_str()),
                    ));
                }
            }
            None if method == methods::PING => {}
            None => {
                return Err(DomainError::new(
                    ErrorCode::InvalidArgs,
                    format!("unknown method: {method}"),
                ));
            }
        }

        let args_preview = truncate_json(&args, 200);
        let result = self.dispatch(plugin_id, method, &args, &manifest);
        let (ok, result_preview) = match &result {
            Ok(v) => (true, truncate_json(v, 200)),
            Err(e) => (false, e.message.clone()),
        };
        if let Ok(db) = self.open_db(plugin_id) {
            let _ = db.append_history(method, &args_preview, &result_preview, ok);
        }
        result
    }

    fn dispatch(
        &self,
        plugin_id: &str,
        method: &str,
        args: &Value,
        _manifest: &PluginManifest,
    ) -> DomainResult<Value> {
        match method {
            methods::PING => Ok(json!({ "pong": true, "plugin_id": plugin_id })),
            methods::STORAGE_GET => {
                let key = args
                    .get("key")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| DomainError::new(ErrorCode::InvalidArgs, "key required"))?;
                let db = self.open_db(plugin_id)?;
                Ok(json!({ "value": db.get(key)? }))
            }
            methods::STORAGE_SET => {
                let key = args
                    .get("key")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| DomainError::new(ErrorCode::InvalidArgs, "key required"))?;
                let value = args
                    .get("value")
                    .map(|v| match v {
                        // Already a string: store as-is (may be JSON text or plain).
                        serde_json::Value::String(s) => s.clone(),
                        // Objects/arrays/numbers: canonical JSON text.
                        other => other.to_string(),
                    })
                    .ok_or_else(|| DomainError::new(ErrorCode::InvalidArgs, "value required"))?;
                let db = self.open_db(plugin_id)?;
                db.set(key, &value)?;
                Ok(json!({ "ok": true }))
            }
            methods::STORAGE_DELETE => {
                let key = args
                    .get("key")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| DomainError::new(ErrorCode::InvalidArgs, "key required"))?;
                let db = self.open_db(plugin_id)?;
                Ok(json!({ "deleted": db.delete(key)? }))
            }
            methods::STORAGE_LIST => {
                let prefix = args.get("prefix").and_then(|v| v.as_str());
                let db = self.open_db(plugin_id)?;
                Ok(json!({ "keys": db.list_keys(prefix)? }))
            }
            methods::HISTORY_LIST => {
                let limit = args
                    .get("limit")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(50)
                    .min(200) as u32;
                let db = self.open_db(plugin_id)?;
                Ok(json!(db.list_history(limit)?))
            }
            methods::HISTORY_APPEND => {
                let note = args.get("note").and_then(|v| v.as_str()).unwrap_or("user");
                let db = self.open_db(plugin_id)?;
                let id = db.append_history("history.append", note, "ok", true)?;
                Ok(json!({ "id": id }))
            }
            methods::TIMER_NOW => {
                let now = Utc::now();
                let iso = now.to_rfc3339();
                Ok(json!({
                    "now": iso,
                    "iso": iso,
                    "ts": now.timestamp_millis(),
                }))
            }
            methods::NOTIFY => {
                // Actual OS notification is host-owned; return payload for host to show.
                let title = args
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("callai");
                let body = args.get("body").and_then(|v| v.as_str()).unwrap_or("");
                Ok(json!({ "queued": true, "title": title, "body": body }))
            }
            _ => Err(DomainError::new(
                ErrorCode::InvalidArgs,
                format!("unknown method: {method}"),
            )),
        }
    }

    fn open_db(&self, id: &str) -> DomainResult<PluginDb> {
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

fn truncate_json(v: &Value, max: usize) -> String {
    let s = v.to_string();
    if s.chars().count() <= max {
        s
    } else {
        let t: String = s.chars().take(max).collect();
        format!("{t}…")
    }
}
