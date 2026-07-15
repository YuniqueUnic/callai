import { describe, expect, it } from "vitest";
import { isModEnter, isPrimarySendKey } from "../ai/sendKeyMode";

describe("send key mode", () => {
  it("enter mode sends on bare Enter", () => {
    expect(
      isPrimarySendKey(
        { key: "Enter", metaKey: false, ctrlKey: false, shiftKey: false },
        "enter",
      ),
    ).toBe(true);
    expect(
      isPrimarySendKey(
        { key: "Enter", metaKey: false, ctrlKey: false, shiftKey: true },
        "enter",
      ),
    ).toBe(false);
  });

  it("mod_enter requires modifier", () => {
    expect(
      isPrimarySendKey(
        { key: "Enter", metaKey: false, ctrlKey: false, shiftKey: false },
        "mod_enter",
      ),
    ).toBe(false);
    expect(
      isPrimarySendKey(
        { key: "Enter", metaKey: false, ctrlKey: true, shiftKey: false },
        "mod_enter",
      ),
    ).toBe(true);
  });

  it("isModEnter detects ctrl", () => {
    expect(isModEnter({ key: "Enter", metaKey: false, ctrlKey: true })).toBe(
      true,
    );
    expect(isModEnter({ key: "Enter", metaKey: false, ctrlKey: false })).toBe(
      false,
    );
  });
});
