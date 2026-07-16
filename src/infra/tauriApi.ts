import { invoke } from "@tauri-apps/api/core";
import type {
  Alarm,
  AlarmDraft,
  AppSettings,
  DomainError,
  ExecutionLog,
  LogFilter,
  McpLogEntry,
  McpHttpStatus,
  PluginDraft,
  PluginHistoryEntry,
  PluginSummary,
  TemplateDto,
  AiChatMessage,
  AiChatPage,
} from "../domain/types";

function coerceDomainError(raw: unknown): DomainError {
  if (typeof raw === "string") {
    try {
      const obj = JSON.parse(raw) as DomainError;
      if (obj && (obj.message || obj.code)) {
        return {
          code: obj.code || "INTERNAL",
          message: String(obj.message ?? raw),
        };
      }
    } catch {
      return { code: "INTERNAL", message: raw };
    }
    return { code: "INTERNAL", message: raw };
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    // Tauri sometimes wraps { message: "..." } or DomainError-shaped objects.
    if (typeof o.message === "string" && o.message.trim()) {
      return {
        code: typeof o.code === "string" ? o.code : "INTERNAL",
        message: o.message,
      };
    }
    try {
      return { code: "INTERNAL", message: JSON.stringify(raw) };
    } catch {
      return { code: "INTERNAL", message: "unknown error" };
    }
  }
  return { code: "INTERNAL", message: String(raw) };
}

/** Always throw Error so UI can read `.message` (not `[object Object]`). */
function throwInvokeError(raw: unknown): never {
  const de = coerceDomainError(raw);
  const err = new Error(de.message);
  (err as Error & { code?: string; domain?: DomainError }).code = de.code;
  (err as Error & { domain?: DomainError }).domain = de;
  throw err;
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    throwInvokeError(err);
  }
}

