import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "animal-island-ui";
import type { AiProvider } from "../domain/types";
import { AI_PROVIDER_DEFAULTS } from "../domain/types";
import { WheelColumn, focusFirstWheel } from "./WheelColumn";
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

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() =>
      focusFirstWheel(popupRef.current),
    );
    return () => window.cancelAnimationFrame(id);
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
          <WheelColumn
            items={items}
            value={draft}
            label={t("settings:aiProvider")}
            className="provider-wheel-col"
            itemClassName="provider-wheel-item"
            format={(p) => labels[p]}
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
