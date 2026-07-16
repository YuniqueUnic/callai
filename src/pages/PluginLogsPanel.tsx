import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tag } from "animal-island-ui";
import type { PluginHistoryEntry, PluginSummary } from "../domain/types";
import { formatDateTime } from "../domain/format";
import { ElementImage } from "../ui/ElementImage";
import { IconButton } from "../ui/IconButton";
import { IconClear, IconCopy, IconRefresh } from "../ui/icons";
import { toast } from "../ui/toast";
import { playSound } from "../ui/sounds";

export type PluginConsoleLine = {
  level: string;
  args: string[];
  t: number;
};

type Filter = "all" | "invoke" | "console" | "errors";

interface Props {
  plugin: PluginSummary;
  history: PluginHistoryEntry[];
  consoleLines: PluginConsoleLine[];
  loading?: boolean;
  onRefresh: () => void;
  onClearConsole: () => void;
}

function isErrorLevel(level: string): boolean {
  const l = (level || "").toLowerCase();
  return l === "error" || l === "err" || l === "fatal" || l === "exception";
}

function isWarnLevel(level: string): boolean {
  return /warn/i.test(level || "");
}

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

function formatConsoleLine(e: PluginConsoleLine): string {
  const ts = e.t ? new Date(e.t).toLocaleString() : "";
  return `[${ts}] ${e.level}: ${e.args.join(" ")}`;
}

function formatHistoryCopy(h: PluginHistoryEntry, labels: {
  method: string;
  args: string;
  result: string;
}): string {
  return [
    `${labels.method}: ${h.method}`,
    `OK: ${h.ok ? "Y" : "N"}`,
    `${labels.args}: ${h.args_preview || "—"}`,
    `${labels.result}: ${h.result_preview || "—"}`,
    h.created_at,
  ].join("\n");
}

