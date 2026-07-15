/**
 * Shared JSON / AI parse helpers (no generate-side imports).
 */
import { z } from "zod";

/** Parse/schema failure that preserves the raw model output for the UI. */
export class AiParseError extends Error {
  readonly raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.name = "AiParseError";
    this.raw = raw;
  }
}

export function tryParseJsonObject(slice: string): unknown {
  try {
    return JSON.parse(slice);
  } catch {
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
  try {
    return tryParseJsonObject(raw.slice(start));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new AiParseError(msg || "JSON truncated or incomplete", source);
  }
}

export function parseOrThrow<T>(
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
