import { useTranslation } from "react-i18next";
import { Card, Loading, Typewriter } from "animal-island-ui";
import type { ChatMsg } from "../../ai/chatHistory";
import type { AiIntent } from "../../ai/generate";
import type { AlarmDraft, PluginDraft } from "../../domain/types";
import { ElementImage } from "../../ui/ElementImage";
import { AiChatBubble } from "./AiChatBubble";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

interface Props {
  configured: boolean;
  historyReady: boolean;
  messages: ChatMsg[];
  hasMore: boolean;
  loadingOlder: boolean;
  busy: boolean;
  selectMode: boolean;
  selected: Set<string>;
  streamRef: RefObject<HTMLDivElement | null>;
  onScrollStream: () => void;
  onLoadOlder: () => void;
  onDetail: (msg: ChatMsg) => void;
  onCopy: (msg: ChatMsg) => void;
  onRetry: (text: string, intent: AiIntent) => void;
  onAcceptAlarm: (id: string, draft: AlarmDraft) => void;
  onAcceptPlugin: (id: string, draft: PluginDraft) => void;
  onDismiss: (id: string) => void;
  onPointerDown: (id: string, e: ReactPointerEvent) => void;
  onPointerEnd: () => void;
  onBubbleClick: (id: string) => void;
}

export function AiChatStream({
  configured,
  historyReady,
  messages,
  hasMore,
  loadingOlder,
  busy,
  selectMode,
  selected,
  streamRef,
  onScrollStream,
  onLoadOlder,
  onDetail,
  onCopy,
  onRetry,
  onAcceptAlarm,
  onAcceptPlugin,
  onDismiss,
  onPointerDown,
  onPointerEnd,
  onBubbleClick,
}: Props) {
  const { t } = useTranslation(["ai"]);

  return (
    <div className="ai-scroll" ref={streamRef} onScroll={onScrollStream}>
      {!configured ? (
        <Card color="default" className="form-panel ai-config-hint">
          <div className="panel-head">
            <h3>{t("ai:needConfig")}</h3>
            <ElementImage
              id="notify-badge"
              size={40}
              alt=""
              className="section-illus"
            />
          </div>
          <p className="meta">{t("ai:needConfigHint")}</p>
        </Card>
      ) : null}

      <Card color="default" className="form-panel ai-stream-card">
        <div className="panel-head">
          <h3>{t("ai:assistant")}</h3>
          <ElementImage
            id="sprout-fresh"
            size={40}
            alt=""
            className="section-illus"
          />
        </div>

        <div className="ai-chat-stream">
          {hasMore ? (
            <div className="ai-load-older">
              <button
                type="button"
                className="ai-load-older-btn"
                disabled={loadingOlder}
                onClick={onLoadOlder}
              >
                {loadingOlder ? t("ai:loadingOlder") : t("ai:loadOlder")}
              </button>
            </div>
          ) : null}

          {!historyReady ? (
            <div className="ai-welcome">
              <Loading />
            </div>
          ) : messages.length === 0 ? (
            <div className="ai-welcome">
              <Typewriter speed={18}>{t("ai:welcome")}</Typewriter>
              <p className="meta" style={{ marginTop: 8 }}>
                {t("ai:longPressHint")}
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <AiChatBubble
                key={m.id}
                msg={m}
                busy={busy}
                selectMode={selectMode}
                selected={selected.has(m.id)}
                onDetail={() => onDetail(m)}
                onCopy={() => onCopy(m)}
                onRetry={onRetry}
                onAcceptAlarm={onAcceptAlarm}
                onAcceptPlugin={onAcceptPlugin}
                onDismiss={onDismiss}
                onPointerDown={onPointerDown}
                onPointerEnd={onPointerEnd}
                onClick={onBubbleClick}
              />
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
