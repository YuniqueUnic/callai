/**
 * Parse model text into PluginDraft.
 *
 * Preferred dual-part format (stable — no HTML-inside-JSON escaping):
 *   1) JSON: { "manifest": { ... } }
 *   2) HTML: ```html ... ```  or after a `ui.html` marker / raw <!DOCTYPE html>…</html>
 *
 * Legacy: single JSON { "manifest":..., "ui_html":"..." } still accepted.
 */
import { z } from "zod";
import type { PluginDraft } from "../domain/types";
import { AiParseError, extractJson } from "./parseShared";

const ManifestSchema = z.object({
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
});

const LegacyPluginDraftSchema = z.object({
  manifest: ManifestSchema,
  ui_html: z.string().min(1),
});

const ManifestOnlySchema = z.object({
  manifest: ManifestSchema,
  ui_html: z.string().optional(),
});

const HTML_FENCE =
  /```(?:html|HTML|htm)\s*\n?([\s\S]*?)```/i;
const UI_HTML_MARKER =
  /(?:^|\n)\s*(?:#{1,3}\s*)?(?:ui\.html|UI\.HTML|Part\s*2[^\n]*)\s*\n/i;

function extractHtmlDocument(text: string): string | null {
  const source = text ?? "";

  const fenced = source.match(HTML_FENCE);
  if (fenced?.[1]?.trim()) {
    return fenced[1].trim();
  }

  // After explicit ui.html marker: take remainder and strip optional fence
  const marker = source.match(UI_HTML_MARKER);
  if (marker && marker.index != null) {
    let after = source.slice(marker.index + marker[0].length).trim();
    const inner = after.match(HTML_FENCE);
    if (inner?.[1]?.trim()) return inner[1].trim();
    // strip opening fence without close (truncated)
    after = after.replace(/^```(?:html|HTML|htm)?\s*\n?/i, "").trim();
    if (after) return after;
  }

  // Raw full document
  const doctype = source.search(/<!DOCTYPE\s+html/i);
  const htmlOpen = source.search(/<html[\s>]/i);
  const start =
    doctype >= 0 ? doctype : htmlOpen >= 0 ? htmlOpen : -1;
  if (start >= 0) {
    const end = source.toLowerCase().lastIndexOf("</html>");
    if (end > start) {
      return source.slice(start, end + "</html>".length).trim();
    }
    // incomplete html — still return from start (caller may continue)
    return source.slice(start).trim();
  }

  return null;
}

function firstJsonObjectSlice(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
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
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Build PluginDraft from raw model text (dual-part preferred, legacy OK).
 */
export function parsePluginDraftFromModelText(raw: string): PluginDraft {
  const source = (raw ?? "").replace(/^\uFEFF/, "").trim();
  if (!source) {
    throw new AiParseError("PluginDraft: empty model output", raw ?? "");
  }

  // 1) Try full extractJson (legacy {manifest, ui_html} or manifest-only)
  let jsonData: unknown = null;
  try {
    jsonData = extractJson(source);
  } catch {
    // maybe HTML-first rare case — still try slice
    const slice = firstJsonObjectSlice(source);
    if (slice) {
      try {
        jsonData = JSON.parse(slice);
      } catch {
        /* fall through */
      }
    }
  }

  if (jsonData == null) {
    throw new AiParseError(
      "PluginDraft: missing manifest JSON object",
      source,
    );
  }

  // Legacy single-object with ui_html
  const legacy = LegacyPluginDraftSchema.safeParse(jsonData);
  if (legacy.success) {
    return legacy.data as PluginDraft;
  }

  const manifestOnly = ManifestOnlySchema.safeParse(jsonData);
  if (!manifestOnly.success) {
    throw new AiParseError(
      `PluginDraft: invalid manifest — ${manifestOnly.error.message}`,
      source,
    );
  }

  // If legacy optional ui_html present and non-empty
  if (manifestOnly.data.ui_html?.trim()) {
    return {
      manifest: manifestOnly.data.manifest,
      ui_html: manifestOnly.data.ui_html.trim(),
    };
  }

  // Dual-part: HTML outside JSON
  // Prefer HTML after the JSON object so prose-before doesn't steal
  const jsonSlice = firstJsonObjectSlice(source);
  const afterJson = jsonSlice
    ? source.slice(source.indexOf(jsonSlice) + jsonSlice.length)
    : source;
  const html =
    extractHtmlDocument(afterJson) ?? extractHtmlDocument(source);

  if (!html?.trim()) {
    throw new AiParseError(
      "PluginDraft: missing ui.html / HTML document (dual-part format)",
      source,
    );
  }

  return {
    manifest: manifestOnly.data.manifest,
    ui_html: html.trim(),
  };
}

/** Heuristic: dual-part plugin output looks truncated. */
export function isLikelyTruncatedPluginOutput(text: string): boolean {
  const s = (text ?? "").trim();
  if (!s) return false;
  if (/callai:\s*truncated\s+finish_reason/i.test(s)) return true;

  const fences = (s.match(/```/g) || []).length;
  if (fences % 2 === 1) return true;

  // Unbalanced JSON
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

  // JSON closed but HTML started without </html>
  const lower = s.toLowerCase();
  const hasHtmlStart =
    /<!doctype\s+html/i.test(s) || /<html[\s>]/i.test(s) || /```html/i.test(s);
  if (hasHtmlStart && !lower.includes("</html>")) return true;

  if (/[,:{]\s*$/.test(s) || /\\$/.test(s)) return true;
  return false;
}
