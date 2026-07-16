//! In-memory ring buffers of plugin console / error lines (Logs / Fix-with-AI).
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::domain::{PLUGIN_CONSOLE_MAX, PLUGIN_ERROR_LOG_MAX};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginConsoleEntry {
    pub level: String,
    pub args: Vec<String>,
    pub t: i64,
}

#[derive(Default)]
struct PluginLogRings {
    console: VecDeque<PluginConsoleEntry>,
    errors: VecDeque<PluginConsoleEntry>,
}

#[derive(Default)]
pub struct PluginConsoleStore {
    inner: Mutex<HashMap<String, PluginLogRings>>,
}

fn is_error_level(level: &str) -> bool {
    let l = level.to_ascii_lowercase();
    l == "error" || l == "err" || l == "fatal" || l == "exception"
}

fn push_capped(q: &mut VecDeque<PluginConsoleEntry>, entry: PluginConsoleEntry, max: usize) {
    q.push_back(entry);
    while q.len() > max {
        q.pop_front();
    }
}

fn list_rev_take(
    q: &VecDeque<PluginConsoleEntry>,
    limit: usize,
    max: usize,
) -> Vec<PluginConsoleEntry> {
    let lim = limit.clamp(1, max);
    q.iter()
        .rev()
        .take(lim)
        .cloned()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect()
}

impl PluginConsoleStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn append(&self, plugin_id: &str, entry: PluginConsoleEntry) {
        let mut map = self.inner.lock().unwrap();
        let rings = map.entry(plugin_id.to_string()).or_default();
        let err = is_error_level(&entry.level);
        push_capped(&mut rings.console, entry.clone(), PLUGIN_CONSOLE_MAX);
        if err {
            push_capped(&mut rings.errors, entry, PLUGIN_ERROR_LOG_MAX);
        }
    }

    pub fn append_many(&self, plugin_id: &str, entries: Vec<PluginConsoleEntry>) {
        for e in entries {
            self.append(plugin_id, e);
        }
    }

    /// Recent console lines (all levels), newest-last order, max [`PLUGIN_CONSOLE_MAX`].
    pub fn list(&self, plugin_id: &str, limit: usize) -> Vec<PluginConsoleEntry> {
        let map = self.inner.lock().unwrap();
        let Some(rings) = map.get(plugin_id) else {
            return Vec::new();
        };
        list_rev_take(&rings.console, limit, PLUGIN_CONSOLE_MAX)
    }

    /// Recent error-level lines only, max [`PLUGIN_ERROR_LOG_MAX`].
    pub fn list_errors(&self, plugin_id: &str, limit: usize) -> Vec<PluginConsoleEntry> {
        let map = self.inner.lock().unwrap();
        let Some(rings) = map.get(plugin_id) else {
            return Vec::new();
        };
        list_rev_take(&rings.errors, limit, PLUGIN_ERROR_LOG_MAX)
    }

    pub fn clear_console(&self, plugin_id: &str) {
        let mut map = self.inner.lock().unwrap();
        if let Some(rings) = map.get_mut(plugin_id) {
            rings.console.clear();
        }
    }

    pub fn clear_errors(&self, plugin_id: &str) {
        let mut map = self.inner.lock().unwrap();
        if let Some(rings) = map.get_mut(plugin_id) {
            rings.errors.clear();
        }
    }
}

#[cfg(test)]
mod unit {
    use super::*;

    #[test]
    fn console_and_errors_cap_at_100() {
        let store = PluginConsoleStore::new();
        for i in 0..150 {
            store.append(
                "p1",
                PluginConsoleEntry {
                    level: "info".into(),
                    args: vec![format!("i{i}")],
                    t: i,
                },
            );
            store.append(
                "p1",
                PluginConsoleEntry {
                    level: "error".into(),
                    args: vec![format!("e{i}")],
                    t: i,
                },
            );
        }
        let cons = store.list("p1", 1000);
        let errs = store.list_errors("p1", 1000);
        assert_eq!(cons.len(), PLUGIN_CONSOLE_MAX);
        assert_eq!(errs.len(), PLUGIN_ERROR_LOG_MAX);
        // oldest dropped
        assert!(cons.first().unwrap().args[0].contains("50") || cons.first().unwrap().t >= 50);
        assert_eq!(errs.last().unwrap().args[0], "e149");
    }
}
