import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input, Modal, Tag } from "animal-island-ui";
import type { ExecutionLog, ExecutionStatus } from "../domain/types";
import { formatDateTime } from "../domain/format";
import { client } from "../infra/client";
import { ElementImage } from "../ui/ElementImage";
import { IconButton } from "../ui/IconButton";
import { IconSearch, IconTrash } from "../ui/icons";
import { toast } from "../ui/toast";

interface Props {
  alarmId?: string | null;
}

export function LogsPanel({ alarmId }: Props) {
  const { t, i18n } = useTranslation(["logs", "common"]);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ExecutionStatus | "all">("all");
  const [openId, setOpenId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  async function refresh() {
    const list = await client.listLogs({
      alarm_id: alarmId ?? null,
      status: status === "all" ? null : status,
      query: query || null,
      limit: 100,
    });
    setLogs(list);
  }

  useEffect(() => {
    void refresh();
  }, [alarmId, status]);

  return (
    <div className="logs-panel">
      {/* Fixed to drawer viewport bottom-right (under scrolling list) */}
      <ElementImage
        id="hero-perch"
        size={240}
        alt=""
        motion="breathe"
        className="logs-watermark"
      />

      <div className="logs-panel-scroll">
        <div className="logs-toolbar">
          <Input
            value={query}
            allowClear
            placeholder={t("logs:search")}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void refresh();
            }}
            style={{ flex: 1, minWidth: 0 }}
          />
          <IconButton
            label={t("common:confirm")}
            icon={<IconSearch size={16} />}
            variant="primary"
            onClick={() => void refresh()}
          />
        </div>
        <div className="segmented logs-filter">
          {(["all", "success", "failed", "timeout", "canceled", "retrying"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={status === s ? "active" : ""}
              onClick={() => setStatus(s)}
            >
              {t(`logs:${s}` as "logs:all")}
            </button>
          ))}
        </div>

        {logs.length === 0 ? (
          <div className="empty-state compact">
            <ElementImage id="logs-clipboard" size={100} alt="" />
            <h2>{t("logs:empty")}</h2>
          </div>
        ) : (
          <div className="log-list">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`log-card ${log.status}`}
                onClick={() => setOpenId(openId === log.id ? null : log.id)}
              >
                <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{log.alarm_name}</strong>
                  <div className="row" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
                    <IconButton
                      label={t("logs:delete")}
                      icon={<IconTrash size={14} />}
                      variant="danger"
                      onClick={() => setConfirmDeleteId(log.id)}
                    />
                  <Tag
                    color={
                      log.status === "success"
                        ? "app-green"
                        : log.status === "failed" || log.status === "timeout"
                          ? "app-red"
                          : log.status === "canceled"
                            ? "brown"
                            : "app-yellow"
                    }
                    size="small"
                  >
                    {t(`logs:${log.status}` as "logs:success")}
                  </Tag>
                  </div>
                </div>
                <div className="meta">
                  {formatDateTime(log.started_at, i18n.language)} ·{" "}
                  {t("logs:duration")} {log.duration_ms ?? "—"}ms ·{" "}
                  {t("logs:retries")} {log.retry_count}
                </div>
                <div className="meta">{log.command_preview}</div>
                {openId === log.id && (
                  <div className="log-detail">
                    <div>
                      <strong>{t("logs:command")}</strong>: {log.command_preview}
                    </div>
                    <div>
                      <strong>{t("logs:exitCode")}</strong>: {log.exit_code ?? "—"}
                    </div>
                    <div>
                      <strong>{t("logs:stdout")}</strong>
                      {"\n"}
                      {log.stdout || "—"}
                    </div>
                    <div>
                      <strong>{t("logs:stderr")}</strong>
                      {"\n"}
                      {log.stderr || "—"}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={confirmDeleteId != null}
        title={t("logs:delete")}
        typewriter={false}
        onClose={() => setConfirmDeleteId(null)}
        onOk={() => {
          if (confirmDeleteId == null) return;
          void (async () => {
            try {
              await client.deleteLog(confirmDeleteId);
              toast.success({ message: t("logs:deleteSuccess") });
              setConfirmDeleteId(null);
              setOpenId((id) => (id === confirmDeleteId ? null : id));
              await refresh();
            } catch (err) {
              toast.error({
                message: t("logs:delete"),
                description: String((err as { message?: string })?.message ?? err),
              });
            }
          })();
        }}
      >
        {t("logs:deleteOneConfirm")}
      </Modal>

    </div>
  );
}
