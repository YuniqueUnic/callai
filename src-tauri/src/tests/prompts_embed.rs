use crate::domain::PromptId;

#[test]
fn prompt_ids_include_animal_island_style() {
    let id = PromptId::parse("animal_island_style").expect("parse");
    assert_eq!(id.as_str(), "animal_island_style");
    assert!(id.body().contains("animal-island-ui"));
    assert!(id.body().len() > 1000);

    assert!(PromptId::parse("animal-island-style").is_some());
    assert!(PromptId::parse("island").is_some());

    let all = PromptId::all();
    assert_eq!(all.len(), 5);
    assert!(all.iter().any(|p| matches!(p, PromptId::AnimalIslandStyle)));
}
