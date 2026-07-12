import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "../infra/tauriApi";

/**
 * Custom titlebar pitfalls (Tauri 2 docs + practice):
 * - decorations:false + transparent:true; paint ONLY the app shell; all parents transparent
 * - use data-tauri-drag-region for drag; interactive controls must NOT be nested inside it
 * - avoid -webkit-app-region (WebView2-only; conflicts with Tauri drag region)
 * - double-click maximize is native on drag region (Windows); also wire explicitly for all OS
 * - maximized/fullscreen: drop border-radius or square "ears" show through transparent host
 * - close() still hits CloseRequested → hide-to-tray (Rust), not process exit
 * - grant core:window allow-* for drag/resize/always-on-top/fullscreen
 */

type ResizeDir =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

type WinApi = {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  isFullscreen: () => Promise<boolean>;
  setFullscreen: (v: boolean) => Promise<void>;
  setAlwaysOnTop: (v: boolean) => Promise<void>;
  startDragging: () => Promise<void>;
  startResizeDragging: (dir: ResizeDir) => Promise<void>;
  onResized: (cb: () => void) => Promise<() => void>;
  onScaleChanged: (cb: () => void) => Promise<() => void>;
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
    isFullscreen: () => w.isFullscreen(),
    setFullscreen: (v) => w.setFullscreen(v),
    setAlwaysOnTop: (v) => w.setAlwaysOnTop(v),
    startDragging: () => w.startDragging(),
    startResizeDragging: (dir) => w.startResizeDragging(dir),
    onResized: async (cb) => {
      const un = await w.onResized(() => cb());
      return () => {
        void un();
      };
    },
    onScaleChanged: async (cb) => {
      const un = await w.onScaleChanged(() => cb());
      return () => {
        void un();
      };
    },
  };
}

function detectPlatform(): "macos" | "windows" | "linux" | "web" {
  if (!isTauri()) return "web";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  return "linux";
}

function applyShellFlags(flags: {
  maximized?: boolean;
  fullscreen?: boolean;
  pinned?: boolean;
}) {
  const shell = document.querySelector(".app-shell");
  if (!shell) return;
  if (flags.maximized != null) {
    shell.classList.toggle("is-maximized", flags.maximized);
  }
  if (flags.fullscreen != null) {
    shell.classList.toggle("is-fullscreen", flags.fullscreen);
  }
  if (flags.pinned != null) {
    shell.classList.toggle("is-pinned", flags.pinned);
  }
  document.documentElement.classList.toggle(
    "callai-window-chrome-flat",
    Boolean(flags.maximized || flags.fullscreen),
  );
}

