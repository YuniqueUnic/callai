import { useTranslation } from "react-i18next";
import { Loading } from "animal-island-ui";
import type { ChatMsg } from "../../ai/chatHistory";
import { selectable } from "../../ai/chatHistory";
import type { AiIntent } from "../../ai/generate";
import type { AlarmDraft, PluginDraft } from "../../domain/types";
import { IconButton } from "../../ui/IconButton";
import { IconCopy, IconRefresh } from "../../ui/icons";
import { AiAlarmDraftCard } from "../../ui/AiAlarmDraftCard";
import { AiPluginDraftCard } from "../../ui/AiPluginDraftCard";
import type { PointerEvent as ReactPointerEvent } from "react";

interface Props {
  msg: ChatMsg;
  busy: boolean;
  selectMode: boolean;
  selected: boolean;
  rawOpen: boolean;
  onToggleRaw: () => void;
  onRetry: (text: string, intent: AiIntent) => void;
  onAcceptAlarm: (id: string, draft: AlarmDraft) => void;
  onAcceptPlugin: (id: string, draft: PluginDraft) => void;
  onDismiss: (id: string) => void;
  onPointerDown: (id: string, e: ReactPointerEvent) => void;
  onPointerEnd: () => void;
  onClick: (id: string) => void;
}

function bubbleClass(m: ChatMsg, selectMode: boolean, selected: boolean): string {
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
  return parts.join(" ");
}

export function AiChatBubble({
  msg: m,
  busy,
  selectMode,
  selected,
  rawOpen,
  onToggleRaw,
  onRetry,
  onAcceptAlarm,
  onAcceptPlugin,
  onDismiss,
  onPointerDown,
  onPointerEnd,
  onClick,
}: Props) {
  const { t } = useTranslation(["ai"]);
  const canSelect = selectable(m);
  const cls = bubbleClass(m, selectMode, selected);

  const body = (() => {
    if (m.role === "user") {
      return (
        <>
          <div className="meta">{t("ai:you")}</div>
          <div className="ai-bubble-body">{m.content}</div>
        </>
      );
    }
    if (m.kind === "generating") {
      const secs = m.progress
        ? Math.floor((m.progress.elapsedMs || 0) / 1000)
        : 0;
      return (
        <>
          <div className="meta">{t("ai:assistant")}</div>
          <div className="ai-bubble-body ai-generating-row">
            <Loading />
            <div className="ai-generating-copy">
              <div className="ai-generating-status">{m.content}</div>
              <p className="meta ai-generating-meta">
                {t("ai:generatingProgress", {
                  chars: m.progress?.chars ?? 0,
                  secs,
                })}
              </p>
              {m.streamText ? (
                <pre className="ai-stream-preview">{m.streamText}</pre>
              ) : (
                <p className="meta" style={{ margin: "6px 0 0" }}>
                  {t("ai:generatingHint")}
                </p>
              )}
            </div>
          </div>
        </>
      );
    }
    if (m.kind === "error") {
      return (
        <>
          <div className="meta">{t("ai:assistant")}</div>
          <div className="ai-bubble-body">{m.content}</div>
          <div className="ai-error-actions">
            {m.raw ? (
              <span
                onClick={(ev) => ev.stopPropagation()}
                onPointerDown={(ev) => ev.stopPropagation()}
              >
                <IconButton
                  label={rawOpen ? t("ai:hideRaw") : t("ai:viewRaw")}
                  icon={<IconCopy size={16} />}
                  sfx="soft"
                  onClick={onToggleRaw}
                />
              </span>
            ) : null}
            {m.retryText ? (
              <span
                onClick={(ev) => ev.stopPropagation()}
                onPointerDown={(ev) => ev.stopPropagation()}
              >
                <IconButton
                  label={t("ai:retry")}
                  icon={<IconRefresh size={16} />}
                  variant="primary"
                  loading={busy}
                  sfx="confirm"
                  onClick={() => onRetry(m.retryText, m.retryIntent)}
                />
              </span>
            ) : null}
          </div>
          {rawOpen && m.raw ? (
            <pre className="ai-stream-preview ai-raw-preview">{m.raw}</pre>
          ) : null}
        </>
      );
    }
    if (m.kind === "alarm_draft") {
      return (
        <>
          <div className="meta">{t("ai:assistant")}</div>
          <div className="ai-bubble-body">{m.content}</div>
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
          <div className="meta">{t("ai:assistant")}</div>
          <div className="ai-bubble-body">{m.content}</div>
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
        <div className="meta">{t("ai:assistant")}</div>
        <div className="ai-bubble-body">{m.content}</div>
      </>
    );
  })();

  if (!canSelect) {
    return (
      <div key={m.id} className={cls}>
        {body}
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
      {selectMode ? (
        <span
          className={`ai-select-check${selected ? " is-on" : ""}`}
          aria-hidden
        />
      ) : null}
      {body}
    </div>
  );
}
