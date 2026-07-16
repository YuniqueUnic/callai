use crate::domain::PluginPermission;
use crate::infra::plugin::builtins::{catalog_ids, list_builtin_drafts};
use crate::infra::plugin::{ensure_builtin_plugins, PluginManager};

#[test]
fn builtin_catalog_is_complete_and_valid() {
    let drafts = list_builtin_drafts().expect("list drafts");
    assert!(drafts.len() >= 4, "expected at least the shipped builtins");
    let ids = catalog_ids();
    for id in ["todo", "pomodoro", "meal-spin", "work-report"] {
        assert!(ids.contains(&id), "missing catalog id {id}");
    }
    for d in &drafts {
        d.validate().unwrap();
        assert!(
            d.manifest.permissions.contains(&PluginPermission::Storage),
            "{} should request storage",
            d.manifest.id
        );
        assert!(
            d.ui_html.contains("waitCallai") || d.ui_html.contains("callai.storage"),
            "{} ui should talk to host SDK",
            d.manifest.id
        );
        assert!(
            d.ui_html.contains("data-presets=\"react-classic\"")
                || d.ui_html.contains("data-presets='react-classic'"),
            "{} should use react-classic babel preset",
            d.manifest.id
        );
    }
}

#[test]
fn seed_installs_once_and_respects_delete() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("plugins");
    let mgr = PluginManager::from_root(root.clone()).unwrap();

    let first = ensure_builtin_plugins(&mgr).expect("first seed");
    assert_eq!(first.len(), catalog_ids().len());
    assert_eq!(mgr.list().unwrap().len(), catalog_ids().len());

    // Second seed: nothing new.
    let second = ensure_builtin_plugins(&mgr).expect("second seed");
    assert!(second.is_empty());
    assert_eq!(mgr.list().unwrap().len(), catalog_ids().len());

    // Delete one builtin — must not reappear.
    mgr.delete("todo").unwrap();
    assert!(mgr.get_summary("todo").is_err());
    let third = ensure_builtin_plugins(&mgr).expect("third seed after delete");
    assert!(third.is_empty());
    assert!(mgr.get_summary("todo").is_err());
    assert_eq!(mgr.list().unwrap().len(), catalog_ids().len() - 1);

    // Marker file exists.
    assert!(root.join(".callai_builtins_seeded.json").is_file());
}

#[test]
fn new_catalog_id_can_be_seeded_after_marker_exists() {
    // Simulate: marker already has all current ids except we manually remove one from marker
    // and delete the plugin dir to prove only unseeded ids install.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("plugins");
    let mgr = PluginManager::from_root(root.clone()).unwrap();
    ensure_builtin_plugins(&mgr).unwrap();
    mgr.delete("pomodoro").unwrap();

    // Rewrite marker without pomodoro → next ensure should reinstall pomodoro only.
    let marker_path = root.join(".callai_builtins_seeded.json");
    let raw = std::fs::read_to_string(&marker_path).unwrap();
    let mut v: serde_json::Value = serde_json::from_str(&raw).unwrap();
    let seeded = v["seeded"].as_array_mut().unwrap();
    seeded.retain(|x| x.as_str() != Some("pomodoro"));
    std::fs::write(&marker_path, serde_json::to_string_pretty(&v).unwrap()).unwrap();

    let again = ensure_builtin_plugins(&mgr).unwrap();
    assert_eq!(again.len(), 1);
    assert_eq!(again[0].id, "pomodoro");
    assert!(mgr.get_summary("pomodoro").is_ok());
}

#[test]
fn restore_builtin_resets_ui_keeps_data() {
    use crate::infra::plugin::builtins::{self, find_spec};
    let dir = tempfile::tempdir().unwrap();
    let mgr = PluginManager::from_root(dir.path().join("plugins")).unwrap();
    builtins::ensure_builtin_plugins(&mgr).unwrap();
    mgr.invoke(
        "todo",
        "storage.set",
        serde_json::json!({"key":"settings","value":{"filter":"open"}}),
    )
    .unwrap();
    mgr.write_ui_html("todo", "<html>user-edit</html>").unwrap();
    assert!(mgr.read_ui_html("todo").unwrap().contains("user-edit"));

    let restored = builtins::restore_builtin(&mgr, "todo", false).unwrap();
    assert_eq!(restored.id, "todo");
    let ui = mgr.read_ui_html("todo").unwrap();
    assert!(!ui.contains("user-edit"));
    assert!(ui.contains("waitCallai") || ui.len() > 100);
    let got = mgr
        .invoke(
            "todo",
            "storage.get",
            serde_json::json!({"key": "settings"}),
        )
        .unwrap();
    // value may be object or string depending on storage path
    let raw = got.get("value").cloned().unwrap_or(serde_json::Value::Null);
    let s = raw.to_string();
    assert!(s.contains("open") || s.contains("filter"), "kept data: {s}");
    let _ = find_spec("todo");
}

#[test]
fn internal_warmup_seeded_but_hidden_from_list() {
    use crate::infra::plugin::{ensure_warmup_plugin, is_internal_plugin};

    assert!(is_internal_plugin("callai-warmup"));
    assert!(!is_internal_plugin("meal-spin"));

    let dir = tempfile::tempdir().unwrap();
    let mgr = PluginManager::from_root(dir.path().join("plugins")).unwrap();
    ensure_warmup_plugin(&mgr).expect("seed warmup");
    assert!(mgr.get_summary("callai-warmup").is_ok());
    // Hidden from UI list.
    let list = mgr.list().unwrap();
    assert!(list.iter().all(|p| p.id != "callai-warmup"));
    // Second seed is idempotent.
    ensure_warmup_plugin(&mgr).unwrap();
    assert_eq!(mgr.list().unwrap().len(), 0);
}
