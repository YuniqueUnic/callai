use crate::domain::{PluginDraft, PluginManifest, PluginPermission};
use crate::infra::plugin::PluginManager;

#[test]
fn install_invoke_storage_and_delete() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("plugins");
    let mgr = PluginManager::from_root(root).unwrap();

    let draft = PluginDraft {
        manifest: PluginManifest {
            id: "demo-timer".into(),
            name: "Demo".into(),
            version: "0.1.0".into(),
            description: "test".into(),
            permissions: vec![
                PluginPermission::Storage,
                PluginPermission::History,
                PluginPermission::Timer,
            ],
            ui: "ui.html".into(),
            params: Default::default(),
        },
        ui_html: "<html><body>hi</body></html>".into(),
    };
    let summary = mgr.install(draft).unwrap();
    assert_eq!(summary.id, "demo-timer");

    let set = mgr
        .invoke(
            "demo-timer",
            "storage.set",
            serde_json::json!({"key":"k","value":"v"}),
        )
        .unwrap();
    assert_eq!(set["ok"], true);

    let get = mgr
        .invoke("demo-timer", "storage.get", serde_json::json!({"key":"k"}))
        .unwrap();
    assert_eq!(get["value"], "v");

    let ping = mgr
        .invoke("demo-timer", "ping", serde_json::json!({}))
        .unwrap();
    assert_eq!(ping["pong"], true);

    // missing permission
    let denied = mgr.invoke(
        "demo-timer",
        "notification.show",
        serde_json::json!({"title":"t","body":"b"}),
    );
    assert!(denied.is_err());

    mgr.delete("demo-timer").unwrap();
    assert!(mgr.get_summary("demo-timer").is_err());
}

#[test]
fn rejects_bad_plugin_id() {
    let dir = tempfile::tempdir().unwrap();
    let mgr = PluginManager::from_root(dir.path().join("plugins")).unwrap();
    let draft = PluginDraft {
        manifest: PluginManifest {
            id: "BAD_ID".into(),
            name: "x".into(),
            version: "0.1.0".into(),
            description: String::new(),
            permissions: vec![],
            ui: "ui.html".into(),
            params: Default::default(),
        },
        ui_html: "<p>x</p>".into(),
    };
    assert!(mgr.install(draft).is_err());
}

#[test]
fn compose_host_forces_react_classic_jsx_runtime() {
    let dir = tempfile::tempdir().unwrap();
    let mgr = PluginManager::from_root(dir.path().join("plugins")).unwrap();
    let draft = PluginDraft {
        manifest: PluginManifest {
            id: "babel-demo".into(),
            name: "Babel".into(),
            version: "0.1.0".into(),
            description: String::new(),
            permissions: vec![],
            ui: "ui.html".into(),
            params: Default::default(),
        },
        ui_html: r#"<!DOCTYPE html><html><head>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head><body>
<script type="text/babel" data-presets="react,typescript">
const App = () => <div style={{x:1}}>hi</div>;
</script>
</body></html>"#
            .into(),
    };
    mgr.install(draft).unwrap();
    let host = mgr.compose_host_html("babel-demo").unwrap();
    assert!(
        host.contains("react-classic"),
        "expected react-classic preset, got snippet missing it"
    );
    assert!(
        host.contains("registerPreset"),
        "expected Babel registerPreset bootstrap"
    );
    assert!(
        !host.contains(r#"data-presets="react,typescript""#),
        "typescript preset must be stripped"
    );
    assert!(
        host.contains("callai.storage") || host.contains("window.callai"),
        "bridge SDK from templates/plugin/bridge.js.j2 must be injected"
    );
    assert!(
        host.contains("getLaunchParams") || host.contains("launchParams"),
        "bridge must expose launchParams for alarm-driven page override"
    );
    assert!(
        host.contains("callai-host-bar")
            || host.contains("callai-host-fab")
            || host.contains("__callaiHostPanel"),
        "host settings panel must be injected"
    );
    assert!(
        host.contains("callai-theme-dark") || host.contains("hue-rotate"),
        "host dark theme invert CSS must be present"
    );
    assert!(
        host.contains("scrollbar-width") || host.contains("::-webkit-scrollbar"),
        "host chrome CSS (hide scrollbars) must be injected"
    );
}
