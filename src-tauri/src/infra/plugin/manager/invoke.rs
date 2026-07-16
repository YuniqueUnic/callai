//! plugin_invoke routing.
use chrono::Utc;
use serde_json::{json, Value};

use super::{truncate_json, PluginManager};
use crate::domain::{
    methods, permission_for_method, DomainError, DomainResult, ErrorCode, PluginManifest,
};

impl PluginManager {
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
                    .min(crate::domain::PLUGIN_INVOKE_HISTORY_MAX as u64)
                    as u32;
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
}
