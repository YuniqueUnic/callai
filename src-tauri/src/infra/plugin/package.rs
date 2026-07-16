//! callai plugin zip package format (import / export).
//!
//! # Layout (marketplace-ready)
//!
//! ```text
//! <id>.zip
//!   manifest.json          # required
//!   ui.html                # or manifest.ui filename
//!   callai-package.json    # optional package meta (schema, includes_data, …)
//!   data.db                # optional — only when exported with data
//! ```

use std::io::{Cursor, Read, Write};
use std::path::{Component, Path};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::domain::{DomainError, DomainResult, ErrorCode, PluginDraft, PluginManifest};

pub const PACKAGE_SCHEMA: u32 = 1;
pub const PACKAGE_KIND: &str = "callai-plugin";
pub const PACKAGE_META_FILE: &str = "callai-package.json";
pub const MANIFEST_FILE: &str = "manifest.json";
pub const DATA_FILE: &str = "data.db";

const MAX_ZIP_BYTES: u64 = 12 * 1024 * 1024;
const MAX_UNCOMPRESSED_TOTAL: u64 = 16 * 1024 * 1024;
const MAX_UI_BYTES: usize = 1024 * 1024;
const MAX_DATA_BYTES: u64 = 10 * 1024 * 1024;
const MAX_ENTRIES: usize = 64;

/// How to handle an existing plugin id on import.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum InstallConflictMode {
    /// Allocate unique id/name (legacy default).
    #[default]
    Rename,
    /// Replace ui/manifest (and data if package includes it); keep id.
    Overwrite,
    /// Return error if id already exists.
    Fail,
    /// Return Ok(None) style — handled at call site as skip.
    Skip,
}

