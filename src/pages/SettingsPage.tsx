import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input, Notification, Switch } from "animal-island-ui";
import type { AppSettings, LocaleCode, ThemeMode } from "../domain/types";
import { client } from "../infra/client";
import { applyTheme } from "../theme/theme";
import { ElementImage } from "../ui/ElementImage";

interface Props {
  onBack: () => void;
}

export function SettingsPage({ onBack }: Props) {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [backups, setBackups] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      setSettings(await client.getSettings());
      setBackups(await client.listBackups());
    })();
  }, []);

  async function save(next: AppSettings) {
    const saved = await client.saveSettings(next);
    setSettings(saved);
    applyTheme(saved.theme);
    if (saved.locale !== i18n.language) {
      await i18n.changeLanguage(saved.locale);
    }
    Notification.success({ message: t("settings:saved") });
  }

  if (!settings) {
    return <p className="app-main meta">{t("common:loading")}</p>;
  }

  return (
    <div>
      <div className="app-header">
        <div>
          <h1>{t("settings:title")}</h1>
        </div>
        <div className="header-actions">
          <Button onClick={onBack}>{t("common:back")}</Button>
        </div>
      </div>
      <div className="app-main">
        <div className="settings-card">
          <div className="field">
            <label className="row" style={{ gap: 10 }}>
              <ElementImage id="theme-light" size={36} alt="" />
              <ElementImage id="theme-dark" size={36} alt="" />
              <span>{t("common:theme")}</span>
            </label>
            <div className="segmented">
              {(
                [
                  ["system", "themeSystem"],
                  ["light", "themeLight"],
                  ["dark", "themeDark"],
                ] as const
              ).map(([mode, key]) => (
                <button
                  key={mode}
                  type="button"
                  className={settings.theme === mode ? "active" : ""}
                  onClick={() => {
                    const next = { ...settings, theme: mode as ThemeMode };
                    setSettings(next);
                    void save(next);
                  }}
                >
                  {t(`settings:${key}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="row" style={{ gap: 10 }}>
              <ElementImage id="chat-global" size={36} alt="" />
              <span>{t("common:language")}</span>
            </label>
            <div className="segmented">
              {(
                [
                  ["zh-CN", "localeZh"],
                  ["en", "localeEn"],
                ] as const
              ).map(([locale, key]) => (
                <button
                  key={locale}
                  type="button"
                  className={settings.locale === locale ? "active" : ""}
                  onClick={() => {
                    const next = { ...settings, locale: locale as LocaleCode };
                    setSettings(next);
                    void save(next);
                  }}
                >
                  {t(`settings:${key}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="field row">
            <Switch
              checked={settings.launch_minimized}
              onChange={(v) => {
                const next = { ...settings, launch_minimized: v };
                setSettings(next);
                void save(next);
              }}
            />
            <span>{t("settings:launchMinimized")}</span>
          </div>

          <div className="field row">
            <Switch
              checked={settings.notify_on_failure}
              onChange={(v) => {
                const next = { ...settings, notify_on_failure: v };
                setSettings(next);
                void save(next);
              }}
            />
            <span>{t("settings:notifyFailure")}</span>
          </div>

          <div className="field row">
            <Switch
              checked={settings.auto_backup_on_start}
              onChange={(v) => {
                const next = { ...settings, auto_backup_on_start: v };
                setSettings(next);
                void save(next);
              }}
            />
            <span>{t("settings:autoBackup")}</span>
          </div>

          <div className="field">
            <label>{t("settings:logRetention")}</label>
            <Input
              type="number"
              value={String(settings.log_retention_days)}
              onChange={(e) => {
                const n = Number(e.target.value) || 30;
                setSettings({ ...settings, log_retention_days: n });
              }}
              onBlur={() => void save(settings)}
              style={{ width: 120 }}
            />
          </div>

          <div className="field">
            <Button
              type="primary"
              onClick={async () => {
                const name = await client.backupNow();
                setBackups(await client.listBackups());
                Notification.success({
                  message: t("settings:backupNow"),
                  description: name || undefined,
                });
              }}
            >
              {t("settings:backupNow")}
            </Button>
          </div>

          <div className="field">
            <label>{t("settings:backups")}</label>
            {backups.length === 0 ? (
              <div className="meta">{t("common:empty")}</div>
            ) : (
              backups.map((b) => (
                <div className="row" key={b} style={{ marginBottom: 6 }}>
                  <span className="meta">{b}</span>
                  <Button
                    size="small"
                    onClick={async () => {
                      await client.restoreBackup(b);
                      Notification.success({ message: t("settings:restore") });
                    }}
                  >
                    {t("settings:restore")}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
