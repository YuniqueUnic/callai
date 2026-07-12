import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "animal-island-ui";
import { playSound, playTick, unlockAudio } from "./sounds";

interface Props {
  value: string; // HH:mm
  onChange: (value: string) => void;
  onAdd?: () => void;
  addLabel?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function parse(value: string): { h: number; m: number } {
  const [hs, ms] = (value || "09:00").split(":");
  const h = Math.min(23, Math.max(0, Number(hs) || 0));
  const m = Math.min(59, Math.max(0, Number(ms) || 0));
  return { h, m };
}

function WheelColumn({
  items,
  value,
  onChange,
  label,
}: {
  items: number[];
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const itemH = 36;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = items.indexOf(value);
    if (idx >= 0) el.scrollTop = idx * itemH;
  }, [value, items]);

  return (
    <div className="time-wheel-col" aria-label={label}>
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
        {items.map((n) => (
          <button
            key={n}
            type="button"
            className={`time-wheel-item ${n === value ? "active" : ""}`}
            onClick={() => {
              onChange(n);
              const el = ref.current;
              if (el) {
                const idx = items.indexOf(n);
                el.scrollTo({ top: idx * itemH, behavior: "smooth" });
              }
            }}
          >
            {pad(n)}
          </button>
        ))}
        <div className="time-wheel-pad" />
      </div>
      <div className="time-wheel-fade time-wheel-fade-bottom" />
      <div className="time-wheel-highlight" aria-hidden />
    </div>
  );
}

export function TimePicker({ value, onChange, onAdd, addLabel }: Props) {
  const { t } = useTranslation("alarms");
  const [open, setOpen] = useState(false);
  const parsed = useMemo(() => parse(value), [value]);
  const [h, setH] = useState(parsed.h);
  const [m, setM] = useState(parsed.m);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });

  useEffect(() => {
    setH(parsed.h);
    setM(parsed.m);
  }, [parsed.h, parsed.m]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = Math.max(260, Math.min(320, rect.width + 120));
    let top = rect.bottom + 8;
    // if near bottom, open above
    if (top + 240 > window.innerHeight) {
      top = Math.max(8, rect.top - 240);
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
    // capture phase so card click/focus cannot steal and thrash the popup
    document.addEventListener("pointerdown", onDoc, true);
    return () => {
      document.removeEventListener("pointerdown", onDoc, true);
    };
  }, [open]);

  function commit(nextH = h, nextM = m) {
    onChange(`${pad(nextH)}:${pad(nextM)}`);
  }

  const popup =
    open &&
    createPortal(
      <div
        ref={popupRef}
        className="time-picker-popup time-picker-popup-portal"
        role="dialog"
        aria-label={t("pickTime")}
        style={{ top: pos.top, left: pos.left, width: pos.width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="time-wheels">
          <WheelColumn
            items={HOURS}
            value={h}
            label="hour"
            onChange={(v) => {
              setH(v);
              commit(v, m);
              playTick();
            }}
          />
          <div className="time-wheel-colon">:</div>
          <WheelColumn
            items={MINUTES}
            value={m}
            label="minute"
            onChange={(v) => {
              setM(v);
              commit(h, v);
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
              setOpen(false);
            }}
          >
            {t("donePick")}
          </Button>
        </div>
      </div>,
      document.body,
    );

  return (
    <div className={`time-picker ${open ? "is-open" : ""}`}>
      <div className="time-picker-row">
        <button
          ref={triggerRef}
          type="button"
          className="time-picker-trigger"
          onClick={() => {
            void unlockAudio();
            setOpen((v) => !v);
          }}
          aria-expanded={open}
        >
          <span className="time-picker-value">{value || "09:00"}</span>
          <span className="time-picker-caret" aria-hidden>
            ▾
          </span>
        </button>
        {onAdd && (
          <Button
            size="small"
            type="primary"
            onClick={() => {
              playSound("confirm");
              commit();
              onAdd();
              setOpen(false);
            }}
          >
            {addLabel ?? t("addTime")}
          </Button>
        )}
      </div>
      {popup}
    </div>
  );
}
