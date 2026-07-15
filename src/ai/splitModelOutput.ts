/**
 * Split model output into "thinking / reasoning" vs final body.
 *
 * Real-world streams often mix:
 * - prose reasoning ("The user is asking…") before JSON
 * - <think>…</think> / <thinking>…</thinking> fences (incl. unclosed mid-stream)
 * - ```thinking / ```reason code fences (incl. unclosed)
 * - markdown ## Thinking / ## Answer sections
 * - dual-part plugin: JSON then ```html
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

const THINK_TAG_CLOSED =
  /<think(?:ing)?\b[^>]*>([\s\S]*?)<\/think(?:ing)?>/gi;
const THINK_FENCE_CLOSED =
  /```(?:thinking|reasoning|thought|analysis)\s*\r?\n?([\s\S]*?)```/gi;

/** Language tags that are output fences, NOT human thinking. */
const OUTPUT_FENCE_LANG =
  /^(?:json|html|htm|javascript|js|ts|typescript|tsx|jsx|css|xml|yaml|yml|toml|text|txt|md|markdown|bash|sh|shell|python|py)?$/i;

function firstJsonObjectSpan(
  text: string,
): { start: number; end: number; complete: boolean } | null {
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
      if (depth === 0) return { start, end: i + 1, complete: true };
    }
  }
  // incomplete JSON still starting — treat from `{` as body
  return { start, end: text.length, complete: false };
}

/** True when text is only markdown fence openers like ``` / ```json (not real thinking). */
export function isFenceOnlyPreamble(text: string): boolean {
  const s = (text ?? "").trim();
  if (!s) return true;
  // one or more fence openers, optional trailing whitespace
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return true;
  return lines.every((line) => {
    const m = line.match(/^```([\w.-]*)\s*$/);
    if (!m) return false;
    const lang = m[1] || "";
    return OUTPUT_FENCE_LANG.test(lang) || lang === "";
  });
}

/**
 * Peel trailing ```json / ``` openers off "before JSON" prose so they don't
 * pollute the thinking panel (common stream shape: "…\n```json\n{").
 */
export function peelOutputFenceOpeners(text: string): {
  prose: string;
  fence: string;
} {
  const source = text ?? "";
  const re = /(?:^|\n)(```[\w.-]*\s*)$/;
  let prose = source;
  let fence = "";
  // peel repeatedly from the end
  for (let i = 0; i < 4; i++) {
    const m = prose.match(re);
    if (!m) break;
    const lang = (m[1].match(/```([\w.-]*)/) || [])[1] || "";
    if (!(OUTPUT_FENCE_LANG.test(lang) || lang === "")) break;
    fence = m[1] + fence;
    prose = prose.slice(0, m.index).replace(/\s+$/, "");
  }
  // whole string is only fences
  if (isFenceOnlyPreamble(prose) && prose.trim()) {
    return { prose: "", fence: source };
  }
  return { prose: prose.trim(), fence };
}

function extractClosedThinkParts(source: string): {
  thinkingParts: string[];
  rest: string;
} {
  const thinkingParts: string[] = [];
  let rest = source;

  rest = rest.replace(THINK_TAG_CLOSED, (_m, inner: string) => {
    const s = String(inner ?? "").trim();
    if (s) thinkingParts.push(s);
    return "\n";
  });

  rest = rest.replace(THINK_FENCE_CLOSED, (_m, inner: string) => {
    const s = String(inner ?? "").trim();
    if (s) thinkingParts.push(s);
    return "\n";
  });

  return { thinkingParts, rest };
}

/**
 * Mid-stream: unclosed <think>… or ```thinking … without closing fence.
 * Those are the main reason "阔爱在想" looks empty during generation.
 */
function extractOpenThinking(source: string): {
  thinking: string;
  rest: string;
} | null {
  // Prefer the last unclosed think tag
  const tagRe = /<think(?:ing)?\b[^>]*>/gi;
  let tagMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(source)) != null) tagMatch = m;
  if (tagMatch && tagMatch.index != null) {
    const afterOpen = source.slice(tagMatch.index + tagMatch[0].length);
    if (!/<\/think(?:ing)?>/i.test(afterOpen)) {
      return {
        thinking: afterOpen.trim(),
        rest: source.slice(0, tagMatch.index).trim(),
      };
    }
  }

  // Unclosed ```thinking / ```reasoning …
  const fenceRe = /```(thinking|reasoning|thought|analysis)\b[^\n]*\r?\n?/gi;
  let fenceMatch: RegExpExecArray | null = null;
  while ((m = fenceRe.exec(source)) != null) fenceMatch = m;
  if (fenceMatch && fenceMatch.index != null) {
    const afterOpen = source.slice(fenceMatch.index + fenceMatch[0].length);
    // still open if no closing ```
    if (!afterOpen.includes("```")) {
      return {
        thinking: afterOpen.trim(),
        rest: source.slice(0, fenceMatch.index).trim(),
      };
    }
  }

  return null;
}

