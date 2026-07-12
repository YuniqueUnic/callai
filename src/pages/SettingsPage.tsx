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
import { IconFolder, IconLogs, IconRestore, IconTrash } from "../ui/icons";
import { playSound, setSoundEnabled, unlockAudio } from "../ui/sounds";
import { isTauri } from "../infra/tauriApi";
import { checkForAppUpdate } from "../infra/updater";
import {
  ensureDetectedTimezone,
  peekDetectedTimezone,
} from "../infra/timezoneCache";
import {
  getAppVersionCached,
  getAutostartCached,
  getSettingsCached,
  listBackupsCached,
  peekAppVersion,
  peekAutostart,
  peekBackups,
  peekSettings,
  setAutostartCache,
  setSettingsCache,
} from "../infra/settingsCache";

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


const REPO_URL = "https://github.com/YuniqueUnic/callai";
const AUTHOR_URL = "https://github.com/YuniqueUnic";
const ISSUES_URL = "https://github.com/YuniqueUnic/callai/issues";

async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function SettingsPage({ onOpenLogs }: Props) {
  const { t, i18n } = useTranslation(["settings", "common", "alarms"]);
  const [settings, setSettings] = useState<AppSettings | null>(() => peekSettings());
  const [backups, setBackups] = useState<string[]>(() => peekBackups() ?? []);
  const [confirmDeleteBackup, setConfirmDeleteBackup] = useState<string | null>(
    null,
  );
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<string | null>(null);
  const [pendingInstall, setPendingInstall] = useState<null | (() => Promise<void>)>(null);
  const [pendingVersion, setPendingVersion] = useState<string>("");
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [detectedTz, setDetectedTz] = useState<string>(() => peekDetectedTimezone());
  const [appVersion, setAppVersion] = useState<string>(() => peekAppVersion() ?? "");
  const [autostartOn, setAutostartOn] = useState<boolean>(() => peekAutostart() ?? false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Cache-first: keep-alive tab + module caches make re-entry instant.
      try {
        const s = await getSettingsCached();
        if (cancelled) return;
        setSettings(s);
      } catch {
        if (!cancelled) setSettings(null);
        return;
      }

      // Background refine (timezone already warmed at app start).
      void ensureDetectedTimezone().then((tz) => {
        if (!cancelled) setDetectedTz(tz);
      });
      void Promise.all([
        listBackupsCached().then((b) => {
          if (!cancelled) setBackups(b);
        }),
        getAppVersionCached().then((v) => {
          if (!cancelled) setAppVersion(v);
        }),
        getAutostartCached().then((v) => {
          if (!cancelled) setAutostartOn(v);
        }),
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(next: AppSettings) {
    const saved = await client.saveSettings(next);
    setSettingsCache(saved);
    setSettings(saved);
    applyTheme(saved.theme);
    if (saved.locale !== i18n.language) {
      await i18n.changeLanguage(saved.locale);
    }
    toast.success({ message: t("settings:saved"), key: "settings-save", duration: 2.6 });
  }


  async function runUpdateCheck(): Promise<
    | { kind: "none" }
    | { kind: "available"; version: string; install: () => Promise<void>; body?: string | null }
  > {
    const res = await checkForAppUpdate();
    if (res.status === "unsupported") {
      setUpdateInfo(t("settings:updateUnsupported"));
      setPendingInstall(null);
      setPendingVersion("");
      toast.warning({ message: t("settings:updateUnsupported") });
      return { kind: "none" };
    }
    if (res.status === "upToDate") {
      setUpdateInfo(t("settings:updateUpToDate"));
      setPendingInstall(null);
      setPendingVersion("");
      toast.success({ message: t("settings:updateUpToDate") });
      return { kind: "none" };
    }
    if (res.status === "error") {
      setUpdateInfo(res.message);
      setPendingInstall(null);
      setPendingVersion("");
      toast.error({
        message: t("settings:updateError"),
        description: res.message,
      });
      return { kind: "none" };
    }
    setUpdateInfo(t("settings:updateAvailable", { version: res.version }));
    setPendingInstall(() => res.install);
    setPendingVersion(res.version);
    return {
      kind: "available",
      version: res.version,
      install: res.install,
      body: res.body,
    };
  }

  async function installPending(install: () => Promise<void>) {
    setUpdateBusy(true);
    toast.success({ message: t("settings:updateInstalling") });
    try {
      await install();
      toast.success({ message: t("settings:updateDone") });
      setUpdateInfo(t("settings:updateDone"));
      setPendingInstall(null);
      setPendingVersion("");
    } catch (err) {
      toast.error({
        message: t("settings:updateError"),
        description: String((err as { message?: string })?.message ?? err),
      });
    } finally {
      setUpdateBusy(false);
    }
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
            <span>{t("settings:autostart")}</span>
            <Switch
              checked={autostartOn}
              onChange={(v) => {
                void (async () => {
                  try {
                    const enabled = await client.setAutostartEnabled(v);
                    setAutostartCache(enabled);
                    setAutostartOn(enabled);
                    toast.success({
                      message: t("settings:saved"),
                      key: "autostart",
                      duration: 2.2,
                    });
                  } catch (err) {
                    toast.error({
                      message: t("settings:autostartFail"),
                      description: String(
                        (err as { message?: string })?.message ?? err,
                      ),
                    });
                  }
                })();
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
                setBackups(await listBackupsCached(true));
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
            <div className="panel-head" style={{ marginBottom: 8 }}>
              <label className="label">{t("settings:backups")}</label>
              <IconButton
                label={t("settings:openBackupsFolder")}
                icon={<IconFolder size={16} />}
                onClick={() => {
                  void (async () => {
                    try {
                      const dir = await client.openBackupsDir();
                      toast.success({
                        message: t("settings:openBackupsFolderSuccess"),
                        description: dir || undefined,
                      });
                    } catch (err) {
                      toast.error({
                        message: t("settings:openBackupsFolderFail"),
                        description: String(
                          (err as { message?: string })?.message ?? err,
                        ),
                      });
                    }
                  })();
                }}
              />
            </div>
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
                type="primary"
                disabled={updateBusy}
                onClick={() => {
                  void (async () => {
                    // One-click path: check if needed → confirm → install.
                    if (pendingInstall) {
                      setConfirmUpdate(true);
                      return;
                    }
                    setUpdateBusy(true);
                    try {
                      const found = await runUpdateCheck();
                      if (found.kind === "available") {
                        toast.success({
                          message: t("settings:updateAvailable", {
                            version: found.version,
                          }),
                          description: found.body || undefined,
                        });
                        setConfirmUpdate(true);
                      }
                    } finally {
                      setUpdateBusy(false);
                    }
                  })();
                }}
              >
                {updateBusy
                  ? t("settings:checkingUpdate")
                  : t("settings:updateInstall")}
              </Button>
              <Button
                type="default"
                disabled={updateBusy}
                onClick={() => {
                  void (async () => {
                    setUpdateBusy(true);
                    try {
                      const found = await runUpdateCheck();
                      if (found.kind === "available") {
                        toast.success({
                          message: t("settings:updateAvailable", {
                            version: found.version,
                          }),
                          description: found.body || undefined,
                        });
                        // Checked only — user can tap install without re-check.
                      }
                    } finally {
                      setUpdateBusy(false);
                    }
                  })();
                }}
              >
                {t("settings:checkUpdate")}
              </Button>
            </div>
          </div>

          <div className="field settings-about">
            <div className="panel-head">
              <label className="label">{t("settings:aboutSection")}</label>
            </div>
            <div className="settings-about-body">
              <div
                className="settings-version"
                aria-label={t("settings:appVersion", {
                  version: appVersion || "…",
                })}
              >
                <span className="settings-version-badge">
                  {appVersion
                    ? t("settings:appVersion", { version: appVersion })
                    : t("common:loading")}
                </span>
                <span className="meta settings-version-cli">
                  {t("settings:cliVersionHint")}
                </span>
              </div>

              <dl className="settings-about-meta">
                <div className="settings-about-row">
                  <dt>{t("settings:aboutAuthor")}</dt>
                  <dd>
                    <button
                      type="button"
                      className="settings-link-btn"
                      onClick={() => {
                        void openExternal(AUTHOR_URL).catch((err) => {
                          toast.error({
                            message: t("settings:openLinkFail"),
                            description: String(
                              (err as { message?: string })?.message ?? err,
                            ),
                          });
                        });
                      }}
                    >
                      {t("settings:aboutAuthorName")}
                    </button>
                  </dd>
                </div>
                <div className="settings-about-row">
                  <dt>{t("settings:aboutGithub")}</dt>
                  <dd>
                    <button
                      type="button"
                      className="settings-link-btn"
                      onClick={() => {
                        void openExternal(REPO_URL).catch((err) => {
                          toast.error({
                            message: t("settings:openLinkFail"),
                            description: String(
                              (err as { message?: string })?.message ?? err,
                            ),
                          });
                        });
                      }}
                    >
                      {t("settings:aboutGithubRepo")}
                    </button>
                  </dd>
                </div>
                <div className="settings-about-row">
                  <dt>{t("settings:aboutIssues")}</dt>
                  <dd>
                    <button
                      type="button"
                      className="settings-link-btn"
                      onClick={() => {
                        void openExternal(ISSUES_URL).catch((err) => {
                          toast.error({
                            message: t("settings:openLinkFail"),
                            description: String(
                              (err as { message?: string })?.message ?? err,
                            ),
                          });
                        });
                      }}
                    >
                      Issues
                    </button>
                  </dd>
                </div>
                <div className="settings-about-row">
                  <dt>{t("settings:aboutLicense")}</dt>
                  <dd className="meta">{t("settings:aboutLicenseValue")}</dd>
                </div>
              </dl>
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
              setBackups(await listBackupsCached(true));
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

      <Modal
        open={confirmUpdate}
        title={t("settings:updateConfirmTitle")}
        typewriter={false}
        onClose={() => setConfirmUpdate(false)}
        onOk={() => {
          setConfirmUpdate(false);
          if (!pendingInstall) return;
          void installPending(pendingInstall);
        }}
      >
        {t("settings:updateConfirmBody", {
          version: pendingVersion || "…",
        })}
      </Modal>
    </div>
  );
}
