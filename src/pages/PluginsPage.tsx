import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Modal, Table, Tag } from "animal-island-ui";
import { ElementImage } from "../ui/ElementImage";
import type { McpLogEntry, PluginHistoryEntry, PluginSummary } from "../domain/types";
import { client } from "../infra/client";
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

interface Props {
  onOpenAi: () => void;
}

type PluginsTab = "list" | "mcp";

export function PluginsPage({ onOpenAi }: Props) {
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

  useEffect(() => {
    void refresh();
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

  async function openPlugin(p: PluginSummary) {
    setActive(p);
    setTab("list");
    try {
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

  async function remove(p: PluginSummary) {
    try {
      await client.deletePlugin(p.id);
      setConfirmDelete(null);
      if (active?.id === p.id) {
        setActive(null);
        setUiHtml(null);
      }
      await refresh();
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
                  sandbox="allow-scripts"
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
