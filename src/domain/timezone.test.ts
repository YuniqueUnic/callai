import { describe, expect, it } from "vitest";
import {
  formatNowInTimezone,
  isSystemTimezoneSetting,
  peekResolvedTimezone,
} from "./timezone";

describe("timezone helpers", () => {
  it("detects system tokens", () => {
    expect(isSystemTimezoneSetting("system")).toBe(true);
    expect(isSystemTimezoneSetting("auto")).toBe(true);
    expect(isSystemTimezoneSetting("Asia/Shanghai")).toBe(false);
  });

  it("peeks explicit IANA", () => {
    expect(peekResolvedTimezone("Asia/Shanghai")).toBe("Asia/Shanghai");
  });

  it("formats now in zone", () => {
    const s = formatNowInTimezone("UTC");
    expect(s).toMatch(/UTC|GMT|\+00/);
  });
});
