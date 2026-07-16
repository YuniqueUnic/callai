use crate::domain::{PluginDraft, PluginManifest, PluginPermission};
use crate::infra::plugin::package::InstallConflictMode;
use crate::infra::plugin::PluginManager;

#[test]
fn export_import_roundtrip_bare_and_with_data() {
    let dir = tempfile::tempdir().unwrap();
    let mgr = PluginManager::from_root(dir.path().join("plugins")).unwrap();
    let draft = PluginDraft {
        manifest: PluginManifest {
            id: "pack-demo".into(),
            name: "Pack Demo".into(),
            version: "0.1.0".into(),
            description: "zip".into(),
            permissions: vec![PluginPermission::Storage],
            ui: "ui.html".into(),
        },
        ui_html: "<html><body>pack</body></html>".into(),
    };
    let summary = mgr.install(draft).unwrap();
    mgr.invoke(
        &summary.id,
        "storage.set",
        serde_json::json!({"key":"k","value":"v"}),
    )
    .unwrap();

    let bare = mgr.export_zip_bytes(&summary.id, false).unwrap();
    let with_data = mgr.export_zip_bytes(&summary.id, true).unwrap();
    assert!(with_data.len() > bare.len());

    let mgr2 = PluginManager::from_root(dir.path().join("plugins2")).unwrap();
    let s2 = mgr2
        .import_zip_bytes(&bare, InstallConflictMode::Rename)
        .unwrap()
        .expect("installed bare");
    assert!(s2.id.starts_with("pack-demo"));
    let got = mgr2
        .invoke(&s2.id, "storage.get", serde_json::json!({"key": "k"}))
        .unwrap();
    assert!(got.get("value").map(|v| v.is_null()).unwrap_or(true) || got["value"].is_null());

    let s3 = mgr2
        .import_zip_bytes(&with_data, InstallConflictMode::Rename)
        .unwrap()
        .expect("installed data");
    let got2 = mgr2
        .invoke(&s3.id, "storage.get", serde_json::json!({"key": "k"}))
        .unwrap();
    assert_eq!(got2["value"], "v");
}

#[test]
fn conflict_fail_and_overwrite() {
    let dir = tempfile::tempdir().unwrap();
    let mgr = PluginManager::from_root(dir.path().join("plugins")).unwrap();
    let draft = PluginDraft {
        manifest: PluginManifest {
            id: "same-id".into(),
            name: "A".into(),
            version: "0.1.0".into(),
            description: String::new(),
            permissions: vec![PluginPermission::Storage],
            ui: "ui.html".into(),
        },
        ui_html: "<html>v1</html>".into(),
    };
    mgr.install(draft).unwrap();
    let zip = mgr.export_zip_bytes("same-id", false).unwrap();

    assert!(mgr
        .import_zip_bytes(&zip, InstallConflictMode::Fail)
        .is_err());
    assert!(mgr
        .import_zip_bytes(&zip, InstallConflictMode::Skip)
        .unwrap()
        .is_none());
    let over = mgr
        .import_zip_bytes(&zip, InstallConflictMode::Overwrite)
        .unwrap()
        .unwrap();
    assert_eq!(over.id, "same-id");
}
