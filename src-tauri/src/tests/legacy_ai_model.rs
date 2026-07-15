use crate::domain::is_legacy_ai_model;

#[test]
fn detects_retired_models() {
    assert!(is_legacy_ai_model("gpt-4o-mini"));
    assert!(is_legacy_ai_model("claude-sonnet-4-20250514"));
    assert!(!is_legacy_ai_model("gpt-5.6-terra"));
    assert!(!is_legacy_ai_model("claude-sonnet-5"));
}