export function TitleBar() {
  const { t } = useTranslation("common");
  const platform = useMemo(() => detectPlatform(), []);
  const [maximized, setMaximized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [ready, setReady] = useState(!isTauri());
  const controlsLeft = platform === "macos";

  const syncState = useCallback(async () => {
    const win = await getWin();
    if (!win) return;
    try {
      const [max, full] = await Promise.all([
        win.isMaximized(),
        win.isFullscreen(),
      ]);
      setMaximized(max);
      setFullscreen(full);
      applyShellFlags({ maximized: max, fullscreen: full });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const unsubs: Array<() => void> = [];

    void (async () => {
      const win = await getWin();
      if (disposed) return;
      setReady(true);
      if (!win) return;
      await syncState();
      try {
        unsubs.push(await win.onResized(() => void syncState()));
      } catch {
        /* ignore */
      }
      try {
        unsubs.push(await win.onScaleChanged(() => void syncState()));
      } catch {
        /* ignore */
      }
    })();

    return () => {
      disposed = true;
      for (const u of unsubs) u();
      applyShellFlags({ maximized: false, fullscreen: false, pinned: false });
    };
  }, [syncState]);

  const onDragMouseDown = useCallback((e: MouseEvent) => {
    if (e.button !== 0) return;
    // Keep native double-click maximize; also fire for non-Windows.
    if (e.detail >= 2) {
      void (async () => {
        const win = await getWin();
        if (!win) return;
        if (await win.isFullscreen()) {
          await win.setFullscreen(false);
        } else {
          await win.toggleMaximize();
        }
        await syncState();
      })();
      return;
    }
    // Prefer data-tauri-drag-region; startDragging is a reliable fallback.
    void (async () => {
      const win = await getWin();
      await win?.startDragging();
    })();
  }, [syncState]);

  const run = useCallback(
    async (
      op:
        | "minimize"
        | "toggleMaximize"
        | "close"
        | "togglePin"
        | "toggleFullscreen",
    ) => {
      const win = await getWin();
      if (!win) return;
      if (op === "minimize") {
        await win.minimize();
        return;
      }
      if (op === "close") {
        // CloseRequested in Rust prevents destroy and hides to tray.
        await win.close();
        return;
      }
      if (op === "toggleMaximize") {
        if (await win.isFullscreen()) {
          await win.setFullscreen(false);
        } else {
          await win.toggleMaximize();
        }
        await syncState();
        return;
      }
      if (op === "togglePin") {
        const next = !pinned;
        await win.setAlwaysOnTop(next);
        setPinned(next);
        applyShellFlags({ pinned: next });
        return;
      }
      if (op === "toggleFullscreen") {
        const next = !(await win.isFullscreen());
        await win.setFullscreen(next);
        await syncState();
      }
    },
    [pinned, syncState],
  );

  const beginResize = useCallback((dir: ResizeDir) => {
    if (maximized || fullscreen) return;
    void (async () => {
      const win = await getWin();
      await win?.startResizeDragging(dir);
    })();
  }, [fullscreen, maximized]);

  const controls = (
    <div
      className={`titlebar-controls ${controlsLeft ? "is-left" : "is-right"}`}
      role="toolbar"
      aria-label={t("windowControls")}
    >
      {controlsLeft ? (
        <>
          <button
            type="button"
            className="titlebar-btn titlebar-close is-traffic"
            aria-label={t("windowClose")}
            disabled={!ready && isTauri()}
            onClick={() => void run("close")}
          >
            <span className="traffic-dot" />
          </button>
          <button
            type="button"
            className="titlebar-btn titlebar-min is-traffic"
            aria-label={t("windowMinimize")}
            disabled={!ready && isTauri()}
            onClick={() => void run("minimize")}
          >
            <span className="traffic-dot" />
          </button>
          <button
            type="button"
            className="titlebar-btn titlebar-max is-traffic"
            aria-label={maximized ? t("windowRestore") : t("windowMaximize")}
            disabled={!ready && isTauri()}
            onClick={() => void run("toggleMaximize")}
          >
            <span className="traffic-dot" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="titlebar-btn titlebar-min"
            aria-label={t("windowMinimize")}
            disabled={!ready && isTauri()}
            onClick={() => void run("minimize")}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path
                d="M2 6.5h8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
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
        </>
      )}
    </div>
  );

  const extras = (
    <div className="titlebar-extras" role="group" aria-label={t("windowExtras")}>
      <button
        type="button"
        className={`titlebar-btn titlebar-extra ${pinned ? "is-active" : ""}`}
        aria-label={pinned ? t("windowUnpin") : t("windowPin")}
        aria-pressed={pinned}
        disabled={!ready && isTauri()}
        onClick={() => void run("togglePin")}
        title={pinned ? t("windowUnpin") : t("windowPin")}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path
            d="M4.2 7.8L2 10M5 2.2l4.8 1.6-2.4 2.4 1 2.6-1.5 1.5-2.6-1-2.4 2.4L.9 5.9 5 2.2z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className={`titlebar-btn titlebar-extra ${fullscreen ? "is-active" : ""}`}
        aria-label={
          fullscreen ? t("windowExitFullscreen") : t("windowFullscreen")
        }
        aria-pressed={fullscreen}
        disabled={!ready && isTauri()}
        onClick={() => void run("toggleFullscreen")}
        title={fullscreen ? t("windowExitFullscreen") : t("windowFullscreen")}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path
            d="M2 4.2V2h2.2M8 2h2v2.2M10 8V10H7.8M4.2 10H2V7.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );

  const brand = (
    <div
      className="titlebar-drag"
      data-tauri-drag-region
      onMouseDown={onDragMouseDown}
      role="presentation"
    >
      <span className="titlebar-mark" aria-hidden>
        <img
          src="/favicon.png"
          alt=""
          className="titlebar-logo"
          draggable={false}
        />
      </span>
      <span className="titlebar-title" data-tauri-drag-region>
        {t("appName")}
      </span>
      <span className="titlebar-tagline" data-tauri-drag-region>
        {t("tagline")}
      </span>
      {pinned ? (
        <span className="titlebar-pill" data-tauri-drag-region>
          {t("windowPinnedBadge")}
        </span>
      ) : null}
      {fullscreen ? (
        <span className="titlebar-pill is-focus" data-tauri-drag-region>
          {t("windowFullscreenBadge")}
        </span>
      ) : null}
    </div>
  );

  return (
    <>
      <header
        className={`titlebar platform-${platform} ${controlsLeft ? "controls-left" : "controls-right"}`}
      >
        {controlsLeft ? (
          <>
            {controls}
            {brand}
            {extras}
          </>
        ) : (
          <>
            {brand}
            {extras}
            {controls}
          </>
        )}
      </header>

      {/* Edge resize grips — undeco windows need explicit resize affordances */}
      {!maximized && !fullscreen ? (
        <div className="window-resize-layer" aria-hidden>
          {(
            [
              ["n", "North"],
              ["s", "South"],
              ["e", "East"],
              ["w", "West"],
              ["ne", "NorthEast"],
              ["nw", "NorthWest"],
              ["se", "SouthEast"],
              ["sw", "SouthWest"],
            ] as const
          ).map(([cls, dir]) => (
            <div
              key={dir}
              className={`window-resize-grip grip-${cls}`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                beginResize(dir);
              }}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
