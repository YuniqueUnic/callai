//! In-memory ring buffer of plugin console lines (for Logs / Fix-with-AI).
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

const MAX_PER_PLUGIN: usize = 300;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginConsoleEntry {
    pub level: String,
    pub args: Vec<String>,
    pub t: i64,
}

#[derive(Default)]
pub struct PluginConsoleStore {
    inner: Mutex<HashMap<String, VecDeque<PluginConsoleEntry>>>,
}

impl PluginConsoleStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn append(&self, plugin_id: &str, entry: PluginConsoleEntry) {
        let mut map = self.inner.lock().unwrap();
        let q = map.entry(plugin_id.to_string()).or_default();
        q.push_back(entry);
        while q.len() > MAX_PER_PLUGIN {
            q.pop_front();
        }
    }

    pub fn append_many(&self, plugin_id: &str, entries: Vec<PluginConsoleEntry>) {
        for e in entries {
            self.append(plugin_id, e);
        }
    }

    pub fn list(&self, plugin_id: &str, limit: usize) -> Vec<PluginConsoleEntry> {
        let map = self.inner.lock().unwrap();
        let Some(q) = map.get(plugin_id) else {
            return Vec::new();
        };
        let lim = limit.clamp(1, MAX_PER_PLUGIN);
        q.iter()
            .rev()
            .take(lim)
            .cloned()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect()
    }

    pub fn clear(&self, plugin_id: &str) {
        let mut map = self.inner.lock().unwrap();
        map.remove(plugin_id);
    }
}
