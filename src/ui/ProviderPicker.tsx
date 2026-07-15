import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "animal-island-ui";
import type { AiProvider } from "../domain/types";
import { AI_PROVIDER_DEFAULTS } from "../domain/types";
import { playSound, playTick, unlockAudio } from "./sounds";

export const AI_PROVIDERS: AiProvider[] = [
  "openai",
  "claude",
  "gemini",
  "openai_compatible",
];

interface Props {
  value: AiProvider;
  onChange: (provider: AiProvider) => void;
}

function WheelList({
  items,
  value,
  labels,
  onChange,
  label,
}: {
  items: AiProvider[];
  value: AiProvider;
  labels: Record<AiProvider, string>;
  onChange: (v: AiProvider) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const itemH = 36;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, items.indexOf(value));
    el.scrollTop = idx * itemH;
  }, [value, items]);

  return (
    <div className="time-wheel-col provider-wheel-col" aria-label={label}>
      <div className="time-wheel-fade time-wheel-fade-top" />
      <div
        className="time-wheel-scroller"
        ref={ref}
        onScroll={() => {
          const el = ref.current;
          if (!el) return;
          const idx = Math.round(el.scrollTop / itemH);
          const next = items[Math.min(items.length - 1, Math.max(0, idx))];
          if (next !== value) onChange(next);
        }}
      >
        <div className="time-wheel-pad" />
        {items.map((p) => (
          <button
            key={p}
            type="button"
            className={`time-wheel-item provider-wheel-item ${p === value ? "active" : ""}`}
            onClick={() => {
              onChange(p);
              const el = ref.current;
              if (el) {
                const idx = items.indexOf(p);
                el.scrollTo({ top: idx * itemH, behavior: "smooth" });
              }
            }}
          >
            {labels[p]}
          </button>
        ))}
        <div className="time-wheel-pad" />
      </div>
      <div className="time-wheel-fade time-wheel-fade-bottom" />
      <div className="time-wheel-highlight" aria-hidden />
    </div>
  );
}

/** Gear-scroll provider picker, same interaction model as Time/Timezone pickers. */
export function ProviderPicker({ value, onChange }: Props) {
  const { t } = useTranslation(["settings", "common"]);
  const [open, setOpen] = useState(false);
  const items = useMemo(() => AI_PROVIDERS, []);
  const labels = useMemo(() => {
    const map = {} as Record<AiProvider, string>;
    for (const p of items) {
      map[p] = AI_PROVIDER_DEFAULTS[p].label;
    }
    return map;
  }, [items]);

  const current: AiProvider = items.includes(value) ? value : "openai";
  const [draft, setDraft] = useState<AiProvider>(current);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });

  useEffect(() => {
    setDraft(current);
  }, [current]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = Math.max(240, Math.min(320, rect.width + 24));
    let top = rect.bottom + 8;
    if (top + 260 > window.innerHeight) {
      top = Math.max(8, rect.top - 260);
    }
    setPos({
      top,
      left: Math.min(rect.left, window.innerWidth - width - 8),
      width,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => {
      const node = e.target as Node;
      if (triggerRef.current?.contains(node)) return;
      if (popupRef.current?.contains(node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc, true);
    return () => document.removeEventListener("pointerdown", onDoc, true);
  }, [open]);

  function commit(next: AiProvider = draft) {
    onChange(next);
    setOpen(false);
  }

  const display = labels[current];

  const popup =
    open &&
    createPortal(
      <div
        ref={popupRef}
        className="time-picker-popup time-picker-popup-portal provider-picker-popup"
        role="dialog"
        aria-label={t("settings:aiProvider")}
        style={{ top: pos.top, left: pos.left, width: pos.width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="timezone-picker-caption provider-picker-caption">
          {labels[draft]}
        </div>
        <div className="time-wheels provider-wheels">
          <WheelList
            items={items}
            value={draft}
            labels={labels}
            label={t("settings:aiProvider")}
            onChange={(p) => {
              setDraft(p);
              playTick();
            }}
          />
        </div>
        <div className="time-picker-actions">
          <Button
            size="small"
            type="primary"
            onClick={() => {
              playSound("confirm");
              commit();
            }}
          >
            {t("common:confirm")}
          </Button>
        </div>
      </div>,
      document.body,
    );

  return (
    <div className={`time-picker provider-picker ${open ? "is-open" : ""}`}>
      <div className="time-picker-row">
        <button
          ref={triggerRef}
          type="button"
          className="time-picker-trigger provider-picker-trigger"
          onClick={() => {
            void unlockAudio();
            setOpen((v) => !v);
          }}
          aria-expanded={open}
        >
          <span className="time-picker-value provider-picker-value">{display}</span>
          <span className="time-picker-caret" aria-hidden>
            ▾
          </span>
        </button>
      </div>
      {popup}
    </div>
  );
}
