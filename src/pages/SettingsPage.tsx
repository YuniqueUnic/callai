import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input, Modal, Switch } from "animal-island-ui";
import { toast } from "../ui/toast";
import type { AppSettings, LocaleCode, ThemeMode } from "../domain/types";
import { client } from "../infra/client";
import { applyTheme } from "../theme/theme";
import { ElementImage } from "../ui/ElementImage";
import { TimezonePicker } from "../ui/TimezonePicker";
import { IconButton } from "../ui/IconButton";
import { IconLogs, IconRestore, IconTrash } from "../ui/icons";
import { playSound, setSoundEnabled, unlockAudio } from "../ui/sounds";
import { isTauri } from "../infra/tauriApi";
import { checkForAppUpdate } from "../infra/updater";

async function ensureNotifyPermission(): Promise<boolean> {
  if (!isTauri()) return true;
  try {
    const { isPermissionGranted, requestPermission } = await import(
      "@tauri-apps/plugin-notification"
    );
    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === "granted";
    }
    return granted;
  } catch {
    return false;
  }
}

interface Props {
  onOpenLogs: () => void;
}

export function SettingsPage({ onOpenLogs }: Props) {
  const { t, i18n } = useTranslation(["settings", "common", "alarms"]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [backups, setBackups] = useState<string[]>([]);
  const [confirmDeleteBackup, setConfirmDeleteBackup] = useState<string | null>(
    null,
  );
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<string | null>(null);
  const [pendingInstall, setPendingInstall] = useState<null | (() => Promise<void>)>(null);
  const [detectedTz, setDetectedTz] = useState<string>("");

  useEffect(() => {
    void (async () => {
      setSettings(await client.getSettings());
      setBackups(await client.listBackups());
      try {
        setDetectedTz(await client.detectTimezone());
      } catch {
        setDetectedTz(
          Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        );
      }
    })();
  }, []);

  async function save(next: AppSettings) {
    const saved = await client.saveSettings(next);
    setSettings(saved);
    applyTheme(saved.theme);
    if (saved.locale !== i18n.language) {
      await i18n.changeLanguage(saved.locale);
    }
    toast.success({ message: t("settings:saved"), key: "settings-save", duration: 2.6 });
  }

  if (!settings) {
    return <p className="app-main meta">{t("common:loading")}</p>;
  }

  return (
    <div className="settings-page">
      {/* Bold decorative bird — absolute corner, not inline chrome */}
      <ElementImage
        id="multi-device"
        size={120}
        alt=""
        motion="breathe"
        className="settings-hero-deco"
      />

      <header className="settings-hero">
        <h1>{t("settings:title")}</h1>
        <p>{t("common:tagline")}</p>
      </header>

      <div className="app-main settings-main">
        <div className="settings-card">
          <div className="field">
            <div className="panel-head">
              <label className="label">{t("common:theme")}</label>
              <span className="row deco-mini">
                <ElementImage id="theme-light" size={26} alt="" />
                <ElementImage id="theme-dark" size={26} alt="" />
              </span>
            </div>
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
            <div className="panel-head">
              <label className="label">{t("common:language")}</label>
              <ElementImage id="chat-global" size={26} alt="" className="deco-mini" />
            </div>
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

          <div className="field">
            <label className="label">{t("settings:timezone")}</label>
            <div style={{ marginTop: 8 }}>
              <TimezonePicker
                value={settings.timezone || "system"}
                detected={detectedTz}
                onChange={(tz) => {
                  const next = { ...settings, timezone: tz };
                  setSettings(next);
                  void save(next);
                }}
              />
            </div>
          </div>

          <div className="settings-row">
            <span>{t("settings:launchMinimized")}</span>
            <Switch
              checked={settings.launch_minimized}
              onChange={(v) => {
                const next = { ...settings, launch_minimized: v };
                setSettings(next);
                void save(next);
              }}
            />
          </div>

          <div className="settings-row">
            <span>{t("settings:notifyFailure")}</span>
            <Switch
              checked={settings.notify_on_failure}
              onChange={(v) => {
                void (async () => {
                  if (v) {
                    const ok = await ensureNotifyPermission();
                    if (!ok) {
                      toast.warning({
                        message: t("settings:notifyPermissionTitle"),
                        description: t("settings:notifyPermissionBody"),
                      });
                      return;
                    }
                  }
                  const next = { ...settings, notify_on_failure: v };
                  setSettings(next);
                  void save(next);
                })();
              }}
            />
          </div>


          <div className="settings-row">
            <span>{t("settings:soundEnabled")}</span>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <Button
                size="small"
                onClick={() => {
                  void unlockAudio().then(() => {
                    setSoundEnabled(true);
                    playSound("success");
                  });
                }}
              >
                {t("settings:soundPreview")}
              </Button>
              <Switch
                checked={settings.sound_enabled !== false}
                onChange={(v) => {
                  void unlockAudio();
                  setSoundEnabled(v);
                  const next = { ...settings, sound_enabled: v };
                  setSettings(next);
                  void save(next);
                  if (v) playSound("soft");
                }}
              />
            </div>
          </div>

          <div className="settings-row">
            <span>{t("settings:autoBackup")}</span>
            <Switch
              checked={settings.auto_backup_on_start}
              onChange={(v) => {
                const next = { ...settings, auto_backup_on_start: v };
                setSettings(next);
                void save(next);
              }}
            />
          </div>

          <div className="field">
            <label className="label">{t("settings:logRetention")}</label>
            <Input
              type="number"
              value={String(settings.log_retention_days)}
              onChange={(e) => {
                const n = Number(e.target.value) || 30;
                setSettings({ ...settings, log_retention_days: n });
              }}
              onBlur={() => void save(settings)}
              style={{ width: "100%", maxWidth: 160 }}
            />
          </div>

          <div className="field">
            <Button
              type="primary"
              block
              onClick={async () => {
                const name = await client.backupNow();
                setBackups(await client.listBackups());
                toast.success({
                  message: t("settings:backupNow"),
                  description: name || undefined,
                });
              }}
            >
              {t("settings:backupNow")}
            </Button>
          </div>

          <div className="field">
            <label className="label">{t("settings:backups")}</label>
            {backups.length === 0 ? (
              <div className="meta">{t("common:empty")}</div>
            ) : (
              backups.map((b) => (
                <div className="backup-item" key={b}>
                  <span className="meta" title={b}>
                    {b}
                  </span>
                  <div className="row icon-actions">
                    <IconButton
                      label={t("settings:restore")}
                      icon={<IconRestore size={16} />}
                      onClick={async () => {
                        await client.restoreBackup(b);
                        toast.success({
                          message: t("settings:restore"),
                        });
                      }}
                    />
                    <IconButton
                      label={t("settings:deleteBackup")}
                      icon={<IconTrash size={16} />}
                      variant="danger"
                      onClick={() => setConfirmDeleteBackup(b)}
                    />
                  </div>
                </div>
              ))
            )}
          </div>


          <div className="field">
            <div className="panel-head">
              <label className="label">{t("settings:updateSection")}</label>
            </div>
            {updateInfo ? (
              <div className="meta" style={{ marginBottom: 8 }}>
                {updateInfo}
              </div>
            ) : null}
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Button
                type="default"
                disabled={updateBusy}
                onClick={() => {
                  void (async () => {
                    setUpdateBusy(true);
                    try {
                      const res = await checkForAppUpdate();
                      if (res.status === "unsupported") {
                        setUpdateInfo(t("settings:updateUnsupported"));
                        return;
                      }
                      if (res.status === "upToDate") {
                        setUpdateInfo(t("settings:updateUpToDate"));
                        toast.success({ message: t("settings:updateUpToDate") });
                        return;
                      }
                      if (res.status === "error") {
                        setUpdateInfo(res.message);
                        toast.error({
                          message: t("settings:updateError"),
                          description: res.message,
                        });
                        return;
                      }
                      setUpdateInfo(
                        t("settings:updateAvailable", { version: res.version }),
                      );
                      toast.success({
                        message: t("settings:updateAvailable", {
                          version: res.version,
                        }),
                        description: res.body || undefined,
                      });
                      setPendingInstall(() => res.install);
                    } finally {
                      setUpdateBusy(false);
                    }
                  })();
                }}
              >
                {updateBusy ? t("settings:checkingUpdate") : t("settings:checkUpdate")}
              </Button>
              <Button
                type="primary"
                disabled={updateBusy}
                onClick={() => {
                  if (!pendingInstall) {
                    toast.warning({ message: t("settings:checkUpdate") });
                    return;
                  }
                  void (async () => {
                    setUpdateBusy(true);
                    toast.success({ message: t("settings:updateInstalling") });
                    try {
                      await pendingInstall();
                      toast.success({ message: t("settings:updateDone") });
                      setUpdateInfo(t("settings:updateDone"));
                    } catch (err) {
                      toast.error({
                        message: t("settings:updateError"),
                        description: String(
                          (err as { message?: string })?.message ?? err,
                        ),
                      });
                    } finally {
                      setUpdateBusy(false);
                    }
                  })();
                }}
              >
                {t("settings:updateInstall")}
              </Button>
            </div>
          </div>

          <div className="settings-logs-entry">
            <div className="settings-logs-copy">
              <ElementImage id="logs-clipboard" size={36} alt="" />
              <div>
                <div className="label">{t("alarms:openLogsFromSettings")}</div>
              </div>
            </div>
            <IconButton
              label={t("common:logs")}
              icon={<IconLogs size={18} />}
              variant="primary"
              onClick={onOpenLogs}
            />
          </div>
        </div>
      </div>

      <Modal
        open={!!confirmDeleteBackup}
        title={t("settings:deleteBackup")}
        typewriter={false}
        onClose={() => setConfirmDeleteBackup(null)}
        onOk={() => {
          if (!confirmDeleteBackup) return;
          void (async () => {
            try {
              await client.deleteBackup(confirmDeleteBackup);
              setBackups(await client.listBackups());
              toast.success({
                message: t("settings:deleteBackupSuccess"),
              });
            } catch (err) {
              toast.error({
                message: t("settings:deleteBackup"),
                description: String(
                  (err as { message?: string })?.message ?? err,
                ),
              });
            } finally {
              setConfirmDeleteBackup(null);
            }
          })();
        }}
      >
        {t("settings:deleteBackupConfirm")}
        {confirmDeleteBackup ? (
          <div className="meta" style={{ marginTop: 8 }}>
            {confirmDeleteBackup}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
