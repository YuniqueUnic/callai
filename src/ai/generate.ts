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

const PluginDraftSchema = z.object({
  manifest: z.object({
    id: z.string().min(2).max(64),
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().default(""),
    permissions: z.array(
      z.enum([
        "storage",
        "timer",
        "notification",
        "network_limited",
        "limited_exec",
        "history",
      ]),
    ),
    ui: z.string().default("ui.html"),
  }),
  ui_html: z.string().min(1),
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

/** Parse/schema failure that preserves the raw model output for the UI. */
export class AiParseError extends Error {
  readonly raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.name = "AiParseError";
    this.raw = raw;
  }
}

function tryParseJsonObject(slice: string): unknown {
  try {
    return JSON.parse(slice);
  } catch {
    // trailing commas common from models
    const cleaned = slice
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/\n/g, "\n");
    return JSON.parse(cleaned);
  }
}

/** Extract first top-level JSON object; throws AiParseError with full text on failure. */
export function extractJson(text: string): unknown {
  const source = text ?? "";
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? source).trim();
  const start = raw.indexOf("{");
  if (start < 0) {
    throw new AiParseError("AI response is not JSON", source);
  }
  // brace-scan for balanced object (handles trailing prose after JSON)
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === "\"") inStr = false;
      continue;
    }
    if (ch === "\"") {
      inStr = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const slice = raw.slice(start, i + 1);
        try {
          return tryParseJsonObject(slice);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new AiParseError(msg, source);
        }
      }
    }
  }
  // truncated stream — still keep raw for the user
  try {
    return tryParseJsonObject(raw.slice(start));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new AiParseError(msg || "JSON truncated or incomplete", source);
  }
}

function parseOrThrow<T>(
  schema: z.ZodType<T>,
  text: string,
  label: string,
): T {
  try {
    const data = extractJson(text);
    return schema.parse(data);
  } catch (e) {
    if (e instanceof AiParseError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new AiParseError(`${label}: ${msg}`, text);
  }
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

export async function loadPromptBundle(): Promise<PromptBundle> {
  const [system, capabilities, outputContract, alarm, plugin, ai2ui, islandStyle] =
    await Promise.all([
      client.getPrompt("system"),
      client.getPrompt("capabilities"),
      client.getPrompt("output_contract"),
      client.getPrompt("alarm_generate"),
      client.getPrompt("plugin_generate"),
      client.getPrompt("ai2ui"),
      client.getPrompt("animal_island_style"),
    ]);
  return {
    system,
    capabilities,
    outputContract,
    alarm,
    plugin,
    ai2ui,
    islandStyle,
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
  const text = await completeText(
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
  const text = await completeText(
    ai,
    composeSystemPrompt(bundle, runtime, "plugin"),
    userMessage,
    0.4,
    handlers,
  );
  const split = splitModelOutput(text);
  const draft = parseOrThrow(
    PluginDraftSchema,
    split.body || text,
    "PluginDraft",
  ) as PluginDraft;
  return { draft, thinking: split.thinking, raw: text };
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
  const text = await completeText(
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
