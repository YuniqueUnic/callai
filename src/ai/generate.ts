/**
 * AI generation for callai.
 *
 * Prompt composition:
 *   system → runtime → capabilities → task → style? → output_contract → user
 *
 * HTTP: Tauri Rust proxy with SSE streaming when available
 * (chat/completions + responses). Emits progress for UI.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { z } from "zod";
import type { AiSettings, AlarmDraft, PluginDraft } from "../domain/types";
import { splitModelOutput } from "./splitModelOutput";
import { client } from "../infra/client";
import { isTauri } from "../infra/tauriApi";
import { loadRuntimeContextBlock } from "./runtimeContext";
import { AiParseError, parseOrThrow } from "./parseShared";
import {
  isLikelyTruncatedPluginOutput,
  parsePluginDraftFromModelText,
} from "./parsePluginOutput";

export { AiParseError } from "./parseShared";

const AlarmDraftSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  schedule: z.union([
    z.object({ mode: z.literal("daily"), times: z.array(z.string()) }),
    z.object({
      mode: z.literal("weekly"),
      days: z.array(z.number()),
      times: z.array(z.string()),
    }),
    z.object({
      mode: z.literal("monthly"),
      days: z.array(z.number()),
      times: z.array(z.string()),
    }),
    z.object({ mode: z.literal("cron"), expression: z.string() }),
  ]),
  binary: z.string().min(1),
  args: z.array(z.string()).default([]),
  env_vars: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .default([]),
  retry: z
    .object({
      interval: z.enum(["1m", "2m", "5m", "10m"]),
      max_attempts: z.number().int().min(1).max(3),
    })
    .default({ interval: "1m", max_attempts: 1 }),
  timeout_secs: z.number().int().min(1).max(3600).default(20),
  notification: z
    .object({
      enabled: z.boolean(),
      notification_type: z.enum(["system_only", "with_sound"]),
      sound_id: z.string().nullable().optional(),
    })
    .optional(),
});

export type AiIntent = "alarm" | "plugin" | "chat";

export interface PromptBundle {
  system: string;
  capabilities: string;
  outputContract: string;
  alarm: string;
  plugin: string;
  ai2ui: string;
  islandStyle: string;
  pluginSdk: string;
}

export type StreamPhase =
  | "connecting"
  | "waiting"
  | "streaming"
  | "done";

export interface CompleteTextHandlers {
  onPhase?: (phase: StreamPhase, info: { chars: number; elapsedMs: number }) => void;
  onDelta?: (delta: string, full: string) => void;
}

function requireAiConfig(ai: AiSettings) {
  if (!ai.base_url.trim() || !ai.api_key.trim()) {
    throw new Error("AI_NOT_CONFIGURED");
  }
}

function browserSafeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers ?? undefined);
  for (const key of ["user-agent", "User-Agent"]) {
    headers.delete(key);
  }
  return globalThis.fetch(input, { ...init, headers });
}

function newRequestId(): string {
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Heuristic: model hit max tokens or cut mid-JSON / mid-string / dual-part HTML. */
export function isLikelyTruncatedOutput(text: string): boolean {
  if (isLikelyTruncatedPluginOutput(text)) return true;
  const s = (text ?? "").trim();
  if (!s) return false;
  if (/callai:\s*truncated\s+finish_reason/i.test(s)) return true;
  const fences = (s.match(/```/g) || []).length;
  if (fences % 2 === 1) return true;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let sawObj = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") {
      depth++;
      sawObj = true;
    } else if (ch === "}") depth--;
  }
  if (inStr) return true;
  if (sawObj && depth > 0) return true;
  if (/[,:{]\s*$/.test(s) || /\\$/.test(s)) return true;
  return false;
}

const CONTINUE_MAX_ROUNDS = 4;

/**
 * Complete a system+user turn with optional streaming callbacks.
 * Prefer Tauri Rust path (SSE when gateway allows).
 */
export async function completeText(
  ai: AiSettings,
  system: string,
  user: string,
  temperature: number,
  handlers?: CompleteTextHandlers,
): Promise<string> {
  requireAiConfig(ai);
  const model = ai.model.trim() || "gpt-5.6-terra";
  const provider = ai.provider || "openai";

  if (isTauri() && typeof client.aiChatCompletion === "function") {
    const requestId = newRequestId();
    let full = "";
    let unlisten: UnlistenFn | undefined;
    try {
      handlers?.onPhase?.("connecting", { chars: 0, elapsedMs: 0 });
      unlisten = await listen<{
        requestId: string;
        phase: string;
        delta: string;
        chars: number;
        elapsedMs: number;
      }>("callai://ai-stream", (ev) => {
        const p = ev.payload;
        if (p.requestId !== requestId) return;
        if (p.delta) {
          full += p.delta;
          handlers?.onDelta?.(p.delta, full);
        }
        const phase = (p.phase || "waiting") as StreamPhase;
        handlers?.onPhase?.(phase, {
          chars: p.chars ?? full.length,
          elapsedMs: p.elapsedMs ?? 0,
        });
      });

      const text = await client.aiChatCompletion({
        request_id: requestId,
        provider,
        base_url: ai.base_url.replace(/\/$/, ""),
        api_key: ai.api_key,
        model,
        system,
        user,
        temperature,
      });
      // If gateway ignored stream and returned one shot without deltas, push once.
      if (text && !full) {
        full = text;
        handlers?.onDelta?.(text, text);
      }
      handlers?.onPhase?.("done", {
        chars: full.length || text.length,
        elapsedMs: 0,
      });
      return text || full;
    } finally {
      if (unlisten) unlisten();
    }
  }

  // Browser mock / non-Tauri fallback
  handlers?.onPhase?.("connecting", { chars: 0, elapsedMs: 0 });
  const openai = createOpenAI({
    apiKey: ai.api_key,
    baseURL: ai.base_url.replace(/\/$/, ""),
    fetch: browserSafeFetch,
  });
  handlers?.onPhase?.("waiting", { chars: 0, elapsedMs: 0 });
  const { text } = await generateText({
    model: openai.chat(model),
    system,
    prompt: user,
    temperature,
  });
  handlers?.onDelta?.(text, text);
  handlers?.onPhase?.("done", { chars: text.length, elapsedMs: 0 });
  return text;
}


const TRUNCATED_MARKER_RE = /\n\n\/\* callai: truncated[\s\S]*?\*\/\s*$/i;
const CONTINUE_TAIL_CHARS = 3500;

function stripTruncatedMarker(text: string): string {
  return (text ?? "").replace(TRUNCATED_MARKER_RE, "");
}

/**
 * If the model restarts and re-emits the end of the previous text, drop the overlap.
 */
export function stitchContinuation(base: string, piece: string): string {
  const suffix = (piece ?? "").replace(/^\uFEFF/, "");
  if (!suffix) return base;
  const left = base ?? "";
  if (!left) return suffix;

  const max = Math.min(left.length, suffix.length, 1200);
  for (let n = max; n >= 12; n--) {
    if (left.endsWith(suffix.slice(0, n))) {
      return left + suffix.slice(n);
    }
  }
  // Full restart of a closed JSON object — prefer append only when piece looks like a suffix.
  if (suffix.trimStart().startsWith("{") && left.includes("{") && !isLikelyTruncatedOutput(left)) {
    // Base already complete; ignore restarting piece.
    return left;
  }
  return left + suffix;
}

async function loadContinuePrompts(
  incomplete: string,
  round: number,
  maxRounds: number,
): Promise<{ systemAddendum: string; user: string }> {
  const tail = incomplete.slice(-CONTINUE_TAIL_CHARS);
  const vars = {
    incomplete_tail: tail,
    round: String(round),
    max_rounds: String(maxRounds),
  };

  const render =
    typeof client.renderPrompt === "function"
      ? (id: string, v?: Record<string, string>) => client.renderPrompt(id, v)
      : async (id: string, v?: Record<string, string>) => {
          // Fallback: load body + simple {{ key }} substitution (browser mock path).
          let body = await client.getPrompt(id);
          for (const [k, val] of Object.entries(v ?? {})) {
            body = body.split(`{{ ${k} }}`).join(val).split(`{{${k}}}`).join(val);
          }
          return body;
        };

  const [systemAddendum, user] = await Promise.all([
    render("continue_system", vars),
    render("continue_user", vars),
  ]);
  return { systemAddendum, user };
}

/**
 * Keep requesting continuation until JSON/prose/HTML looks complete or rounds exhausted.
 * Continuation instructions live in `continue_system.prompt` + `continue_user.prompt`
 * (mini-jinja rendered) — never inline in this file.
 */
export async function completeTextWithContinue(
  ai: AiSettings,
  system: string,
  user: string,
  temperature: number,
  handlers?: CompleteTextHandlers,
): Promise<string> {
  let text = stripTruncatedMarker(
    await completeText(ai, system, user, temperature, handlers),
  );
  let rounds = 0;
  let stagnant = 0;

  while (rounds < CONTINUE_MAX_ROUNDS && isLikelyTruncatedOutput(text)) {
    rounds += 1;
    handlers?.onPhase?.("streaming", {
      chars: text.length,
      elapsedMs: 0,
    });

    const beforeLen = text.length;
    const { systemAddendum, user: contUser } = await loadContinuePrompts(
      text,
      rounds,
      CONTINUE_MAX_ROUNDS,
    );
    const contSystem = joinPromptLayers([system, systemAddendum]);
    const piece = await completeText(
      ai,
      contSystem,
      contUser,
      Math.min(temperature, 0.2),
      handlers,
    );
    if (!piece.trim()) break;

    text = stripTruncatedMarker(stitchContinuation(text, piece));

    // No meaningful progress → stop (avoid infinite loop of near-empty pieces).
    if (text.length <= beforeLen + 8) {
      stagnant += 1;
      if (stagnant >= 2) break;
    } else {
      stagnant = 0;
    }
  }

  return stripTruncatedMarker(text);
}

export async function loadPromptBundle(): Promise<PromptBundle> {
  const [system, capabilities, outputContract, alarm, plugin, ai2ui, islandStyle, pluginSdk] =
    await Promise.all([
      client.getPrompt("system"),
      client.getPrompt("capabilities"),
      client.getPrompt("output_contract"),
      client.getPrompt("alarm_generate"),
      client.getPrompt("plugin_generate"),
      client.getPrompt("ai2ui"),
      client.getPrompt("animal_island_style"),
      client.getPrompt("plugin_sdk"),
    ]);
  return {
    system,
    capabilities,
    outputContract,
    alarm,
    plugin,
    ai2ui,
    islandStyle,
    pluginSdk,
  };
}

export function joinPromptLayers(layers: Array<string | null | undefined>): string {
  return layers
    .map((l) => (l ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}

export function composeSystemPrompt(
  bundle: PromptBundle,
  runtime: string,
  intent: AiIntent,
): string {
  if (intent === "alarm") {
    return joinPromptLayers([
      bundle.system,
      runtime,
      bundle.capabilities,
      bundle.alarm,
      bundle.outputContract,
    ]);
  }
  if (intent === "plugin") {
    return joinPromptLayers([
      bundle.system,
      runtime,
      bundle.capabilities,
      bundle.pluginSdk,
      bundle.plugin,
      bundle.islandStyle,
      bundle.ai2ui,
      bundle.outputContract,
    ]);
  }
  return joinPromptLayers([
    bundle.system,
    runtime,
    bundle.capabilities,
    bundle.outputContract,
  ]);
}

export type AlarmGenerateResult = {
  draft: AlarmDraft;
  thinking: string;
  raw: string;
};

export type PluginGenerateResult = {
  draft: PluginDraft;
  thinking: string;
  raw: string;
};

export type ChatGenerateResult = {
  reply: string;
  thinking: string;
  raw: string;
};

export async function generateAlarmDraft(
  ai: AiSettings,
  userMessage: string,
  handlers?: CompleteTextHandlers,
): Promise<AlarmGenerateResult> {
  const [bundle, runtime] = await Promise.all([
    loadPromptBundle(),
    loadRuntimeContextBlock(),
  ]);
  const text = await completeTextWithContinue(
    ai,
    composeSystemPrompt(bundle, runtime, "alarm"),
    userMessage,
    0.3,
    handlers,
  );
  const split = splitModelOutput(text);
  const draft = parseOrThrow(
    AlarmDraftSchema,
    split.body || text,
    "AlarmDraft",
  ) as AlarmDraft;
  return { draft, thinking: split.thinking, raw: text };
}

export async function generatePluginDraft(
  ai: AiSettings,
  userMessage: string,
  handlers?: CompleteTextHandlers,
): Promise<PluginGenerateResult> {
  const [bundle, runtime] = await Promise.all([
    loadPromptBundle(),
    loadRuntimeContextBlock(),
  ]);
  const text = await completeTextWithContinue(
    ai,
    composeSystemPrompt(bundle, runtime, "plugin"),
    userMessage,
    0.4,
    handlers,
  );
  const split = splitModelOutput(text);
  try {
    const draft = parsePluginDraftFromModelText(split.body || text);
    return { draft, thinking: split.thinking, raw: text };
  } catch (e) {
    // Retry against full text (body split may drop HTML after JSON incorrectly)
    if (e instanceof AiParseError && split.body && split.body !== text) {
      const draft = parsePluginDraftFromModelText(text);
      return { draft, thinking: split.thinking, raw: text };
    }
    throw e;
  }
}

export async function chatReply(
  ai: AiSettings,
  userMessage: string,
  history: { role: "user" | "assistant"; content: string }[],
  handlers?: CompleteTextHandlers,
): Promise<ChatGenerateResult> {
  const [bundle, runtime] = await Promise.all([
    loadPromptBundle(),
    loadRuntimeContextBlock(),
  ]);
  const transcript = history
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
  const text = await completeTextWithContinue(
    ai,
    composeSystemPrompt(bundle, runtime, "chat"),
    `${transcript}\nUser: ${userMessage}\nAssistant:`,
    0.5,
    handlers,
  );
  const split = splitModelOutput(text);
  return {
    reply: (split.body || text).trim(),
    thinking: split.thinking,
    raw: text,
  };
}

export function guessIntent(message: string): AiIntent {
  const m = message.toLowerCase();
  if (
    m.includes("plugin") ||
    m.includes("插件") ||
    m.includes("form") ||
    m.includes("timer ui") ||
    m.includes("checklist")
  ) {
    return "plugin";
  }
  if (
    m.includes("alarm") ||
    m.includes("闹钟") ||
    m.includes("schedule") ||
    m.includes("cron") ||
    m.includes("remind") ||
    m.includes("提醒")
  ) {
    return "alarm";
  }
  return "chat";
}
