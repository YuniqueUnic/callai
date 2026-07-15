use crate::domain::PromptId;

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

    let island = PromptId::parse("animal_island_style").expect("parse");
    assert_eq!(island.as_str(), "animal_island_style");
    assert!(island.body().contains("animal-island-ui"));
    assert!(island.body().len() > 1000);

    let caps = PromptId::parse("capabilities").unwrap();
    assert!(caps.body().contains("AlarmDraft") || caps.body().contains("Alarm"));
    assert!(caps.body().contains("__callai_alarm__"));

    let contract = PromptId::parse("output_contract").unwrap();
    assert!(contract.body().contains("JSON") || contract.body().contains("parse"));

    let all = PromptId::all();
    assert_eq!(all.len(), 7);
    assert!(all.iter().any(|p| matches!(p, PromptId::Capabilities)));
    assert!(all.iter().any(|p| matches!(p, PromptId::OutputContract)));
    assert!(all.iter().any(|p| matches!(p, PromptId::AnimalIslandStyle)));
}