impl InstallConflictMode {
    pub fn parse(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "overwrite" | "replace" => Self::Overwrite,
            "fail" | "error" => Self::Fail,
            "skip" => Self::Skip,
            _ => Self::Rename,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageMeta {
    pub schema: u32,
    pub kind: String,
    #[serde(default)]
    pub includes_data: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exported_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    /// Optional registry / homepage URL (marketplace prep).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repository: Option<String>,
}

impl Default for PackageMeta {
    fn default() -> Self {
        Self {
            schema: PACKAGE_SCHEMA,
            kind: PACKAGE_KIND.into(),
            includes_data: false,
            exported_at: None,
            source: None,
            homepage: None,
            repository: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct PluginPackage {
    pub draft: PluginDraft,
    pub data_db: Option<Vec<u8>>,
    pub meta: PackageMeta,
}

fn err_invalid(msg: impl Into<String>) -> DomainError {
    DomainError::new(ErrorCode::InvalidArgs, msg)
}

fn err_corrupt(msg: impl Into<String>) -> DomainError {
    DomainError::new(ErrorCode::ConfigCorrupt, msg)
}

fn normalize_entry_name(raw: &str) -> DomainResult<Option<String>> {
    let normalized = raw.replace('\\', "/");
    if normalized.starts_with('/') {
        return Err(err_invalid(format!("unsafe zip entry path: {raw}")));
    }
    let raw = normalized.trim_matches('/');
    if raw.is_empty() || raw.ends_with('/') {
        return Ok(None);
    }
    let path = Path::new(raw);
    let mut parts: Vec<String> = Vec::new();
    for c in path.components() {
        match c {
            Component::Normal(s) => {
                let s = s.to_string_lossy();
                if s.contains('\0') {
                    return Err(err_invalid("zip entry has illegal name"));
                }
                parts.push(s.into_owned());
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(err_invalid(format!("unsafe zip entry path: {raw}")));
            }
        }
    }
    if parts.is_empty() {
        return Ok(None);
    }
    if parts.len() > 2 {
        return Err(err_invalid(format!(
            "zip entry too nested (max one folder): {raw}"
        )));
    }
    Ok(Some(parts.join("/")))
}

fn strip_common_root(names: &[String]) -> Vec<String> {
    if names.is_empty() {
        return Vec::new();
    }
    let roots: Vec<&str> = names.iter().filter_map(|n| n.split('/').next()).collect();
    if roots.is_empty() {
        return names.to_vec();
    }
    let first = roots[0];
    let all_nested = names.iter().all(|n| n.contains('/')) && roots.iter().all(|r| *r == first);
    if all_nested {
        names
            .iter()
            .map(|n| {
                n.strip_prefix(&format!("{first}/"))
                    .unwrap_or(n)
                    .to_string()
            })
            .collect()
    } else {
        names.to_vec()
    }
}

fn is_simple_filename(name: &str) -> bool {
    !name.is_empty()
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..")
        && name != "."
        && name != ".."
}

/// SQLite main DB files start with this magic (NUL-terminated in file).
fn looks_like_sqlite(bytes: &[u8]) -> bool {
    const MAGIC: &[u8] = b"SQLite format 3\0";
    bytes.len() >= MAGIC.len() && &bytes[..MAGIC.len()] == MAGIC
}

fn read_zip_files(bytes: &[u8]) -> DomainResult<std::collections::HashMap<String, Vec<u8>>> {
    if bytes.is_empty() {
        return Err(err_invalid("zip is empty"));
    }
    if bytes.len() as u64 > MAX_ZIP_BYTES {
        return Err(err_invalid(format!(
            "zip too large (max {} bytes)",
            MAX_ZIP_BYTES
        )));
    }
    let cursor = Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|e| err_corrupt(format!("zip open: {e}")))?;
    if archive.len() > MAX_ENTRIES {
        return Err(err_invalid(format!(
            "zip has too many entries (max {MAX_ENTRIES})"
        )));
    }
    let mut raw_names = Vec::new();
    for i in 0..archive.len() {
        let file = archive
            .by_index(i)
            .map_err(|e| err_corrupt(format!("zip entry: {e}")))?;
        if let Some(n) = normalize_entry_name(file.name())? {
            raw_names.push(n);
        }
    }
    let flat_names = strip_common_root(&raw_names);
    let name_map: std::collections::HashMap<String, String> =
        raw_names.into_iter().zip(flat_names).collect();
    let mut files: std::collections::HashMap<String, Vec<u8>> = std::collections::HashMap::new();
    let mut uncompressed_total: u64 = 0;
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| err_corrupt(format!("zip entry: {e}")))?;
        let Some(norm) = normalize_entry_name(file.name())? else {
            continue;
        };
        let key = name_map.get(&norm).cloned().unwrap_or(norm);
        if !is_simple_filename(&key) {
            return Err(err_invalid(format!("unsupported zip layout entry: {key}")));
        }
        let size = file.size();
        uncompressed_total = uncompressed_total.saturating_add(size);
        if uncompressed_total > MAX_UNCOMPRESSED_TOTAL {
            return Err(err_invalid("zip uncompressed payload too large"));
        }
        let mut buf = Vec::new();
        file.read_to_end(&mut buf)
            .map_err(|e| err_corrupt(format!("zip read {key}: {e}")))?;
        files.insert(key, buf);
    }
    Ok(files)
}

pub fn parse_plugin_zip(bytes: &[u8]) -> DomainResult<PluginPackage> {
    let files = read_zip_files(bytes)?;

    let manifest_raw = files
        .get(MANIFEST_FILE)
        .ok_or_else(|| err_invalid("zip missing manifest.json"))?;
    let manifest: PluginManifest = serde_json::from_slice(manifest_raw)
        .map_err(|e| err_corrupt(format!("manifest.json: {e}")))?;
    manifest.validate()?;

    let ui_name = manifest.ui.clone();
    if !is_simple_filename(&ui_name) {
        return Err(err_invalid("manifest.ui must be a simple filename"));
    }
    let ui_bytes = files
        .get(&ui_name)
        .ok_or_else(|| err_invalid(format!("zip missing ui file: {ui_name}")))?;
    if ui_bytes.is_empty() {
        return Err(err_invalid("ui html is empty"));
    }
    if ui_bytes.len() > MAX_UI_BYTES {
        return Err(err_invalid("ui html too large (max 1MiB)"));
    }
    let ui_html = String::from_utf8(ui_bytes.clone())
        .map_err(|e| err_corrupt(format!("ui file is not valid UTF-8: {e}")))?;
    if ui_html.trim().is_empty() {
        return Err(err_invalid("ui html is empty"));
    }

    let mut meta = PackageMeta::default();
    if let Some(raw) = files.get(PACKAGE_META_FILE) {
        if let Ok(m) = serde_json::from_slice::<PackageMeta>(raw) {
            if m.kind != PACKAGE_KIND && !m.kind.is_empty() {
                return Err(err_invalid(format!("unsupported package kind: {}", m.kind)));
            }
            if m.schema > PACKAGE_SCHEMA {
                return Err(err_invalid(format!(
                    "package schema {} newer than supported {}",
                    m.schema, PACKAGE_SCHEMA
                )));
            }
            meta = m;
            meta.schema = meta.schema.max(1);
            meta.kind = PACKAGE_KIND.into();
        }
    }

    let data_db = match files.get(DATA_FILE) {
        Some(blob) if !blob.is_empty() => {
            if blob.len() as u64 > MAX_DATA_BYTES {
                return Err(err_invalid("data.db too large"));
            }
            if !looks_like_sqlite(blob) {
                return Err(err_invalid(
                    "data.db does not look like a SQLite database (bad magic)",
                ));
            }
            meta.includes_data = true;
            Some(blob.clone())
        }
        _ => None,
    };

    for name in files.keys() {
        let ok = name == MANIFEST_FILE
            || name == PACKAGE_META_FILE
            || name == DATA_FILE
            || name == &ui_name;
        if !ok {
            return Err(err_invalid(format!(
                "zip contains unsupported file: {name}"
            )));
        }
    }

    let draft = PluginDraft { manifest, ui_html };
    draft.validate()?;

    Ok(PluginPackage {
        draft,
        data_db,
        meta,
    })
}

/// Read only plugin id from zip (for conflict UI before install).
pub fn peek_plugin_zip_id(bytes: &[u8]) -> DomainResult<String> {
    Ok(peek_plugin_zip(bytes)?.id)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PluginZipPeek {
    pub id: String,
    pub name: String,
    pub version: String,
    pub includes_data: bool,
}

/// Peek id/version/includes_data for update UI (no install).
pub fn peek_plugin_zip(bytes: &[u8]) -> DomainResult<PluginZipPeek> {
    let pkg = parse_plugin_zip(bytes)?;
    Ok(PluginZipPeek {
        id: pkg.draft.manifest.id,
        name: pkg.draft.manifest.name,
        version: pkg.draft.manifest.version,
        includes_data: pkg.meta.includes_data || pkg.data_db.is_some(),
    })
}

pub fn build_plugin_zip(
    manifest: &PluginManifest,
    ui_html: &str,
    data_db: Option<&[u8]>,
) -> DomainResult<Vec<u8>> {
    manifest.validate()?;
    if ui_html.trim().is_empty() {
        return Err(err_invalid("ui html is empty"));
    }
    if ui_html.len() > MAX_UI_BYTES {
        return Err(err_invalid("ui html too large (max 1MiB)"));
    }
    if let Some(db) = data_db {
        if db.len() as u64 > MAX_DATA_BYTES {
            return Err(err_invalid("data.db too large to export"));
        }
        if !looks_like_sqlite(db) {
            return Err(err_invalid("data.db is not a valid SQLite file"));
        }
    }

    let meta = PackageMeta {
        schema: PACKAGE_SCHEMA,
        kind: PACKAGE_KIND.into(),
        includes_data: data_db.is_some(),
        exported_at: Some(Utc::now().to_rfc3339()),
        source: Some("callai".into()),
        homepage: None,
        repository: None,
    };

    let mut cursor = Cursor::new(Vec::new());
    {
        let mut zip = ZipWriter::new(&mut cursor);
        let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

        let manifest_json = serde_json::to_vec_pretty(manifest)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("manifest: {e}")))?;
        zip.start_file(MANIFEST_FILE, opts)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("zip: {e}")))?;
        zip.write_all(&manifest_json)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("zip write: {e}")))?;

        let meta_json = serde_json::to_vec_pretty(&meta)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("meta: {e}")))?;
        zip.start_file(PACKAGE_META_FILE, opts)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("zip: {e}")))?;
        zip.write_all(&meta_json)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("zip write: {e}")))?;

        let ui_name = if is_simple_filename(&manifest.ui) {
            manifest.ui.as_str()
        } else {
            "ui.html"
        };
        zip.start_file(ui_name, opts)
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("zip: {e}")))?;
        zip.write_all(ui_html.as_bytes())
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("zip write: {e}")))?;

        if let Some(db) = data_db {
            zip.start_file(DATA_FILE, opts)
                .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("zip: {e}")))?;
            zip.write_all(db).map_err(|e| {
                DomainError::new(ErrorCode::StorageFailed, format!("zip write: {e}"))
            })?;
        }

        zip.finish()
            .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("zip finish: {e}")))?;
    }

    Ok(cursor.into_inner())
}

