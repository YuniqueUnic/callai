import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "animal-island-ui";
import { playSound, playTick, unlockAudio } from "./sounds";

interface Props {
  /** IANA name, or "system" */
  value: string;
  detected?: string;
  onChange: (tz: string) => void;
}

/** Curated IANA list (scrollable). "system" is injected at top. */
const ZONES: string[] = [
  "UTC",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Atlantic/Reykjavik",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function zoneLabel(tz: string, detected: string | undefined, systemLabel: string): string {
  if (!tz || tz === "system") {
    return detected ? `${systemLabel} · ${detected}` : systemLabel;
  }
  return tz;
}

function WheelList({
  items,
  value,
  onChange,
  label,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
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
    <div className="time-wheel-col timezone-wheel-col" aria-label={label}>
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
        {items.map((z) => (
          <button
            key={z}
            type="button"
            className={`time-wheel-item timezone-wheel-item ${z === value ? "active" : ""}`}
            onClick={() => {
              onChange(z);
              const el = ref.current;
              if (el) {
                const idx = items.indexOf(z);
                el.scrollTo({ top: idx * itemH, behavior: "smooth" });
              }
            }}
          >
            {z === "system" ? "system" : z}
          </button>
        ))}
        <div className="time-wheel-pad" />
      </div>
      <div className="time-wheel-fade time-wheel-fade-bottom" />
      <div className="time-wheel-highlight" aria-hidden />
    </div>
  );
}

export function TimezonePicker({ value, detected, onChange }: Props) {
  const { t } = useTranslation(["settings", "common"]);
  const [open, setOpen] = useState(false);
  const items = useMemo(() => {
    const list = ["system", ...ZONES];
    // ensure detected appears for scroll target even if not in curated list
    if (detected && !list.includes(detected)) {
      list.splice(1, 0, detected);
    }
    if (value && value !== "system" && !list.includes(value)) {
      list.splice(1, 0, value);
    }
    return list;
  }, [detected, value]);

  const current = !value || value === "system" ? "system" : value;
  const [draft, setDraft] = useState(current);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 300 });

  useEffect(() => {
    setDraft(current);
  }, [current]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = Math.max(280, Math.min(360, rect.width + 40));
    let top = rect.bottom + 8;
    if (top + 280 > window.innerHeight) {
      top = Math.max(8, rect.top - 280);
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

  function commit(next = draft) {
    onChange(next);
    setOpen(false);
  }

  const display = zoneLabel(
    current,
    detected,
    t("settings:timezoneSystem"),
  );

  const popup =
    open &&
    createPortal(
      <div
        ref={popupRef}
        className="time-picker-popup time-picker-popup-portal timezone-picker-popup"
        role="dialog"
        aria-label={t("settings:timezone")}
        style={{ top: pos.top, left: pos.left, width: pos.width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="timezone-picker-caption">
          {draft === "system"
            ? `${t("settings:timezoneSystem")}${detected ? ` · ${detected}` : ""}`
            : draft}
        </div>
        <div className="time-wheels timezone-wheels">
          <WheelList
            items={items}
            value={draft}
            label={t("settings:timezone")}
            onChange={(z) => {
              setDraft(z);
              playTick();
            }}
          />
        </div>
        <div className="time-picker-actions">
          <Button
            size="small"
            onClick={() => {
              playSound("soft");
              setDraft("system");
              commit("system");
            }}
          >
            {t("settings:timezoneSystem")}
          </Button>
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
    <div className={`time-picker timezone-picker ${open ? "is-open" : ""}`}>
      <div className="time-picker-row">
        <button
          ref={triggerRef}
          type="button"
          className="time-picker-trigger timezone-picker-trigger"
          onClick={() => {
            void unlockAudio();
            setOpen((v) => !v);
          }}
          aria-expanded={open}
        >
          <span className="time-picker-value timezone-picker-value">{display}</span>
          <span className="time-picker-caret" aria-hidden>
            ▾
          </span>
        </button>
      </div>
      {popup}
    </div>
  );
}
