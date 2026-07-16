/**
 * Independent plugin host window.
 * Reuses shared <TitleBar variant="plugin" /> chrome.
 * Minimize → compact titlebar strip (not OS minimize).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { client } from "../infra/client";
import { isTauri } from "../infra/tauriApi";
import { TitleBar } from "../ui/TitleBar";

const COMPACT_H = 44;
const COMPACT_MIN_W = 280;
const EXPANDED_MIN_H = 220;
const DEFAULT_EXPANDED = { w: 440, h: 720 };

function resolvePluginId(): string {
  const q = new URLSearchParams(window.location.search);
  const fromQuery = (q.get("id") || q.get("plugin") || "").trim();
  if (fromQuery) return fromQuery;

  const hash = window.location.hash.replace(/^#/, "");
  if (hash) {
    const hq = new URLSearchParams(hash.includes("=") ? hash : `id=${hash}`);
    const fromHash = (hq.get("id") || hq.get("plugin") || "").trim();
    if (fromHash) return fromHash;
  }

  if (isTauri()) {
    try {
      const label = getCurrentWindow().label;
      if (label.startsWith("plugin-")) {
        return label.slice("plugin-".length);
      }
    } catch {
      /* ignore */
    }
  }
  return "";
}

function resolveLaunchParams(): Record<string, unknown> {
  const q = new URLSearchParams(window.location.search);
  const raw = (q.get("launch") || q.get("params") || "").trim();
  if (raw) {
    for (const candidate of [raw, (() => { try { return decodeURIComponent(raw); } catch { return ""; } })()]) {
      if (!candidate) continue;
      try {
        const parsed = JSON.parse(candidate) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        /* try next */
      }
    }
  }
  // Flat query shortcuts: ?mode=drink&page=food
  const flat: Record<string, unknown> = {};
  for (const key of ["mode", "page", "view", "tab"]) {
    const v = q.get(key);
    if (v != null && v !== "") flat[key] = v;
  }
  // p.<key>=value
  q.forEach((value, key) => {
    if (key.startsWith("p.") && key.length > 2) {
      flat[key.slice(2)] = value;
    }
  });
  return flat;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function PluginWindowApp() {
  const [pluginId] = useState(() => resolvePluginId());
  const [launchParams, setLaunchParams] = useState(() => resolveLaunchParams());
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [title, setTitle] = useState("callai plugin");
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [compact, setCompact] = useState(false);
  /** Theme requested by plugin host panel (iframe). Affects outer titlebar/shell. */
  const [contentTheme, setContentTheme] = useState<"light" | "dark">("light");

  const expandedSizeRef = useRef(DEFAULT_EXPANDED);
  const sizingLock = useRef(false);

  // Load plugin HTML
  useEffect(() => {
    if (!pluginId) {
      setLoading(false);
      setError("missing plugin id (open via Plugins list)");
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [summary, ui] = await Promise.all([
          client.getPlugin(pluginId),
          client.pluginUiHtml(pluginId),
        ]);
        if (cancelled) return;
        const name = summary.name || pluginId;
        setTitle(name);
        setHtml(ui);
        if (isTauri()) {
          try {
            await getCurrentWindow().setTitle(name);
          } catch {
            /* ignore */
          }
        }
        try {
          await client.pluginMarkRun(pluginId);
        } catch {
          /* ignore */
        }
      } catch (e) {
        if (!cancelled) {
          setError(String((e as { message?: string })?.message ?? e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pluginId]);

  // Initial min size + remember expanded geometry
  useEffect(() => {
    if (!isTauri()) return;
    void (async () => {
      try {
        const w = getCurrentWindow();
        await w.setMinSize(new LogicalSize(COMPACT_MIN_W, COMPACT_H));
        const size = await w.innerSize();
        const factor = await w.scaleFactor();
        expandedSizeRef.current = {
          w: Math.max(COMPACT_MIN_W, Math.round(size.width / factor)),
          h: Math.max(EXPANDED_MIN_H, Math.round(size.height / factor)),
        };
      } catch (e) {
        console.warn("[plugin-win] size init", e);
      }
    })();
  }, []);

  // Bridge iframe → plugin_invoke + console buffer → host store
  useEffect(() => {
    const pendingConsole: { level: string; args: string[]; t: number }[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    function flushConsole(pluginId: string) {
      if (!pendingConsole.length) return;
      const batch = pendingConsole.splice(0, pendingConsole.length);
      if (typeof client.pluginAppendConsole === "function") {
        void client.pluginAppendConsole(pluginId, batch).catch(() => undefined);
      }
    }
    function onMessage(ev: MessageEvent) {
      const d = ev.data as {
        __callai_plugin_invoke?: boolean;
        __callai_plugin_console?: boolean;
        reqId?: string;
        pluginId?: string;
        method?: string;
        args?: unknown;
        entry?: { level: string; args: string[]; t: number };
      };
      if (d?.__callai_plugin_console && d.pluginId && d.entry) {
        pendingConsole.push(d.entry);
        if (flushTimer) clearTimeout(flushTimer);
        const pid = d.pluginId;
        flushTimer = setTimeout(() => flushConsole(pid), 400);
        return;
      }
      if (!d?.__callai_plugin_invoke || !d.reqId || !d.pluginId || !d.method) {
        return;
      }
      void client
        .pluginInvoke(d.pluginId, d.method, d.args ?? {})
        .then((value: unknown) => {
          (ev.source as Window | null)?.postMessage(
            { __callai_plugin_result: true, reqId: d.reqId, ok: true, value },
            "*",
          );
        })
        .catch((err: unknown) => {
          (ev.source as Window | null)?.postMessage(
            {
              __callai_plugin_result: true,
              reqId: d.reqId,
              ok: false,
              error: String((err as { message?: string })?.message ?? err),
            },
            "*",
          );
        });
    }
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, []);

  // Alarm re-trigger / open_plugin_window on existing label → host-launch event.
  useEffect(() => {
    function onHostLaunch(ev: Event) {
      const detail = (ev as CustomEvent<Record<string, unknown>>).detail;
      if (detail && typeof detail === "object") {
        setLaunchParams(detail);
      }
    }
    window.addEventListener("callai:host-launch", onHostLaunch as EventListener);
    return () =>
      window.removeEventListener(
        "callai:host-launch",
        onHostLaunch as EventListener,
      );
  }, []);

  // Plugin iframe host-panel dark/light → outer titlebar / shell.
  useEffect(() => {
    function onThemeMsg(ev: MessageEvent) {
      const d = ev.data as {
        __callai_plugin_theme?: boolean;
        theme?: string;
        pluginId?: string;
      };
      if (!d?.__callai_plugin_theme) return;
      if (pluginId && d.pluginId && d.pluginId !== pluginId) return;
      const next = d.theme === "dark" ? "dark" : "light";
      setContentTheme(next);
    }
    window.addEventListener("message", onThemeMsg);
    return () => window.removeEventListener("message", onThemeMsg);
  }, [pluginId]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", contentTheme);
    document.documentElement.classList.toggle("plugin-content-dark", contentTheme === "dark");
    document.body.classList.toggle("plugin-content-dark", contentTheme === "dark");
    return () => {
      document.documentElement.classList.remove("plugin-content-dark");
      document.body.classList.remove("plugin-content-dark");
    };
  }, [contentTheme]);

    // Push launch params into sandboxed plugin document (bridge listens).
  const pushLaunchParams = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(
        { __callai_set_launch_params: true, params: launchParams },
        "*",
      );
    } catch {
      /* ignore */
    }
  }, [launchParams]);

  useEffect(() => {
    pushLaunchParams();
    const t1 = window.setTimeout(pushLaunchParams, 80);
    const t2 = window.setTimeout(pushLaunchParams, 400);
    const t3 = window.setTimeout(pushLaunchParams, 1200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [html, pushLaunchParams]);

  const applyCompact = useCallback(async (next: boolean) => {
    if (sizingLock.current) return;
    sizingLock.current = true;
    try {
      if (!isTauri()) {
        setCompact(next);
        return;
      }
      const w = getCurrentWindow();

      if (next) {
        // Snapshot expanded size while still large (skip if already compact height).
        try {
          const size = await w.innerSize();
          const factor = await w.scaleFactor();
          const lw = Math.round(size.width / factor);
          const lh = Math.round(size.height / factor);
          if (lh > COMPACT_H + 40) {
            expandedSizeRef.current = {
              w: Math.max(COMPACT_MIN_W, lw),
              h: Math.max(EXPANDED_MIN_H, lh),
            };
          }
        } catch {
          /* ignore */
        }

        // Must leave maximized/fullscreen before setSize, otherwise OS keeps max frame.
        try {
          if (await w.isFullscreen()) {
            await w.setFullscreen(false);
            await sleep(40);
          }
        } catch {
          /* ignore */
        }
        try {
          if (await w.isMaximized()) {
            await w.unmaximize();
            await sleep(60);
          }
        } catch {
          /* ignore */
        }

        await w.setMinSize(new LogicalSize(COMPACT_MIN_W, COMPACT_H));
        // Cap max height while compact so drag-resize cannot re-expand by accident.
        try {
          await w.setMaxSize(new LogicalSize(COMPACT_MIN_W, COMPACT_H));
        } catch {
          /* ignore */
        }

        // Compact = titlebar chip: fixed narrow width + titlebar height (not last expanded width).
        const width = COMPACT_MIN_W;
        await w.setSize(new LogicalSize(width, COMPACT_H));
        await sleep(30);
        await w.setSize(new LogicalSize(width, COMPACT_H));

        setCompact(true);
        document.documentElement.classList.remove("callai-window-chrome-flat");
      } else {
        // Clear compact max-height cap
        try {
          await w.setMaxSize(null);
        } catch {
          /* ignore */
        }
        await w.setMinSize(new LogicalSize(COMPACT_MIN_W, COMPACT_H));
        const { w: ew, h: eh } = expandedSizeRef.current;
        await w.setSize(
          new LogicalSize(
            Math.max(COMPACT_MIN_W, ew),
            Math.max(EXPANDED_MIN_H, eh),
          ),
        );
        setCompact(false);
      }
    } catch (e) {
      console.warn("[plugin-win] compact", e);
      setCompact(next);
    } finally {
      sizingLock.current = false;
    }
  }, []);

  return (
    <div
      className={`plugin-win-shell app-shell has-titlebar${compact ? " is-compact" : ""}${contentTheme === "dark" ? " is-content-dark" : ""}`}
    >
      <TitleBar
        variant="plugin"
        title={title}
        tagline="plugin"
        compact={compact}
        onCompactChange={(v) => applyCompact(v)}
        shellSelector=".plugin-win-shell"
      />

      <div className="plugin-win-body" hidden={compact} aria-hidden={compact}>
        {loading ? (
          <p className="plugin-win-status">loading…</p>
        ) : error ? (
          <div className="plugin-win-status is-error">
            <p>{error}</p>
            <p className="meta">id: {pluginId || "(empty)"}</p>
          </div>
        ) : !html ? (
          <p className="plugin-win-status">no ui</p>
        ) : (
          <iframe
            ref={iframeRef}
            className="plugin-win-frame"
            title={title}
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
            srcDoc={html}
            onLoad={() => pushLaunchParams()}
          />
        )}
      </div>
    </div>
  );
}
