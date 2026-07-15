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

export interface AlarmPluginConfig {
  plugin_id: string;
  popup: boolean;
  suppress_when_fullscreen: boolean;
  params: Record<string, string | number | boolean | null>;
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
  plugin?: AlarmPluginConfig | null;
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
  plugin?: AlarmPluginConfig | null;
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

export type AiProvider = "openai" | "claude" | "gemini" | "openai_compatible";

export interface AiSettings {
  provider: AiProvider;
  base_url: string;
  api_key: string;
  model: string;
}

export const AI_PROVIDER_DEFAULTS: Record<
  AiProvider,
  { base_url: string; model: string; label: string }
> = {
  openai: {
    base_url: "https://api.openai.com/v1",
    // Balanced GPT-5.6 tier (mini-class successor). Docs: developers.openai.com/api/docs/models
    model: "gpt-5.6-terra",
    label: "OpenAI",
  },
  claude: {
    base_url: "https://api.anthropic.com/v1",
    // Claude Sonnet 5 — speed/intelligence balance (claude-sonnet-4-20250514 retired).
    model: "claude-sonnet-5",
    label: "Claude",
  },
  gemini: {
    base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
    label: "Gemini",
  },
  openai_compatible: {
    base_url: "",
    model: "gpt-5.6-terra",
    label: "OpenAI Compatible",
  },
};

/** Seed / mock list for autocomplete when live /models is unavailable. */
export const AI_MODEL_HINTS: string[] = [
  // OpenAI GPT-5.6 family
  "gpt-5.6-terra",
  "gpt-5.6-sol",
  "gpt-5.6-luna",
  "gpt-5.6",
  "gpt-5.5",
  // Anthropic
  "claude-sonnet-5",
  "claude-opus-4-8",
  "claude-fable-5",
  "claude-haiku-4-5",
  "claude-sonnet-4-6",
  // Google Gemini
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
  // Common compatible gateways
  "deepseek-chat",
  "deepseek-reasoner",
];

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: "openai",
  base_url: AI_PROVIDER_DEFAULTS.openai.base_url,
  api_key: "",
  model: AI_PROVIDER_DEFAULTS.openai.model,
};

export interface McpSettings {
  enabled: boolean;
  listen_host: string;
  port: number;
  auth_token: string;
}

export const DEFAULT_MCP_SETTINGS: McpSettings = {
  enabled: false,
  listen_host: "127.0.0.1",
  port: 3927,
  auth_token: "",
};

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
  /** Nested AI chat config. */
  ai: AiSettings;
  /** Nested MCP HTTP endpoint config. */
  mcp: McpSettings;
}

// Plugin / MCP types
export type PluginPermission =
  | "storage"
  | "timer"
  | "notification"
  | "network_limited"
  | "limited_exec"
  | "history";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  permissions: PluginPermission[];
  ui: string;
}

export interface PluginDraft {
  manifest: PluginManifest;
  ui_html: string;
}

export interface PluginSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  permissions: PluginPermission[];
  ui: string;
  installed_at: string;
  last_run_at: string | null;
  record_count: number;
}

export interface PluginHistoryEntry {
  id: number;
  method: string;
  args_preview: string;
  result_preview: string;
  ok: boolean;
  created_at: string;
}

export interface McpLogEntry {
  id: number;
  tool: string;
  args_preview: string;
  result_preview: string;
  ok: boolean;
  source: string;
  created_at: string;
}

export type PageId = "home" | "edit" | "logs" | "settings" | "plugins" | "ai";

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
  kind?: "builtin" | "plugin" | string;
  plugin?: AlarmPluginConfig | null;
}


export type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: DomainError };

/** Persisted AI assistant chat row (single shared thread). */
export type AiChatRole = "user" | "assistant";
export type AiChatKind = "text" | "error" | "alarm_draft" | "plugin_draft";

export interface AiChatMessage {
  id: string;
  role: AiChatRole;
  kind: AiChatKind;
  content: string;
  payload_json: string;
  created_at: string;
  applied: boolean;
}

export interface AiChatPage {
  messages: AiChatMessage[];
  has_more: boolean;
}