/// Lightweight content fingerprint for builtin upgrade detection.
pub fn ui_fingerprint(ui_html: &str) -> String {
    // FNV-1a 64-bit — no extra deps; enough to detect local edits.
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in ui_html.as_bytes() {
        hash ^= u64::from(*b);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

/// Compare semver-ish versions: "0.4.0" > "0.3.0". Non-numeric tails compare as strings.
pub fn version_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    fn parts(s: &str) -> Vec<u64> {
        s.split(|c: char| !c.is_ascii_digit())
            .filter(|p| !p.is_empty())
            .filter_map(|p| p.parse().ok())
            .collect()
    }
    let pa = parts(a);
    let pb = parts(b);
    let n = pa.len().max(pb.len());
    for i in 0..n {
        let x = pa.get(i).copied().unwrap_or(0);
        let y = pb.get(i).copied().unwrap_or(0);
        match x.cmp(&y) {
            std::cmp::Ordering::Equal => {}
            o => return o,
        }
    }
    a.cmp(b)
}

#[cfg(test)]
mod unit {
    use super::*;
    use crate::domain::PluginPermission;

    fn sample_manifest() -> PluginManifest {
        PluginManifest {
            id: "demo-pack".into(),
            name: "Demo".into(),
            version: "0.1.0".into(),
            description: "t".into(),
            permissions: vec![PluginPermission::Storage],
            ui: "ui.html".into(),
            params: Default::default(),
        }
    }

    #[test]
    fn roundtrip_bare_package() {
        let m = sample_manifest();
        let zip = build_plugin_zip(&m, "<html>hi</html>", None).unwrap();
        let pkg = parse_plugin_zip(&zip).unwrap();
        assert_eq!(pkg.draft.manifest.id, "demo-pack");
        assert!(pkg.data_db.is_none());
    }

    #[test]
    fn rejects_bad_sqlite_magic() {
        let m = sample_manifest();
        let bad = b"not-a-database".to_vec();
        assert!(build_plugin_zip(&m, "<html>hi</html>", Some(&bad)).is_err());
    }

    #[test]
    fn version_cmp_orders_semver() {
        assert_eq!(version_cmp("0.4.0", "0.3.0"), std::cmp::Ordering::Greater);
        assert_eq!(version_cmp("1.0.0", "1.0.0"), std::cmp::Ordering::Equal);
    }

    #[test]
    fn fingerprint_changes_with_content() {
        assert_ne!(ui_fingerprint("a"), ui_fingerprint("b"));
        assert_eq!(ui_fingerprint("x"), ui_fingerprint("x"));
    }

    #[test]
    fn rejects_path_traversal() {
        assert!(normalize_entry_name("../evil").is_err());
        assert!(normalize_entry_name("/abs").is_err());
    }

    #[test]
    fn rejects_missing_manifest() {
        let mut cursor = Cursor::new(Vec::new());
        {
            let mut zip = ZipWriter::new(&mut cursor);
            let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
            zip.start_file("ui.html", opts).unwrap();
            zip.write_all(b"<html></html>").unwrap();
            zip.finish().unwrap();
        }
        let err = parse_plugin_zip(&cursor.into_inner()).unwrap_err();
        assert!(err.message.contains("manifest"));
    }
}
