use crate::domain::{AiChatKind, AiChatMessage, AiChatRole};
use crate::infra::SqliteStore;

fn sample(id: &str, created_at: &str) -> AiChatMessage {
    AiChatMessage {
        id: id.to_string(),
        role: AiChatRole::User,
        kind: AiChatKind::Text,
        content: format!("hello {id}"),
        payload_json: String::new(),
        created_at: created_at.to_string(),
        applied: false,
    }
}

#[test]
fn ai_chat_upsert_list_delete_page() {
    let store = SqliteStore::open_in_memory().expect("db");
    store
        .upsert_ai_chat_message(&sample("a", "2026-01-01T10:00:00Z"))
        .unwrap();
    store
        .upsert_ai_chat_message(&sample("b", "2026-01-01T11:00:00Z"))
        .unwrap();
    store
        .upsert_ai_chat_message(&sample("c", "2026-01-01T12:00:00Z"))
        .unwrap();

    let page = store.list_ai_chat_messages(None, 2).unwrap();
    assert_eq!(page.messages.len(), 2);
    assert!(page.has_more);
    // chronological
    assert_eq!(page.messages[0].id, "b");
    assert_eq!(page.messages[1].id, "c");

    let older = store
        .list_ai_chat_messages(Some("2026-01-01T11:00:00Z"), 10)
        .unwrap();
    assert_eq!(older.messages.len(), 1);
    assert_eq!(older.messages[0].id, "a");
    assert!(!older.has_more);

    store.set_ai_chat_applied("b", true).unwrap();
    let page2 = store.list_ai_chat_messages(None, 10).unwrap();
    let b = page2.messages.iter().find(|m| m.id == "b").unwrap();
    assert!(b.applied);

    let n = store
        .delete_ai_chat_messages(&["a".into(), "c".into()])
        .unwrap();
    assert_eq!(n, 2);
    let left = store.list_ai_chat_messages(None, 10).unwrap();
    assert_eq!(left.messages.len(), 1);
    assert_eq!(left.messages[0].id, "b");

    let cleared = store.clear_ai_chat_messages().unwrap();
    assert_eq!(cleared, 1);
    assert!(store
        .list_ai_chat_messages(None, 10)
        .unwrap()
        .messages
        .is_empty());
}
