import { describe, expect, it } from "vitest";
import {
  composeSystemPrompt,
  joinPromptLayers,
  type PromptBundle,
} from "../ai/generate";

const bundle: PromptBundle = {
  system: "SYSTEM",
  capabilities: "CAPS",
  outputContract: "CONTRACT",
  alarm: "ALARM_TASK",
  plugin: "PLUGIN_TASK",
  ai2ui: "AI2UI",
  islandStyle: "ISLAND",
};

describe("joinPromptLayers", () => {
  it("drops empty layers and joins with blank lines", () => {
    expect(joinPromptLayers(["a", "", "b", null, "  c  "])).toBe("a\n\nb\n\nc");
  });
});

describe("composeSystemPrompt", () => {
  it("orders alarm layers correctly", () => {
    const s = composeSystemPrompt(bundle, "RUNTIME", "alarm");
    expect(s).toBe(
      ["SYSTEM", "RUNTIME", "CAPS", "ALARM_TASK", "CONTRACT"].join("\n\n"),
    );
  });

  it("includes style packs for plugin", () => {
    const s = composeSystemPrompt(bundle, "RUNTIME", "plugin");
    expect(s).toContain("ISLAND");
    expect(s).toContain("AI2UI");
    expect(s.endsWith("CONTRACT")).toBe(true);
  });

  it("chat still gets capabilities + contract", () => {
    const s = composeSystemPrompt(bundle, "RUNTIME", "chat");
    expect(s).toBe(["SYSTEM", "RUNTIME", "CAPS", "CONTRACT"].join("\n\n"));
  });
});
