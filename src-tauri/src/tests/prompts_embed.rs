use crate::domain::{render_prompt_id_with, render_prompt_template, PromptId, PRODUCT_PROMPT_VARS};
use std::collections::BTreeMap;

#[test]
fn prompt_ids_include_composition_layers() {
    assert!(PromptId::parse("system").is_some());
    assert!(PromptId::parse("capabilities").is_some());
    assert!(PromptId::parse("caps").is_some());
    assert!(PromptId::parse("output_contract").is_some());
    assert!(PromptId::parse("contract").is_some());
    assert!(PromptId::parse("alarm_generate").is_some());
    assert!(PromptId::parse("plugin_generate").is_some());
    assert!(PromptId::parse("ai2ui").is_some());
    assert!(PromptId::parse("plugin_sdk").is_some());
    assert!(PromptId::parse("continue_system").is_some());
    assert!(PromptId::parse("continue_user").is_some());

    let island = PromptId::parse("animal_island_style").expect("parse");
    assert_eq!(island.as_str(), "animal_island_style");
    assert!(island.body().contains("animal-island-ui"));
    assert!(island.body().len() > 1000);

    let caps = PromptId::parse("capabilities").unwrap();
    assert!(caps.body().contains("AlarmDraft") || caps.body().contains("Alarm"));
    assert!(caps.body().contains("__callai_alarm__"));
    assert!(caps.body().contains("dual-part") || caps.body().contains("ui.html"));

    let contract = PromptId::parse("output_contract").unwrap();
    assert!(contract.body().contains("JSON") || contract.body().contains("parse"));
    assert!(
        contract.body().contains("dual-part")
            || contract.body().contains("ui.html")
            || contract.body().contains("plugin_generate")
    );

    let plugin = PromptId::parse("plugin_generate").unwrap();
    assert!(plugin.body().contains("manifest"));
    assert!(!plugin.body().contains("\"ui_html\": string"));
    assert!(plugin.body().contains("```html") || plugin.body().contains("ui.html"));

    let cont = PromptId::parse("continue_system").unwrap();
    assert!(cont.body().contains("missing suffix") || cont.body().contains("Continuation"));

    let all = PromptId::all();
    assert_eq!(all.len(), 10);
    assert!(all.iter().any(|p| matches!(p, PromptId::Capabilities)));
    assert!(all.iter().any(|p| matches!(p, PromptId::OutputContract)));
    assert!(all.iter().any(|p| matches!(p, PromptId::AnimalIslandStyle)));
    assert!(all.iter().any(|p| matches!(p, PromptId::ContinueUser)));
}

#[test]
fn minijinja_renders_product_placeholders() {
    let rendered = render_prompt_template(PromptId::System.raw_source());
    assert!(rendered.contains(PRODUCT_PROMPT_VARS.mascot_zh));
    assert!(rendered.contains(PRODUCT_PROMPT_VARS.name));
    assert!(!rendered.contains("{{ product."));
    assert!(PromptId::System.body().contains("阔爱"));
    assert!(PromptId::AlarmGenerate.body().contains("__callai_alarm__"));
}

#[test]
fn continue_user_renders_runtime_tail() {
    let mut vars = BTreeMap::new();
    vars.insert("incomplete_tail".into(), r#"{"manifest":{"id":"x""#.into());
    vars.insert("round".into(), "2".into());
    vars.insert("max_rounds".into(), "4".into());
    let out = render_prompt_id_with(PromptId::ContinueUser, &vars);
    assert!(out.contains(r#"{"manifest":{"id":"x""#));
    assert!(out.contains("2"));
    assert!(out.contains("4"));
    assert!(!out.contains("{{ incomplete_tail }}"));
    assert!(!out.contains("{{ round }}"));
}
