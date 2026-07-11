import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input, Tag } from "animal-island-ui";
import type { ExecutionLog, ExecutionStatus } from "../domain/types";
import { client } from "../infra/client";
import { ElementImage } from "../ui/ElementImage";

interface Props {
  alarmId?: string | null;
  onBack: () => void;
}

export function LogsPage({ alarmId, onBack }: Props) {
  const { t } = useTranslation(["logs", "common"]);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ExecutionStatus | "all">("all");
  const [openId, setOpenId] = useState<number | null>(null);

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
    <>
      <div className="app-header">
        <div>
          <h1>{t("logs:title")}</h1>
        </div>
        <div className="header-actions">
          <Button size="small" onClick={onBack}>{t("common:back")}</Button>
        </div>
      </div>
      <div className="app-main">
        <div className="row" style={{ marginBottom: 14 }}>
          <Input
            value={query}
            allowClear
            placeholder={t("logs:search")}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void refresh();
            }}
            style={{ minWidth: 240 }}
          />
          <Button size="small" onClick={() => void refresh()}>
            {t("common:confirm")}
          </Button>
          <div className="segmented">
            {(["all", "success", "failed", "retrying"] as const).map((s) => (
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
        </div>

        {logs.length === 0 ? (
          <div className="empty-state">
            <ElementImage id="logs-clipboard" size={140} alt="" />
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
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{log.alarm_name}</strong>
                  <Tag
                    color={
                      log.status === "success"
                        ? "app-green"
                        : log.status === "failed"
                          ? "app-red"
                          : "app-yellow"
                    }
                    size="small"
                  >
                    {t(`logs:${log.status}` as "logs:success")}
                  </Tag>
                </div>
                <div className="meta">
                  {new Date(log.started_at).toLocaleString()} · {t("logs:duration")}{" "}
                  {log.duration_ms ?? "—"}ms · {t("logs:retries")} {log.retry_count}
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
    </>
  );
}
