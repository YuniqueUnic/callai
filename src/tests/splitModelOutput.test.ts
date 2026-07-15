import { describe, expect, it } from "vitest";
import {
  isFenceOnlyPreamble,
  peelOutputFenceOpeners,
  splitModelOutput,
} from "../ai/splitModelOutput";
import { isLikelyTruncatedOutput, stitchContinuation } from "../ai/generate";

describe("splitModelOutput", () => {
  it("splits prose before JSON as thinking", () => {
    const raw = `The user wants a daily TODO alarm at 16:50.

{"name":"TODO铃","enabled":true,"schedule":{"mode":"daily","times":["16:50"]},"binary":"__callai_alarm__","args":["写 TODO"],"env_vars":[],"retry":{"interval":"1m","max_attempts":1},"timeout_secs":20}`;
    const s = splitModelOutput(raw);
    expect(s.thinking).toContain("daily TODO");
    expect(s.body.startsWith("{")).toBe(true);
    expect(s.hasJson).toBe(true);
  });

  it("does not treat ```json fence as thinking", () => {
    const raw = "```json\n{\"name\":\"x\",\"enabled\":true,\"schedule\":{\"mode\":\"daily\",\"times\":[\"09:00\"]},\"binary\":\"__callai_alarm__\",\"args\":[],\"env_vars\":[],\"retry\":{\"interval\":\"1m\",\"max_attempts\":1},\"timeout_secs\":20}";
    const s = splitModelOutput(raw);
    expect(s.thinking).toBe("");
    expect(s.body).toContain('"name"');
    expect(s.hasJson).toBe(true);
  });

  it("keeps prose thinking and peels ```json opener", () => {
    const raw = `先确认时间是下午 4:50。

\`\`\`json
{"name":"铃","enabled":true,"schedule":{"mode":"daily","times":["16:50"]},"binary":"__callai_alarm__","args":[],"env_vars":[],"retry":{"interval":"1m","max_attempts":1},"timeout_secs":20}`;
    const s = splitModelOutput(raw);
    expect(s.thinking).toContain("4:50");
    expect(s.thinking).not.toContain("```");
    expect(s.body).toContain('"16:50"');
  });

  it("extracts unclosed <think> mid-stream", () => {
    const s = splitModelOutput(
      `<think>用户要一个插件，我先规划布局和 storage…`,
    );
    expect(s.thinking).toContain("规划布局");
    expect(s.body).toBe("");
  });

  it("extracts unclosed ```thinking fence mid-stream", () => {
    const s = splitModelOutput(
      "```thinking\nstep one: parse schedule\nstep two: pick binary",
    );
    expect(s.thinking).toContain("step one");
    expect(s.thinking).toContain("step two");
  });

  it("extracts closed <think> tags", () => {
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

describe("peelOutputFenceOpeners / isFenceOnlyPreamble", () => {
  it("detects fence-only", () => {
    expect(isFenceOnlyPreamble("```json")).toBe(true);
    expect(isFenceOnlyPreamble("```\n```json")).toBe(true);
    expect(isFenceOnlyPreamble("hello")).toBe(false);
  });
  it("peels trailing fence", () => {
    const { prose, fence } = peelOutputFenceOpeners("分析一下\n```json\n");
    expect(prose).toContain("分析");
    expect(fence).toContain("```");
  });
});

describe("isLikelyTruncatedOutput", () => {
  it("detects unfinished JSON string", () => {
    expect(isLikelyTruncatedOutput('{"ui_html":"<html> partial')).toBe(true);
  });
  it("accepts balanced JSON", () => {
    expect(isLikelyTruncatedOutput('{"name":"x","enabled":true}')).toBe(false);
  });
  it("detects callai truncated marker", () => {
    expect(
      isLikelyTruncatedOutput("hello\n\n/* callai: truncated finish_reason=length */"),
    ).toBe(true);
  });
});

describe("stitchContinuation", () => {
  it("appends clean suffix", () => {
    expect(stitchContinuation("hello ", "world")).toBe("hello world");
  });
  it("dedupes overlapping restart", () => {
    expect(stitchContinuation("aaa_overlap_tail_here", "overlap_tail_here!!!")).toBe(
      "aaa_overlap_tail_here!!!",
    );
  });
});
