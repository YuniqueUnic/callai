import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "animal-island-ui";

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
    if (idx >= 0) {
      el.scrollTop = idx * itemH;
    }
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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setH(parsed.h);
    setM(parsed.m);
  }, [parsed.h, parsed.m]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function commit(nextH = h, nextM = m) {
    onChange(`${pad(nextH)}:${pad(nextM)}`);
  }

  return (
    <div className="time-picker" ref={rootRef}>
      <div className="time-picker-row">
        <button
          type="button"
          className="time-picker-trigger"
          onClick={() => setOpen((v) => !v)}
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
              commit();
              onAdd();
            }}
          >
            {addLabel ?? t("addTime")}
          </Button>
        )}
      </div>

      {open && (
        <div className="time-picker-popup" role="dialog" aria-label={t("pickTime")}>
          <div className="time-wheels">
            <WheelColumn
              items={HOURS}
              value={h}
              label="hour"
              onChange={(v) => {
                setH(v);
                commit(v, m);
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
              }}
            />
          </div>
          <div className="time-picker-actions">
            <Button size="small" onClick={() => setOpen(false)}>
              {t("donePick")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
