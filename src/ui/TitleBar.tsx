import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "../infra/tauriApi";

type WinApi = {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  startDragging: () => Promise<void>;
  onResized: (cb: () => void) => Promise<() => void>;
};

async function getWin(): Promise<WinApi | null> {
  if (!isTauri()) return null;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const w = getCurrentWindow();
  return {
    minimize: () => w.minimize(),
    toggleMaximize: () => w.toggleMaximize(),
    close: () => w.close(),
    isMaximized: () => w.isMaximized(),
    startDragging: () => w.startDragging(),
    onResized: async (cb) => {
      const un = await w.onResized(() => cb());
      return () => {
        void un();
      };
    },
  };
}

/**
 * Cross-platform custom title bar (no OS chrome).
 * Uses Tauri 2 window API — same controls on Linux / Windows / macOS.
 */
export function TitleBar() {
  const { t } = useTranslation("common");
  const [maximized, setMaximized] = useState(false);
  const [ready, setReady] = useState(!isTauri());

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const win = await getWin();
      if (disposed) return;
      setReady(true);
      if (!win) return;
      try {
        setMaximized(await win.isMaximized());
      } catch {
        /* ignore */
      }
      try {
        unlisten = await win.onResized(() => {
          void win.isMaximized().then(setMaximized).catch(() => {});
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const onDrag = useCallback((e: MouseEvent) => {
    if (e.button !== 0) return;
    // double-click maximize
    if (e.detail === 2) {
      void (async () => {
        const win = await getWin();
        if (!win) return;
        await win.toggleMaximize();
        setMaximized(await win.isMaximized());
      })();
      return;
    }
    void (async () => {
      const win = await getWin();
      await win?.startDragging();
    })();
  }, []);

  const run = useCallback(async (op: keyof WinApi) => {
    const win = await getWin();
    if (!win) return;
    if (op === "toggleMaximize") {
      await win.toggleMaximize();
      setMaximized(await win.isMaximized());
      return;
    }
    if (op === "minimize") await win.minimize();
    if (op === "close") await win.close();
  }, []);

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div
        className="titlebar-drag"
        data-tauri-drag-region
        onMouseDown={onDrag}
        role="presentation"
      >
        <span className="titlebar-mark" aria-hidden>
          <img src="/favicon.png" alt="" className="titlebar-logo" draggable={false} />
        </span>
        <span className="titlebar-title">{t("appName")}</span>
        <span className="titlebar-tagline">{t("tagline")}</span>
      </div>

      <div className="titlebar-controls" role="toolbar" aria-label={t("windowControls")}>
        <button
          type="button"
          className="titlebar-btn titlebar-min"
          aria-label={t("windowMinimize")}
          disabled={!ready && isTauri()}
          onClick={() => void run("minimize")}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M2 6.5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-max"
          aria-label={maximized ? t("windowRestore") : t("windowMaximize")}
          disabled={!ready && isTauri()}
          onClick={() => void run("toggleMaximize")}
        >
          {maximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path
                d="M3.5 4.5h5v5h-5v-5zm1.2-1.5h4.3v4.3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <rect
                x="2.5"
                y="2.5"
                width="7"
                height="7"
                rx="1.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-close"
          aria-label={t("windowClose")}
          disabled={!ready && isTauri()}
          onClick={() => void run("close")}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path
              d="M3 3l6 6M9 3L3 9"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
