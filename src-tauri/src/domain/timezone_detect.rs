//! Cross-platform host IANA timezone detection for schedule wall-clock evaluation.
//!
//! **Primary source:** [`iana_time_zone`](https://crates.io/crates/iana-time-zone)
//! - macOS: CoreFoundation / system APIs
//! - Windows: `GetDynamicTimeZoneInformation` / registry
//! - Linux/*nix: `/etc/localtime`, `/etc/timezone`, env, etc.
//!
//! **Sanity layer (all platforms):** compare candidate zone's *current* UTC offset
//! against `chrono::Local` offset. Rejects bare `GMT`/`UTC` when the machine is
//! clearly not on zero offset (VPN/TUN or polluted `TZ=` can cause this).
//!
//! **Unix bonus:** read `/etc/localtime` zoneinfo symlink when present (often more
//! reliable than a polluted `TZ`). Not used on Windows.
//!
//! **Last resort:** map fixed offset → well-known IANA / `Etc/GMT±N` (sign inverted
//! per POSIX). Prefer real city zones for +08/+09.

#![allow(dead_code)]

use chrono::{Local, Offset, Utc};
use chrono_tz::Tz;

/// Detect host IANA timezone (cross-platform).
pub fn detect_system_timezone() -> Tz {
    let offset_secs = Local::now().offset().local_minus_utc();
    let mut candidates: Vec<String> = Vec::new();

    // 1) Platform crate first (Windows + macOS + Linux).
    if let Ok(name) = iana_time_zone::get_timezone() {
        candidates.push(name);
    }

    // 2) Unix zoneinfo link (does not apply on Windows).
    if let Some(name) = timezone_from_localtime_link() {
        // Prefer link if not already first.
        if !candidates.iter().any(|c| c == &name) {
            candidates.insert(0, name);
        } else {
            // Move to front for priority when both exist.
            candidates.retain(|c| c != &name);
            candidates.insert(0, name);
        }
    }

    // 3) $TZ only if it looks like IANA (Area/City), not forced GMT from tooling.
    if let Ok(tz_env) = std::env::var("TZ") {
        let t = tz_env.trim().trim_start_matches(':');
        if looks_like_iana_name(t) {
            candidates.push(t.to_string());
        }
    }

    for name in &candidates {
        if let Some(tz) = parse_tz_name(name) {
            if timezone_offset_plausible(tz, offset_secs) {
                return tz;
            }
        }
    }

    if let Some(tz) = timezone_from_utc_offset_secs(offset_secs) {
        return tz;
    }

    for name in &candidates {
        if let Some(tz) = parse_tz_name(name) {
            return tz;
        }
    }
    chrono_tz::UTC
}

fn looks_like_iana_name(s: &str) -> bool {
    let s = s.trim();
    if s.is_empty() || !s.contains('/') {
        return false;
    }
    // Reject POSIX-style "GMT+8" / "UTC-5" env values that are not IANA city names.
    let upper = s.to_ascii_uppercase();
    if upper.starts_with("GMT") || upper.starts_with("UTC") || upper.starts_with("ETC/") {
        return false;
    }
    true
}

fn parse_tz_name(name: &str) -> Option<Tz> {
    let n = name.trim();
    if n.is_empty() {
        return None;
    }
    n.parse::<Tz>().ok()
}

fn is_generic_gmt_utc(name: &str) -> bool {
    matches!(
        name,
        "UTC"
            | "GMT"
            | "Etc/UTC"
            | "Etc/GMT"
            | "Etc/GMT0"
            | "Etc/GMT-0"
            | "Etc/GMT+0"
            | "Zulu"
            | "UCT"
            | "Universal"
            | "Greenwich"
    )
}

fn timezone_offset_plausible(tz: Tz, local_offset_secs: i32) -> bool {
    if is_generic_gmt_utc(tz.name()) && local_offset_secs.abs() > 30 * 60 {
        return false;
    }
    let now = Utc::now();
    let off = now.with_timezone(&tz).offset().fix().local_minus_utc();
    (off - local_offset_secs).abs() <= 15 * 60
}

fn timezone_from_localtime_link() -> Option<String> {
    #[cfg(unix)]
    {
        let path = std::fs::read_link("/etc/localtime").ok()?;
        let s = path.to_string_lossy();
        const MARK: &str = "zoneinfo/";
        if let Some(idx) = s.find(MARK) {
            let name = s[idx + MARK.len()..].trim_matches('/');
            if !name.is_empty() && name.contains('/') {
                return Some(name.to_string());
            }
        }
        // Some distros copy the file instead of linking; optional /etc/timezone.
        if let Ok(text) = std::fs::read_to_string("/etc/timezone") {
            let name = text.trim();
            if looks_like_iana_name(name) {
                return Some(name.to_string());
            }
        }
    }
    #[cfg(not(unix))]
    {
        // Windows: iana-time-zone already covers registry / WinAPI.
    }
    None
}

fn timezone_from_utc_offset_secs(offset_secs: i32) -> Option<Tz> {
    if offset_secs == 8 * 3600 {
        return "Asia/Shanghai".parse().ok();
    }
    if offset_secs == 9 * 3600 {
        return "Asia/Tokyo".parse().ok();
    }
    if offset_secs == -5 * 3600 {
        // Ambiguous (many US zones); only use as last resort fixed offset.
        return "Etc/GMT+5".parse().ok();
    }
    if offset_secs == 0 {
        return Some(chrono_tz::UTC);
    }
    let hours = offset_secs / 3600;
    if offset_secs % 3600 != 0 || !(-12..=14).contains(&hours) {
        return None;
    }
    // POSIX Etc/GMT: sign is inverted (Etc/GMT-8 == UTC+8).
    let etc = if hours >= 0 {
        format!("Etc/GMT-{hours}")
    } else {
        format!("Etc/GMT+{}", -hours)
    };
    etc.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_returns_non_empty() {
        let tz = detect_system_timezone();
        assert!(!tz.name().is_empty());
    }

    #[test]
    fn offset_plausible_rejects_gmt_when_plus_eight() {
        let gmt: Tz = "GMT".parse().unwrap();
        assert!(!timezone_offset_plausible(gmt, 8 * 3600));
        let sh: Tz = "Asia/Shanghai".parse().unwrap();
        assert!(timezone_offset_plausible(sh, 8 * 3600));
    }

    #[test]
    fn plus_eight_maps_shanghai() {
        let tz = timezone_from_utc_offset_secs(8 * 3600).unwrap();
        assert_eq!(tz.name(), "Asia/Shanghai");
    }

    #[test]
    fn looks_like_iana() {
        assert!(looks_like_iana_name("Asia/Shanghai"));
        assert!(!looks_like_iana_name("GMT"));
        assert!(!looks_like_iana_name("UTC"));
        assert!(!looks_like_iana_name("GMT+8"));
    }
}
