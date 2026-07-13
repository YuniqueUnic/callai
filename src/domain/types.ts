export type RetryInterval = "1m" | "2m" | "5m" | "10m";

export type ThemeMode = "system" | "light" | "dark";
export type LocaleCode = "zh-CN" | "en";

export type ScheduleSpec =
  | { mode: "daily"; times: string[] }
  | { mode: "weekly"; days: number[]; times: string[] }
  | { mode: "monthly"; days: number[]; times: string[] }
  | { mode: "cron"; expression: string };

export type AlarmLifecycle =
  | "idle"
  | "running"
  | { retrying: { attempt: number } }
  | { Retrying?: { attempt: number } };


export type NotificationType = "system_only" | "with_sound";

export type BuiltinSoundId =
  | "soft_chime"
  | "island_bell"
  | "wood_knock"
  | "warm_rise"
  | "gentle_ping";

export interface AlarmNotificationSettings {
  enabled: boolean;
  notification_type: NotificationType;
  sound_id?: string | null;
}

export const DEFAULT_NOTIFICATION: AlarmNotificationSettings = {
  enabled: true,
  notification_type: "with_sound",
  sound_id: null,
};

export const BUILTIN_SOUNDS: { id: BuiltinSoundId; labelKey: string }[] = [
  { id: "soft_chime", labelKey: "soundSoftChime" },
  { id: "island_bell", labelKey: "soundIslandBell" },
  { id: "wood_knock", labelKey: "soundWoodKnock" },
  { id: "warm_rise", labelKey: "soundWarmRise" },
  { id: "gentle_ping", labelKey: "soundGentlePing" },
];

export interface EnvVar {
  key: string;
  value: string;
}

export interface RetryPolicy {
  interval: RetryInterval;
  max_attempts: number;
}

export interface Alarm {
  id: string;
  name: string;
  enabled: boolean;
  schedule: ScheduleSpec;
  binary: string;
  args: string[];
  env_vars: EnvVar[];
  retry: RetryPolicy;
  timeout_secs: number;
  notification: AlarmNotificationSettings;
  lifecycle: AlarmLifecycle | { Retrying: { attempt: number } } | string;
  created_at: string;
  updated_at: string;
}

export interface AlarmDraft {
  name: string;
  enabled: boolean;
  schedule: ScheduleSpec;
  binary: string;
  args: string[];
  env_vars: EnvVar[];
  retry: RetryPolicy;
  timeout_secs: number;
  notification?: AlarmNotificationSettings;
}

export type ExecutionStatus = "running" | "success" | "failed" | "retrying" | "canceled" | "timeout";

export interface ExecutionLog {
  id: number;
  alarm_id: string;
  alarm_name: string;
  started_at: string;
  finished_at: string | null;
  status: ExecutionStatus;
  exit_code: number | null;
  duration_ms: number | null;
  retry_count: number;
  command_preview: string;
  stdout: string;
  stderr: string;
}

export interface LogFilter {
  alarm_id?: string | null;
  status?: ExecutionStatus | null;
  query?: string | null;
  limit: number;
}

export interface AppSettings {
  theme: ThemeMode;
  locale: LocaleCode;
  launch_minimized: boolean;
  log_retention_days: number;
  notify_on_failure: boolean;
  sound_enabled: boolean;
  /** IANA name or "system" */
  timezone: string;
  auto_backup_on_start: boolean;
  backup_keep_count: number;
}

export interface DomainError {
  code: string;
  message: string;
}

export interface TemplateDto {
  id: string;
  name_zh: string;
  name_en: string;
  binary: string;
  args: string[];
}

export type PageId = "home" | "edit" | "logs" | "settings";

export type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: DomainError };