/** Markdown-style section split: ## Thinking … ## Answer / ## Final */
function splitMarkdownSections(text: string): SplitModelOutput | null {
  const re =
    /^(#{1,3}\s*(?:thinking|reasoning|thoughts?|analysis|思考|推理|想法)\s*)$/im;
  const ans =
    /^(#{1,3}\s*(?:answer|final|response|result|output|结论|回答|结果|正文)\s*)$/im;
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
 * Never treat bare ```json fence openers as thinking.
 */
export function splitModelOutput(raw: string): SplitModelOutput {
  const source = (raw ?? "").replace(/^\uFEFF/, "");
  if (!source.trim()) {
    return { thinking: "", body: "", hasJson: false };
  }

  // 1) Unclosed think mid-stream (must run before closed-tag strip)
  const open = extractOpenThinking(source);
  if (open) {
    const closed = extractClosedThinkParts(open.rest);
    const thinking = [...closed.thinkingParts, open.thinking]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    // rest may still contain answer/json start
    const sub = splitModelOutput(closed.rest);
    return {
      thinking: [thinking, sub.thinking].filter(Boolean).join("\n\n").trim(),
      body: sub.body || closed.rest.trim(),
      hasJson: sub.hasJson,
    };
  }

  const { thinkingParts, rest } = extractClosedThinkParts(source);
  const md = splitMarkdownSections(rest.trim());
  if (md) {
    return {
      thinking: [...thinkingParts, md.thinking]
        .filter(Boolean)
        .join("\n\n")
        .trim(),
      body: md.body,
      hasJson: md.hasJson,
    };
  }

  const span = firstJsonObjectSpan(rest);
  if (span) {
    const beforeRaw = rest.slice(0, span.start);
    const { prose, fence } = peelOutputFenceOpeners(beforeRaw);
    const jsonBody = rest.slice(span.start, span.end).trim();
    const after = rest.slice(span.end).trim();
    // Rebuild body: optional fence + json + trailing (html dual-part etc.)
    const bodyCore = [fence.trim(), jsonBody, after].filter(Boolean).join("\n");
    const thinking = [...thinkingParts, prose].filter(Boolean).join("\n\n").trim();
    return {
      thinking: isFenceOnlyPreamble(thinking) ? thinkingParts.join("\n\n").trim() : thinking,
      body: bodyCore.trim(),
      hasJson: true,
    };
  }

  // No JSON yet — if stream opened ```json only, body = that (not thinking)
  if (isFenceOnlyPreamble(rest) || isFenceOnlyPreamble(source)) {
    return {
      thinking: thinkingParts.join("\n\n").trim(),
      body: rest.trim() || source.trim(),
      hasJson: false,
    };
  }

  if (thinkingParts.length > 0) {
    return {
      thinking: thinkingParts.join("\n\n").trim(),
      body: rest.trim(),
      hasJson: false,
    };
  }

  // Heuristic: long analysis before a Chinese/final answer without JSON
  // Keep entire text as body when we cannot confidently split.
  return { thinking: "", body: source.trim(), hasJson: false };
}

/** Live stream helper: same split, safe on incomplete text. */
export function splitStreamingOutput(raw: string): SplitModelOutput {
  return splitModelOutput(raw);
}