export const api = {
  listAlarms: () => call<Alarm[]>("list_alarms"),
  getAlarm: (id: string) => call<Alarm>("get_alarm", { id }),
  createAlarm: (draft: AlarmDraft) => call<Alarm>("create_alarm", { draft }),
  updateAlarm: (id: string, draft: AlarmDraft) =>
    call<Alarm>("update_alarm", { id, draft }),
  deleteAlarm: (id: string) => call<void>("delete_alarm", { id }),
  setEnabled: (id: string, enabled: boolean) =>
    call<Alarm>("set_alarm_enabled", { id, enabled }),
  setAllEnabled: (enabled: boolean) =>
    call<Alarm[]>("set_all_enabled", { enabled }),
  runNow: (id: string) => call<ExecutionLog>("run_alarm_now", { id }),
  cancelAlarmRun: (id: string) => call<boolean>("cancel_alarm_run", { id }),
  listLogs: (filter: LogFilter) => call<ExecutionLog[]>("list_logs", { filter }),
  deleteLog: (id: number) => call<void>("delete_log", { id }),
  deleteLogs: (ids: number[]) => call<number>("delete_logs", { ids }),
  getSettings: () => call<AppSettings>("get_settings"),
  saveSettings: (settings: AppSettings) =>
    call<AppSettings>("save_settings", { settings }),
  checkBinary: (binary: string) => call<string | null>("check_binary", { binary }),
  listTemplates: () => call<TemplateDto[]>("list_templates"),
  templateDraft: (id: string) => call<AlarmDraft | null>("template_draft", { id }),
  backupNow: () => call<string>("backup_now"),
  listBackups: () => call<string[]>("list_backups"),
  restoreBackup: (name: string) => call<void>("restore_backup", { name }),
  deleteBackup: (name: string) => call<void>("delete_backup", { name }),
  nextTrigger: (id: string) => call<string | null>("next_trigger", { id }),
  detectTimezone: () => call<string>("detect_timezone"),
  getAppVersion: () => call<string>("get_app_version"),
  getBackupsDir: () => call<string>("get_backups_dir"),
  openBackupsDir: () => call<string>("open_backups_dir"),
  getAutostartEnabled: () => call<boolean>("get_autostart_enabled"),
  setAutostartEnabled: (enabled: boolean) =>
    call<boolean>("set_autostart_enabled", { enabled }),
  listAlarmSounds: () => call<string[]>("list_alarm_sounds"),
  previewAlarmSound: (sound_id?: string | null) =>
    call<boolean>("preview_alarm_sound", { soundId: sound_id ?? null }),
  listPlugins: () => call<PluginSummary[]>("list_plugins"),
  getPlugin: (id: string) => call<PluginSummary>("get_plugin", { id }),
  installPlugin: (draft: PluginDraft) =>
    call<PluginSummary>("install_plugin", { draft }),
  importPluginZipBytes: (
    bytes: number[] | Uint8Array,
    conflict?: string | null,
    force_downgrade?: boolean,
    replace_data?: boolean,
  ) =>
    call<PluginSummary | null>("import_plugin_zip_bytes", {
      bytes: Array.from(bytes as Uint8Array),
      conflict: conflict ?? null,
      force_downgrade: force_downgrade ?? false,
      replace_data: replace_data ?? false,
    }),
  importPluginZipPath: (
    path: string,
    conflict?: string | null,
    force_downgrade?: boolean,
    replace_data?: boolean,
  ) =>
    call<PluginSummary | null>("import_plugin_zip_path", {
      path,
      conflict: conflict ?? null,
      force_downgrade: force_downgrade ?? false,
      replace_data: replace_data ?? false,
    }),
  fetchPluginRegistry: (url?: string | null) =>
    call<{
      schema: number;
      name: string;
      updated_at?: string | null;
      plugins: {
        id: string;
        name: string;
        version: string;
        description: string;
        author?: string | null;
        zip_url: string;
        homepage?: string | null;
        repository?: string | null;
        tags?: string[];
      }[];
    }>("fetch_plugin_registry", { url: url ?? null }),
  peekPluginZipId: (bytes: number[] | Uint8Array) =>
    call<string>("peek_plugin_zip_id", {
      bytes: Array.from(bytes as Uint8Array),
    }),
  peekPluginZip: (bytes: number[] | Uint8Array) =>
    call<{
      id: string;
      name: string;
      version: string;
      includes_data: boolean;
    }>("peek_plugin_zip", {
      bytes: Array.from(bytes as Uint8Array),
    }),
  importPluginZipUrl: (
    url: string,
    conflict?: string | null,
    force_downgrade?: boolean,
    replace_data?: boolean,
  ) =>
    call<PluginSummary | null>("import_plugin_zip_url", {
      url,
      conflict: conflict ?? null,
      force_downgrade: force_downgrade ?? false,
      replace_data: replace_data ?? false,
    }),
  listBuiltinCatalog: () =>
    call<
      {
        id: string;
        name: string;
        version: string;
        description: string;
        installed: boolean;
        installed_version: string | null;
        update_available: boolean;
        user_edited: boolean;
        blocked_by_user_edit: boolean;
      }[]
    >("list_builtin_catalog"),
  restoreBuiltinPlugin: (id: string, wipe_data?: boolean) =>
    call<PluginSummary>("restore_builtin_plugin", {
      id,
      wipe_data: wipe_data ?? false,
    }),
  upgradeBuiltinPlugins: () =>
    call<PluginSummary[]>("upgrade_builtin_plugins"),
  exportPluginZipPath: (id: string, include_data: boolean, path: string) =>
    call<void>("export_plugin_zip_path", { id, include_data, path }),
  exportPluginZipBytes: (id: string, include_data: boolean) =>
    call<number[]>("export_plugin_zip_bytes", { id, include_data }),
  deletePlugin: (id: string) => call<void>("delete_plugin", { id }),
  pluginInvoke: (plugin_id: string, method: string, args: unknown) =>
    call<unknown>("plugin_invoke", { pluginId: plugin_id, method, args }),
  pluginUiHtml: (id: string) => call<string>("plugin_ui_html", { id }),
  openPluginWindow: (id: string, params?: Record<string, unknown> | null) =>
    call<void>("open_plugin_window", { id, params: params ?? null }),
  pluginGetSource: (id: string) => call<string>("plugin_get_source", { id }),
  pluginSetSource: (id: string, html: string) =>
    call<void>("plugin_set_source", { id, html }),
  pluginAppendConsole: (
    id: string,
    entries: { level: string; args: string[]; t: number }[],
  ) => call<void>("plugin_append_console", { id, entries }),
  pluginGetConsole: (id: string, limit?: number) =>
    call<{ level: string; args: string[]; t: number }[]>(
      "plugin_get_console",
      { id, limit: limit ?? 100 },
    ),
  pluginClearConsole: (id: string) => call<void>("plugin_clear_console", { id }),
  pluginMarkRun: (id: string) => call<void>("plugin_mark_run", { id }),
  pluginListHistory: (id: string, limit?: number) =>
    call<PluginHistoryEntry[]>("plugin_list_history", { id, limit }),
  listMcpLogs: (limit?: number) =>
    call<McpLogEntry[]>("list_mcp_logs", { limit }),
  clearMcpLogs: () => call<number>("clear_mcp_logs"),
  mcpHttpStatus: () => call<McpHttpStatus>("mcp_http_status"),
  getPrompt: (id: string) => call<string>("get_prompt", { id }),
  renderPrompt: (id: string, vars?: Record<string, string>) =>
    call<string>("render_prompt", { id, vars: vars ?? null }),
  getAiRuntimeContext: () =>
    call<import("../ai/runtimeContext").AiRuntimeContextDto>("get_ai_runtime_context"),
  listPrompts: () => call<string[]>("list_prompts"),
  generateSecretToken: () => call<string>("generate_secret_token"),
  aiChatCompletion: (opts: {
    request_id?: string;
    provider: string;
    base_url: string;
    api_key: string;
    model: string;
    system: string;
    user: string;
    temperature?: number;
  }) =>
    call<string>("ai_chat_completion", {
      requestId: opts.request_id ?? `ai-${Date.now()}`,
      provider: opts.provider,
      baseUrl: opts.base_url,
      apiKey: opts.api_key,
      model: opts.model,
      system: opts.system,
      user: opts.user,
      temperature: opts.temperature ?? null,
    }),


  listAiChatMessages: (before?: string | null, limit?: number) =>
    call<AiChatPage>("list_ai_chat_messages", {
      before: before ?? null,
      limit: limit ?? null,
    }),
  upsertAiChatMessage: (message: AiChatMessage) =>
    call<void>("upsert_ai_chat_message", { message }),
  deleteAiChatMessages: (ids: string[]) =>
    call<number>("delete_ai_chat_messages", { ids }),
  clearAiChatMessages: () => call<number>("clear_ai_chat_messages"),
  setAiChatApplied: (id: string, applied: boolean) =>
    call<void>("set_ai_chat_applied", { id, applied }),

  listAiModels: (provider: string, base_url: string, api_key: string) =>
    call<string[]>("list_ai_models", {
      provider,
      baseUrl: base_url,
      apiKey: api_key,
    }),
};


/** Browser-only mock when not running inside Tauri. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
