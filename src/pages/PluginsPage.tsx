import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Card, Drawer, Modal, Table } from "animal-island-ui";
import { ElementImage } from "../ui/ElementImage";
import type { PluginHistoryEntry, PluginSummary } from "../domain/types";
import { client } from "../infra/client";
import { isTauri } from "../infra/tauriApi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "../ui/toast";
import { playSound } from "../ui/sounds";
import { IconButton } from "../ui/IconButton";
import {
  IconBack,
  IconChat,
  IconRestore,
  IconUpload,
} from "../ui/icons";
import { PluginLogsPanel } from "./PluginLogsPanel";
import { PluginExportModal } from "./plugins/PluginExportModal";
import { PluginImportConflictModal } from "./plugins/PluginImportConflictModal";
import { PluginRestoreModal } from "./plugins/PluginRestoreModal";
import { PluginImportProgressModal } from "./plugins/PluginImportProgressModal";
import { usePluginZip } from "./plugins/usePluginZip";
import type { BuiltinCatalogItem } from "./plugins/types";
import { PluginListCard } from "./plugins/PluginListCard";
import {
  PluginRegistryPanel,
  buildMarketUpdates,
  type RegistryIndex,
} from "./plugins/PluginRegistryPanel";
import type { MarketUpdateInfo } from "../domain/pluginVersion";

interface Props {
  onOpenAi: () => void;
  onFixPlugin?: (brief: {
    pluginId: string;
    pluginName: string;
    source: string;
    history: PluginHistoryEntry[];
    consoleLines: { level: string; args: string[]; t: number }[];
  }) => void;
  tabActive?: boolean;
}

