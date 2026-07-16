use crate::domain::parse_registry_index;

#[test]
fn parses_example_registry() {
    let raw = include_str!("../../../docs/plugin-registry.example.json");
    let idx = parse_registry_index(raw).unwrap();
    assert_eq!(idx.schema, 1);
    assert!(!idx.plugins.is_empty());
    assert!(idx.plugins[0].zip_url.starts_with("https://"));
}

#[test]
fn rejects_http_non_localhost_zip() {
    let raw = r#"{
      "schema": 1,
      "name": "x",
      "plugins": [{
        "id": "bad-http",
        "name": "Bad",
        "version": "0.1.0",
        "zip_url": "http://example.com/a.zip"
      }]
    }"#;
    assert!(parse_registry_index(raw).is_err());
}
