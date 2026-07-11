import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cursor } from "animal-island-ui";
import type { PageId } from "./domain/types";
import { client } from "./infra/client";
import { onNavigate } from "./infra/events";
import { HomePage } from "./pages/HomePage";
import { EditAlarmPage } from "./pages/EditAlarmPage";
import { LogsPage } from "./pages/LogsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { BottomTabs } from "./ui/BottomTabs";
import { applyTheme, readStoredTheme } from "./theme/theme";

export default function App() {
  const { i18n } = useTranslation();
  const [page, setPage] = useState<PageId>("home");
  const [editId, setEditId] = useState<string | null>(null);
  const [logAlarmId, setLogAlarmId] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(readStoredTheme());
    void client.getSettings().then((s) => {
      applyTheme(s.theme);
      if (s.locale && s.locale !== i18n.language) {
        void i18n.changeLanguage(s.locale);
      }
    });
  }, [i18n]);

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
        setPage("logs");
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

  const showTabs = page === "home" || page === "settings";

  return (
    <Cursor>
      <div className={`app-shell ${showTabs ? "with-tabs" : ""}`}>
        {page === "home" && (
          <HomePage
            onCreate={() => {
              setEditId(null);
              setPage("edit");
            }}
            onEdit={(id) => {
              setEditId(id);
              setPage("edit");
            }}
            onLogs={(alarmId) => {
              setLogAlarmId(alarmId ?? null);
              setPage("logs");
            }}
          />
        )}
        {page === "edit" && (
          <EditAlarmPage
            alarmId={editId}
            onBack={() => setPage("home")}
            onSaved={() => {
              // toast already fired in EditAlarmPage; just return home
              setPage("home");
            }}
          />
        )}
        {page === "logs" && (
          <LogsPage
            alarmId={logAlarmId}
            onBack={() => setPage("settings")}
          />
        )}
        {page === "settings" && (
          <SettingsPage
            onOpenLogs={() => {
              setLogAlarmId(null);
              setPage("logs");
            }}
          />
        )}
        {showTabs && (
          <BottomTabs
            active={page === "settings" ? "settings" : "home"}
            onChange={(tab) => setPage(tab)}
          />
        )}
      </div>
    </Cursor>
  );
}
