import {
  ensureDetectedTimezone,
  peekDetectedTimezone,
} from "../infra/timezoneCache";

/** settings.runtime.timezone tokens that mean "follow host". */
export function isSystemTimezoneSetting(
  setting: string | null | undefined,
): boolean {
  const s = (setting ?? "system").trim().toLowerCase();
  return !s || s === "system" || s === "auto" || s === "local";
}

/**
 * Sync best-effort resolve for UI paint (cache / Intl / explicit IANA).
 * Same rules as Rust `resolve_timezone` for non-system names.
 */
export function peekResolvedTimezone(
  setting: string | null | undefined,
): string {
  if (isSystemTimezoneSetting(setting)) return peekDetectedTimezone();
  const explicit = (setting ?? "").trim();
  return explicit || peekDetectedTimezone();
}

/** Async resolve — waits for OS detect when setting is system. */
export async function resolveAppTimezone(
  setting: string | null | undefined,
): Promise<string> {
  if (isSystemTimezoneSetting(setting)) {
    return ensureDetectedTimezone();
  }
  const explicit = (setting ?? "").trim();
  return explicit || ensureDetectedTimezone();
}

/** Format "now" in an IANA zone for AI runtime context. */
export function formatNowInTimezone(timeZone: string, date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "short",
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const y = get("year");
    const m = get("month");
    const d = get("day");
    const h = get("hour");
    const min = get("minute");
    const s = get("second");
    const tz = get("timeZoneName");
    return `${y}-${m}-${d}T${h}:${min}:${s} (${tz}, ${timeZone})`;
  } catch {
    return date.toString();
  }
}
