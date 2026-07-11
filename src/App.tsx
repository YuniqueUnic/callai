import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cursor, Drawer, Tabs } from "animal-island-ui";
import type { PageId } from "./domain/types";
import { client } from "./infra/client";
import { onNavigate } from "./infra/events";
import { HomePage } from "./pages/HomePage";
import { EditAlarmPage } from "./pages/EditAlarmPage";
import { LogsPanel } from "./pages/LogsPanel";
import { SettingsPage } from "./pages/SettingsPage";
import { applyTheme, readStoredTheme } from "./theme/theme";
import { SeaMarquee } from "./ui/SeaMarquee";
import { warmToast } from "./ui/toast";

export default function App() {
  const { t, i18n } = useTranslation(["common", "alarms", "logs"]);
  const [page, setPage] = useState<PageId>("home");
  const [editId, setEditId] = useState<string | null>(null);
  const [logAlarmId, setLogAlarmId] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);

  useEffect(() => {
    warmToast();
    applyTheme(readStoredTheme());
    void client.getSettings().then((s) => {
      applyTheme(s.theme);
      if (s.locale && s.locale !== i18n.language) {
        void i18n.changeLanguage(s.locale);
      }
    });
  }, [i18n]);

  const openLogs = useCallback((alarmId?: string | null) => {
    setLogAlarmId(alarmId ?? null);
    setLogsOpen(true);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("callai-logs-open", logsOpen);
    return () => document.body.classList.remove("callai-logs-open");
  }, [logsOpen]);

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

  const tabItems = useMemo(
    () => [
      {
        key: "home",
        label: t("common:tabAlarms"),
        children: (
          <HomePage onCreate={onCreate} onEdit={onEdit} onLogs={openLogs} />
        ),
      },
      {
        key: "settings",
        label: t("common:tabSettings"),
        children: <SettingsPage onOpenLogs={() => openLogs(null)} />,
      },
    ],
    [t, onCreate, onEdit, openLogs],
  );

  const inTabs = page === "home" || page === "settings";
  const tabKey = page === "settings" ? "settings" : "home";

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
        className={`app-shell ${inTabs ? "with-tabs" : "immersive-edit"} ${logsOpen ? "drawer-open" : ""}`}
      >
        {page === "edit" ? (
          <EditAlarmPage
            alarmId={editId}
            onBack={() => setPage("home")}
            onSaved={() => setPage("home")}
          />
        ) : (
          <>
            <div className="app-body">
              <Tabs
                className="main-tabs"
                activeKey={tabKey}
                onChange={(key) => {
                  if (key === "home" || key === "settings") setPage(key);
                }}
                leafAnimation
                shadow={false}
                items={tabItems}
                aria-label={t("common:appName")}
              />
            </div>
            <div className="app-footer-band" aria-hidden>
              <SeaMarquee />
            </div>
          </>
        )}

        <Drawer
          open={logsOpen}
          title={t("logs:title")}
          placement="right"
          width="min(420px, 92vw)"
          pushBackground
          onClose={() => setLogsOpen(false)}
          className="logs-drawer"
        >
          {logsOpen ? <LogsPanel alarmId={logAlarmId} /> : null}
        </Drawer>
      </div>
    </Cursor>
  );
}
