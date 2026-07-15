import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cursor, Drawer, Tabs } from "animal-island-ui";
import type { PageId } from "./domain/types";
import { onNavigate } from "./infra/events";
import { HomePage } from "./pages/HomePage";
import { EditAlarmPage } from "./pages/EditAlarmPage";
import { LogsPanel } from "./pages/LogsPanel";
import { SettingsPage } from "./pages/SettingsPage";
import { PluginsPage } from "./pages/PluginsPage";
import { AiChatPage } from "./pages/AiChatPage";
import { applyTheme, readStoredTheme } from "./theme/theme";
import { SeaMarquee } from "./ui/SeaMarquee";
import { TitleBar } from "./ui/TitleBar";
import { warmToast } from "./ui/toast";
import { setSoundEnabled, unlockAudio } from "./ui/sounds";
import { ensureDetectedTimezone } from "./infra/timezoneCache";
import { getSettingsCached, warmSettingsSecondary } from "./infra/settingsCache";
import { invalidateAlarmsCache, warmAlarmsCache } from "./infra/alarmsCache";

export default function App() {
  const { t, i18n } = useTranslation(["common", "alarms", "logs"]);
  const [page, setPage] = useState<PageId>("home");
  const [aiReturnPage, setAiReturnPage] = useState<"home" | "plugins">("home");
  const [editId, setEditId] = useState<string | null>(null);
  const [logAlarmId, setLogAlarmId] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);

  useEffect(() => {
    warmToast();
    applyTheme(readStoredTheme());
    // Warm timezone cache off the critical path (Settings reads cache only).
    void ensureDetectedTimezone();
    void warmAlarmsCache();
    void getSettingsCached().then((s) => {
      applyTheme(s.theme);
      setSoundEnabled(s.sound_enabled !== false);
      if (s.locale && s.locale !== i18n.language) {
        void i18n.changeLanguage(s.locale);
      }
      // Prefetch settings secondaries so first Settings open is warm.
      warmSettingsSecondary();
    });
    const unlock = () => {
      void unlockAudio();
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [i18n]);

  const openLogs = useCallback((alarmId?: string | null) => {
    setLogAlarmId(alarmId ?? null);
    setLogsOpen(true);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("callai-logs-open", logsOpen);
    return () => document.body.classList.remove("callai-logs-open");
  }, [logsOpen]);

  // Hide body-portaled FAB on edit / AI chat (Home stays mounted under overlay).
  useEffect(() => {
    const immersive = page === "edit" || page === "ai";
    document.body.classList.toggle("callai-immersive", immersive);
    return () => document.body.classList.remove("callai-immersive");
  }, [page]);

  const onCreate = useCallback(() => {
    setEditId(null);
    setPage("edit");
  }, []);

  const onEdit = useCallback((id: string) => {
    setEditId(id);
    setPage("edit");
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void onNavigate((target) => {
      if (target === "new-alarm") {
        setEditId(null);
        setPage("edit");
      } else if (target === "home") {
        setPage("home");
      } else if (target === "logs") {
        setLogAlarmId(null);
        setLogsOpen(true);
      } else if (target === "settings") {
        setPage("settings");
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  // Labels only — page trees stay mounted (Tabs remounts children every switch).
  const tabItems = useMemo(
    () => [
      { key: "home", label: t("common:tabAlarms"), children: null },
      { key: "plugins", label: t("common:tabPlugins"), children: null },
      { key: "settings", label: t("common:tabSettings"), children: null },
    ],
    [t],
  );

  const inTabs = page === "home" || page === "settings" || page === "plugins";
  const tabKey =
    page === "settings" ? "settings" : page === "plugins" ? "plugins" : "home";

  return (
    <Cursor
      className="callai-cursor"
      style={{
        display: "block",
        height: "100%",
        maxHeight: "100dvh",
        minHeight: "100%",
        overflow: "hidden",
      }}
    >
      <div
        className={`app-shell has-titlebar ${inTabs ? "with-tabs" : "immersive-edit"} ${logsOpen ? "drawer-open" : ""}`}
      >
        <TitleBar />
        {/* Main shell always mounted — unmounting Home on edit was a 1–2s remount stall
            (listAlarms + N×nextTrigger + SeaMarquee restart). Edit overlays on top. */}
        <div
          className="app-body"
          hidden={page === "edit" || page === "ai"}
          aria-hidden={page === "edit" || page === "ai"}
        >
          <Tabs
            className="main-tabs"
            activeKey={tabKey}
            onChange={(key) => {
              if (key === "home" || key === "settings" || key === "plugins") {
                setPage(key);
              }
            }}
            leafAnimation={false}
            shadow={false}
            items={tabItems}
            aria-label={t("common:appName")}
          />
          <div className="tab-panes">
            <div
              className={`tab-pane ${tabKey === "home" ? "is-active" : ""}`}
              hidden={tabKey !== "home"}
              aria-hidden={tabKey !== "home"}
            >
              <HomePage
                onCreate={onCreate}
                onEdit={onEdit}
                onLogs={openLogs}
                onAi={() => {
                  setAiReturnPage("home");
                  setPage("ai");
                }}
                fabVisible={page === "home"}
              />
            </div>
            <div
              className={`tab-pane ${tabKey === "plugins" ? "is-active" : ""}`}
              hidden={tabKey !== "plugins"}
              aria-hidden={tabKey !== "plugins"}
            >
              <PluginsPage
                onOpenAi={() => {
                  setAiReturnPage("plugins");
                  setPage("ai");
                }}
              />
            </div>
            <div
              className={`tab-pane ${tabKey === "settings" ? "is-active" : ""}`}
              hidden={tabKey !== "settings"}
              aria-hidden={tabKey !== "settings"}
            >
              <SettingsPage onOpenLogs={() => openLogs(null)} />
            </div>
          </div>
        </div>
        <div
          className="app-footer-band"
          aria-hidden
          hidden={page === "edit" || page === "ai"}
        >
          <SeaMarquee />
        </div>
        {page === "edit" ? (
          <div className="edit-overlay">
            <EditAlarmPage
              alarmId={editId}
              onBack={() => setPage("home")}
              onSaved={() => {
                invalidateAlarmsCache();
                window.dispatchEvent(new Event("callai:alarms-changed"));
                setPage("home");
              }}
            />
          </div>
        ) : null}
        {page === "ai" ? (
          <div className="edit-overlay">
            <AiChatPage
              onBack={() => setPage(aiReturnPage)}
              onAlarmCreated={() => {
                // Stay on AI chat so the draft card can show "added"; home list refreshes via cache.
                invalidateAlarmsCache();
                window.dispatchEvent(new Event("callai:alarms-changed"));
              }}
              onPluginCreated={() => {
                setAiReturnPage("plugins");
                // stay on AI; list refresh happens when user returns
              }}
            />
          </div>
        ) : null}

        <Drawer
          open={logsOpen}
          title={t("logs:title")}
          placement="right"
          width="min(420px, 92vw)"
          /* pushBackground scales/blurs #root + forces radius — breaks transparent
             rounded Tauri chrome (square corners under mask). Keep false. */
          pushBackground={false}
          onClose={() => setLogsOpen(false)}
          className="logs-drawer"
        >
          {logsOpen ? <LogsPanel alarmId={logAlarmId} /> : null}
        </Drawer>
      </div>
    </Cursor>
  );
}
