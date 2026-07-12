import type { AlarmDraft, ScheduleSpec } from "./types";

export function defaultDraft(): AlarmDraft {
  return {
    name: "",
    enabled: true,
    schedule: { mode: "daily", times: ["08:00", "13:00", "18:00"] },
    binary: "echo",
    args: ["callai warmup {{date}}"],
    env_vars: [],
    retry: { interval: "2m", max_attempts: 3 },
    timeout_secs: 20,
  };
}

export function commandPreview(binary: string, args: string[]): string {
  return [binary, ...args].filter(Boolean).join(" ");
}

export function scheduleLabel(schedule: ScheduleSpec, dailyPrefix: string): string {
  if (schedule.mode === "daily") {
    return `${dailyPrefix} ${schedule.times.join(", ")}`;
  }
  if (schedule.mode === "weekly") {
    return `weekly ${schedule.days.join(",")} ${schedule.times.join(", ")}`;
  }
  if (schedule.mode === "monthly") {
    return `monthly ${schedule.days.join(",")} ${schedule.times.join(", ")}`;
  }
  return schedule.expression;
}

/** Visible time chips + overflow count for Tag UI. */
export function scheduleTimeChips(
  schedule: ScheduleSpec,
  maxVisible = 2,
): { visible: string[]; overflow: number; kind: "daily" | "weekly" | "monthly" | "cron" } {
  if (schedule.mode === "daily" || schedule.mode === "weekly" || schedule.mode === "monthly") {
    const times = [...schedule.times].sort();
    const kind = schedule.mode;
    if (times.length <= maxVisible) {
      return { visible: times, overflow: 0, kind };
    }
    return {
      visible: times.slice(0, maxVisible),
      overflow: times.length - maxVisible,
      kind,
    };
  }
  const expr = schedule.expression.trim();
  const short = expr.length > 18 ? `${expr.slice(0, 16)}…` : expr;
  return { visible: [short], overflow: 0, kind: "cron" };
}

export function isAlarmRunning(lifecycle: unknown): boolean {
  if (lifecycle === "running" || lifecycle === "Running") return true;
  if (typeof lifecycle === "object" && lifecycle !== null) {
    const o = lifecycle as Record<string, unknown>;
    return "Retrying" in o || "retrying" in o;
  }
  return false;
}

export function validateDraft(draft: AlarmDraft): string | null {
  if (!draft.name.trim()) return "INVALID_NAME";
  if (!draft.binary.trim()) return "INVALID_BINARY";
  if (
    (draft.schedule.mode === "daily" ||
      draft.schedule.mode === "weekly" ||
      draft.schedule.mode === "monthly") &&
    draft.schedule.times.length === 0
  ) {
    return "INVALID_SCHEDULE";
  }
  if (draft.schedule.mode === "weekly" && draft.schedule.days.length === 0) {
    return "INVALID_SCHEDULE";
  }
  if (draft.schedule.mode === "monthly" && draft.schedule.days.length === 0) {
    return "INVALID_SCHEDULE";
  }
  if (draft.schedule.mode === "cron" && !draft.schedule.expression.trim()) {
    return "INVALID_CRON";
  }
  const t = draft.timeout_secs ?? 20;
  if (!Number.isFinite(t) || t < 1 || t > 3600) return "INVALID_ARGS";
  return null;
}
