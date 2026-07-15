/**
 * Split model output into "thinking / reasoning" vs final body.
 *
 * Real-world streams often mix:
 * - prose reasoning ("The user is asking…") before JSON
 * - <think>…</think> / <thinking>…</thinking> fences
 * - ```thinking / ```reason code fences
 * - markdown ## Thinking / ## Answer sections
 *
 * Industry pattern (ChatGPT o-series, Claude, Cursor): show thinking in a
 * subdued collapsible block; keep the final answer as the primary surface.
 */

export interface SplitModelOutput {
  thinking: string;
  body: string;
  /** true when a JSON object was found in body (alarm/plugin style). */
  hasJson: boolean;
}

const THINK_TAG =
  /<think(?:ing)?\b[^>]*>([\s\S]*?)<\/think(?:ing)?>/gi;
const THINK_FENCE =
  /```(?:thinking|reasoning|thought|analysis)\s*([\s\S]*?)```/gi;

function firstJsonObjectSpan(text: string): { start: number; end: number } | null {
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
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  // incomplete JSON still starting — treat from `{` as body
  return { start, end: text.length };
}

function stripTagsAndFences(source: string): {
  thinkingParts: string[];
  rest: string;
} {
  const thinkingParts: string[] = [];
  let rest = source;

  rest = rest.replace(THINK_TAG, (_m, inner: string) => {
    const s = String(inner ?? "").trim();
    if (s) thinkingParts.push(s);
    return "\n";
  });

  rest = rest.replace(THINK_FENCE, (_m, inner: string) => {
    const s = String(inner ?? "").trim();
    if (s) thinkingParts.push(s);
    return "\n";
  });

  return { thinkingParts, rest };
}

/** Markdown-style section split: ## Thinking … ## Answer / ## Final */
function splitMarkdownSections(text: string): SplitModelOutput | null {
  const re =
    /^(#{1,3}\s*(?:thinking|reasoning|thoughts?|analysis|思考|推理)\s*)$/im;
  const ans =
    /^(#{1,3}\s*(?:answer|final|response|result|output|结论|回答|结果)\s*)$/im;
  const lines = text.split(/\r?\n/);
  let mode: "pre" | "think" | "body" = "pre";
  const think: string[] = [];
  const body: string[] = [];
  let sawThinkHeader = false;

  for (const line of lines) {
    if (re.test(line.trim())) {
      mode = "think";
      sawThinkHeader = true;
      continue;
    }
    if (ans.test(line.trim())) {
      mode = "body";
      continue;
    }
    if (mode === "think") think.push(line);
    else if (mode === "body") body.push(line);
    else body.push(line);
  }

  if (!sawThinkHeader) return null;
  return {
    thinking: think.join("\n").trim(),
    body: body.join("\n").trim() || text.trim(),
    hasJson: firstJsonObjectSpan(body.join("\n")) != null,
  };
}

/**
 * Split raw model text into thinking + final body.
 * Prefer explicit fences/tags; else prose before first JSON object.
 */
export function splitModelOutput(raw: string): SplitModelOutput {
  const source = (raw ?? "").replace(/^\uFEFF/, "");
  if (!source.trim()) {
    return { thinking: "", body: "", hasJson: false };
  }

  const { thinkingParts, rest } = stripTagsAndFences(source);
  const md = splitMarkdownSections(rest.trim());
  if (md) {
    return {
      thinking: [...thinkingParts, md.thinking].filter(Boolean).join("\n\n").trim(),
      body: md.body,
      hasJson: md.hasJson,
    };
  }

  const span = firstJsonObjectSpan(rest);
  if (span) {
    const before = rest.slice(0, span.start).trim();
    const jsonBody = rest.slice(span.start, span.end).trim();
    const after = rest.slice(span.end).trim();
    // Prefer prose-before-JSON as thinking; keep trailing notes with body lightly.
    const thinking = [...thinkingParts, before].filter(Boolean).join("\n\n").trim();
    const body = after ? `${jsonBody}\n\n${after}` : jsonBody;
    return { thinking, body, hasJson: true };
  }

  // No JSON: if we already extracted tag/fence thinking, body is remainder.
  if (thinkingParts.length > 0) {
    return {
      thinking: thinkingParts.join("\n\n").trim(),
      body: rest.trim(),
      hasJson: false,
    };
  }

  // Heuristic: long English "The user is asking" analysis before a Chinese answer
  // Keep entire text as body when we cannot confidently split.
  return { thinking: "", body: source.trim(), hasJson: false };
}

/** Live stream helper: same split, safe on incomplete text. */
export function splitStreamingOutput(raw: string): SplitModelOutput {
  return splitModelOutput(raw);
}
