import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ChatMsg } from "../../ai/chatHistory";
import { splitStreamingOutput } from "../../ai/splitModelOutput";
import { selectable } from "../../ai/chatHistory";
import type { AiIntent } from "../../ai/generate";
import { formatDateTime } from "../../domain/format";
import type { AlarmDraft, PluginDraft } from "../../domain/types";
import { IconButton } from "../../ui/IconButton";
import {
  IconChevronDown,
  IconCopy,
  IconLogs,
  IconRefresh,
  IconTrash,
} from "../../ui/icons";
import { AiAlarmDraftCard } from "../../ui/AiAlarmDraftCard";
import { AiPluginDraftCard } from "../../ui/AiPluginDraftCard";

interface Props {
  msg: ChatMsg;
  busy: boolean;
  selectMode: boolean;
  selected: boolean;
  onDetail: () => void;
  onCopy: () => void;
  onRetry: (text: string, intent: AiIntent) => void;
  onAcceptAlarm: (id: string, draft: AlarmDraft) => void;
  onAcceptPlugin: (id: string, draft: PluginDraft) => void;
  onDismiss: (id: string) => void;
  onPointerDown: (id: string, e: ReactPointerEvent) => void;
  onPointerEnd: () => void;
  onClick: (id: string) => void;
}

function bubbleClass(
  m: ChatMsg,
  selectMode: boolean,
  selected: boolean,
  collapsed: boolean,
): string {
  const parts = ["ai-bubble"];
  if (m.role === "user") parts.push("is-user");
  else parts.push("is-bot");
  if (m.role === "assistant") {
    if (m.kind === "generating") parts.push("is-generating");
    if (m.kind === "error") parts.push("is-error");
    if (m.kind === "alarm_draft" || m.kind === "plugin_draft")
      parts.push("is-draft");
  }
  if (selectMode && selected) parts.push("is-selected");
  if (selectMode && selectable(m)) parts.push("is-selectable");
  if (collapsed) parts.push("is-collapsed");
  return parts.join(" ");
}

