import { client } from "./client";

/**
 * Detected host timezone cache (cross-platform).
 *
 * Sources (best → fallback):
 * 1. Rust `detect_timezone` → `iana-time-zone` + offset sanity (Win/macOS/Linux)
 * 2. `Intl.DateTimeFormat().resolvedOptions().timeZone` (browser/WebView)
 * 3. Fixed-offset heuristic from `Date#getTimezoneOffset` (never trust bare GMT when offset ≠ 0)
 *
 * Settings UI should never block on IPC; peek is sync.
 */

let cached: string | null = null;
let inflight: Promise<string> | null = null;

function intlFallback(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Minutes east of UTC (JS getTimezoneOffset is inverted). */
function localOffsetMinutesEast(): number {
  return -new Date().getTimezoneOffset();
}

function isGenericGmtUtc(name: string): boolean {
  const u = name.trim().toUpperCase();
  return (
    u === "UTC" ||
    u === "GMT" ||
    u === "ETC/UTC" ||
    u === "ETC/GMT" ||
    u === "ETC/GMT0" ||
    u === "ETC/GMT-0" ||
    u === "ETC/GMT+0" ||
    u === "ZULU" ||
    u === "UCT"
  );
}

/** Reject name if it cannot explain the process wall offset (within 30m). */
function offsetPlausible(iana: string, offsetMin: number): boolean {
  if (isGenericGmtUtc(iana) && Math.abs(offsetMin) > 30) return false;
  try {
    const now = new Date();
    // Format parts in target zone vs UTC to recover offset.
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: iana,
      timeZoneName: "shortOffset",
      hour: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    // e.g. "GMT+8", "GMT+08:00", "UTC"
    const m = tzName.match(/([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (!m) {
      if (/^(GMT|UTC)$/i.test(tzName)) return Math.abs(offsetMin) <= 30;
      return true;
    }
    const sign = m[1] === "-" ? -1 : 1;
    const hh = Number(m[2]);
    const mm = Number(m[3] || "0");
    const zoneMin = sign * (hh * 60 + mm);
    return Math.abs(zoneMin - offsetMin) <= 30;
  } catch {
    return !isGenericGmtUtc(iana);
  }
}

function fromOffsetHeuristic(offsetMin: number): string {
  if (offsetMin === 480) return "Asia/Shanghai";
  if (offsetMin === 540) return "Asia/Tokyo";
  if (offsetMin === 0) return "UTC";
  // Etc/GMT inverted sign
  const hours = Math.trunc(offsetMin / 60);
  if (offsetMin % 60 !== 0) return "UTC";
  if (hours >= 0) return `Etc/GMT-${hours}`;
  return `Etc/GMT+${-hours}`;
}

function pickBest(rustName: string | null, intlName: string): string {
  const offsetMin = localOffsetMinutesEast();
  const ordered = [rustName, intlName].filter(
    (x): x is string => Boolean(x && x.trim()),
  );
  for (const name of ordered) {
    const n = name.trim();
    if (offsetPlausible(n, offsetMin)) return n;
  }
  return fromOffsetHeuristic(offsetMin);
}

/** Immediate best-effort value (cache or Intl). Never hits IPC. */
export function peekDetectedTimezone(): string {
  if (cached) return cached;
  return pickBest(null, intlFallback());
}

/** Cached value if already resolved. */
export function getCachedDetectedTimezone(): string | null {
  return cached;
}

/**
 * Ensure detection runs once in the background.
 * Prefers Rust (cross-platform OS APIs) then Intl, with offset sanity.
 */
export function ensureDetectedTimezone(): Promise<string> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  inflight = (async () => {
    const intl = intlFallback();
    let rust: string | null = null;
    try {
      const tz = await client.detectTimezone();
      rust = (tz && tz.trim()) || null;
    } catch {
      rust = null;
    }
    cached = pickBest(rust, intl);
    return cached!;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/** Force re-detect (e.g. after user changes OS zone or VPN messes TZ). */
export function resetDetectedTimezone(): void {
  cached = null;
  inflight = null;
}

/** Test/reset helper. */
export function __resetTimezoneCacheForTests(): void {
  resetDetectedTimezone();
}
