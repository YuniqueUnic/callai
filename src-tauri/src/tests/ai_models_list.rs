//! Lenient /models list parsing for OpenAI-compatible gateways.

use crate::infra::ai_models::parse_model_ids_from_list_body;

#[test]
fn parses_ids_when_created_missing_on_some_entries() {
    let body = r#"{
      "object": "list",
      "data": [
        {"id": "gemini-3-flash-agent", "object": "model", "owned_by": "antigravity"},
        {"created": 1784199262, "id": "claude-opus-4-6", "object": "model", "owned_by": "anthropic"},
        {"id": "org/deepseek-chat", "object": "model"}
      ]
    }"#;
    let ids = parse_model_ids_from_list_body(body).expect("parse");
    assert_eq!(
        ids,
        vec![
            "claude-opus-4-6".to_string(),
            "deepseek-chat".to_string(),
            "gemini-3-flash-agent".to_string(),
        ]
    );
}

#[test]
fn parses_bare_array_and_skips_items_without_id() {
    let body = r#"[
      {"id": "gpt-5.4"},
      {"object": "model"},
      {"id": "  "}
    ]"#;
    let ids = parse_model_ids_from_list_body(body).expect("parse");
    assert_eq!(ids, vec!["gpt-5.4".to_string()]);
}

#[test]
fn rejects_non_list_payload() {
    let err = parse_model_ids_from_list_body(r#"{"ok":true}"#).unwrap_err();
    let msg = format!("{err}");
    assert!(msg.contains("expected"), "{msg}");
}
