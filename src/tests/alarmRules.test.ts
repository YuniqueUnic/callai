import { describe, expect, it } from "vitest";
import {
  commandPreview,
  defaultDraft,
  scheduleLabel,
  validateDraft,
} from "../domain/alarmRules";

describe("alarmRules", () => {
  it("builds default draft", () => {
    const d = defaultDraft();
    expect(d.retry.max_attempts).toBe(3);
    expect(d.schedule.mode).toBe("daily");
  });

  it("validates required fields", () => {
    const d = defaultDraft();
    d.name = "";
    expect(validateDraft(d)).toBe("INVALID_NAME");
    d.name = "x";
    d.binary = "";
    expect(validateDraft(d)).toBe("INVALID_BINARY");
  });

  it("formats command preview", () => {
    expect(commandPreview("echo", ["a", "b"])).toBe("echo a b");
  });

  it("labels schedule", () => {
    expect(
      scheduleLabel({ mode: "daily", times: ["08:00"] }, "daily"),
    ).toContain("08:00");
  });
});
