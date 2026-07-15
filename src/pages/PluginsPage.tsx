import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Drawer, Modal, Table, Tag } from "animal-island-ui";
import { ElementImage } from "../ui/ElementImage";
import type { McpLogEntry, PluginHistoryEntry, PluginSummary } from "../domain/types";
import { client } from "../infra/client";
import { isTauri } from "../infra/tauriApi";
import { toast } from "../ui/toast";
import { playSound } from "../ui/sounds";
import { IconButton } from "../ui/IconButton";
import {
  IconBack,
  IconChat,
  IconClear,
  IconLogs,
  IconOpen,
  IconRefresh,
  IconTrash,
} from "../ui/icons";
import { PluginLogsPanel } from "./PluginLogsPanel";

interface Props {
  onOpenAi: () => void;
  /** Open AI assistant with a prefilled fix brief for a plugin. */
  onFixPlugin?: (brief: {
    pluginId: string;
    pluginName: string;
    source: string;
    history: PluginHistoryEntry[];
    consoleLines: { level: string; args: string[]; t: number }[];
  }) => void;
  /** When keep-alive tab becomes active, parent sets true so we re-fetch. */
  tabActive?: boolean;
}

type PluginsTab = "list" | "mcp";

export function PluginsPage({ onOpenAi, onFixPlugin, tabActive = true }: Props) {
  const { t } = useTranslation(["plugins", "common"]);
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PluginsTab>("list");
  const [active, setActive] = useState<PluginSummary | null>(null);
  const [history, setHistory] = useState<PluginHistoryEntry[]>([]);
  const [uiHtml, setUiHtml] = useState<string | null>(null);
  const [mcpLogs, setMcpLogs] = useState<McpLogEntry[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PluginSummary | null>(null);
  const [logTarget, setLogTarget] = useState<PluginSummary | null>(null);
  const [consoleLines, setConsoleLines] = useState<
    { level: string; args: string[]; t: number }[]
  >([]);
  /** Logs drawer history (isolated from in-page runtime table). */
  const [logHistory, setLogHistory] = useState<PluginHistoryEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);


  // Same rounded-window chrome fix as main logs / AI detail drawers.
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
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMcpLogs = useCallback(async () => {
    setMcpLoading(true);
    try {
      setMcpLogs(await client.listMcpLogs(500));
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
    } finally {
      setMcpLoading(false);
    }
  }, []);

  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Keep-alive tab: re-fetch when this pane becomes active again.
  useEffect(() => {
    if (tabActive) void refresh();
  }, [tabActive, refresh]);

  useEffect(() => {
    function onPluginsChanged(ev: Event) {
      const detail = (ev as CustomEvent<{ id?: string; open?: boolean }>).detail;
      void refresh();
      setTab("list");
      if (detail?.id && detail.open !== false) {
        setPendingOpenId(detail.id);
      }
    }
    window.addEventListener("callai:plugins-changed", onPluginsChanged);
    return () =>
      window.removeEventListener("callai:plugins-changed", onPluginsChanged);
  }, [refresh]);

  useEffect(() => {
    if (tab === "mcp") void loadMcpLogs();
  }, [tab, loadMcpLogs]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const d = ev.data as {
        __callai_plugin_invoke?: boolean;
        reqId?: string;
        pluginId?: string;
        method?: string;
        args?: unknown;
      };
      if (!d?.__callai_plugin_invoke || !d.reqId || !d.pluginId || !d.method) return;
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
        client.pluginListHistory(p.id, 80),
        typeof client.pluginGetConsole === "function"
          ? client.pluginGetConsole(p.id, 200)
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
        client.pluginListHistory(p.id, 40),
        typeof client.pluginGetConsole === "function"
          ? client.pluginGetConsole(p.id, 200)
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
    setTab("list");
    try {
      // Prefer independent OS window (generic HTML host). Fall back to in-page iframe.
      if (isTauri() && typeof client.openPluginWindow === "function") {
        await client.openPluginWindow(p.id);
        playSound("soft");
        // still refresh history meta in list
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
        client.pluginListHistory(p.id, 50),
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
            label={t("plugins:mcpLogs")}
            icon={<IconLogs size={18} />}
            tooltipPlacement="bottom"
            sfx="soft"
            onClick={() => {
              setTab("mcp");
              setActive(null);
              setUiHtml(null);
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
        <div className="segmented plugins-tabs" role="tablist" aria-label={t("plugins:title")}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "list"}
            className={tab === "list" ? "active" : ""}
            onClick={() => {
              playSound("soft");
              setTab("list");
            }}
          >
            {t("plugins:tabList")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "mcp"}
            className={tab === "mcp" ? "active" : ""}
            onClick={() => {
              playSound("soft");
              setTab("mcp");
              setActive(null);
              setUiHtml(null);
            }}
          >
            {t("plugins:tabMcp")}
          </button>
        </div>

        {tab === "list" ? (
          <>
            {loading ? (
              <p className="meta">{t("common:loading")}</p>
            ) : plugins.length === 0 ? (
              <Card color="default" className="form-panel empty-card">
                <ElementImage id="sprout-fresh" size={88} alt="" motion="breathe" />
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
                  <Card key={p.id} className="plugin-card form-panel">
                    <div className="plugin-card-head">
                      <div className="plugin-card-meta">
                        <strong className="plugin-name">{p.name}</strong>
                        <div className="meta plugin-id-line">
                          <span className="plugin-id">{p.id}</span>
                          <span aria-hidden>·</span>
                          <span>v{p.version}</span>
                        </div>
                      </div>
                      <div className="icon-actions plugin-card-actions">
                        <IconButton
                          label={t("plugins:open")}
                          icon={<IconOpen size={16} />}
                          variant="primary"
                          sfx="soft"
                          onClick={() => void openPlugin(p)}
                        />
                        <IconButton
                          label={t("plugins:logs", { defaultValue: "日志" })}
                          icon={<IconLogs size={16} />}
                          sfx="soft"
                          onClick={() => void showPluginLogs(p)}
                        />
                        <IconButton
                          label={t("plugins:fixWithAi", { defaultValue: "AI 修复" })}
                          icon={<IconChat size={16} />}
                          sfx="confirm"
                          onClick={() => void fixPluginWithAi(p)}
                        />
                        <IconButton
                          label={t("common:delete")}
                          icon={<IconTrash size={16} />}
                          variant="danger"
                          sfx="soft"
                          onClick={() => setConfirmDelete(p)}
                        />
                      </div>
                    </div>
                    <p className="plugin-desc">{p.description || t("plugins:noDesc")}</p>
                    <div className="plugin-tags">
                      {p.permissions.map((perm) => (
                        <Tag key={perm} size="small">
                          {perm}
                        </Tag>
                      ))}
                    </div>
                    <div className="meta plugin-stats">
                      <span>
                        {t("plugins:records")}: {p.record_count}
                      </span>
                      {p.last_run_at ? (
                        <span>
                          {t("plugins:lastRun")}:{" "}
                          {new Date(p.last_run_at).toLocaleString()}
                        </span>
                      ) : null}
                    </div>
                  </Card>
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
                      dataSource={history as unknown as Record<string, unknown>[]}
                    />
                  </div>
                ) : null}
              </Card>
            ) : null}
          </>
        ) : (
          <Card className="form-panel mcp-log-panel">
            <div className="plugin-card-head">
              <div>
                <strong>{t("plugins:mcpLogs")}</strong>
                <p className="meta" style={{ margin: "4px 0 0" }}>
                  {t("plugins:mcpCap")}
                </p>
              </div>
              <div className="icon-actions">
                <IconButton
                  label={t("plugins:refreshMcp")}
                  icon={<IconRefresh size={16} />}
                  loading={mcpLoading}
                  sfx="soft"
                  onClick={() => void loadMcpLogs()}
                />
                <IconButton
                  label={t("plugins:clearMcp")}
                  icon={<IconClear size={16} />}
                  variant="danger"
                  sfx="warn"
                  onClick={() => {
                    void client.clearMcpLogs().then(() => void loadMcpLogs());
                  }}
                />
              </div>
            </div>
            {mcpLoading ? (
              <p className="meta">{t("common:loading")}</p>
            ) : mcpLogs.length === 0 ? (
              <p className="meta">{t("plugins:mcpEmpty")}</p>
            ) : (
              <div className="mcp-table-wrap">
                <Table
                  rowKey="id"
                  columns={[
                    { title: "Tool", dataIndex: "tool" },
                    {
                      title: "OK",
                      dataIndex: "ok",
                      render: (v) => (v ? "Y" : "N"),
                    },
                    { title: "Source", dataIndex: "source" },
                    {
                      title: t("plugins:when"),
                      dataIndex: "created_at",
                      render: (v) =>
                        typeof v === "string" ? new Date(v).toLocaleString() : "",
                    },
                  ]}
                  dataSource={mcpLogs as unknown as Record<string, unknown>[]}
                />
              </div>
            )}
          </Card>
        )}
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
        /* Same as main logs drawer: avoid pushBackground square-corner bug. */
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
                    message: String((e as { message?: string })?.message ?? e),
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
    </div>
  );
}
