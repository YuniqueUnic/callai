//! Portable built-in alarm (ordinary clock UX).
//!
//! Config stores a stable binary id (`__callai_alarm__`) so the same alarm works
//! after moving config across macOS / Windows / Linux. At run time we fan out to:
//! 1) desktop notification (best-effort)
//! 2) short attention sound / beep
//! 3) optional modal attention (platform dialog) that can wait for dismiss
//!
//! There is no universal "OS Alarm Clock API" for third-party desktop apps that is
//! reliable on all three platforms without heavy permissions; this is the practical
//! cross-platform equivalent.

use std::process::{Command, Stdio};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use crate::app::{CancelFlag, ProcessOutput};

use crate::domain::{DomainResult, BUILTIN_ALARM_ALIAS, BUILTIN_ALARM_BINARY};

pub fn is_builtin_alarm(binary: &str) -> bool {
    let b = binary.trim();
    b == BUILTIN_ALARM_BINARY || b.eq_ignore_ascii_case(BUILTIN_ALARM_ALIAS)
}

/// Args convention:
/// - args[0] = message body (required-ish; defaulted)
/// - args[1] = title (optional)
/// - remaining args ignored (reserved)
pub fn run_builtin_alarm(
    args: &[String],
    timeout_secs: u32,
    cancel: Option<Arc<CancelFlag>>,
) -> DomainResult<ProcessOutput> {
    let started = Instant::now();
    let message = args
        .first()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "叮咚～闹钟响啦！".into());
    let title = args
        .get(1)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "callai 小闹钟".into());

    if cancel.as_ref().is_some_and(|c| c.is_requested()) {
        return Ok(ProcessOutput {
            exit_code: -1,
            stdout: String::new(),
            stderr: "execution canceled by user".into(),
            duration_ms: started.elapsed().as_millis() as i64,
            canceled: true,
            timed_out: false,
        });
    }

    let mut steps: Vec<String> = Vec::new();

    // 1) Non-blocking notification (always best-effort).
    match notify_desktop(&title, &message) {
        Ok(true) => steps.push("notify=ok".into()),
        Ok(false) => steps.push("notify=skip".into()),
        Err(e) => steps.push(format!("notify=err:{e}")),
    }

    // 2) Attention sound / beep.
    match play_attention_sound() {
        Ok(true) => steps.push("sound=ok".into()),
        Ok(false) => steps.push("sound=skip".into()),
        Err(e) => steps.push(format!("sound=err:{e}")),
    }

    if cancel.as_ref().is_some_and(|c| c.is_requested()) {
        return Ok(ProcessOutput {
            exit_code: -1,
            stdout: steps.join("\n"),
            stderr: "execution canceled by user".into(),
            duration_ms: started.elapsed().as_millis() as i64,
            canceled: true,
            timed_out: false,
        });
    }

    // 3) Modal attention (may block until user dismisses or timeout).
    let timeout = Duration::from_secs(u64::from(timeout_secs.max(1)));
    let remaining = timeout.saturating_sub(started.elapsed());
    let dialog_timeout_secs = remaining
        .as_secs()
        .max(1)
        .min(u64::from(timeout_secs.max(1))) as u32;

    match show_attention_dialog(&title, &message, dialog_timeout_secs, cancel.clone()) {
        Ok(DialogResult::Ok) => steps.push("dialog=ok".into()),
        Ok(DialogResult::Skipped) => steps.push("dialog=skip".into()),
        Ok(DialogResult::Canceled) => {
            return Ok(ProcessOutput {
                exit_code: -1,
                stdout: steps.join("\n"),
                stderr: "execution canceled by user".into(),
                duration_ms: started.elapsed().as_millis() as i64,
                canceled: true,
                timed_out: false,
            });
        }
        Ok(DialogResult::TimedOut) => {
            steps.push("dialog=timeout".into());
            // Still success: alarm fired (notify/sound already ran).
        }
        Err(e) => steps.push(format!("dialog=err:{e}")),
    }

    Ok(ProcessOutput {
        exit_code: 0,
        stdout: format!(
            "builtin alarm\ntitle={title}\nmessage={message}\n{}",
            steps.join("\n")
        ),
        stderr: String::new(),
        duration_ms: started.elapsed().as_millis() as i64,
        canceled: false,
        timed_out: false,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
enum DialogResult {
    Ok,
    Skipped,
    Canceled,
    TimedOut,
}

fn notify_desktop(title: &str, message: &str) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        // display notification is non-blocking
        let script = format!(
            r#"display notification {msg} with title {title} sound name "Glass""#,
            msg = apple_str(message),
            title = apple_str(title),
        );
        let status = Command::new("osascript")
            .args(["-e", &script])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| e.to_string())?;
        Ok(status.success())
    }
    #[cfg(target_os = "linux")]
    {
        // notify-send if present
        if which_exists("notify-send") {
            let status = Command::new("notify-send")
                .args(["-u", "critical", title, message])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map_err(|e| e.to_string())?;
            return Ok(status.success());
        }
        Ok(false)
    }
    #[cfg(target_os = "windows")]
    {
        // Lightweight balloon via PowerShell (no extra deps). Best-effort.
        let ps = format!(
            r#"
$ErrorActionPreference='SilentlyContinue'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
"#
        );
        // Prefer MessageBox path in dialog step; for notify use simple beep+Write-Output only
        let _ = ps;
        let status = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "[Console]::Beep(880,180); Write-Output {msg}",
                    msg = ps_quote(&format!("{title}: {message}"))
                ),
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(status.success());
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = (title, message);
        Ok(false)
    }
}

