import { describe, expect, it } from "vitest";
import {
  allocateTokenBudget,
  buildPluginFixSeed,
  estimateTokens,
  selectRecentErrors,
  type PluginConsoleLine,
} from "../ai/pluginFixContext";

describe("selectRecentErrors", () => {
  it("prefers error level and keeps last 10", () => {
    const lines: PluginConsoleLine[] = [];
    for (let i = 0; i < 20; i++) {
      lines.push({ level: "log", args: [`log-${i}`], t: i });
    }
    for (let i = 0; i < 12; i++) {
      lines.push({ level: "error", args: [`err-${i}`], t: 100 + i });
    }
    const picked = selectRecentErrors(lines, 10);
    expect(picked).toHaveLength(10);
    expect(picked[0].args[0]).toBe("err-2");
    expect(picked[9].args[0]).toBe("err-11");
  });

  it("falls back to warn then any", () => {
    const lines: PluginConsoleLine[] = [
      { level: "info", args: ["a"], t: 1 },
      { level: "warn", args: ["w1"], t: 2 },
      { level: "warn", args: ["w2"], t: 3 },
    ];
    const picked = selectRecentErrors(lines, 10);
    expect(picked.map((e) => e.args[0])).toEqual(["w1", "w2"]);
  });
});

describe("allocateTokenBudget", () => {
  it("keeps parts when under budget", () => {
    const parts = ["short", "also short"];
    expect(allocateTokenBudget(parts, 10_000)).toEqual(parts);
  });

  it("splits budget by size share when over", () => {
    const big = "x".repeat(40_000);
    const small = "y".repeat(4_000);
    const out = allocateTokenBudget([big, small], 1000);
    expect(out[0].length).toBeLessThan(big.length);
    expect(out[1].length).toBeLessThanOrEqual(small.length + 50);
    // larger part gets more chars
    expect(out[0].length).toBeGreaterThan(out[1].length);
    const totalTok = out.reduce((a, s) => a + estimateTokens(s), 0);
    // allow some slack from head/tail markers
    expect(totalTok).toBeLessThan(2500);
  });
});

describe("buildPluginFixSeed", () => {
  it("includes error section and plugin id", () => {
    const seed = buildPluginFixSeed({
      pluginId: "afternoon-todo",
      pluginName: "TODO",
      source: "<html></html>",
      history: [
        {
          method: "storage.get",
          ok: false,
          created_at: "2026-01-01",
          result_preview: "boom",
        },
      ],
      consoleLines: [
        { level: "error", args: ["TypeError: x"], t: Date.now() },
      ],
    });
    expect(seed).toContain("afternoon-todo");
    expect(seed).toContain("console errors");
    expect(seed).toContain("TypeError");
    expect(seed).toContain("storage.get FAIL");
  });
});
