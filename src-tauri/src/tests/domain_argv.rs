use crate::domain::{preview_command, resolve_process_argv};

#[test]
fn osascript_shell_line_splits() {
    let (bin, args) = resolve_process_argv(
        "osascript",
        &["-e 'display dialog \"hi\" buttons {\"ok\"} default button 1'".into()],
    )
    .unwrap();
    assert_eq!(bin, "osascript");
    assert_eq!(args.len(), 2);
    assert_eq!(args[0], "-e");
    assert_eq!(
        args[1],
        "display dialog \"hi\" buttons {\"ok\"} default button 1"
    );
    assert!(!args[1].starts_with('\''));
}

#[test]
fn chinese_osascript_paste_from_user_log() {
    let line = r#"-e 'display dialog "已经连续写代码 2 小时了，喝口水？" buttons {"已喝", "等会"} default button 1 with icon caution'"#;
    let (bin, args) = resolve_process_argv("osascript", &[line.into()]).unwrap();
    assert_eq!(bin, "osascript");
    assert_eq!(args[0], "-e");
    assert!(args[1].starts_with("display dialog"));
    assert!(!args[1].starts_with('\''));
    assert!(args[1].contains("喝口水"));
}

#[test]
fn say_shell_line_splits() {
    let (bin, args) = resolve_process_argv("say", &["-v Mei-Jia \"主人，你好\"".into()]).unwrap();
    assert_eq!(bin, "say");
    assert_eq!(args, vec!["-v", "Mei-Jia", "主人，你好"]);
}

#[test]
fn one_token_per_line_still_works() {
    let (bin, args) = resolve_process_argv(
        "osascript",
        &["-e".into(), "display dialog \"hi\" buttons {\"ok\"}".into()],
    )
    .unwrap();
    assert_eq!(bin, "osascript");
    assert_eq!(args, vec!["-e", "display dialog \"hi\" buttons {\"ok\"}"]);
}

#[test]
fn full_command_in_binary_field() {
    let (bin, args) = resolve_process_argv("osascript -e 'display dialog \"x\"'", &[]).unwrap();
    assert_eq!(bin, "osascript");
    assert_eq!(args, vec!["-e", "display dialog \"x\""]);
}

#[test]
fn preview_quotes_spaces() {
    let s = preview_command("osascript", &["-e".into(), "display dialog \"hi\"".into()]);
    assert!(s.contains("osascript"));
    assert!(s.contains("-e"));
}
