import { describe, expect, it } from "vitest";
import { scheduleTimeChips } from "./alarmRules";

describe("scheduleTimeChips", () => {
  it("shows all when few times", () => {
    const c = scheduleTimeChips({ mode: "daily", times: ["08:00", "13:00"] }, 2);
    expect(c.visible).toEqual(["08:00", "13:00"]);
    expect(c.overflow).toBe(0);
  });

  it("overflows with +N", () => {
    const c = scheduleTimeChips(
      { mode: "daily", times: ["08:00", "13:00", "18:00", "21:00"] },
      2,
    );
    expect(c.visible).toEqual(["08:00", "13:00"]);
    expect(c.overflow).toBe(2);
  });
});
