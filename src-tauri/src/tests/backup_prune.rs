use std::fs;

use crate::app::ConfigBackup;
use crate::infra::{AppPaths, TomlConfigBackup};

fn temp_paths() -> (tempfile::TempDir, AppPaths) {
    let dir = tempfile::tempdir().unwrap();
    let config_dir = dir.path().join("config");
    let data_dir = dir.path().join("data");
    let paths = AppPaths::from_dirs(config_dir, data_dir);
    paths.ensure().unwrap();
    (dir, paths)
}

#[test]
fn prune_keeps_at_most_ten() {
    let (_dir, paths) = temp_paths();
    // seed config
    fs::write(&paths.config_file, "settings = {}\nalarms = []\n").unwrap();
    let backup = TomlConfigBackup::new(AppPaths::from_dirs(
        paths.config_dir.clone(),
        paths.data_dir.clone(),
    ));

    // create 12 fake backups with sortable names
    for i in 1..=12 {
        let name = format!("config.toml.2026-07-12_04-{:02}-00.bak", i);
        fs::write(paths.backups_dir.join(&name), b"x").unwrap();
    }
    // trigger prune via backup_now (copies current config + prunes)
    let _ = backup.backup_now().unwrap();
    let list = backup.list_backups().unwrap();
    assert!(list.len() <= TomlConfigBackup::MAX_BACKUP_FILES);
    assert!(list.len() <= 10);
}

#[test]
fn delete_backup_removes_file() {
    let (_dir, paths) = temp_paths();
    fs::write(&paths.config_file, "ok").unwrap();
    let backup = TomlConfigBackup::new(AppPaths::from_dirs(
        paths.config_dir.clone(),
        paths.data_dir.clone(),
    ));
    let name = backup.backup_now().unwrap();
    assert!(!name.is_empty());
    let bak_path = paths.backups_dir.join(&name);
    assert!(bak_path.exists());
    backup.delete_backup(&name).unwrap();
    assert!(!bak_path.exists());
    assert!(backup.delete_backup("../evil.bak").is_err());
}
