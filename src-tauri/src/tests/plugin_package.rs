use crate::domain::{PluginDraft, PluginManifest, PluginPermission};
use crate::infra::plugin::package::InstallConflictMode;
use crate::infra::plugin::InstallPackageOpts;
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
            params: Default::default(),
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
        .import_zip_bytes(
            &bare,
            InstallPackageOpts::from_conflict(InstallConflictMode::Rename),
        )
        .unwrap()
        .expect("installed bare");
    assert!(s2.id.starts_with("pack-demo"));
    let got = mgr2
        .invoke(&s2.id, "storage.get", serde_json::json!({"key": "k"}))
        .unwrap();
    assert!(got.get("value").map(|v| v.is_null()).unwrap_or(true) || got["value"].is_null());

    let s3 = mgr2
        .import_zip_bytes(
            &with_data,
            InstallPackageOpts::from_conflict(InstallConflictMode::Rename),
        )
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
            params: Default::default(),
        },
        ui_html: "<html>v1</html>".into(),
    };
    mgr.install(draft).unwrap();
    let zip = mgr.export_zip_bytes("same-id", false).unwrap();

    assert!(mgr
        .import_zip_bytes(
            &zip,
            InstallPackageOpts::from_conflict(InstallConflictMode::Fail)
        )
        .is_err());
    assert!(mgr
        .import_zip_bytes(
            &zip,
            InstallPackageOpts::from_conflict(InstallConflictMode::Skip)
        )
        .unwrap()
        .is_none());
    let over = mgr
        .import_zip_bytes(
            &zip,
            InstallPackageOpts::from_conflict(InstallConflictMode::Overwrite),
        )
        .unwrap()
        .unwrap();
    assert_eq!(over.id, "same-id");
}

#[test]
fn overwrite_blocks_silent_downgrade_keeps_data() {
    let dir = tempfile::tempdir().unwrap();
    let mgr = PluginManager::from_root(dir.path().join("plugins")).unwrap();
    let draft = PluginDraft {
        manifest: PluginManifest {
            id: "ver-demo".into(),
            name: "Ver".into(),
            version: "2.0.0".into(),
            description: String::new(),
            permissions: vec![PluginPermission::Storage],
            ui: "ui.html".into(),
            params: Default::default(),
        },
        ui_html: "<html>v2</html>".into(),
    };
    mgr.install(draft).unwrap();
    mgr.invoke(
        "ver-demo",
        "storage.set",
        serde_json::json!({"key": "settings", "value": {"keep": true}}),
    )
    .unwrap();

    let lower_manifest = PluginManifest {
        id: "ver-demo".into(),
        name: "Ver".into(),
        version: "1.0.0".into(),
        description: String::new(),
        permissions: vec![PluginPermission::Storage],
        ui: "ui.html".into(),
        params: Default::default(),
    };
    let zip =
        crate::infra::plugin::package::build_plugin_zip(&lower_manifest, "<html>v1</html>", None)
            .unwrap();

    let err = mgr
        .import_zip_bytes(
            &zip,
            InstallPackageOpts {
                conflict: InstallConflictMode::Overwrite,
                force_downgrade: false,
                replace_data: false,
            },
        )
        .unwrap_err();
    assert!(
        err.message.to_ascii_lowercase().contains("downgrade"),
        "expected downgrade block: {}",
        err.message
    );

    let ok = mgr
        .import_zip_bytes(
            &zip,
            InstallPackageOpts {
                conflict: InstallConflictMode::Overwrite,
                force_downgrade: true,
                replace_data: false,
            },
        )
        .unwrap()
        .expect("force downgrade");
    assert_eq!(ok.version, "1.0.0");

    let v = mgr
        .invoke(
            "ver-demo",
            "storage.get",
            serde_json::json!({"key": "settings"}),
        )
        .unwrap();
    // storage.get returns the value itself
    assert!(
        v.get("keep").and_then(|x| x.as_bool()) == Some(true) || format!("{v}").contains("keep"),
        "data should be preserved: {v}"
    );
}
