#![allow(dead_code)]
use chrono::{DateTime, Datelike, Local, NaiveTime, Timelike, Utc, Weekday};
use cron::Schedule as CronSchedule;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use super::{DomainError, DomainResult, ErrorCode};

/// Product schedule model: simple daily multi-times or advanced cron.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum ScheduleSpec {
    /// Daily at selected local times, e.g. 08:00, 13:00, 18:00.
    Daily { times: Vec<String> },
    /// Advanced cron expression (5 or 6 fields).
    Cron { expression: String },
}

impl ScheduleSpec {
    pub fn validate(&self) -> DomainResult<()> {
        match self {
            Self::Daily { times } => {
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
            Self::Cron { expression } => {
                parse_cron(expression)?;
                Ok(())
            }
        }
    }

    /// Canonical cron expression used by the scheduler.
    pub fn to_cron_expression(&self) -> DomainResult<String> {
        match self {
            Self::Daily { times } => {
                let mut minutes: Vec<u32> = Vec::new();
                let mut hours: Vec<u32> = Vec::new();
                for t in times {
                    let (h, m) = parse_hhmm(t)?;
                    if !hours.contains(&h) {
                        hours.push(h);
                    }
                    if !minutes.contains(&m) {
                        minutes.push(m);
                    }
                }
                hours.sort_unstable();
                minutes.sort_unstable();
                // When mixed minutes across hours, expand to multiple minute/hour pairs via multi-value cron.
                // Simple product form: "m1,m2 h1,h2 * * *" works for common same-minute cases.
                // For mixed (08:00, 13:30) we generate union of exact pairs via multi-cron join later.
                if minutes.len() == 1 {
                    let m = minutes[0];
                    let hs = hours
                        .iter()
                        .map(|h| h.to_string())
                        .collect::<Vec<_>>()
                        .join(",");
                    Ok(format!("{m} {hs} * * *"))
                } else {
                    // Build a cron that fires only exact pairs by using one expression with minute lists
                    // and hour lists — this may over-fire for mixed pairs; use per-time expressions.
                    // Domain returns a composite marker handled by scheduler.
                    let parts: Vec<String> = times
                        .iter()
                        .map(|t| {
                            let (h, m) = parse_hhmm(t).expect("validated");
                            format!("{m} {h} * * *")
                        })
                        .collect();
                    Ok(parts.join(" || "))
                }
            }
            Self::Cron { expression } => {
                let normalized = normalize_cron(expression)?;
                Ok(normalized)
            }
        }
    }

    pub fn next_trigger_after(
        &self,
        after: DateTime<Local>,
    ) -> DomainResult<Option<DateTime<Local>>> {
        let expr = self.to_cron_expression()?;
        let candidates: Vec<&str> = if expr.contains("||") {
            expr.split("||").map(str::trim).collect()
        } else {
            vec![expr.as_str()]
        };

        let mut best: Option<DateTime<Local>> = None;
        for c in candidates {
            let schedule = parse_cron(c)?;
            if let Some(next) = schedule.after(&after.with_timezone(&Utc)).next() {
                let local = next.with_timezone(&Local);
                best = Some(match best {
                    Some(cur) if cur < local => cur,
                    Some(_) => local,
                    None => local,
                });
            }
        }
        Ok(best)
    }

    pub fn display_summary(&self) -> String {
        match self {
            Self::Daily { times } => format!("daily {}", times.join(", ")),
            Self::Cron { expression } => expression.clone(),
        }
    }
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
    // cron crate expects seconds field (6-field). Accept 5-field by prefixing 0.
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

/// Helper for tests / UI: build daily schedule from local NaiveTimes.
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

pub fn _year_of(dt: DateTime<Local>) -> i32 {
    dt.year()
}
