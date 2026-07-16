import { describe, expect, it } from "vitest";
import { scrollChildIntoContainer, scrollWheelToIndex } from "../ui/pickerScroll";

describe("scrollWheelToIndex", () => {
  it("sets scrollTop to index * itemH", () => {
    const el = { scrollTop: 0, scrollTo: null as unknown } as unknown as HTMLElement & {
      scrollTop: number;
    };
    scrollWheelToIndex(el, 3, 36, "auto");
    expect(el.scrollTop).toBe(108);
  });
});

describe("scrollChildIntoContainer", () => {
  it("scrolls down when child is below container bottom", () => {
    const root = {
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 100, bottom: 200, left: 0, right: 100 }),
    } as unknown as HTMLElement;
    const child = {
      getBoundingClientRect: () => ({ top: 180, bottom: 220, left: 0, right: 100 }),
    } as unknown as HTMLElement;
    scrollChildIntoContainer(root, child, 4);
    expect(root.scrollTop).toBe(24); // 220 - 200 + 4
  });

  it("scrolls up when child is above container top", () => {
    const root = {
      scrollTop: 50,
      getBoundingClientRect: () => ({ top: 100, bottom: 200, left: 0, right: 100 }),
    } as unknown as HTMLElement;
    const child = {
      getBoundingClientRect: () => ({ top: 80, bottom: 110, left: 0, right: 100 }),
    } as unknown as HTMLElement;
    scrollChildIntoContainer(root, child, 4);
    expect(root.scrollTop).toBe(26); // 50 - (100 - 80 + 4) = 26
  });
});
