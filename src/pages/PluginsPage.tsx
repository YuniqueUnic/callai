import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Drawer, Modal, Table } from "animal-island-ui";
import { ElementImage } from "../ui/ElementImage";
import type { PluginHistoryEntry, PluginSummary } from "../domain/types";
import { client } from "../infra/client";
import { isTauri } from "../infra/tauriApi";
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
import { usePluginZip } from "./plugins/usePluginZip";
import type { BuiltinCatalogItem } from "./plugins/types";
import { PluginListCard } from "./plugins/PluginListCard";
import { PluginRegistryPanel } from "./plugins/PluginRegistryPanel";

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
  });

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (tabActive) void refresh();
  }, [tabActive, refresh]);

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

  return (
    <div className="page plugins-page">
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

      <div
        className={`app-main plugins-main${dragOver ? " is-drag-over" : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files || []);
          const z = files.find(
            (f) =>
              f.name.toLowerCase().endsWith(".zip") ||
              f.type.includes("zip"),
          );
          if (!z) {
            toast.error({
              message: t("plugins:dropZipOnly", {
                defaultValue: "请拖入 .zip 插件包",
              }),
            });
            return;
          }
          void z.arrayBuffer().then((buf) =>
            zip.beginImportBytes(new Uint8Array(buf)),
          );
        }}
      >
        {dragOver ? (
          <div className="plugins-drop-hint" aria-hidden>
            {t("plugins:dropToInstall", {
              defaultValue: "松开以安装插件包",
            })}
          </div>
        ) : null}

        <div className="plugin-view-seg" role="tablist">
          <button
            type="button"
            className={pluginView === "installed" ? "on" : ""}
            onClick={() => setPluginView("installed")}
          >
            {t("plugins:tabInstalled", { defaultValue: "已安装" })}
          </button>
          <button
            type="button"
            className={pluginView === "registry" ? "on" : ""}
            onClick={() => setPluginView("registry")}
          >
            {t("plugins:tabRegistry", { defaultValue: "市场" })}
          </button>
        </div>

        {pluginView === "registry" ? (
          <PluginRegistryPanel
            installedIds={new Set(plugins.map((p) => p.id))}
            onInstalled={refresh}
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
                onOpen={() => void openPlugin(p)}
                onLogs={() => void showPluginLogs(p)}
                onFix={() => void fixPluginWithAi(p)}
                onExport={() => zip.setExportTarget(p)}
                onRestore={() => {
                  void (async () => {
                    try {
                      await client.restoreBuiltinPlugin(p.id, false);
                      await refresh();
                      toast.success({
                        message: t("plugins:restored", {
                          defaultValue: "已从内置目录恢复 UI",
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
        onClose={() => setConfirmDelete(null)}
        onOk={() => {
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

      <PluginExportModal
        target={zip.exportTarget}
        exporting={zip.exporting}
        onClose={() => zip.setExportTarget(null)}
        onExport={(d) => void zip.doExport(d)}
      />
      <PluginImportConflictModal
        open={zip.conflictOpen}
        pluginId={zip.conflictId}
        onCancel={zip.cancelConflict}
        onChoose={(mode) => void zip.importWithMode(mode)}
      />
    </div>
  );
}
