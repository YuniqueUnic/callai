import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "animal-island-ui";
import { playTick, unlockAudio } from "./sounds";

interface Props {
  /** Total seconds (1–3600). */
  value: number;
  onChange: (secs: number) => void;
  min?: number;
  max?: number;
}

const MINUTES = Array.from({ length: 61 }, (_, i) => i); // 0–60
const SECONDS = Array.from({ length: 60 }, (_, i) => i); // 0–59

function clampTotal(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function split(total: number) {
  const t = Math.max(0, Math.round(total));
  const m = Math.min(60, Math.floor(t / 60));
  const s = Math.min(59, t % 60);
  return { m, s };
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/** Display like TimePicker: mm:ss (e.g. 00:20, 05:00). */
function formatClock(total: number): string {
  const { m, s } = split(total);
  return `${pad(m)}:${pad(s)}`;
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

export function DurationPicker({
  value,
  onChange,
  min = 1,
  max = 3600,
}: Props) {
  const { t } = useTranslation("alarms");
  const [open, setOpen] = useState(false);
  const total = clampTotal(value ?? 20, min, max);
  const parsed = useMemo(() => split(total), [total]);
  const [m, setM] = useState(parsed.m);
  const [s, setS] = useState(parsed.s);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });

  useEffect(() => {
    setM(parsed.m);
    setS(parsed.s);
  }, [parsed.m, parsed.s]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = Math.max(260, Math.min(320, rect.width + 120));
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
    return () => {
      document.removeEventListener("pointerdown", onDoc, true);
    };
  }, [open]);

  function commit(nextM = m, nextS = s) {
    let next = nextM * 60 + nextS;
    if (next < min) next = min;
    if (next > max) next = max;
    const parts = split(next);
    setM(parts.m);
    setS(parts.s);
    onChange(next);
  }

  const popup =
    open &&
    createPortal(
      <div
        ref={popupRef}
        className="time-picker-popup time-picker-popup-portal duration-picker-popup"
        role="dialog"
        aria-label={t("timeout")}
        style={{ top: pos.top, left: pos.left, width: pos.width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="duration-picker-labels">
          <span>{t("timeoutMin")}</span>
          <span />
          <span>{t("timeoutSec")}</span>
        </div>
        <div className="time-wheels">
          <WheelColumn
            items={MINUTES}
            value={m}
            label={t("timeoutMin")}
            onChange={(v) => {
              setM(v);
              commit(v, s);
              playTick();
            }}
          />
          <div className="time-wheel-colon">:</div>
          <WheelColumn
            items={SECONDS}
            value={s}
            label={t("timeoutSec")}
            onChange={(v) => {
              setS(v);
              commit(m, v);
              playTick();
            }}
          />
        </div>
        <div className="time-picker-actions">
          <Button size="small" type="primary" onClick={() => setOpen(false)}>
            {t("donePick")}
          </Button>
        </div>
      </div>,
      document.body,
    );

  return (
    <div className={`time-picker duration-picker ${open ? "is-open" : ""}`}>
      <div className="time-picker-row">
        <button
          ref={triggerRef}
          type="button"
          className="time-picker-trigger duration-picker-trigger"
          onClick={() => {
            void unlockAudio();
            setOpen((v) => !v);
          }}
          aria-expanded={open}
        >
          <span className="time-picker-value">{formatClock(total)}</span>
          <span className="time-picker-caret" aria-hidden>
            ▾
          </span>
        </button>
      </div>
      {popup}
    </div>
  );
}
