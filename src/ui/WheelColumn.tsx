import { useEffect, useRef, type KeyboardEvent } from "react";
import {
  WHEEL_ITEM_H,
  scrollWheelToIndex,
} from "./pickerScroll";

export interface WheelColumnProps<T extends string | number> {
  items: T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  /** Render cell content; default String(v) with 2-digit pad for numbers. */
  format?: (v: T) => string;
  className?: string;
  itemClassName?: string;
  /** Optional extra class on the scroller (focus styles). */
  scrollerClassName?: string;
}

function defaultFormat<T extends string | number>(v: T): string {
  if (typeof v === "number") return v.toString().padStart(2, "0");
  return String(v);
}

/**
 * Shared island wheel column (time / duration / timezone / provider).
 * Keyboard: ↑↓ / PageUp·PageDown / Home·End; auto-scrolls active value into band.
 */
export function WheelColumn<T extends string | number>({
  items,
  value,
  onChange,
  label,
  format = defaultFormat,
  className = "",
  itemClassName = "",
  scrollerClassName = "",
}: WheelColumnProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const itemH = WHEEL_ITEM_H;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = items.indexOf(value);
    if (idx >= 0) scrollWheelToIndex(el, idx, itemH, "auto");
  }, [value, items, itemH]);

  function selectIndex(idx: number, smooth = false) {
    const next = items[Math.min(items.length - 1, Math.max(0, idx))];
    if (next === undefined) return;
    if (next !== value) onChange(next);
    const el = ref.current;
    if (el) {
      scrollWheelToIndex(
        el,
        items.indexOf(next),
        itemH,
        smooth ? "smooth" : "auto",
      );
    }
  }

  function move(delta: number) {
    const idx = Math.max(0, items.indexOf(value));
    selectIndex(idx + delta, true);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault();
        e.stopPropagation();
        move(1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault();
        e.stopPropagation();
        move(-1);
        break;
      case "PageDown":
        e.preventDefault();
        e.stopPropagation();
        move(5);
        break;
      case "PageUp":
        e.preventDefault();
        e.stopPropagation();
        move(-5);
        break;
      case "Home":
        e.preventDefault();
        e.stopPropagation();
        selectIndex(0, true);
        break;
      case "End":
        e.preventDefault();
        e.stopPropagation();
        selectIndex(items.length - 1, true);
        break;
      default:
        break;
    }
  }

  return (
    <div
      className={["time-wheel-col", className].filter(Boolean).join(" ")}
      aria-label={label}
    >
      <div className="time-wheel-fade time-wheel-fade-top" />
      <div
        className={["time-wheel-scroller", scrollerClassName]
          .filter(Boolean)
          .join(" ")}
        ref={ref}
        tabIndex={0}
        role="listbox"
        aria-label={label}
        onKeyDown={onKeyDown}
        onScroll={() => {
          const el = ref.current;
          if (!el) return;
          const idx = Math.round(el.scrollTop / itemH);
          const next = items[Math.min(items.length - 1, Math.max(0, idx))];
          if (next !== undefined && next !== value) onChange(next);
        }}
      >
        <div className="time-wheel-pad" />
        {items.map((n, i) => (
          <button
            key={`${String(n)}-${i}`}
            type="button"
            role="option"
            aria-selected={n === value}
            data-wheel-idx={i}
            className={[
              "time-wheel-item",
              itemClassName,
              n === value ? "active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => {
              onChange(n);
              const el = ref.current;
              if (el) scrollWheelToIndex(el, i, itemH, "smooth");
            }}
          >
            {format(n)}
          </button>
        ))}
        <div className="time-wheel-pad" />
      </div>
      <div className="time-wheel-fade time-wheel-fade-bottom" />
      <div className="time-wheel-highlight" aria-hidden />
    </div>
  );
}

/** Focus the first wheel scroller inside a picker popup for keyboard use. */
export function focusFirstWheel(popup: HTMLElement | null): void {
  if (!popup) return;
  const scroller = popup.querySelector<HTMLElement>(".time-wheel-scroller");
  scroller?.focus({ preventScroll: true });
}

