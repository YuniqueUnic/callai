//! PluginManager: install/list/delete plugins and route `plugin_invoke`.
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::{DateTime, Utc};
use serde_json::{json, Value};

use crate::domain::{
    methods, permission_for_method, DomainError, DomainResult, ErrorCode, PluginDraft,
    PluginHistoryEntry, PluginManifest, PluginSummary,
};
use crate::infra::paths::AppPaths;

use super::storage::PluginDb;

pub struct PluginManager {
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

    pub fn install(&self, draft: PluginDraft) -> DomainResult<PluginSummary> {
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

    /// Compose host HTML that injects a safe `plugin_invoke` bridge via postMessage parent,
    /// or when running as standalone webview, uses a marker for host injection.
    pub fn compose_host_html(&self, id: &str) -> DomainResult<String> {
        let body = self.read_ui_html(id)?;
        let bridge = r#"
<script>
(function(){
  const PLUGIN_ID = __PLUGIN_ID__;
  window.callai = window.callai || {};
  window.callai.pluginId = PLUGIN_ID;
  window.callai.invoke = function(method, args) {
    return new Promise(function(resolve, reject) {
      const reqId = Math.random().toString(36).slice(2);
      function onMsg(ev) {
        const d = ev.data || {};
        if (d && d.__callai_plugin_result && d.reqId === reqId) {
          window.removeEventListener('message', onMsg);
          if (d.ok) resolve(d.value);
          else reject(new Error(d.error || 'plugin_invoke failed'));
        }
      }
      window.addEventListener('message', onMsg);
      parent.postMessage({
        __callai_plugin_invoke: true,
        reqId: reqId,
        pluginId: PLUGIN_ID,
        method: method,
        args: args || {}
      }, '*');
      setTimeout(function(){
        window.removeEventListener('message', onMsg);
        reject(new Error('plugin_invoke timeout'));
      }, 30000);
    });
  };
})();
</script>
"#;
        let bridge = bridge.replace("__PLUGIN_ID__", &format!("\"{id}\""));
        // Prefer injecting before </head> or at start of document.
        if body.to_lowercase().contains("</head>") {
            Ok(body.replacen("</head>", &format!("{bridge}</head>"), 1))
        } else if body.to_lowercase().contains("<body") {
            Ok(format!("{bridge}{body}"))
        } else {
            Ok(format!(
                "<!DOCTYPE html><html><head><meta charset=\"utf-8\">{csp}</head><body>{body}{bridge}</body></html>",
                csp = r#"<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; connect-src 'none';">"#,
                body = body,
                bridge = bridge
            ))
        }
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
                    .map(|v| {
                        if let Some(s) = v.as_str() {
                            s.to_string()
                        } else {
                            v.to_string()
                        }
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
            methods::TIMER_NOW => Ok(json!({ "now": Utc::now().to_rfc3339() })),
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