export function PluginsPage({
  onOpenAi,
  onFixPlugin,
  tabActive = true,
}: Props) {
  const { t } = useTranslation(["plugins", "common"]);
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<PluginSummary | null>(null);
  const [history, setHistory] = useState<PluginHistoryEntry[]>([]);
  const [uiHtml, setUiHtml] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PluginSummary | null>(
    null,
  );
  const [confirmRestore, setConfirmRestore] = useState<PluginSummary | null>(
    null,
  );
  const [restoreWipeData, setRestoreWipeData] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [logTarget, setLogTarget] = useState<PluginSummary | null>(null);
  const [consoleLines, setConsoleLines] = useState<
    { level: string; args: string[]; t: number }[]
  >([]);
  const [logHistory, setLogHistory] = useState<PluginHistoryEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [catalog, setCatalog] = useState<BuiltinCatalogItem[]>([]);
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);
  const [pluginView, setPluginView] = useState<"installed" | "registry">(
    "installed",
  );
  const [marketIndex, setMarketIndex] = useState<RegistryIndex | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const open = logTarget != null;
    document.body.classList.toggle("callai-drawer-open", open);
    document.body.classList.toggle("callai-logs-open", open);
    return () => {
      document.body.classList.remove("callai-drawer-open");
      document.body.classList.remove("callai-logs-open");
    };
  }, [logTarget]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setPlugins(await client.listPlugins());
      if (typeof client.listBuiltinCatalog === "function") {
        try {
          setCatalog(await client.listBuiltinCatalog());
        } catch {
          /* optional */
        }
      }
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const zip = usePluginZip({
    onChanged: refresh,
    t: t as (k: string, o?: Record<string, unknown>) => string,
    toastSuccess: (o) => toast.success(o),
    toastError: (o) => toast.error(o),
    playConfirm: () => playSound("confirm"),
    playWarn: () => playSound("warn"),
    getInstalledVersion: (id) => plugins.find((p) => p.id === id)?.version,
  });

  const installedVersions = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of plugins) m.set(p.id, p.version);
    return m;
  }, [plugins]);

  const marketUpdates = useMemo(
    () => buildMarketUpdates(marketIndex, installedVersions),
    [marketIndex, installedVersions],
  );

  async function updateFromMarket(id: string, info: MarketUpdateInfo) {
    if (typeof client.importPluginZipUrl !== "function") return;
    setUpdatingId(id);
    try {
      const summary = await client.importPluginZipUrl(
        info.zip_url,
        "overwrite",
        false,
        false,
      );
      if (summary) {
        playSound("confirm");
        toast.success({
          message: t("plugins:updated", {
            defaultValue: "已更新 {{name}} → v{{version}}",
            name: summary.name,
            version: summary.version,
          }),
        });
        await refresh();
      }
    } catch (e) {
      playSound("warn");
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
    } finally {
      setUpdatingId(null);
    }
  }


  const loadMarket = useCallback(async () => {
    if (typeof client.fetchPluginRegistry !== "function") return;
    try {
      const idx = await client.fetchPluginRegistry(null);
      setMarketIndex(idx);
    } catch {
      /* registry optional offline */
    }
  }, []);

  useEffect(() => {
    void refresh();
    void loadMarket();
  }, [refresh, loadMarket]);

  useEffect(() => {
    if (tabActive) {
      void refresh();
      void loadMarket();
    }
  }, [tabActive, refresh, loadMarket]);

  useEffect(() => {
    function onPluginsChanged(ev: Event) {
      const detail = (ev as CustomEvent<{ id?: string; open?: boolean }>)
        .detail;
      void refresh();
      if (detail?.id && detail.open !== false) setPendingOpenId(detail.id);
    }
    window.addEventListener("callai:plugins-changed", onPluginsChanged);
    return () =>
      window.removeEventListener("callai:plugins-changed", onPluginsChanged);
  }, [refresh]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const d = ev.data as {
        __callai_plugin_invoke?: boolean;
        reqId?: string;
        pluginId?: string;
        method?: string;
        args?: unknown;
      };
      if (!d?.__callai_plugin_invoke || !d.reqId || !d.pluginId || !d.method)
        return;
      void client
        .pluginInvoke(d.pluginId, d.method, d.args ?? {})
        .then((value) => {
          (ev.source as Window | null)?.postMessage(
            { __callai_plugin_result: true, reqId: d.reqId, ok: true, value },
            "*",
          );
        })
        .catch((err) => {
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
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function showPluginLogs(p: PluginSummary) {
    setLogTarget(p);
    setLogLoading(true);
    try {
      const [hist, cons] = await Promise.all([
        client.pluginListHistory(p.id, 100),
        typeof client.pluginGetConsole === "function"
          ? client.pluginGetConsole(p.id, 100)
          : Promise.resolve([]),
      ]);
      setLogHistory(hist);
      setConsoleLines(cons);
      playSound("soft");
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
    } finally {
      setLogLoading(false);
    }
  }

  async function fixPluginWithAi(p: PluginSummary) {
    if (!onFixPlugin) {
      onOpenAi();
      return;
    }
    try {
      const [source, hist, cons] = await Promise.all([
        typeof client.pluginGetSource === "function"
          ? client.pluginGetSource(p.id)
          : client.pluginUiHtml(p.id),
        client.pluginListHistory(p.id, 100),
        typeof client.pluginGetConsole === "function"
          ? client.pluginGetConsole(p.id, 100)
          : Promise.resolve([]),
      ]);
      playSound("confirm");
      onFixPlugin({
        pluginId: p.id,
        pluginName: p.name,
        source,
        history: hist,
        consoleLines: cons,
      });
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
    }
  }

  async function openPlugin(p: PluginSummary) {
    try {
      if (isTauri() && typeof client.openPluginWindow === "function") {
        await client.openPluginWindow(p.id);
        playSound("soft");
        try {
          await client.pluginMarkRun(p.id);
          await refresh();
        } catch {
          /* ignore */
        }
        return;
      }
      setActive(p);
      const [hist, html] = await Promise.all([
        client.pluginListHistory(p.id, 100),
        client.pluginUiHtml(p.id),
      ]);
      setHistory(hist);
      setUiHtml(html);
      await client.pluginMarkRun(p.id);
      playSound("soft");
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
    }
  }

  useEffect(() => {
    if (!pendingOpenId || loading) return;
    const hit = plugins.find((p) => p.id === pendingOpenId);
    if (!hit) return;
    setPendingOpenId(null);
    void openPlugin(hit);
  }, [pendingOpenId, plugins, loading]);

  async function remove(p: PluginSummary) {
    try {
      await client.deletePlugin(p.id);
      setConfirmDelete(null);
      if (active?.id === p.id) {
        setActive(null);
        setUiHtml(null);
      }
      await refresh();
      window.dispatchEvent(new CustomEvent("callai:plugins-changed"));
      playSound("warn");
      toast.success({ message: t("plugins:deleted") });
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
    }
  }

  async function restoreBuiltin(p: PluginSummary, wipeData: boolean) {
    setRestoring(true);
    try {
      await client.restoreBuiltinPlugin(p.id, wipeData);
      setConfirmRestore(null);
      setRestoreWipeData(false);
      await refresh();
      window.dispatchEvent(new CustomEvent("callai:plugins-changed"));
      playSound("soft");
      toast.success({
        message: wipeData
          ? t("plugins:restoredWithWipe", {
              defaultValue: "已恢复内置并清空数据",
            })
          : t("plugins:restored", {
              defaultValue: "已从内置目录恢复 UI",
            }),
      });
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
    } finally {
      setRestoring(false);
    }
  }

  const beginImportBytesRef = useRef(zip.beginImportBytes);
  beginImportBytesRef.current = zip.beginImportBytes;
  const beginImportPathRef = useRef(zip.beginImportPathSimple);
  beginImportPathRef.current = zip.beginImportPathSimple;

  const dropLabel = t("plugins:dropUpload", { defaultValue: "上传" });
  const dropHint = t("plugins:dropToInstall", {
    defaultValue: "松开以安装插件包",
  });

  const showDropOverlay = useCallback(() => {
    document.documentElement.classList.add("callai-plugin-file-drag");
    document.body.classList.add("callai-plugin-file-drag");
    setDragOver(true);
  }, []);
  const hideDropOverlay = useCallback(() => {
    document.documentElement.classList.remove("callai-plugin-file-drag");
    document.body.classList.remove("callai-plugin-file-drag");
    setDragOver(false);
  }, []);

  /**
   * Tauri: OS file drops come as native `onDragDropEvent` with filesystem paths.
   * HTML5 DataTransfer.files is empty / unused while Tauri dragDrop is enabled.
   * Overlay uses document class so it paints during drag (no React re-render needed).
   */
  useEffect(() => {
    if (!tabActive) {
      hideDropOverlay();
      return;
    }

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    if (isTauri()) {
      void (async () => {
        try {
          const un = await getCurrentWindow().onDragDropEvent((event) => {
            const payload = event.payload;
            if (payload.type === "enter" || payload.type === "over") {
              showDropOverlay();
              return;
            }
            if (payload.type === "leave") {
              hideDropOverlay();
              return;
            }
            if (payload.type === "drop") {
              hideDropOverlay();
              const paths = payload.paths ?? [];
              const zipPath = paths.find((p) =>
                p.toLowerCase().endsWith(".zip"),
              );
              if (!zipPath) {
                playSound("warn");
                toast.error({
                  message: t("plugins:dropZipOnly", {
                    defaultValue: "请拖入插件压缩包",
                  }),
                });
                return;
              }
              playSound("soft");
              void beginImportPathRef.current(zipPath);
            }
          });
          if (cancelled) {
            un();
            return;
          }
          unlisten = un;
        } catch (err) {
          console.warn("[plugins] onDragDropEvent", err);
        }
      })();
    } else {
      const isFileDrag = (e: DragEvent) => {
        const dt = e.dataTransfer;
        if (!dt) return false;
        const types = Array.from(dt.types || []);
        if (types.length === 0) return true;
        return types.some(
          (x) =>
            x === "Files" ||
            x === "application/x-moz-file" ||
            x.toLowerCase().includes("file"),
        );
      };
      const onOver = (e: DragEvent) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        try {
          if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        } catch {
          /* ignore */
        }
        showDropOverlay();
      };
      const onLeave = (e: DragEvent) => {
        if (e.relatedTarget == null) hideDropOverlay();
      };
      const onDrop = (e: DragEvent) => {
        e.preventDefault();
        hideDropOverlay();
        const files = Array.from(e.dataTransfer?.files || []);
        const z = files.find(
          (f) =>
            f.name.toLowerCase().endsWith(".zip") || f.type.includes("zip"),
        );
        if (!z) {
          playSound("warn");
          toast.error({
            message: t("plugins:dropZipOnly", {
              defaultValue: "请拖入插件压缩包",
            }),
          });
          return;
        }
        playSound("soft");
        void z.arrayBuffer().then((buf) => {
          void beginImportBytesRef.current(new Uint8Array(buf), z.name);
        });
      };
      window.addEventListener("dragenter", onOver, true);
      window.addEventListener("dragover", onOver, true);
      window.addEventListener("dragleave", onLeave, true);
      window.addEventListener("drop", onDrop, true);
      return () => {
        hideDropOverlay();
        window.removeEventListener("dragenter", onOver, true);
        window.removeEventListener("dragover", onOver, true);
        window.removeEventListener("dragleave", onLeave, true);
        window.removeEventListener("drop", onDrop, true);
      };
    }

    return () => {
      cancelled = true;
      hideDropOverlay();
      unlisten?.();
    };
  }, [tabActive, t, showDropOverlay, hideDropOverlay]);

  const dropOverlay =
    typeof document !== "undefined"
      ? createPortal(
          <div
            id="callai-plugin-drop-overlay"
            className="plugins-drop-overlay"
            role="status"
            aria-live="polite"
          >
            <div className="plugins-drop-card">
              <span className="plugins-drop-plus" aria-hidden>
                +
              </span>
              <span className="plugins-drop-label">{dropLabel}</span>
              <span className="plugins-drop-sub meta">{dropHint}</span>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`page plugins-page${dragOver ? " is-drag-over" : ""}`}>
      {tabActive ? dropOverlay : null}

      <header className="soft-header plugins-hero">
        <div className="plugins-hero-brand">
          <ElementImage id="task-checklist" size={72} alt="" motion="hop" />
          <div className="soft-header-copy">
            <h1>{t("plugins:title")}</h1>
            <p className="meta">{t("plugins:subtitle")}</p>
          </div>
        </div>
        <div className="header-actions plugins-hero-actions">
          <IconButton
            label={t("plugins:importZip", { defaultValue: "安装 zip" })}
            icon={<IconUpload size={18} />}
            tooltipPlacement="bottom"
            sfx="soft"
            disabled={zip.importing}
            onClick={() => void zip.pickAndImport()}
          />
          <IconButton
            label={t("plugins:upgradeBuiltins", { defaultValue: "更新内置" })}
            icon={<IconRestore size={18} />}
            tooltipPlacement="bottom"
            sfx="soft"
            onClick={() => {
              void (async () => {
                try {
                  if (typeof client.upgradeBuiltinPlugins !== "function")
                    return;
                  const up = await client.upgradeBuiltinPlugins();
                  await refresh();
                  playSound(up.length > 0 ? "confirm" : "soft");
                  toast.success({
                    message: t("plugins:upgraded", {
                      defaultValue: "已更新 {{n}} 个内置插件",
                      n: up.length,
                    }),
                  });
                } catch (e) {
                  toast.error({
                    message: String(
                      (e as { message?: string })?.message ?? e,
                    ),
                  });
                }
              })();
            }}
          />
          <IconButton
            label={t("plugins:createWithAi")}
            icon={<IconChat size={18} />}
            variant="primary"
            tooltipPlacement="bottom"
            sfx="confirm"
            onClick={onOpenAi}
          />
        </div>
      </header>

      <div className="app-main plugins-main">
        <div className="plugin-view-seg" role="tablist">
          <button
            type="button"
            className={pluginView === "installed" ? "on" : ""}
            onClick={() => {
              playSound("soft");
              setPluginView("installed");
            }}
          >
            {t("plugins:tabInstalled", { defaultValue: "已安装" })}
          </button>
          <button
            type="button"
            className={pluginView === "registry" ? "on" : ""}
            onClick={() => {
              playSound("soft");
              setPluginView("registry");
            }}
          >
            {t("plugins:tabRegistry", { defaultValue: "市场" })}
          </button>
        </div>

        {pluginView === "registry" ? (
          <PluginRegistryPanel
            installedVersions={installedVersions}
            onInstalled={refresh}
            onIndexLoaded={setMarketIndex}
          />
        ) : loading ? (
          <p className="meta">{t("common:loading")}</p>
        ) : plugins.length === 0 ? (
          <Card color="default" className="form-panel empty-card">
            <ElementImage
              id="sprout-fresh"
              size={88}
              alt=""
              motion="breathe"
            />
            <p>{t("plugins:empty")}</p>
            <div className="row-actions" style={{ justifyContent: "center" }}>
              <IconButton
                label={t("plugins:createWithAi")}
                icon={<IconChat size={18} />}
                variant="primary"
                sfx="confirm"
                onClick={onOpenAi}
              />
            </div>
          </Card>
        ) : (
          <div className="plugin-list">
            {plugins.map((p) => (
              <PluginListCard
                key={p.id}
                plugin={p}
                catalog={catalog}
                marketUpdate={marketUpdates.get(p.id)}
                onOpen={() => void openPlugin(p)}
                onLogs={() => void showPluginLogs(p)}
                onFix={() => void fixPluginWithAi(p)}
                onExport={() => zip.setExportTarget(p)}
                onRestore={() => {
                  setRestoreWipeData(false);
                  setConfirmRestore(p);
                }}
                onUpdate={() => {
                  const info = marketUpdates.get(p.id);
                  if (info) void updateFromMarket(p.id, info);
                }}
                updating={updatingId === p.id}
                onDelete={() => setConfirmDelete(p)}
              />
            ))}
          </div>
        )}

        {active && uiHtml ? (
          <Card className="plugin-runtime form-panel">
            <div className="plugin-card-head">
              <strong className="plugin-runtime-title">
                {active.name}
                <span className="meta"> — {t("plugins:runtime")}</span>
              </strong>
              <IconButton
                label={t("common:back")}
                icon={<IconBack size={16} />}
                sfx="cancel"
                onClick={() => {
                  setActive(null);
                  setUiHtml(null);
                }}
              />
            </div>
            <iframe
              className="plugin-frame"
              title={active.name}
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
              srcDoc={uiHtml}
            />
            {history.length > 0 ? (
              <div className="plugin-history-wrap">
                <Table
                  rowKey="id"
                  columns={[
                    { title: t("plugins:method"), dataIndex: "method" },
                    {
                      title: "OK",
                      dataIndex: "ok",
                      render: (v) => (v ? "Y" : "N"),
                    },
                    {
                      title: t("plugins:when"),
                      dataIndex: "created_at",
                      render: (v) =>
                        typeof v === "string"
                          ? new Date(v).toLocaleString()
                          : "",
                    },
                  ]}
                  dataSource={
                    history as unknown as Record<string, unknown>[]
                  }
                />
              </div>
            ) : null}
          </Card>
        ) : null}
      </div>

      <Drawer
        open={logTarget != null}
        title={
          logTarget
            ? `${t("plugins:logs")} · ${logTarget.name}`
            : t("plugins:logs")
        }
        placement="right"
        width="min(420px, 92vw)"
        pushBackground={false}
        onClose={() => setLogTarget(null)}
        className="logs-drawer plugin-logs-drawer"
      >
        {logTarget ? (
          <PluginLogsPanel
            plugin={logTarget}
            history={logHistory}
            consoleLines={consoleLines}
            loading={logLoading}
            onRefresh={() => void showPluginLogs(logTarget)}
            onClearConsole={() => {
              void (async () => {
                try {
                  if (typeof client.pluginClearConsole === "function") {
                    await client.pluginClearConsole(logTarget.id);
                  }
                  setConsoleLines([]);
                  playSound("soft");
                  toast.success({ message: t("plugins:consoleCleared") });
                } catch (e) {
                  toast.error({
                    message: String(
                      (e as { message?: string })?.message ?? e,
                    ),
                  });
                }
              })();
            }}
          />
        ) : null}
      </Drawer>

      <Modal
        open={!!confirmDelete}
        title={t("common:delete")}
        typewriter={false}
        onClose={() => {
          playSound("cancel");
          setConfirmDelete(null);
        }}
        onOk={() => {
          playSound("warn");
          if (confirmDelete) void remove(confirmDelete);
        }}
      >
        {t("plugins:deleteConfirm")}
        {confirmDelete ? (
          <div className="meta" style={{ marginTop: 8 }}>
            {confirmDelete.name}
          </div>
        ) : null}
      </Modal>

      <PluginRestoreModal
        target={confirmRestore}
        wipeData={restoreWipeData}
        restoring={restoring}
        onWipeChange={setRestoreWipeData}
        onClose={() => {
          if (restoring) return;
          setConfirmRestore(null);
          setRestoreWipeData(false);
        }}
        onConfirm={() => {
          if (confirmRestore && !restoring) {
            void restoreBuiltin(confirmRestore, restoreWipeData);
          }
        }}
      />

      <PluginExportModal
        target={zip.exportTarget}
        exporting={zip.exporting}
        onClose={() => zip.setExportTarget(null)}
        onExport={(d) => void zip.doExport(d)}
      />
      <PluginImportConflictModal
        open={zip.conflictOpen}
        pluginId={zip.conflictMeta?.pluginId ?? zip.conflictId}
        packageVersion={zip.conflictMeta?.packageVersion}
        installedVersion={zip.conflictMeta?.installedVersion}
        packageName={zip.conflictMeta?.packageName}
        includesData={zip.conflictMeta?.includesData}
        onCancel={zip.cancelConflict}
        onChoose={(choice) => void zip.importWithChoice(choice)}
      />
      <PluginImportProgressModal
        progress={zip.importProgress}
        onClose={zip.resetProgress}
      />
    </div>
  );
}
