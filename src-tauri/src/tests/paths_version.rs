use crate::infra::AppPaths;

#[test]
fn app_paths_backups_dir_is_under_config() {
    let dir = tempfile::tempdir().unwrap();
    let config = dir.path().join("cfg");
    let data = dir.path().join("data");
    let paths = AppPaths::from_dirs(config.clone(), data);
    paths.ensure().unwrap();
    assert_eq!(paths.backups_dir(), config.join("backups"));
    assert!(paths.backups_dir().is_dir());
}

#[test]
fn package_version_is_semverish() {
    let v = env!("CARGO_PKG_VERSION");
    assert!(!v.is_empty());
    assert!(v.contains('.'), "expected semver-like version, got {v}");
}
