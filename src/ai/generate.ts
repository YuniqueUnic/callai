/**
 * AI generation for callai.
 *
 * Prompt composition (order matters):
 *   system → runtime → capabilities → task → style? → output_contract → user
 *
 * HTTP: always prefer Tauri/Rust ureq (`ai_chat_completion`) so the WebView never
 * hits the provider origin (CORS / User-Agent / localhost Origin issues).
 * Browser mock falls back to Vercel AI SDK only when not in Tauri.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { z } from "zod";
import type { AiSettings, AlarmDraft, PluginDraft } from "../domain/types";
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

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("AI response is not JSON");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function requireAiConfig(ai: AiSettings) {
  if (!ai.base_url.trim() || !ai.api_key.trim()) {
    throw new Error("AI_NOT_CONFIGURED");
  }
}

/** Strip browser-forbidden headers (dev-only SDK path). */
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

/**
 * Complete a system+user turn. Prefer native Rust HTTP inside Tauri.
 */
export async function completeText(
  ai: AiSettings,
  system: string,
  user: string,
  temperature: number,
): Promise<string> {
  requireAiConfig(ai);
  const model = ai.model.trim() || "gpt-5.6-terra";
  const provider = ai.provider || "openai";

  // Desktop path: no CORS, real error bodies from gateway.
  if (isTauri() && typeof client.aiChatCompletion === "function") {
    return client.aiChatCompletion({
      provider,
      base_url: ai.base_url.replace(/\/$/, ""),
      api_key: ai.api_key,
      model,
      system,
      user,
      temperature,
    });
  }

  // Browser mock / non-Tauri fallback (may still hit CORS on real gateways).
  const openai = createOpenAI({
    apiKey: ai.api_key,
    baseURL: ai.base_url.replace(/\/$/, ""),
    fetch: browserSafeFetch,
  });
  const { text } = await generateText({
    model: openai.chat(model),
    system,
    prompt: user,
    temperature,
  });
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

/** Join non-empty prompt layers with blank lines. */
export function joinPromptLayers(layers: Array<string | null | undefined>): string {
  return layers
    .map((l) => (l ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Full system message for an intent.
 * Layer order: system → runtime → capabilities → task → style? → output_contract
 */
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

export async function generateAlarmDraft(
  ai: AiSettings,
  userMessage: string,
): Promise<AlarmDraft> {
  const [bundle, runtime] = await Promise.all([
    loadPromptBundle(),
    loadRuntimeContextBlock(),
  ]);
  const text = await completeText(
    ai,
    composeSystemPrompt(bundle, runtime, "alarm"),
    userMessage,
    0.3,
  );
  const parsed = AlarmDraftSchema.parse(extractJson(text));
  return parsed as AlarmDraft;
}

export async function generatePluginDraft(
  ai: AiSettings,
  userMessage: string,
): Promise<PluginDraft> {
  const [bundle, runtime] = await Promise.all([
    loadPromptBundle(),
    loadRuntimeContextBlock(),
  ]);
  const text = await completeText(
    ai,
    composeSystemPrompt(bundle, runtime, "plugin"),
    userMessage,
    0.4,
  );
  const parsed = PluginDraftSchema.parse(extractJson(text));
  return parsed as PluginDraft;
}

export async function chatReply(
  ai: AiSettings,
  userMessage: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
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
  );
  return text.trim();
}

/** Heuristic intent from free text (user can override in UI). */
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
