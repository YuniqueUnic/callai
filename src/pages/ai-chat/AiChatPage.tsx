import { useTranslation } from "react-i18next";
import { ElementImage } from "../../ui/ElementImage";
import { IconButton } from "../../ui/IconButton";
import { IconBack, IconClear } from "../../ui/icons";
import { AiChatComposer } from "./AiChatComposer";
import { AiChatStream } from "./AiChatStream";
import { AiSelectToolbar } from "./AiSelectToolbar";
import { useAiChat } from "./useAiChat";

interface Props {
  onBack: () => void;
  onAlarmCreated: () => void;
  onPluginCreated: () => void;
}

export function AiChatPage({ onBack, onAlarmCreated, onPluginCreated }: Props) {
  const { t } = useTranslation(["ai", "common"]);
  const chat = useAiChat({ onAlarmCreated, onPluginCreated });

  return (
    <div className="edit-page ai-page">
      <header className="edit-hero ai-hero">
        <div className="edit-hero-brand">
          <ElementImage
            id="chat-global"
            size={108}
            alt=""
            motion="breathe"
            className="edit-hero-deco"
          />
          <div className="edit-hero-copy">
            <h1>{t("ai:title")}</h1>
            <p>{t("common:tagline")}</p>
          </div>
        </div>
        <div className="edit-hero-tools">
          <div className="header-actions edit-hero-actions">
            {chat.historyReady && chat.messages.length > 0 ? (
              <IconButton
                label={
                  chat.selectMode ? t("ai:selectCancel") : t("ai:selectMode")
                }
                icon={<IconClear size={18} />}
                tooltipPlacement="bottom"
                sfx="soft"
                onClick={chat.toggleSelectMode}
              />
            ) : null}
            <IconButton
              label={t("common:back")}
              icon={<IconBack size={18} />}
              tooltipPlacement="bottom"
              sfx="cancel"
              onClick={onBack}
            />
          </div>
        </div>
      </header>

      {chat.selectMode ? (
        <AiSelectToolbar
          selectedCount={chat.selectedCount}
          onSelectAll={chat.selectAllLoaded}
          onCopy={() => void chat.copySelected()}
          onDelete={() => void chat.deleteSelected()}
          onClearAll={() => void chat.clearAllHistory()}
          onCancel={chat.exitSelect}
        />
      ) : null}

      <div className="ai-stage">
        <AiChatStream
          configured={chat.configured}
          historyReady={chat.historyReady}
          messages={chat.messages}
          hasMore={chat.hasMore}
          loadingOlder={chat.loadingOlder}
          busy={chat.busy}
          selectMode={chat.selectMode}
          selected={chat.selected}
          rawOpen={chat.rawOpen}
          streamRef={chat.streamRef}
          onScrollStream={chat.onScrollStream}
          onLoadOlder={() => void chat.loadOlder()}
          onToggleRaw={(id) =>
            chat.setRawOpen((r) => ({ ...r, [id]: !r[id] }))
          }
          onRetry={(text, intent) => void chat.send(text, intent)}
          onAcceptAlarm={(id, draft) => void chat.acceptAlarm(id, draft)}
          onAcceptPlugin={(id, draft) => void chat.acceptPlugin(id, draft)}
          onDismiss={chat.dismissMsg}
          onPointerDown={chat.onBubblePointerDown}
          onPointerEnd={chat.clearLongPress}
          onBubbleClick={chat.onBubbleClick}
        />

        <AiChatComposer
          intent={chat.intent}
          setIntent={chat.setIntent}
          input={chat.input}
          setInput={chat.setInput}
          busy={chat.busy}
          selectMode={chat.selectMode}
          sendKeyMode={chat.sendKeyMode}
          sendMenuOpen={chat.sendMenuOpen}
          setSendMenuOpen={chat.setSendMenuOpen}
          sendMenuRef={chat.sendMenuRef}
          taRef={chat.taRef}
          modLabel={chat.modLabel}
          onSend={() => void chat.send()}
          onKeyDown={chat.onComposerKeyDown}
          pickSendMode={chat.pickSendMode}
        />
      </div>
    </div>
  );
}
