import classNames from "classnames";
import { useTranslation } from "react-i18next";
import type { PageId } from "../domain/types";

interface Props {
  active: Extract<PageId, "home" | "settings">;
  onChange: (page: "home" | "settings") => void;
}

function IconAlarm({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="13" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M12 10v3.5l2 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 5l2.5 2.2M19 5l-2.5 2.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {active ? <circle cx="12" cy="13" r="1.5" fill="currentColor" /> : null}
    </svg>
  );
}

function IconSettings({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 3v2.2M12 18.8V21M4.9 6.5l1.6 1.5M17.5 16l1.6 1.5M3 12h2.2M18.8 12H21M4.9 17.5l1.6-1.5M17.5 8l1.6-1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity={active ? 1 : 0.95}
      />
    </svg>
  );
}

export function BottomTabs({ active, onChange }: Props) {
  const { t } = useTranslation("common");
  return (
    <nav className="bottom-tabs" aria-label="main">
      <button
        type="button"
        className={classNames("bottom-tab", { active: active === "home" })}
        onClick={() => onChange("home")}
      >
        <IconAlarm active={active === "home"} />
        <span>{t("tabAlarms")}</span>
      </button>
      <button
        type="button"
        className={classNames("bottom-tab", { active: active === "settings" })}
        onClick={() => onChange("settings")}
      >
        <IconSettings active={active === "settings"} />
        <span>{t("tabSettings")}</span>
      </button>
    </nav>
  );
}
