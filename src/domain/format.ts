/** Friendly datetime for next trigger / logs. Optionally force IANA timeZone. */
export function formatDateTime(
  iso: string,
  locale?: string,
  timeZone?: string,
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    const opts: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    };
    if (timeZone) opts.timeZone = timeZone;
    return new Intl.DateTimeFormat(locale || undefined, opts).format(d);
  } catch {
    try {
      return d.toLocaleString(locale || undefined, timeZone ? { timeZone } : undefined);
    } catch {
      return d.toLocaleString();
    }
  }
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Progress (0–100) toward the next trigger.
 * `cycleMs` is the expected interval to the previous fire (default 24h).
 */
export function nextTriggerProgress(
  nextIso: string | undefined | null,
  nowMs: number = Date.now(),
  cycleMs: number = DAY,
): number {
  if (!nextIso) return 0;
  const next = Date.parse(nextIso);
  if (Number.isNaN(next)) return 0;
  if (next <= nowMs) return 100;
  const remaining = next - nowMs;
  const windowMs = Math.max(HOUR, Math.min(DAY, cycleMs || DAY));
  // How far through the window: 0 at window start, 100 at fire time.
  const elapsed = windowMs - Math.min(windowMs, remaining);
  const pct = Math.round((elapsed / windowMs) * 100);
  return Math.max(0, Math.min(100, pct));
}

export function remainingLabel(
  nextIso: string | undefined | null,
  locale?: string,
  nowMs: number = Date.now(),
  timeZone?: string,
): string {
  if (!nextIso) return "—";
  const next = Date.parse(nextIso);
  if (Number.isNaN(next)) return formatDateTime(nextIso, locale, timeZone);
  const diff = next - nowMs;
  const zh = Boolean(locale?.startsWith("zh"));
  if (diff <= 0) return zh ? "即将" : "soon";
  const mins = Math.max(1, Math.round(diff / 60_000));
  if (mins < 60) return zh ? `${mins} 分钟后` : `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 48) {
    if (zh) return rem ? `${hours} 小时 ${rem} 分后` : `${hours} 小时后`;
    return rem ? `in ${hours}h ${rem}m` : `in ${hours}h`;
  }
  return formatDateTime(nextIso, locale, timeZone);
}
