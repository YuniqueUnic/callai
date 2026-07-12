#![allow(dead_code)]
use chrono::{DateTime, Local, NaiveTime, TimeZone, Timelike, Utc, Weekday};
use chrono_tz::Tz;
use cron::Schedule as CronSchedule;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use super::{DomainError, DomainResult, ErrorCode};

/// Product schedule model.
/// Wall-clock fields (hour/minute/day) are evaluated in the configured schedule timezone
/// (settings.timezone / system), **not** as UTC.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum ScheduleSpec {
    /// Every day at selected times, e.g. 08:00, 13:00, 18:00.
    Daily { times: Vec<String> },
    /// Selected weekdays (0=Sunday … 6=Saturday, cron-style) + times.
    Weekly { days: Vec<u32>, times: Vec<String> },
    /// Selected month days (1–31) + times.
    Monthly { days: Vec<u32>, times: Vec<String> },
    /// Advanced cron (5 or 6 fields). Hour/minute are wall-clock in schedule TZ.
    /// Full cron semantics for DOW/DOM/month/lists/ranges/steps are supported by the
    /// underlying `cron` crate (after seconds-field normalization).
    Cron { expression: String },
}

impl ScheduleSpec {
    pub fn validate(&self) -> DomainResult<()> {
        match self {
            Self::Daily { times } => {
                validate_times(times)?;
                Ok(())
            }
            Self::Weekly { days, times } => {
                if days.is_empty() {
                    return Err(DomainError::new(
                        ErrorCode::InvalidSchedule,
                        "at least one weekday is required",
                    ));
                }
                for d in days {
                    if *d > 6 {
                        return Err(DomainError::new(
                            ErrorCode::InvalidSchedule,
                            format!("weekday out of range (0=Sun..6=Sat): {d}"),
                        ));
                    }
                }
                validate_times(times)?;
                Ok(())
            }
            Self::Monthly { days, times } => {
                if days.is_empty() {
                    return Err(DomainError::new(
                        ErrorCode::InvalidSchedule,
                        "at least one month day is required",
                    ));
                }
                for d in days {
                    if *d < 1 || *d > 31 {
                        return Err(DomainError::new(
                            ErrorCode::InvalidSchedule,
                            format!("month day out of range (1–31): {d}"),
                        ));
                    }
                }
                validate_times(times)?;
                Ok(())
            }
            Self::Cron { expression } => {
                parse_cron(expression)?;
                Ok(())
            }
        }
    }

    /// Expand to one or more 5-field cron expressions (joined by ` || ` when needed).
    /// Evaluated as wall-clock in the schedule timezone — see [`next_trigger_after_in_tz`].
    pub fn to_cron_expression(&self) -> DomainResult<String> {
        match self {
            Self::Daily { times } => expand_time_pairs(times, "*", "*"),
            Self::Weekly { days, times } => {
                let mut ds = days.clone();
                ds.sort_unstable();
                ds.dedup();
                // Product UI: 0=Sunday .. 6=Saturday.
                // `cron` crate numeric DOW here behaves as 1=Sunday .. 7=Saturday
                // (verified: "0 9 * * 1" fires Sundays in our wall-clock evaluator).
                let dow = ds
                    .iter()
                    .map(|d| (d + 1).to_string())
                    .collect::<Vec<_>>()
                    .join(",");
                expand_time_pairs(times, "*", &dow)
            }
            Self::Monthly { days, times } => {
                let mut ds = days.clone();
                ds.sort_unstable();
                ds.dedup();
                let dom = ds
                    .iter()
                    .map(|d| d.to_string())
                    .collect::<Vec<_>>()
                    .join(",");
                expand_time_pairs(times, &dom, "*")
            }
            Self::Cron { expression } => Ok(normalize_cron(expression)?),
        }
    }

    pub fn next_trigger_after(
        &self,
        after: DateTime<Local>,
    ) -> DomainResult<Option<DateTime<Local>>> {
        let tz = detect_system_timezone();
        let next = self.next_trigger_after_in_tz(after.with_timezone(&Utc), tz)?;
        Ok(next.map(|u| u.with_timezone(&Local)))
    }

