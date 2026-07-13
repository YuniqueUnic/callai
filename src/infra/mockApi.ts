import type {
  Alarm,
  AlarmDraft,
  AppSettings,
  ExecutionLog,
  LogFilter,
  TemplateDto,
} from "../domain/types";
import { DEFAULT_NOTIFICATION } from "../domain/types";
import { defaultDraft } from "../domain/alarmRules";
import { playAlarmSoundPreview } from "../ui/alarmSounds";

let alarms: Alarm[] = [];
let logs: ExecutionLog[] = [];
let settings: AppSettings = {
  theme: "system",
  locale: "zh-CN",
  launch_minimized: false,
  log_retention_days: 30,
  notify_on_failure: false,
  sound_enabled: true,
  timezone: "system",
  auto_backup_on_start: true,
  backup_keep_count: 10,
};
let logSeq = 1;
let mockBackups: string[] = ["config.toml.mock.bak"];

function now() {
  return new Date().toISOString();
}

function toAlarm(draft: AlarmDraft, id?: string): Alarm {
  const ts = now();
  return {
    id: id ?? crypto.randomUUID(),
    name: draft.name,
    enabled: draft.enabled,
    schedule: draft.schedule,
    binary: draft.binary,
    args: draft.args,
    env_vars: draft.env_vars,
    retry: draft.retry,
    timeout_secs: draft.timeout_secs ?? 20,
    notification: draft.notification ?? { ...DEFAULT_NOTIFICATION },
    lifecycle: "idle",
    created_at: ts,
    updated_at: ts,
  };
}

export const mockApi = {
  async listAlarms() {
    return [...alarms];
  },
  async getAlarm(id: string) {
    const a = alarms.find((x) => x.id === id);
    if (!a) throw { code: "ALARM_NOT_FOUND", message: "not found" };
    return a;
  },
  async createAlarm(draft: AlarmDraft) {
    const a = toAlarm(draft);
    alarms = [a, ...alarms];
    return a;
  },
  async updateAlarm(id: string, draft: AlarmDraft) {
    const idx = alarms.findIndex((x) => x.id === id);
    if (idx < 0) throw { code: "ALARM_NOT_FOUND", message: "not found" };
    const next = { ...toAlarm(draft, id), created_at: alarms[idx].created_at };
    alarms[idx] = next;
    return next;
  },
  async deleteAlarm(id: string) {
    alarms = alarms.filter((x) => x.id !== id);
  },
  async setEnabled(id: string, enabled: boolean) {
    const a = await this.getAlarm(id);
    a.enabled = enabled;
    a.updated_at = now();
    return a;
  },
  async setAllEnabled(enabled: boolean) {
    alarms = alarms.map((a) => ({ ...a, enabled, updated_at: now() }));
    return [...alarms];
  },
  async runNow(id: string) {
    const a = await this.getAlarm(id);
    const log: ExecutionLog = {
      id: logSeq++,
      alarm_id: a.id,
      alarm_name: a.name,
      started_at: now(),
      finished_at: now(),
      status: "success",
      exit_code: 0,
      duration_ms: 12,
      retry_count: 0,
      command_preview: [a.binary, ...a.args].join(" "),
      stdout: "mock ok",
      stderr: "",
    };
    logs = [log, ...logs];
    return log;
  },
  async deleteLog(id: number) {
    logs = logs.filter((l) => l.id !== id);
  },
  async deleteLogs(ids: number[]) {
    const set = new Set(ids);
    const before = logs.length;
    logs = logs.filter((l) => !set.has(l.id));
    return before - logs.length;
  },
  async cancelAlarmRun(_id: string) {
    return false;
  },
  async listLogs(filter: LogFilter) {
    let out = [...logs];
    if (filter.alarm_id) out = out.filter((l) => l.alarm_id === filter.alarm_id);
    if (filter.status) out = out.filter((l) => l.status === filter.status);
    if (filter.query) {
      const q = filter.query.toLowerCase();
      out = out.filter(
        (l) =>
          l.alarm_name.toLowerCase().includes(q) ||
          l.command_preview.toLowerCase().includes(q),
      );
    }
    return out.slice(0, filter.limit);
  },
  async detectTimezone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  },
  async getSettings() {
    return { ...settings };
  },
  async saveSettings(s: AppSettings) {
    settings = { ...s };
    return settings;
  },
  async checkBinary(binary: string) {
    return binary ? `/usr/bin/${binary}` : null;
  },
  async listTemplates(): Promise<TemplateDto[]> {
    return [
      {
        id: "cozy_alarm",
        name_zh: "小闹钟提醒",
        name_en: "Cozy alarm clock",
        binary: "__callai_alarm__",
        args: ["叮咚～闹钟响啦！现在是 callai 小闹钟提醒你一下。", "callai 小闹钟"],
      },
      {
        id: "echo_warmup",
        name_zh: "本地 echo 测试",
        name_en: "Local echo test",
        binary: "echo",
        args: ["callai warmup {{date}}"],
      },
      {
        id: "codex_hi",
        name_zh: "Codex 轻量占位",
        name_en: "Codex light warmup",
        binary: "codex",
        args: ["exec", "hi"],
      },
    ];
  },
  async templateDraft(id: string) {
    if (id === "cozy_alarm") {
      const d = defaultDraft();
      d.name = "小闹钟提醒";
      d.schedule = { mode: "daily", times: ["07:30", "12:00", "21:00"] };
      d.binary = "__callai_alarm__";
      d.args = [
        "叮咚～闹钟响啦！现在是 callai 小闹钟提醒你一下。",
        "callai 小闹钟",
      ];
      d.timeout_secs = 120;
      return d;
    }
    const t = (await this.listTemplates()).find((x) => x.id === id);
    if (!t) return null;
    const d = defaultDraft();
    d.name = t.name_zh;
    d.binary = t.binary;
    d.args = t.args;
    return d;
  },
  async backupNow() {
    const name = `config.toml.mock.${Date.now()}.bak`;
    mockBackups = [name, ...mockBackups].slice(0, 10);
    return name;
  },
  async listBackups() {
    return [...mockBackups];
  },
  async restoreBackup(_name: string) {
    return;
  },
  async deleteBackup(name: string) {
    mockBackups = mockBackups.filter((b) => b !== name);
  },
  async nextTrigger(_id: string) {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d.toISOString();
  },
  async getAppVersion() {
    return "0.0.0-mock";
  },
  async getBackupsDir() {
    return "/tmp/callai-mock-backups";
  },
  async openBackupsDir() {
    return "/tmp/callai-mock-backups";
  },
  async getAutostartEnabled() {
    return false;
  },
  async setAutostartEnabled(enabled: boolean) {
    return enabled;
  },

  async listAlarmSounds() {
    return ["soft_chime", "island_bell", "wood_knock", "warm_rise", "gentle_ping"];
  },
  async previewAlarmSound(sound_id?: string | null) {
    playAlarmSoundPreview(sound_id ?? "soft_chime");
    return true;
  },
};
