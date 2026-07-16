import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Input } from "animal-island-ui";
import { scrollChildIntoContainer } from "./pickerScroll";
import { playTick } from "./sounds";

export function filterSuggest(
  options: string[],
  query: string,
  limit = 48,
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return options.slice(0, limit);
  const starts: string[] = [];
  const contains: string[] = [];
  for (const m of options) {
    const low = m.toLowerCase();
    if (low.startsWith(q)) starts.push(m);
    else if (low.includes(q)) contains.push(m);
  }
  return [...starts, ...contains].slice(0, limit);
}

interface Props {
  value: string;
  options: string[];
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  /** When true, typed free-form value stays selectable as first row. */
  allowCustom?: boolean;
  emptyLabel?: string;
  "aria-label"?: string;
}

/**
 * Shared island autocomplete (same portal dropdown UX as ModelAutocomplete).
 * Use for ENV keys, tags, free-form pickers.
 */
function SuggestInputImpl({
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  className,
  inputClassName,
  allowCustom = true,
  emptyLabel = "—",
  "aria-label": ariaLabel,
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [pos, setPos] = useState({ top: -9999, left: 0, width: 200 });
  const [placed, setPlaced] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    setText(value);
  }, [value]);

  const filtered = useMemo(
    () => filterSuggest(options, text, 48),
    [options, text],
  );

  const list = useMemo(() => {
    const base = filtered.length > 0 ? filtered : options.slice(0, 48);
    if (!allowCustom) return base;
    const q = text.trim();
    if (!q) return base;
    const has = base.some((m) => m.toLowerCase() === q.toLowerCase());
    return has ? base : [q, ...base];
  }, [filtered, options, text, allowCustom]);

  useEffect(() => {
    setActiveIdx(0);
  }, [text, options]);

  useEffect(() => {
    setActiveIdx((i) => {
      if (list.length === 0) return 0;
      return Math.min(i, list.length - 1);
    });
  }, [list]);

  useLayoutEffect(() => {
    if (!open) return;
    const root = dropdownRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(
      `[data-suggest-idx="${activeIdx}"]`,
    );
    if (!el) return;
    scrollChildIntoContainer(root, el);
  }, [activeIdx, open, list]);

  const placeDropdown = () => {
    const el = inputWrapRef.current ?? wrapRef.current;
    const maxH = 220;
    const gap = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!el) return;

    const inputEl = el.querySelector("input");
    const rect = (inputEl ?? el).getBoundingClientRect();
    if (rect.width < 2 && rect.height < 2) return;

    const width = Math.min(Math.max(rect.width, 160), Math.max(160, vw - 16));
    const dd = dropdownRef.current;
    let ddH = maxH;
    if (dd) {
      const raw = dd.offsetHeight || dd.getBoundingClientRect().height;
      if (raw > 8) ddH = Math.min(maxH, raw);
    } else {
      ddH = Math.min(maxH, Math.max(1, Math.min(48, list.length || 6)) * 36 + 16);
    }

    const spaceBelow = vh - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUp = spaceBelow < ddH + 12 && spaceAbove >= spaceBelow;
    let top = openUp ? rect.top - ddH - gap : rect.bottom + gap;
    top = Math.min(Math.max(8, top), Math.max(8, vh - Math.min(ddH, 120) - 8));

    let left = rect.left;
    if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
    if (left < 8) left = 8;

    setPos({ top, left, width });
    setPlaced(true);
  };

  useLayoutEffect(() => {
    if (!open) {
      setPlaced(false);
      return;
    }
    placeDropdown();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      placeDropdown();
      raf2 = requestAnimationFrame(() => placeDropdown());
    });
    const onReposition = () => placeDropdown();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, list.length, text]);

  useEffect(() => {
    if (!open) return;
    let ready = false;
    const arm = window.setTimeout(() => {
      ready = true;
    }, 180);
    const onDoc = (e: Event) => {
      if (!ready) return;
      const node = e.target as Node;
      if (wrapRef.current?.contains(node)) return;
      if (dropdownRef.current?.contains(node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc, true);
    return () => {
      window.clearTimeout(arm);
      document.removeEventListener("pointerdown", onDoc, true);
    };
  }, [open]);

  function commit(next: string) {
    setText(next);
    onChangeRef.current(next);
    setOpen(false);
    playTick();
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (list.length === 0) return;
      setOpen(true);
      setActiveIdx((i) => Math.min(list.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (list.length === 0) return;
      setOpen(true);
      setActiveIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Home" && open && list.length > 0) {
      e.preventDefault();
      setActiveIdx(0);
      return;
    }
    if (e.key === "End" && open && list.length > 0) {
      e.preventDefault();
      setActiveIdx(list.length - 1);
      return;
    }
    if (e.key === "Enter" && open && list.length > 0) {
      e.preventDefault();
      const pick = list[Math.min(activeIdx, list.length - 1)];
      if (pick) commit(pick);
      return;
    }
    if (e.key === "Tab" && open && list.length > 0) {
      const pick = list[Math.min(activeIdx, list.length - 1)];
      if (pick && pick !== text) commit(pick);
    }
  }

  const dropdown =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={dropdownRef}
            id={listId}
            role="listbox"
            className="model-ac-dropdown model-ac-dropdown-portal"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: 220,
              zIndex: 40000,
              opacity: placed ? 1 : 0,
              pointerEvents: placed ? "auto" : "none",
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {list.length === 0 ? (
              <div className="model-ac-empty" role="presentation">
                {emptyLabel}
              </div>
            ) : (
              list.map((m, i) => (
                <button
                  key={`${m}-${i}`}
                  type="button"
                  role="option"
                  data-suggest-idx={i}
                  aria-selected={m === text || i === activeIdx}
                  className={`model-ac-option ${
                    m === text || i === activeIdx ? "active" : ""
                  }`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    commit(m);
                  }}
                >
                  {m}
                </button>
              ))
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className={["model-ac", "suggest-ac", className].filter(Boolean).join(" ")}
      ref={wrapRef}
      onPointerDown={() => {
        if (disabled) return;
        setOpen(true);
      }}
    >
      <div className="model-ac-input-wrap" ref={inputWrapRef}>
        <Input
          className={inputClassName}
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            onChangeRef.current(v);
            setOpen(true);
          }}
          onKeyDown={onInputKeyDown}
        />
      </div>
      {dropdown}
    </div>
  );
}

export const SuggestInput = memo(SuggestInputImpl);
