//! Resolve user-entered binary/args into a real process argv.
//!
//! UI stores args as a list (usually one shell line or one token per line).
//! Users often paste shell-style snippets such as:
//!   -e 'display dialog "hi" buttons {"ok"}'
//!   -v Mei-Jia "你好"
//! Passing those strings literally breaks tools like `osascript` / `say`.
//! We detect shell-ish lines and split them with `shlex`.

use super::{DomainError, DomainResult, ErrorCode};

/// Strip a single layer of matching outer quotes if the whole string is quoted.
pub fn strip_outer_quotes(s: &str) -> String {
    let t = s.trim();
    if t.len() >= 2 {
        let b = t.as_bytes();
        let (open, close) = (b[0], b[t.len() - 1]);
        if (open == b'"' && close == b'"') || (open == b'\'' && close == b'\'') {
            return t[1..t.len() - 1].to_string();
        }
    }
    t.to_string()
}

fn looks_like_shell_line(s: &str) -> bool {
    let t = s.trim();
    if t.is_empty() {
        return false;
    }
    // Only shlex **flag lines** that start with `-` and contain more tokens, e.g.
    //   -e 'display dialog "hi"'
    //   -v Mei-Jia "你好"
    // Do NOT split a bare payload (AppleScript body) that merely has spaces/quotes —
    // that is a single argv token when the user uses one-token-per-line mode.
    if t.starts_with('-') && t.contains(char::is_whitespace) {
        return true;
    }
    false
}

fn looks_like_full_command(binary: &str) -> bool {
    let t = binary.trim();
    if !t.contains(char::is_whitespace) {
        return false;
    }
    // Absolute / relative paths with spaces stay as binary name.
    if t.starts_with('/') || t.starts_with('.') || t.starts_with('~') {
        return false;
    }
    // e.g. `osascript -e '...'` pasted into the binary field.
    true
}

fn shlex_split(input: &str) -> DomainResult<Vec<String>> {
    shlex::split(input).ok_or_else(|| {
        DomainError::new(
            ErrorCode::InvalidArgs,
            format!("could not parse command line (unbalanced quotes?): {input}"),
        )
    })
}

/// Expand one user arg entry: either keep as a single argv token, or shlex-split a shell line.
pub fn expand_arg_entry(entry: &str) -> DomainResult<Vec<String>> {
    let t = entry.trim();
    if t.is_empty() {
        return Ok(vec![]);
    }
    if looks_like_shell_line(t) {
        return shlex_split(t);
    }
    Ok(vec![strip_outer_quotes(t)])
}

/// Resolve binary + args into a concrete executable argv.
///
/// Rules (in order):
/// 1. If `binary` itself looks like a full shell command, shlex-split it into binary + leading args.
/// 2. Each args entry may be a shell-style line (shlex) or a raw token (optional outer quotes stripped).
pub fn resolve_process_argv(binary: &str, args: &[String]) -> DomainResult<(String, Vec<String>)> {
    let bin_raw = binary.trim();
    if bin_raw.is_empty() {
        return Err(DomainError::new(
            ErrorCode::InvalidBinary,
            "binary is required",
        ));
    }

    let mut out_args: Vec<String> = Vec::new();
    let resolved_binary: String;

    if looks_like_shell_line(bin_raw) || looks_like_full_command(bin_raw) {
        let mut parts = shlex_split(bin_raw)?;
        if parts.is_empty() {
            return Err(DomainError::new(
                ErrorCode::InvalidBinary,
                "binary is required",
            ));
        }
        resolved_binary = parts.remove(0);
        out_args.append(&mut parts);
    } else {
        resolved_binary = bin_raw.to_string();
    }

    for entry in args {
        let mut pieces = expand_arg_entry(entry)?;
        out_args.append(&mut pieces);
    }

    if resolved_binary.is_empty() {
        return Err(DomainError::new(
            ErrorCode::InvalidBinary,
            "binary is required",
        ));
    }

    Ok((resolved_binary, out_args))
}

/// Human-readable preview using shell-style quoting for spaces.
pub fn preview_command(binary: &str, args: &[String]) -> String {
    let mut parts = Vec::with_capacity(args.len() + 1);
    parts.push(shell_quote(binary));
    for a in args {
        parts.push(shell_quote(a));
    }
    parts.join(" ")
}

fn shell_quote(s: &str) -> String {
    if s.is_empty() {
        return "''".into();
    }
    if !s
        .chars()
        .any(|c| c.is_whitespace() || "\"'`$&|;<>(){}[]!*?".contains(c))
    {
        return s.to_string();
    }
    // Prefer single quotes for AppleScript-ish payloads; escape embedded ' as '\''
    if !s.contains('\'') {
        return format!("'{s}'");
    }
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}
