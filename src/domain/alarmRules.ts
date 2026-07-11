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
  };
}

export function commandPreview(binary: string, args: string[]): string {
  return [binary, ...args].filter(Boolean).join(" ");
}

export function scheduleLabel(schedule: ScheduleSpec, dailyPrefix: string): string {
  if (schedule.mode === "daily") {
    return `${dailyPrefix} ${schedule.times.join(", ")}`;
  }
  return schedule.expression;
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
  if (draft.schedule.mode === "daily" && draft.schedule.times.length === 0) {
    return "INVALID_SCHEDULE";
  }
  if (draft.schedule.mode === "cron" && !draft.schedule.expression.trim()) {
    return "INVALID_CRON";
  }
  return null;
}
