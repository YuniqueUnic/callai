import classNames from "classnames";
import { useTranslation } from "react-i18next";
import type { PageId } from "../domain/types";
import { IconAlarm, IconSettings } from "./icons";

interface Props {
  active: Extract<PageId, "home" | "settings">;
  onChange: (page: "home" | "settings") => void;
}

export function BottomTabs({ active, onChange }: Props) {
  const { t } = useTranslation("common");
  return (
    <nav className="bottom-tabs" aria-label="main">
      <button
        type="button"
        className={classNames("bottom-tab", { active: active === "home" })}
        onClick={() => onChange("home")}
        aria-current={active === "home" ? "page" : undefined}
      >
        <span className="bottom-tab-icon">
          <IconAlarm size={22} />
        </span>
        <span>{t("tabAlarms")}</span>
      </button>
      <button
        type="button"
        className={classNames("bottom-tab", { active: active === "settings" })}
        onClick={() => onChange("settings")}
        aria-current={active === "settings" ? "page" : undefined}
      >
        <span className="bottom-tab-icon">
          <IconSettings size={22} />
        </span>
        <span>{t("tabSettings")}</span>
      </button>
    </nav>
  );
}
