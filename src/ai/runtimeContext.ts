/**
 * Runtime / user-preference context injected into AI system prompts.
 * Secrets (API keys, MCP tokens) are never included.
 */
import type { AppSettings } from "../domain/types";
import { client } from "../infra/client";
import { getAppVersionCached, getSettingsCached } from "../infra/settingsCache";
import { ensureDetectedTimezone } from "../infra/timezoneCache";

export interface AiRuntimeContextDto {
  app_name: string;
  app_version: string;
  os_family: string;
  os_name: string;
  os_version: string;
  arch: string;
  locale: string;
  theme: string;
  timezone_setting: string;
  timezone_resolved: string;
  sound_enabled: boolean;
  notify_on_failure: boolean;
  launch_minimized: boolean;
  auto_backup_on_start: boolean;
  log_retention_days: number;
  ai_provider: string;
  ai_model: string;
  ai_base_host: string;
  mcp_enabled: boolean;
  mcp_listen: string;
  now_local: string;
  now_utc: string;
  shell_hint: string;
  path_sep: string;
  config_dir: string;
  data_dir: string;
  notes: string[];
}

let cache: { at: number; block: string } | null = null;
const TTL_MS = 30_000;

export function formatRuntimeContextBlock(ctx: AiRuntimeContextDto): string {
  const notes = (ctx.notes ?? []).map((n) => `- ${n}`).join("\n");
  return `<callai_runtime_context>
app: ${ctx.app_name} v${ctx.app_version}
os: ${ctx.os_family} / ${ctx.os_name} ${ctx.os_version} (${ctx.arch})
locale: ${ctx.locale}
theme: ${ctx.theme}
timezone.setting: ${ctx.timezone_setting}
timezone.resolved: ${ctx.timezone_resolved}
now.local: ${ctx.now_local}
now.utc: ${ctx.now_utc}
shell: ${ctx.shell_hint}
path_sep: ${ctx.path_sep}
dirs.config: ${ctx.config_dir}
dirs.data: ${ctx.data_dir}
prefs.sound_enabled: ${ctx.sound_enabled}
prefs.notify_on_failure: ${ctx.notify_on_failure}
prefs.launch_minimized: ${ctx.launch_minimized}
prefs.auto_backup_on_start: ${ctx.auto_backup_on_start}
prefs.log_retention_days: ${ctx.log_retention_days}
ai.provider: ${ctx.ai_provider}
ai.model: ${ctx.ai_model}
ai.base_host: ${ctx.ai_base_host}
mcp.enabled: ${ctx.mcp_enabled}
mcp.listen: ${ctx.mcp_listen}
notes:
${notes}
</callai_runtime_context>

Treat this block as authoritative environment/preferences for generation.
Pick binaries, paths, schedule times, and UI copy that fit this machine and locale.
Do not invent paths outside dirs.config / dirs.data unless the user asked.
Never echo or request secrets.`;
}

/** Browser/mock fallback when Tauri command is unavailable. */
export async function buildBrowserRuntimeContext(): Promise<AiRuntimeContextDto> {
  const settings: AppSettings = await getSettingsCached().catch(
    () =>
      ({
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
      }) as AppSettings,
  );
  const version = await getAppVersionCached().catch(() => "0.0.0");
  const tzResolved = await ensureDetectedTimezone().catch(() => "UTC");
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  let os_family = "unknown";
  if (/Mac/i.test(ua)) os_family = "macos";
  else if (/Win/i.test(ua)) os_family = "windows";
  else if (/Linux/i.test(ua)) os_family = "linux";

  const base = settings.ai?.base_url ?? "";
  const host =
    base.replace(/^https?:\/\//, "").split("/")[0] || "(unset)";

  const now = new Date();
  return {
    app_name: "callai",
    app_version: version,
    os_family,
    os_name: os_family,
    os_version: "browser",
    arch: typeof navigator !== "undefined" ? navigator.platform : "unknown",
    locale: settings.locale || "zh-CN",
    theme: settings.theme || "system",
    timezone_setting: settings.timezone || "system",
    timezone_resolved: tzResolved,
    sound_enabled: settings.sound_enabled !== false,
    notify_on_failure: !!settings.notify_on_failure,
    launch_minimized: !!settings.launch_minimized,
    auto_backup_on_start: settings.auto_backup_on_start !== false,
    log_retention_days: settings.log_retention_days ?? 30,
    ai_provider: settings.ai?.provider ?? "openai",
    ai_model: settings.ai?.model ?? "",
    ai_base_host: host,
    mcp_enabled: !!settings.mcp?.enabled,
    mcp_listen: `${settings.mcp?.listen_host ?? "127.0.0.1"}:${settings.mcp?.port ?? 33927}`,
    now_local: now.toString(),
    now_utc: now.toISOString(),
    shell_hint:
      os_family === "windows"
        ? "powershell / cmd"
        : os_family === "macos"
          ? "zsh/bash; open, osascript, say"
          : "bash/sh",
    path_sep: os_family === "windows" ? "\\" : "/",
    config_dir: "(browser mock)",
    data_dir: "(browser mock)",
    notes: [
      "Never echo or request API keys / MCP tokens.",
      "For pure chime reminders use binary `__callai_alarm__`.",
      "Respond in the user's locale when writing names/copy.",
    ],
  };
}

export async function loadRuntimeContextBlock(force = false): Promise<string> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return cache.block;
  }
  try {
    const ctx = await client.getAiRuntimeContext();
    const block = formatRuntimeContextBlock(ctx);
    cache = { at: Date.now(), block };
    return block;
  } catch {
    const block = formatRuntimeContextBlock(await buildBrowserRuntimeContext());
    cache = { at: Date.now(), block };
    return block;
  }
}

export function clearRuntimeContextCache(): void {
  cache = null;
}