fn play_attention_sound() -> Result<bool, String> {
    // Alarm clocks need several bursts — a single Glass/beep is easy to miss.
    const BURSTS: u32 = 5;
    #[cfg(target_os = "macos")]
    {
        let glass = std::path::Path::new("/System/Library/Sounds/Glass.aiff");
        let sosumi = std::path::Path::new("/System/Library/Sounds/Sosumi.aiff");
        let sound = if glass.exists() {
            Some(glass)
        } else if sosumi.exists() {
            Some(sosumi)
        } else {
            None
        };
        if let Some(path) = sound {
            for i in 0..BURSTS {
                let _ = Command::new("afplay")
                    .arg(path)
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
                if i + 1 < BURSTS {
                    thread::sleep(Duration::from_millis(220));
                }
            }
        } else {
            for _ in 0..2 {
                let _ = Command::new("osascript").args(["-e", "beep 3"]).status();
                thread::sleep(Duration::from_millis(180));
            }
        }
        let _ = Command::new("osascript").args(["-e", "beep 2"]).status();
        Ok(true)
    }
    #[cfg(target_os = "linux")]
    {
        if which_exists("paplay") {
            let candidates = [
                "/usr/share/sounds/freedesktop/stereo/alarm-clock-elapsed.oga",
                "/usr/share/sounds/freedesktop/stereo/complete.oga",
                "/usr/share/sounds/freedesktop/stereo/message.oga",
            ];
            for c in candidates {
                if std::path::Path::new(c).exists() {
                    for i in 0..BURSTS {
                        let _ = Command::new("paplay")
                            .arg(c)
                            .stdin(Stdio::null())
                            .stdout(Stdio::null())
                            .stderr(Stdio::null())
                            .status();
                        if i + 1 < BURSTS {
                            thread::sleep(Duration::from_millis(250));
                        }
                    }
                    return Ok(true);
                }
            }
        }
        for _ in 0..BURSTS {
            eprint!("\x07");
            let _ = std::io::Write::flush(&mut std::io::stderr());
            thread::sleep(Duration::from_millis(280));
        }
        Ok(true)
    }
    #[cfg(target_os = "windows")]
    {
        let status = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "1..5 | ForEach-Object { [Console]::Beep(880,220); [Console]::Beep(1175,220); Start-Sleep -Milliseconds 120 }",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(status.success());
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        for _ in 0..BURSTS {
            eprint!("\x07");
            thread::sleep(Duration::from_millis(250));
        }
        Ok(true)
    }
}