    /// Next fire after `after_utc` interpreting schedule fields in `tz`.
    pub fn next_trigger_after_in_tz(
        &self,
        after_utc: DateTime<Utc>,
        tz: Tz,
    ) -> DomainResult<Option<DateTime<Utc>>> {
        let expr = self.to_cron_expression()?;
        let candidates: Vec<&str> = if expr.contains("||") {
            expr.split("||").map(str::trim).collect()
        } else {
            vec![expr.as_str()]
        };

        let mut best: Option<DateTime<Utc>> = None;
        for c in candidates {
            if let Some(next) = next_cron_in_tz(c, after_utc, tz)? {
                best = Some(match best {
                    Some(cur) if cur < next => cur,
                    Some(_) => next,
                    None => next,
                });
            }
        }
        Ok(best)
    }

    pub fn display_summary(&self) -> String {
        match self {
            Self::Daily { times } => format!("daily {}", times.join(", ")),
            Self::Weekly { days, times } => {
                format!("weekly dow={} {}", join_u32(days), times.join(", "))
            }
            Self::Monthly { days, times } => {
                format!("monthly dom={} {}", join_u32(days), times.join(", "))
            }
            Self::Cron { expression } => expression.clone(),
        }
    }
}

fn join_u32(xs: &[u32]) -> String {
    xs.iter()
        .map(|x| x.to_string())
        .collect::<Vec<_>>()
        .join(",")
}

fn validate_times(times: &[String]) -> DomainResult<()> {
    if times.is_empty() {
        return Err(DomainError::new(
            ErrorCode::InvalidSchedule,
            "at least one time is required",
        ));
    }
    for t in times {
        parse_hhmm(t)?;
    }
    Ok(())
}

/// Build cron minute/hour with DOM and DOW wildcards or lists.
/// Uses exact (minute, hour) pairs when minutes differ across times.
fn expand_time_pairs(times: &[String], dom: &str, dow: &str) -> DomainResult<String> {
    let mut pairs: Vec<(u32, u32)> = Vec::new();
    for t in times {
        let (h, m) = parse_hhmm(t)?;
        pairs.push((h, m));
    }
    pairs.sort_unstable();
    pairs.dedup();

    let minutes: Vec<u32> = {
        let mut v: Vec<u32> = pairs.iter().map(|(_, m)| *m).collect();
        v.sort_unstable();
        v.dedup();
        v
    };
    let hours: Vec<u32> = {
        let mut v: Vec<u32> = pairs.iter().map(|(h, _)| *h).collect();
        v.sort_unstable();
        v.dedup();
        v
    };

    // Same single minute → compact "m h1,h2 DOM * DOW"
    if minutes.len() == 1 {
        let m = minutes[0];
        let hs = hours
            .iter()
            .map(|h| h.to_string())
            .collect::<Vec<_>>()
            .join(",");
        return Ok(format!("{m} {hs} {dom} * {dow}"));
    }

    // Mixed minutes: one expression per exact pair to avoid over-firing.
    let parts: Vec<String> = pairs
        .iter()
        .map(|(h, m)| format!("{m} {h} {dom} * {dow}"))
        .collect();
    Ok(parts.join(" || "))
}

/// Detect host IANA timezone. Falls back to UTC.
pub fn detect_system_timezone() -> Tz {
    if let Ok(name) = iana_time_zone::get_timezone() {
        if let Ok(tz) = name.parse::<Tz>() {
            return tz;
        }
    }
    chrono_tz::UTC
}

/// empty / "system" / "auto" → detect; else parse IANA name.
pub fn resolve_timezone(setting: &str) -> DomainResult<Tz> {
    let s = setting.trim();
    if s.is_empty() || s.eq_ignore_ascii_case("system") || s.eq_ignore_ascii_case("auto") {
        return Ok(detect_system_timezone());
    }
    s.parse::<Tz>().map_err(|_| {
        DomainError::new(ErrorCode::InvalidArgs, format!("unknown timezone: {s}"))
    })
}

