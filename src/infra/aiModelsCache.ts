/**
 * AI model list cache (localStorage) + fetch via Tauri command (or browser mock).
 * Cache key: provider + base_url. TTL 24h; force refresh bypasses TTL.
 */
import type { AiProvider } from "../domain/types";
import { AI_MODEL_HINTS } from "../domain/types";
import { client } from "./client";

const CACHE_PREFIX = "callai.ai.models.v1:";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface AiModelsCacheEntry {
  provider: string;
  base_url: string;
  models: string[];
  fetched_at: number;
}

function cacheKey(provider: string, baseUrl: string): string {
  const p = (provider || "openai").trim().toLowerCase();
  const b = baseUrl.trim().replace(/\/+$/, "").toLowerCase();
  return `${CACHE_PREFIX}${p}|${b}`;
}

export function readModelsCache(
  provider: string,
  baseUrl: string,
): AiModelsCacheEntry | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(provider, baseUrl));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AiModelsCacheEntry;
    if (!parsed || !Array.isArray(parsed.models)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeModelsCache(
  provider: string,
  baseUrl: string,
  models: string[],
): AiModelsCacheEntry {
  const entry: AiModelsCacheEntry = {
    provider: (provider || "openai").trim().toLowerCase(),
    base_url: baseUrl.trim().replace(/\/+$/, ""),
    models: [...new Set(models.map((m) => m.trim()).filter(Boolean))].sort(),
    fetched_at: Date.now(),
  };
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(cacheKey(provider, baseUrl), JSON.stringify(entry));
    } catch {
      /* quota */
    }
  }
  return entry;
}

export function isCacheFresh(entry: AiModelsCacheEntry | null): boolean {
  if (!entry) return false;
  return Date.now() - entry.fetched_at < TTL_MS;
}

/**
 * Provider-scoped seed list for autocomplete when /models is empty or offline.
 * OpenAI-compatible gateways get the full hint set (custom + deepseek).
 */
export function modelHintsForProvider(provider: string): string[] {
  const p = (provider || "openai").trim().toLowerCase();
  if (p === "claude") {
    return AI_MODEL_HINTS.filter((m) => m.startsWith("claude-"));
  }
  if (p === "gemini") {
    return AI_MODEL_HINTS.filter((m) => m.startsWith("gemini-"));
  }
  if (p === "openai") {
    return AI_MODEL_HINTS.filter((m) => m.startsWith("gpt-"));
  }
  // openai_compatible / unknown: full list
  return [...AI_MODEL_HINTS];
}

/** Cache first; otherwise provider seed hints (never empty for known providers). */
export function seedModelsList(provider: string, baseUrl: string): string[] {
  const c = readModelsCache(provider, baseUrl);
  if (c && c.models.length > 0) return c.models;
  return modelHintsForProvider(provider);
}

export async function fetchAiModels(opts: {
  provider: AiProvider | string;
  base_url: string;
  api_key: string;
  force?: boolean;
}): Promise<{ models: string[]; fromCache: boolean }> {
  const provider = opts.provider || "openai";
  const base_url = opts.base_url.trim();
  const api_key = opts.api_key.trim();
  if (!base_url || !api_key) {
    throw new Error("AI_NOT_CONFIGURED");
  }

  const cached = readModelsCache(provider, base_url);
  if (!opts.force && isCacheFresh(cached) && cached!.models.length > 0) {
    return { models: cached!.models, fromCache: true };
  }

  const models = await client.listAiModels(String(provider), base_url, api_key);
  writeModelsCache(provider, base_url, models);
  return { models, fromCache: false };
}

/** Filter cached/live list for autocomplete. */
export function filterModels(models: string[], query: string, limit = 40): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return models.slice(0, limit);
  const starts: string[] = [];
  const contains: string[] = [];
  for (const m of models) {
    const low = m.toLowerCase();
    if (low.startsWith(q)) starts.push(m);
    else if (low.includes(q)) contains.push(m);
  }
  return [...starts, ...contains].slice(0, limit);
}