export function PluginLogsPanel({
  plugin,
  history,
  consoleLines,
  loading = false,
  onRefresh,
  onClearConsole,
}: Props) {
  const { t, i18n } = useTranslation(["plugins", "logs", "common"]);
  const [filter, setFilter] = useState<Filter>("all");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const sortedConsole = useMemo(
    () => [...(consoleLines ?? [])].sort((a, b) => (b.t || 0) - (a.t || 0)),
    [consoleLines],
  );

  const sortedHistory = useMemo(
    () =>
      [...(history ?? [])].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [history],
  );

  const errorCount = useMemo(
    () => sortedConsole.filter((e) => isErrorLevel(e.level)).length,
    [sortedConsole],
  );

  const showInvoke = filter === "all" || filter === "invoke";
  const showConsole =
    filter === "all" || filter === "console" || filter === "errors";

  const visibleConsole =
    filter === "errors"
      ? sortedConsole.filter((e) => isErrorLevel(e.level))
      : sortedConsole;

  const empty =
    (showInvoke ? sortedHistory.length === 0 : true) &&
    (showConsole ? visibleConsole.length === 0 : true);

  async function handleCopy(text: string) {
    const ok = await copyText(text);
    if (ok) {
      playSound("confirm");
      toast.success({ message: t("logs:copySuccess") });
    } else {
      playSound("error");
      toast.error({ message: t("logs:copyFailed") });
    }
  }

  return (
    <div className="logs-panel plugin-logs-panel">
      <ElementImage
        id="hero-perch"
        size={240}
        alt=""
        motion="breathe"
        className="logs-watermark"
      />

      <div className="logs-panel-scroll">
        <div className="logs-toolbar plugin-logs-toolbar">
          <div className="plugin-logs-toolbar-meta meta">
            <strong>{plugin.name}</strong>
            <span aria-hidden>·</span>
            <span className="plugin-id">{plugin.id}</span>
          </div>
          <IconButton
            label={t("plugins:refreshLogs")}
            icon={<IconRefresh size={16} />}
            loading={loading}
            sfx="soft"
            onClick={onRefresh}
          />
          <IconButton
            label={t("plugins:clearConsole")}
            icon={<IconClear size={16} />}
            sfx="warn"
            onClick={onClearConsole}
          />
        </div>

        <div className="segmented logs-filter" role="tablist">
          {(
            [
              ["all", t("plugins:filterAll")],
              ["invoke", t("plugins:filterInvoke")],
              ["console", t("plugins:filterConsole")],
              ["errors", t("plugins:filterErrors", { count: errorCount })],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={filter === key ? "active" : ""}
              onClick={() => {
                playSound("soft");
                setFilter(key);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="meta">{t("common:loading")}</p>
        ) : empty ? (
          <div className="empty-state compact">
            <ElementImage id="logs-clipboard" size={100} alt="" />
            <h2>{t("plugins:logsEmpty")}</h2>
            <p>{t("plugins:logsEmptyHint")}</p>
          </div>
        ) : (
          <div className="log-list plugin-log-list">
            {showInvoke &&
              sortedHistory.map((h) => {
                const key = `h-${h.id}`;
                const open = openKey === key;
                return (
                  <div
                    key={key}
                    className={`log-card ${h.ok ? "success" : "failed"}`}
                    onClick={() => {
                      playSound("soft");
                      setOpenKey(open ? null : key);
                    }}
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
                        {h.method}
                      </strong>
                      <div
                        className="row"
                        style={{ gap: 6 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <IconButton
                          label={t("logs:copy")}
                          icon={<IconCopy size={14} />}
                          sfx="soft"
                          onClick={() => {
                            void handleCopy(
                              formatHistoryCopy(h, {
                                method: t("plugins:method"),
                                args: t("plugins:args"),
                                result: t("plugins:result"),
                              }),
                            );
                          }}
                        />
                        <Tag
                          color={h.ok ? "app-green" : "app-red"}
                          size="small"
                        >
                          {h.ok ? "OK" : "ERR"}
                        </Tag>
                      </div>
                    </div>
                    <div className="meta">
                      {formatDateTime(h.created_at, i18n.language)} ·{" "}
                      {t("plugins:invokeHistory")}
                    </div>
                    {h.args_preview ? (
                      <div className="meta plugin-log-preview">
                        {h.args_preview}
                      </div>
                    ) : null}
                    {open ? (
                      <div className="log-detail">
                        <div>
                          <strong>{t("plugins:method")}</strong>: {h.method}
                        </div>
                        <div>
                          <strong>{t("plugins:args")}</strong>
                          {"\n"}
                          {h.args_preview || "—"}
                        </div>
                        <div>
                          <strong>{t("plugins:result")}</strong>
                          {"\n"}
                          {h.result_preview || "—"}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}

            {showConsole &&
              visibleConsole.map((e, idx) => {
                const key = `c-${e.t}-${idx}`;
                const open = openKey === key;
                const err = isErrorLevel(e.level);
                const warn = isWarnLevel(e.level);
                const statusClass = err ? "failed" : warn ? "" : "success";
                const text = formatConsoleLine(e);
                return (
                  <div
                    key={key}
                    className={`log-card ${statusClass}`.trim()}
                    onClick={() => {
                      playSound("soft");
                      setOpenKey(open ? null : key);
                    }}
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
                        console.{e.level || "log"}
                      </strong>
                      <div
                        className="row"
                        style={{ gap: 6 }}
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        <IconButton
                          label={t("logs:copy")}
                          icon={<IconCopy size={14} />}
                          sfx="soft"
                          onClick={() => {
                            void handleCopy(text);
                          }}
                        />
                        <Tag
                          color={
                            err ? "app-red" : warn ? "app-yellow" : "app-green"
                          }
                          size="small"
                        >
                          {(e.level || "log").toUpperCase()}
                        </Tag>
                      </div>
                    </div>
                    <div className="meta">
                      {e.t
                        ? formatDateTime(
                            new Date(e.t).toISOString(),
                            i18n.language,
                          )
                        : "—"}{" "}
                      · {t("plugins:console")}
                    </div>
                    <div className="meta plugin-log-preview">
                      {e.args.join(" ")}
                    </div>
                    {open ? (
                      <div className="log-detail">{text}</div>
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
