import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tag } from "animal-island-ui";
import type { McpLogEntry } from "../domain/types";
import { formatDateTime } from "../domain/format";
import { client } from "../infra/client";
import { ElementImage } from "../ui/ElementImage";
import { IconButton } from "../ui/IconButton";
import { IconClear, IconCopy, IconRefresh } from "../ui/icons";
import { toast } from "../ui/toast";
import { playSound } from "../ui/sounds";

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function McpLogsPanel() {
  const { t, i18n } = useTranslation(["settings", "logs", "common"]);
  const [logs, setLogs] = useState<McpLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setLogs(await client.listMcpLogs(500));
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function clearAll() {
    try {
      await client.clearMcpLogs();
      setLogs([]);
      playSound("soft");
      toast.success({
        message: t("settings:mcpLogsCleared", { defaultValue: "MCP 日志已清空" }),
      });
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
    }
  }

  return (
    <div className="logs-panel mcp-logs-panel">
      <ElementImage
        id="hero-perch"
        size={240}
        alt=""
        motion="breathe"
        className="logs-watermark"
      />

      <div className="logs-panel-scroll">
        <div className="logs-toolbar">
          <p className="meta" style={{ flex: 1, margin: 0 }}>
            {t("settings:mcpLogsCap", {
              defaultValue: "仅 MCP 工具调用 · 最多 500 条",
            })}
          </p>
          <IconButton
            label={t("settings:refreshMcpLogs", { defaultValue: "刷新" })}
            icon={<IconRefresh size={16} />}
            loading={loading}
            sfx="soft"
            onClick={() => void refresh()}
          />
          <IconButton
            label={t("settings:clearMcpLogs", { defaultValue: "清空" })}
            icon={<IconClear size={16} />}
            sfx="soft"
            onClick={() => void clearAll()}
          />
        </div>

        {loading ? (
          <p className="meta">{t("common:loading")}</p>
        ) : logs.length === 0 ? (
          <div className="empty-state compact">
            <ElementImage id="logs-clipboard" size={100} alt="" />
            <h2>
              {t("settings:mcpLogsEmpty", { defaultValue: "暂无 MCP 日志" })}
            </h2>
            <p>
              {t("settings:mcpLogsEmptyHint", {
                defaultValue:
                  "只有外部 Agent 调用 callai mcp-server 工具时才会写入。",
              })}
            </p>
          </div>
        ) : (
          <div className="log-list">
            {logs.map((row) => {
              const open = openId === row.id;
              return (
                <div
                  key={row.id}
                  className={`log-card ${row.ok ? "success" : "failed"}`}
                  onClick={() => setOpenId(open ? null : row.id)}
                >
                  <div
                    className="row"
                    style={{ justifyContent: "space-between", gap: 8 }}
                  >
                    <strong
                      style={{
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {row.tool}
                    </strong>
                    <div
                      className="row"
                      style={{ gap: 6 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconButton
                        label={t("logs:copy")}
                        icon={<IconCopy size={14} />}
                        onClick={() => {
                          void (async () => {
                            const text = [
                              `tool: ${row.tool}`,
                              `ok: ${row.ok}`,
                              `source: ${row.source}`,
                              `args: ${row.args_preview}`,
                              `result: ${row.result_preview}`,
                              row.created_at,
                            ].join("\n");
                            const ok = await copyText(text);
                            if (ok) {
                              playSound("confirm");
                              toast.success({ message: t("logs:copySuccess") });
                            } else {
                              playSound("error");
                              toast.error({ message: t("logs:copyFailed") });
                            }
                          })();
                        }}
                      />
                      <Tag color={row.ok ? "app-green" : "app-red"} size="small">
                        {row.ok ? "OK" : "ERR"}
                      </Tag>
                    </div>
                  </div>
                  <div className="meta">
                    {formatDateTime(row.created_at, i18n.language)} ·{" "}
                    {row.source}
                  </div>
                  {row.args_preview ? (
                    <div className="meta plugin-log-preview">{row.args_preview}</div>
                  ) : null}
                  {open ? (
                    <div className="log-detail">
                      <div>
                        <strong>args</strong>
                        {"\n"}
                        {row.args_preview || "—"}
                      </div>
                      <div>
                        <strong>result</strong>
                        {"\n"}
                        {row.result_preview || "—"}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
