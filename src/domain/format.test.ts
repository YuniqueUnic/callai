import { describe, expect, it } from "vitest";
import { formatDateTime } from "./format";

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
