import { describe, expect, it } from "vitest";
import { formatDateTime, nextTriggerProgress, remainingLabel } from "./format";

describe("formatDateTime", () => {
  it("formats valid iso", () => {
    const s = formatDateTime("2026-07-12T16:00:00+08:00", "zh-CN");
    expect(s.length).toBeGreaterThan(4);
    expect(s).not.toMatch(/AM|PM/);
  });

  it("returns original on invalid", () => {
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
  });
});

describe("nextTriggerProgress", () => {
  it("returns 0 when missing", () => {
    expect(nextTriggerProgress(null)).toBe(0);
  });

  it("returns high percent when almost due", () => {
    const soon = new Date(Date.now() + 5 * 60_000).toISOString();
    expect(nextTriggerProgress(soon)).toBeGreaterThan(95);
  });

  it("returns low percent when far away", () => {
    const far = new Date(Date.now() + 20 * 60 * 60_000).toISOString();
    expect(nextTriggerProgress(far)).toBeLessThan(25);
  });
});

describe("remainingLabel", () => {
  it("shows minutes in zh", () => {
    const soon = new Date(Date.now() + 12 * 60_000).toISOString();
    expect(remainingLabel(soon, "zh-CN")).toMatch(/分钟/);
  });
});
