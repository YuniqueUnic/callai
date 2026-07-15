import { describe, expect, it } from "vitest";
import { splitModelOutput } from "../ai/splitModelOutput";

describe("splitModelOutput", () => {
  it("splits prose before JSON as thinking", () => {
    const raw = `The user wants a daily TODO alarm at 16:50.

{"name":"TODO铃","enabled":true,"schedule":{"mode":"daily","times":["16:50"]},"binary":"__callai_alarm__","args":["写 TODO"],"env_vars":[],"retry":{"interval":"1m","max_attempts":1},"timeout_secs":20}`;
    const s = splitModelOutput(raw);
    expect(s.thinking).toContain("daily TODO");
    expect(s.body.startsWith("{")).toBe(true);
    expect(s.hasJson).toBe(true);
  });

  it("extracts <think> tags", () => {
    const s = splitModelOutput(
      `<think>plan A then B</think>\n{"name":"x","enabled":true,"schedule":{"mode":"daily","times":["09:00"]},"binary":"__callai_alarm__","args":[],"env_vars":[],"retry":{"interval":"1m","max_attempts":1},"timeout_secs":20}`,
    );
    expect(s.thinking).toBe("plan A then B");
    expect(s.hasJson).toBe(true);
  });

  it("extracts thinking fence", () => {
    const s = splitModelOutput(
      "```thinking\nstep one\n```\n\nHello world",
    );
    expect(s.thinking).toContain("step one");
    expect(s.body).toBe("Hello world");
  });

  it("keeps pure answer as body only", () => {
    const s = splitModelOutput("就这样定闹钟吧。");
    expect(s.thinking).toBe("");
    expect(s.body).toBe("就这样定闹钟吧。");
  });
});
