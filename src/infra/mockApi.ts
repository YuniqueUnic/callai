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
  ai: {
    provider: "openai",
    base_url: "https://api.openai.com/v1",
    api_key: "",
    model: "gpt-5.6-terra",
  },
  mcp: {
    enabled: false,
    listen_host: "127.0.0.1",
    port: 33927,
    auth_token: "",
  },
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


const mockAiChat: import("../domain/types").AiChatMessage[] = [];

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
    // mock builtins only
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

  async listPlugins() {
    return [] as import("../domain/types").PluginSummary[];
  },
  async getPlugin(_id: string) {
    throw { code: "ALARM_NOT_FOUND", message: "plugin not found" };
  },
  async installPlugin(draft: import("../domain/types").PluginDraft) {
    return {
      id: draft.manifest.id,
      name: draft.manifest.name,
      version: draft.manifest.version,
      description: draft.manifest.description,
      permissions: draft.manifest.permissions,
      ui: draft.manifest.ui,
      installed_at: now(),
      last_run_at: null,
      record_count: 0,
    };
  },
  async deletePlugin(_id: string) {},
  async pluginInvoke(_pluginId: string, method: string, _args: unknown) {
    if (method === "ping") return { pong: true };
    return {};
  },
  _console: {} as Record<string, { level: string; args: string[]; t: number }[]>,
  async pluginGetSource(id: string) {
    return `<html><body>mock ${id}</body></html>`;
  },
  async pluginSetSource(_id: string, _html: string) {},
  async pluginAppendConsole(id: string, entries: { level: string; args: string[]; t: number }[]) {
    this._console[id] = [...(this._console[id] || []), ...entries].slice(-300);
  },
  async pluginGetConsole(id: string, limit?: number) {
    return (this._console[id] || []).slice(-(limit ?? 100));
  },
  async pluginClearConsole(id: string) {
    delete this._console[id];
  },
  async openPluginWindow(id: string) {
    // Browser mock: open a blank preview tab with the composed HTML if possible.
    console.info("[mock] openPluginWindow", id);
    const html = await this.pluginUiHtml(id);
    const w = window.open("", `plugin-${id}`, "width=440,height=720");
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
    }
  },
  async pluginUiHtml(_id: string) {
    return "<html><body>mock plugin</body></html>";
  },
  async pluginMarkRun(_id: string) {},
  async pluginListHistory(_id: string, _limit?: number) {
    return [];
  },
  async listMcpLogs(_limit?: number) {
    return [];
  },
  async mcpHttpStatus() {
    return {
      enabled: false,
      running: false,
      host: "127.0.0.1",
      port: 33927,
      endpoint: "http://127.0.0.1:33927/mcp",
      health_url: "http://127.0.0.1:33927/health",
      error: null,
    };
  },
  async clearMcpLogs() {
    return 0;
  },
  async aiChatCompletion(opts: {
    request_id?: string;
    provider: string;
    base_url: string;
    api_key: string;
    model: string;
    system: string;
    user: string;
    temperature?: number;
  }) {
    // Deterministic mock for browser / vitest — not a real model.
    const u = opts.user.toLowerCase();
    if (u.includes("plugin") || u.includes("插件")) {
      return JSON.stringify({
        manifest: {
          id: "mock-plugin",
          name: "Mock Plugin",
          version: "0.1.0",
          description: "browser mock",
          permissions: ["storage"],
          ui: "ui.html",
        },
        ui_html: "<!doctype html><html><body><h1>mock</h1></body></html>",
      });
    }
    return JSON.stringify({
      name: "Mock Alarm",
      enabled: true,
      schedule: { mode: "daily", times: ["16:50"] },
      binary: "__callai_alarm__",
      args: ["TODO time"],
      env_vars: [],
      retry: { interval: "1m", max_attempts: 1 },
      timeout_secs: 20,
      notification: {
        enabled: true,
        notification_type: "with_sound",
        sound_id: "soft_chime",
      },
    });
  },
  async getAiRuntimeContext() {
    const { buildBrowserRuntimeContext } = await import("../ai/runtimeContext");
    return buildBrowserRuntimeContext();
  },
  async getPrompt(id: string) {
    const map: Record<string, string> = {
      system: "mock system",
      capabilities: "mock capabilities AlarmDraft __callai_alarm__",
      output_contract: "mock output contract JSON parse",
      alarm_generate: "mock alarm",
      plugin_generate: "mock plugin",
      ai2ui: "mock ai2ui",
      animal_island_style: "mock animal-island-ui " + "x".repeat(1001),
      continue_system: "mock continue system: emit only missing suffix",
      continue_user:
        "Continue round mock. --- incomplete tail ---\n{{ incomplete_tail }}\n--- end tail ---",
    };
    return map[id] ?? `mock prompt ${id}`;
  },
  async renderPrompt(id: string, vars?: Record<string, string>) {
    let body = await this.getPrompt(id);
    for (const [k, v] of Object.entries(vars ?? {})) {
      body = body.split(`{{ ${k} }}`).join(v);
      body = body.split(`{{${k}}}`).join(v);
    }
    return body;
  },
  async listPrompts() {
    return [
      "system",
      "capabilities",
      "output_contract",
      "alarm_generate",
      "plugin_generate",
      "ai2ui",
      "animal_island_style",
      "continue_system",
      "continue_user",
    ];
  },
  async generateSecretToken() {
    return (
      crypto.randomUUID().split("-").join("") +
      crypto.randomUUID().split("-").join("")
    );
  },

  async listAiChatMessages(before?: string | null, limit?: number) {
    const lim = Math.min(100, Math.max(1, limit ?? 30));
    let rows = [...mockAiChat].sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
    );
    if (before) rows = rows.filter((m) => m.created_at < before);
    const has_more = rows.length > lim;
    const page = rows.slice(0, lim).reverse();
    return { messages: page, has_more };
  },
  async upsertAiChatMessage(message: import("../domain/types").AiChatMessage) {
    const i = mockAiChat.findIndex((m) => m.id === message.id);
    if (i >= 0) mockAiChat[i] = message;
    else mockAiChat.push(message);
  },
  async deleteAiChatMessages(ids: string[]) {
    let n = 0;
    for (const id of ids) {
      const i = mockAiChat.findIndex((m) => m.id === id);
      if (i >= 0) {
        mockAiChat.splice(i, 1);
        n++;
      }
    }
    return n;
  },
  async clearAiChatMessages() {
    const n = mockAiChat.length;
    mockAiChat.length = 0;
    return n;
  },
  async setAiChatApplied(id: string, applied: boolean) {
    const m = mockAiChat.find((x) => x.id === id);
    if (m) m.applied = applied;
  },

  async listAiModels(_provider: string, _base_url: string, _api_key: string) {
    // Keep in sync with AI_MODEL_HINTS / current public frontier models (2026-07).
    return [
      "gpt-5.6-terra",
      "gpt-5.6-sol",
      "gpt-5.6-luna",
      "gpt-5.6",
      "gpt-5.5",
      "claude-sonnet-5",
      "claude-opus-4-8",
      "claude-fable-5",
      "claude-haiku-4-5",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-3-flash-preview",
      "deepseek-chat",
      "deepseek-reasoner",
    ];
  },
};