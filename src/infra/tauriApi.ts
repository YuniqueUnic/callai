import { invoke } from "@tauri-apps/api/core";
import type {
  Alarm,
  AlarmDraft,
  AppSettings,
  DomainError,
  ExecutionLog,
  LogFilter,
  McpLogEntry,
  PluginDraft,
  PluginHistoryEntry,
  PluginSummary,
  TemplateDto,
} from "../domain/types";

function parseError(raw: unknown): DomainError {
  if (typeof raw === "string") {
    try {
      const obj = JSON.parse(raw) as DomainError;
      if (obj && obj.code) return obj;
    } catch {
      return { code: "INTERNAL", message: raw };
    }
    return { code: "INTERNAL", message: raw };
  }
  return { code: "INTERNAL", message: String(raw) };
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    throw parseError(err);
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
  deletePlugin: (id: string) => call<void>("delete_plugin", { id }),
  pluginInvoke: (plugin_id: string, method: string, args: unknown) =>
    call<unknown>("plugin_invoke", { pluginId: plugin_id, method, args }),
  pluginUiHtml: (id: string) => call<string>("plugin_ui_html", { id }),
  pluginMarkRun: (id: string) => call<void>("plugin_mark_run", { id }),
  pluginListHistory: (id: string, limit?: number) =>
    call<PluginHistoryEntry[]>("plugin_list_history", { id, limit }),
  listMcpLogs: (limit?: number) =>
    call<McpLogEntry[]>("list_mcp_logs", { limit }),
  clearMcpLogs: () => call<number>("clear_mcp_logs"),
  getPrompt: (id: string) => call<string>("get_prompt", { id }),
  getAiRuntimeContext: () =>
    call<import("../ai/runtimeContext").AiRuntimeContextDto>("get_ai_runtime_context"),
  listPrompts: () => call<string[]>("list_prompts"),
  generateSecretToken: () => call<string>("generate_secret_token"),
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
