import { describe, expect, it } from "vitest";
import {
  filterModels,
  modelHintsForProvider,
  seedModelsList,
} from "../infra/aiModelsCache";

describe("modelHintsForProvider", () => {
  it("scopes openai to gpt family", () => {
    const h = modelHintsForProvider("openai");
    expect(h).toContain("gpt-5.6-terra");
    expect(h.every((m) => m.startsWith("gpt-"))).toBe(true);
  });

  it("scopes claude", () => {
    const h = modelHintsForProvider("claude");
    expect(h).toContain("claude-sonnet-5");
    expect(h.every((m) => m.startsWith("claude-"))).toBe(true);
  });

  it("scopes gemini", () => {
    const h = modelHintsForProvider("gemini");
    expect(h).toContain("gemini-2.5-flash");
    expect(h.every((m) => m.startsWith("gemini-"))).toBe(true);
  });

  it("openai_compatible returns full hint set including deepseek", () => {
    const h = modelHintsForProvider("openai_compatible");
    expect(h).toContain("gpt-5.6-terra");
    expect(h).toContain("deepseek-chat");
  });
});

describe("seedModelsList", () => {
  it("falls back to provider seeds without cache", () => {
    const list = seedModelsList("openai", "https://api.openai.com/v1");
    expect(list[0]).toBe("gpt-5.6-terra");
    expect(list.length).toBeGreaterThan(0);
  });
});

describe("filterModels", () => {
  const models = ["gpt-5.6-terra", "gpt-5.6-sol", "claude-sonnet-5", "gemini-2.5-flash"];

  it("returns prefix matches first", () => {
    expect(filterModels(models, "gpt-5.6-t", 10)).toEqual(["gpt-5.6-terra"]);
  });

  it("empty query returns head of list", () => {
    expect(filterModels(models, "", 2)).toEqual(["gpt-5.6-terra", "gpt-5.6-sol"]);
  });

  it("substring match after prefix", () => {
    expect(filterModels(models, "sonnet", 10)).toEqual(["claude-sonnet-5"]);
  });
});
