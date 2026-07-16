import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "animal-island-ui";
import { WheelColumn, focusFirstWheel } from "./WheelColumn";
import { playSound, playTick, unlockAudio } from "./sounds";

interface Props {
  /** IANA name, or "system" */
  value: string;
  detected?: string;
  onChange: (tz: string) => void;
}

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

export function TimezonePicker({ value, detected, onChange }: Props) {
  const { t } = useTranslation(["settings", "common"]);
  const [open, setOpen] = useState(false);
  const items = useMemo(() => {
    const list = ["system", ...ZONES];
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

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() =>
      focusFirstWheel(popupRef.current),
    );
    return () => window.cancelAnimationFrame(id);
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
          <WheelColumn
            items={items}
            value={draft}
            label={t("settings:timezone")}
            className="timezone-wheel-col"
            itemClassName="timezone-wheel-item"
            format={(z) => (z === "system" ? "system" : z)}
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