function AiThinkBlock({
  thinking,
  defaultOpen,
}: {
  thinking: string;
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation(["ai"]);
  const [open, setOpen] = useState(Boolean(defaultOpen));
  if (!thinking.trim()) return null;
  return (
    <div className={`ai-think${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="ai-think-toggle"
        aria-expanded={open}
        onClick={(ev) => {
          ev.stopPropagation();
          setOpen((v) => !v);
        }}
        onPointerDown={(ev) => ev.stopPropagation()}
      >
        <span className="ai-think-label">{t("ai:thinkingLabel")}</span>
        <IconChevronDown
          size={14}
          className={open ? "ai-chevron" : "ai-chevron is-collapsed"}
        />
      </button>
      {open ? (
        <div className="ai-think-body">{thinking.trim()}</div>
      ) : (
        <p className="meta ai-think-preview">
          {thinking.trim().slice(0, 72)}
          {thinking.trim().length > 72 ? "…" : ""}
        </p>
      )}
    </div>
  );
}

function StopRow(props: { children: React.ReactNode }) {
  return (
    <span
      className="ai-msg-action"
      onClick={(ev) => ev.stopPropagation()}
      onPointerDown={(ev) => ev.stopPropagation()}
    >
      {props.children}
    </span>
  );
}

export function AiChatBubble({
  msg: m,
  busy,
  selectMode,
  selected,
  onDetail,
  onCopy,
  onRetry,
  onAcceptAlarm,
  onAcceptPlugin,
  onDismiss,
  onPointerDown,
  onPointerEnd,
  onClick,
}: Props) {
  const { t, i18n } = useTranslation(["ai", "common"]);
  const [collapsed, setCollapsed] = useState(false);
  const canSelect = selectable(m);
  const cls = bubbleClass(m, selectMode, selected, collapsed);
  const roleLabel =
    m.role === "user" ? t("ai:you") : t("ai:assistant");
  const createdLabel = formatDateTime(m.createdAt, i18n.language);

  const main = (() => {
    if (m.role === "user") {
      return <div className="ai-bubble-body">{m.content}</div>;
    }
    if (m.kind === "generating") {
      const secs = m.progress
        ? Math.floor((m.progress.elapsedMs || 0) / 1000)
        : 0;
      const split = splitStreamingOutput(m.streamText || "");
      const thinking = m.thinking || split.thinking;
      const bodyPreview = split.body || (!thinking ? m.streamText : "");
      return (
        <div className="ai-bubble-body ai-generating-block">
          <div className="ai-generating-head">
            <span className="ai-busy-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <div className="ai-generating-status">{m.content}</div>
          </div>
          <p className="meta ai-generating-meta">
            {t("ai:generatingProgress", {
              chars: m.progress?.chars ?? 0,
              secs,
            })}
          </p>
          {thinking ? (
            <AiThinkBlock thinking={thinking} defaultOpen={!split.hasJson} />
          ) : null}
          {bodyPreview ? (
            <div className="ai-answer-block">
              <div className="ai-answer-label">{t("ai:answerLabel")}</div>
              <pre className="ai-stream-preview">{bodyPreview}</pre>
            </div>
          ) : !thinking ? (
            <p className="meta ai-generating-hint">{t("ai:generatingHint")}</p>
          ) : null}
        </div>
      );
    }
    if (m.kind === "error") {
      return (
        <>
          {m.thinking ? (
            <AiThinkBlock thinking={m.thinking} defaultOpen={false} />
          ) : null}
          <div className="ai-answer-block">
            <div className="ai-answer-label">{t("ai:answerLabel")}</div>
            <div className="ai-bubble-body">{m.content}</div>
          </div>
        </>
      );
    }
    if (m.kind === "alarm_draft") {
      return (
        <>
          {m.thinking ? (
            <AiThinkBlock thinking={m.thinking} defaultOpen={false} />
          ) : null}
          <div className="ai-answer-block">
            <div className="ai-answer-label">{t("ai:answerLabel")}</div>
            <div className="ai-bubble-body">{m.content}</div>
          </div>
          <AiAlarmDraftCard
            draft={m.draft}
            busy={busy || selectMode}
            applied={m.applied}
            onAccept={() => onAcceptAlarm(m.id, m.draft)}
            onDismiss={() => onDismiss(m.id)}
          />
        </>
      );
    }
    if (m.kind === "plugin_draft") {
      return (
        <>
          {m.thinking ? (
            <AiThinkBlock thinking={m.thinking} defaultOpen={false} />
          ) : null}
          <div className="ai-answer-block">
            <div className="ai-answer-label">{t("ai:answerLabel")}</div>
            <div className="ai-bubble-body">{m.content}</div>
          </div>
          <AiPluginDraftCard
            draft={m.draft}
            busy={busy || selectMode}
            applied={m.applied}
            onAccept={() => onAcceptPlugin(m.id, m.draft)}
            onDismiss={() => onDismiss(m.id)}
          />
        </>
      );
    }
    return (
      <>
        {m.role === "assistant" && m.kind === "text" && m.thinking ? (
          <AiThinkBlock thinking={m.thinking} defaultOpen={false} />
        ) : null}
        <div className="ai-answer-block">
          {m.role === "assistant" && m.kind === "text" ? (
            <div className="ai-answer-label">{t("ai:answerLabel")}</div>
          ) : null}
          <div className="ai-bubble-body">{m.content}</div>
        </div>
      </>
    );
  })();

  const actions = (() => {
    if (selectMode) return null;
    if (m.role === "assistant" && m.kind === "generating") {
      return (
        <div className="ai-msg-actions" role="toolbar">
          <StopRow>
            <IconButton
              label={t("ai:detail")}
              icon={<IconLogs size={14} />}
              sfx="soft"
              onClick={onDetail}
            />
          </StopRow>
        </div>
      );
    }
    return (
      <div className="ai-msg-actions" role="toolbar">
        <StopRow>
          <IconButton
            label={t("ai:copyError")}
            icon={<IconCopy size={14} />}
            sfx="soft"
            onClick={onCopy}
          />
        </StopRow>
        <StopRow>
          <IconButton
            label={t("ai:detail")}
            icon={<IconLogs size={14} />}
            sfx="soft"
            onClick={onDetail}
          />
        </StopRow>
        {m.role === "assistant" && m.kind === "error" && m.retryText ? (
          <StopRow>
            <IconButton
              label={t("ai:retry")}
              icon={<IconRefresh size={14} />}
              variant="primary"
              loading={busy}
              sfx="confirm"
              onClick={() => onRetry(m.retryText, m.retryIntent)}
            />
          </StopRow>
        ) : null}
        {m.role === "assistant" &&
        (m.kind === "alarm_draft" || m.kind === "plugin_draft") &&
        !m.applied ? (
          <StopRow>
            <IconButton
              label={t("ai:discardDraft")}
              icon={<IconTrash size={14} />}
              sfx="cancel"
              onClick={() => onDismiss(m.id)}
            />
          </StopRow>
        ) : null}
      </div>
    );
  })();

  const infoBar = (
    <div className="ai-msg-info">
      <span className="ai-msg-role">{roleLabel}</span>
      <span className="ai-msg-time" title={m.createdAt}>
        {t("ai:createdAt", { time: createdLabel })}
      </span>
      <span className="ai-msg-info-spacer" />
      {m.role !== "assistant" || m.kind !== "generating" ? (
        <StopRow>
          <IconButton
            label={collapsed ? t("ai:expand") : t("ai:collapse")}
            icon={
              <IconChevronDown
                size={14}
                className={
                  collapsed ? "ai-chevron is-collapsed" : "ai-chevron"
                }
              />
            }
            sfx="soft"
            onClick={() => setCollapsed((v) => !v)}
          />
        </StopRow>
      ) : null}
    </div>
  );

  const inner = (
    <>
      {selectMode ? (
        <span
          className={`ai-select-check${selected ? " is-on" : ""}`}
          aria-hidden
        />
      ) : null}
      {infoBar}
      {!collapsed ? <div className="ai-msg-main">{main}</div> : null}
      {collapsed ? (
        <p className="meta ai-msg-collapsed-hint">{t("ai:collapsedHint")}</p>
      ) : null}
      {actions}
    </>
  );

  if (!canSelect) {
    return (
      <div key={m.id} className={cls}>
        {inner}
      </div>
    );
  }

  return (
    <div
      key={m.id}
      className={cls}
      data-msg-id={m.id}
      onPointerDown={(e) => onPointerDown(m.id, e)}
      onPointerUp={onPointerEnd}
      onPointerLeave={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClick={() => onClick(m.id)}
      role={selectMode ? "checkbox" : undefined}
      aria-checked={selectMode ? selected : undefined}
    >
      {inner}
    </div>
  );
}