/// Evaluate cron as wall-clock in `tz` (not UTC).
///
/// Trick: feed the cron iterator civil Y-M-D h:m:s from the target zone as if they
/// were UTC numbers, then map the next civil stamp back into `tz`. That makes
/// hour=13 mean 13:00 Asia/Shanghai when tz=Shanghai, instead of 13:00 UTC (21:00 CST).
fn next_cron_in_tz(
    expression: &str,
    after_utc: DateTime<Utc>,
    tz: Tz,
) -> DomainResult<Option<DateTime<Utc>>> {
    let schedule = parse_cron(expression)?;
    let after_local = after_utc.with_timezone(&tz);
    let wall = after_local.naive_local();
    let pseudo_after = match Utc.from_local_datetime(&wall) {
        chrono::LocalResult::Single(dt) => dt,
        chrono::LocalResult::Ambiguous(a, _) => a,
        chrono::LocalResult::None => {
            let bumped = wall + chrono::Duration::hours(1);
            Utc.from_utc_datetime(&bumped)
        }
    };

    let Some(next_pseudo) = schedule.after(&pseudo_after).next() else {
        return Ok(None);
    };
    let next_wall = next_pseudo.naive_utc();
    let real = match tz.from_local_datetime(&next_wall) {
        chrono::LocalResult::Single(dt) => dt,
        chrono::LocalResult::Ambiguous(earlier, _) => earlier,
        chrono::LocalResult::None => {
            let bumped = next_wall + chrono::Duration::hours(1);
            match tz.from_local_datetime(&bumped) {
                chrono::LocalResult::Single(dt) => dt,
                chrono::LocalResult::Ambiguous(a, _) => a,
                chrono::LocalResult::None => return Ok(None),
            }
        }
    };
    Ok(Some(real.with_timezone(&Utc)))
}

fn parse_hhmm(raw: &str) -> DomainResult<(u32, u32)> {
    let parts: Vec<&str> = raw.trim().split(':').collect();
    if parts.len() != 2 {
        return Err(DomainError::new(
            ErrorCode::InvalidSchedule,
            format!("invalid time: {raw}"),
        ));
    }
    let h: u32 = parts[0].parse().map_err(|_| {
        DomainError::new(ErrorCode::InvalidSchedule, format!("invalid hour: {raw}"))
    })?;
    let m: u32 = parts[1].parse().map_err(|_| {
        DomainError::new(ErrorCode::InvalidSchedule, format!("invalid minute: {raw}"))
    })?;
    if h > 23 || m > 59 {
        return Err(DomainError::new(
            ErrorCode::InvalidSchedule,
            format!("time out of range: {raw}"),
        ));
    }
    Ok((h, m))
}

fn normalize_cron(expression: &str) -> DomainResult<String> {
    let trimmed = expression.trim();
    if trimmed.is_empty() {
        return Err(DomainError::new(
            ErrorCode::InvalidCron,
            "cron expression is empty",
        ));
    }
    parse_cron(trimmed)?;
    Ok(trimmed.to_string())
}

fn parse_cron(expression: &str) -> DomainResult<CronSchedule> {
    let trimmed = expression.trim();
    // cron crate expects 6 fields (with seconds). Accept classic 5-field by prefixing 0.
    let with_seconds = if trimmed.split_whitespace().count() == 5 {
        format!("0 {trimmed}")
    } else {
        trimmed.to_string()
    };
    CronSchedule::from_str(&with_seconds).map_err(|e| {
        DomainError::new(
            ErrorCode::InvalidCron,
            format!("invalid cron `{trimmed}`: {e}"),
        )
    })
}

pub fn daily_from_times(times: &[NaiveTime]) -> ScheduleSpec {
    ScheduleSpec::Daily {
        times: times
            .iter()
            .map(|t| format!("{:02}:{:02}", t.hour(), t.minute()))
            .collect(),
    }
}

#[allow(dead_code)]
pub fn weekday_label(day: Weekday) -> &'static str {
    match day {
        Weekday::Mon => "Mon",
        Weekday::Tue => "Tue",
        Weekday::Wed => "Wed",
        Weekday::Thu => "Thu",
        Weekday::Fri => "Fri",
        Weekday::Sat => "Sat",
        Weekday::Sun => "Sun",
    }
}

pub fn today_local() -> DateTime<Local> {
    Local::now()
}
