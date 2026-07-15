/**
 * AI2UI + structured generation via Vercel AI SDK (OpenAI-compatible).
 * Prompts are loaded from Rust-embedded `src-tauri/prompts/*.prompt`.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { z } from "zod";
import type { AiSettings, AlarmDraft, PluginDraft } from "../domain/types";
import { client } from "../infra/client";

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

function modelFromSettings(ai: AiSettings) {
  if (!ai.base_url.trim() || !ai.api_key.trim()) {
    throw new Error("AI_NOT_CONFIGURED");
  }
  const openai = createOpenAI({
    apiKey: ai.api_key,
    baseURL: ai.base_url.replace(/\/$/, ""),
  });
  return openai(ai.model.trim() || "gpt-5.6-terra");
}

export async function loadPromptBundle(): Promise<{
  system: string;
  alarm: string;
  plugin: string;
  ai2ui: string;
  islandStyle: string;
}> {
  const [system, alarm, plugin, ai2ui, islandStyle] = await Promise.all([
    client.getPrompt("system"),
    client.getPrompt("alarm_generate"),
    client.getPrompt("plugin_generate"),
    client.getPrompt("ai2ui"),
    client.getPrompt("animal_island_style"),
  ]);
  return { system, alarm, plugin, ai2ui, islandStyle };
}

export async function generateAlarmDraft(
  ai: AiSettings,
  userMessage: string,
): Promise<AlarmDraft> {
  const prompts = await loadPromptBundle();
  const { text } = await generateText({
    model: modelFromSettings(ai),
    system: `${prompts.system}\n\n${prompts.alarm}`,
    prompt: userMessage,
    temperature: 0.3,
  });
  const parsed = AlarmDraftSchema.parse(extractJson(text));
  return parsed as AlarmDraft;
}

export async function generatePluginDraft(
  ai: AiSettings,
  userMessage: string,
): Promise<PluginDraft> {
  const prompts = await loadPromptBundle();
  const { text } = await generateText({
    model: modelFromSettings(ai),
    // animal-island-style is the visual source of truth for plugin UI HTML.
    system: `${prompts.system}\n\n${prompts.plugin}\n\n${prompts.islandStyle}\n\n${prompts.ai2ui}`,
    prompt: userMessage,
    temperature: 0.4,
  });
  const parsed = PluginDraftSchema.parse(extractJson(text));
  return parsed as PluginDraft;
}

export async function chatReply(
  ai: AiSettings,
  userMessage: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const prompts = await loadPromptBundle();
  const transcript = history
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
  const { text } = await generateText({
    model: modelFromSettings(ai),
    system: prompts.system,
    prompt: `${transcript}\nUser: ${userMessage}\nAssistant:`,
    temperature: 0.5,
  });
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
