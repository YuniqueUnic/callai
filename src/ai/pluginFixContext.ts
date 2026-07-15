/**
 * Build AI "Fix plugin" user seed from diagnostics.
 * Prefer recent console **errors** (max 10). If their combined size exceeds
 * ~10k tokens, allocate the budget proportionally by each error's length.
 */

export type PluginConsoleLine = {
  level: string;
  args: string[];
  t: number;
};

export type PluginFixBrief = {
  pluginId: string;
  pluginName: string;
  source: string;
  history: {
    method: string;
    ok: boolean;
    created_at: string;
    result_preview?: string;
    args_preview?: string;
  }[];
  consoleLines: PluginConsoleLine[];
};

/** Rough token estimate (CJK-aware-ish): ~1 token / 2 chars for mixed text. */
export function estimateTokens(text: string): number {
  const s = text ?? "";
  if (!s) return 0;
  // Count CJK / fullwidth vs ascii separately.
  let cjk = 0;
  let other = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0xac00 && code <= 0xd7af)
    ) {
      cjk += 1;
    } else {
      other += 1;
    }
  }
  // Common heuristic: CJK ~1 tok/char, latin ~1 tok / 4 chars.
  return Math.max(1, Math.ceil(cjk * 1.0 + other / 4));
}

export function formatConsoleLine(e: PluginConsoleLine): string {
  const ts = e.t ? new Date(e.t).toISOString() : "";
  return `[${ts}] ${e.level}: ${e.args.join(" ")}`;
}

function isErrorLevel(level: string): boolean {
  const l = (level || "").toLowerCase();
  return l === "error" || l === "err" || l === "fatal" || l === "exception";
}

/**
 * Take up to `maxCount` most recent error lines (fallback to warn, then any).
 */
export function selectRecentErrors(
  lines: PluginConsoleLine[],
  maxCount = 10,
): PluginConsoleLine[] {
  const sorted = [...(lines ?? [])].sort((a, b) => (a.t || 0) - (b.t || 0));
  const errors = sorted.filter((e) => isErrorLevel(e.level));
  const pool =
    errors.length > 0
      ? errors
      : sorted.filter((e) => /warn/i.test(e.level)).length > 0
        ? sorted.filter((e) => /warn/i.test(e.level))
        : sorted;
  return pool.slice(-maxCount);
}

/**
 * If total tokens of `parts` exceed `budget`, truncate each part to
 * floor(budget * (partLen / totalLen)) tokens (at least a few chars).
 */
export function allocateTokenBudget(
  parts: string[],
  budgetTokens: number,
): string[] {
  if (parts.length === 0) return [];
  const tokens = parts.map(estimateTokens);
  const total = tokens.reduce((a, b) => a + b, 0);
  if (total <= budgetTokens) return parts.map((p) => p);

  return parts.map((p, i) => {
    const share = tokens[i] / total;
    const allow = Math.max(16, Math.floor(budgetTokens * share));
    // Convert token budget back to char budget (mixed heuristic inverse).
    // Prefer keeping head+tail of stack traces.
    const maxChars = allow * 3; // slightly generous char cap
    if (p.length <= maxChars) return p;
    const head = Math.floor(maxChars * 0.65);
    const tail = Math.max(0, maxChars - head - 20);
    return `${p.slice(0, head)}\n…[truncated ${p.length - head - tail} chars]…\n${p.slice(-tail)}`;
  });
}

export function buildPluginFixSeed(
  brief: PluginFixBrief,
  opts?: {
    errorBudgetTokens?: number;
    maxErrors?: number;
    maxSourceChars?: number;
    maxHistory?: number;
  },
): string {
  const errorBudget = opts?.errorBudgetTokens ?? 10_000;
  const maxErrors = opts?.maxErrors ?? 10;
  const maxSourceChars = opts?.maxSourceChars ?? 20_000;
  const maxHistory = opts?.maxHistory ?? 15;

  const picked = selectRecentErrors(brief.consoleLines, maxErrors);
  const formatted = picked.map(formatConsoleLine);
  const budgeted = allocateTokenBudget(formatted, errorBudget);

  const errorSection =
    budgeted.length === 0
      ? "(no recent console errors — open the plugin window to capture logs, then retry Fix)"
      : budgeted
          .map((line, i) => {
            const rawTok = estimateTokens(formatted[i] ?? "");
            const outTok = estimateTokens(line);
            const note =
              outTok < rawTok ? ` (truncated ~${rawTok}→${outTok} tok)` : "";
            return `### error ${i + 1}/${budgeted.length}${note}\n${line}`;
          })
          .join("\n\n");

  const failedInvokes = (brief.history ?? [])
    .filter((h) => !h.ok)
    .slice(-maxHistory);
  const histBlock =
    failedInvokes.length > 0
      ? failedInvokes
          .map(
            (h) =>
              `- ${h.method} FAIL @${h.created_at} :: ${h.result_preview ?? h.args_preview ?? ""}`,
          )
          .join("\n")
      : (brief.history ?? [])
          .slice(-8)
          .map(
            (h) =>
              `- ${h.method} ok=${h.ok} @${h.created_at} :: ${h.result_preview ?? ""}`,
          )
          .join("\n") || "(empty)";

  const src = (brief.source ?? "").slice(0, maxSourceChars);

  return [
    `请修复插件「${brief.pluginName}」id=${brief.pluginId}。`,
    `只改 ui.html：严格按 plugin_sdk 使用 window.callai.storage / timer / notification。`,
    `业务参数 UI 必须在插件内部实现，主程序不负责参数表单。`,
    `优先根据下面 **console errors** 定位问题；不要无视错误栈。`,
    ``,
    `## console errors (latest ≤${maxErrors}, budget ≤${errorBudget} tokens total)`,
    errorSection,
    ``,
    `## invoke history (failed first / recent)`,
    histBlock,
    ``,
    `## current ui.html`,
    "```html",
    src,
    "```",
    ``,
    `修复后输出 dual-part PluginDraft（manifest 保持同一 id=${brief.pluginId} + ui.html）。`,
  ].join("\n");
}