fn show_attention_dialog(
    title: &str,
    message: &str,
    timeout_secs: u32,
    cancel: Option<Arc<CancelFlag>>,
) -> Result<DialogResult, String> {
    #[cfg(target_os = "macos")]
    {
        let script = format!(
            r#"display dialog {msg} with title {title} buttons {{"知道了"}} default button 1 with icon note"#,
            msg = apple_str(message),
            title = apple_str(title),
        );
        run_cancellable("osascript", &["-e".into(), script], timeout_secs, cancel)
    }
    #[cfg(target_os = "linux")]
    {
        if which_exists("zenity") {
            return run_cancellable(
                "zenity",
                &[
                    "--info".into(),
                    format!("--title={title}"),
                    format!("--text={message}"),
                    "--ok-label=知道了".into(),
                ],
                timeout_secs,
                cancel,
            );
        }
        if which_exists("kdialog") {
            return run_cancellable(
                "kdialog",
                &[
                    "--msgbox".into(),
                    message.to_string(),
                    "--title".into(),
                    title.to_string(),
                ],
                timeout_secs,
                cancel,
            );
        }
        // no modal tool — notification already sent
        Ok(DialogResult::Skipped)
    }
    #[cfg(target_os = "windows")]
    {
        let ps = format!(
            r#"Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show({msg},{title},'OK','Information') | Out-Null"#,
            msg = ps_quote(message),
            title = ps_quote(title),
        );
        return run_cancellable(
            "powershell",
            &["-NoProfile".into(), "-Command".into(), ps],
            timeout_secs,
            cancel,
        );
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = (title, message, timeout_secs, cancel);
        Ok(DialogResult::Skipped)
    }
}

fn run_cancellable(
    bin: &str,
    args: &[String],
    timeout_secs: u32,
    cancel: Option<Arc<CancelFlag>>,
) -> Result<DialogResult, String> {
    let timeout = Duration::from_secs(u64::from(timeout_secs.max(1)));
    let started = Instant::now();
    let mut child = Command::new(bin)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;

    loop {
        if cancel.as_ref().is_some_and(|c| c.is_requested()) {
            let _ = child.kill();
            let _ = child.wait();
            return Ok(DialogResult::Canceled);
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Ok(DialogResult::TimedOut);
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                return if status.success() {
                    Ok(DialogResult::Ok)
                } else {
                    // user closed dialog with non-zero still counts as acknowledged on some tools
                    Ok(DialogResult::Ok)
                };
            }
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(e) => return Err(e.to_string()),
        }
    }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[allow(dead_code)]
fn which_exists(bin: &str) -> bool {
    which::which(bin).is_ok()
}

#[cfg(target_os = "macos")]
fn apple_str(s: &str) -> String {
    // AppleScript string literal with escaped quotes/backslashes
    let escaped = s.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}

#[cfg(target_os = "windows")]
fn ps_quote(s: &str) -> String {
    // Single-quoted PowerShell string; double single-quotes to escape.
    format!("'{}'", s.replace('\'', "''"))
}

/// Used by `check_binary` / UI — built-in is always "found".
pub fn builtin_which(binary: &str) -> Option<String> {
    if is_builtin_alarm(binary) {
        Some(format!("builtin:{BUILTIN_ALARM_BINARY}"))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_builtin_ids() {
        assert!(is_builtin_alarm("__callai_alarm__"));
        assert!(is_builtin_alarm("callai-alarm"));
        assert!(is_builtin_alarm("CALLAI-ALARM"));
        assert!(!is_builtin_alarm("osascript"));
    }

    #[test]
    fn builtin_which_returns_marker() {
        assert!(builtin_which("__callai_alarm__")
            .unwrap()
            .starts_with("builtin:"));
    }
}
