/** Keep a child fully visible inside a scrollable container (listbox/dropdown). */
export function scrollChildIntoContainer(
  root: HTMLElement,
  child: HTMLElement,
  pad = 4,
): void {
  const rootRect = root.getBoundingClientRect();
  const elRect = child.getBoundingClientRect();
  if (elRect.bottom > rootRect.bottom - pad) {
    root.scrollTop += elRect.bottom - rootRect.bottom + pad;
  } else if (elRect.top < rootRect.top + pad) {
    root.scrollTop -= rootRect.top - elRect.top + pad;
  }
}

/** Scroll a wheel scroller so `index` sits on the center band (itemH rows). */
export function scrollWheelToIndex(
  scroller: HTMLElement,
  index: number,
  itemH = 36,
  behavior: ScrollBehavior = "auto",
): void {
  const top = Math.max(0, index) * itemH;
  if (behavior === "smooth") {
    scroller.scrollTo({ top, behavior });
  } else {
    scroller.scrollTop = top;
  }
}

export const WHEEL_ITEM_H = 36;
