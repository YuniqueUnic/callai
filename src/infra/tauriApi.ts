import { invoke } from "@tauri-apps/api/core";
import type {
  Alarm,
  AlarmDraft,
  AppSettings,
  DomainError,
  ExecutionLog,
  LogFilter,
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
};

/** Browser-only mock when not running inside Tauri. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
