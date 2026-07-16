import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Drawer, Modal } from "animal-island-ui";
import type { ChatMsg } from "../../ai/chatHistory";
import { ElementImage } from "../../ui/ElementImage";
import { IconButton } from "../../ui/IconButton";
import { IconBack, IconClear, IconCopy } from "../../ui/icons";
import { toast } from "../../ui/toast";
import { playSound } from "../../ui/sounds";
import { AiChatComposer } from "./AiChatComposer";
import { AiChatStream } from "./AiChatStream";
import { AiSelectToolbar } from "./AiSelectToolbar";
import { useAiChat } from "./useAiChat";

interface Props {
  onBack: () => void;
  onAlarmCreated: () => void;
  onPluginCreated: (pluginId: string) => void;
  /** Prefill composer for plugin Fix-with-AI flow. */
  fixSeed?: string | null;
  onFixSeedConsumed?: () => void;
}

interface DetailState {
  title: string;
  summary: string;
  body: string;
}

function detailFromMsg(m: ChatMsg, fallbackTitle: string): DetailState {
  if (m.role === "assistant" && m.kind === "error") {
    const body = [m.content, m.raw ? `--- raw ---\n${m.raw}` : ""]
      .filter(Boolean)
      .join("\n\n");
    return {
      title: fallbackTitle,
      summary: m.content,
      body: body || m.content,
    };
  }
  if (m.role === "assistant" && m.kind === "alarm_draft") {
    return {
      title: fallbackTitle,
      summary: m.content,
      body: JSON.stringify(m.draft, null, 2),
    };
  }
  if (m.role === "assistant" && m.kind === "plugin_draft") {
    return {
      title: fallbackTitle,
      summary: m.content,
      body: JSON.stringify(m.draft, null, 2),
    };
  }
  const text =
    m.role === "user"
      ? m.content
      : m.kind === "generating"
        ? m.streamText || m.content
        : m.content;
  return { title: fallbackTitle, summary: text, body: text };
}

export function AiChatPage({
  onBack,
  onAlarmCreated,
  onPluginCreated,
  fixSeed,
  onFixSeedConsumed,
}: Props) {
  const { t } = useTranslation(["ai", "common"]);
  const chat = useAiChat({ onAlarmCreated, onPluginCreated });
  const [detail, setDetail] = useState<DetailState | null>(null);
  type DeleteConfirm =
    | { kind: "one"; id: string }
    | { kind: "many"; count: number }
    | { kind: "all" };
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);


  useEffect(() => {
    if (!fixSeed?.trim()) return;
    chat.setIntent("plugin");
    chat.setInput(fixSeed);
    onFixSeedConsumed?.();
    // focus composer after paint
    requestAnimationFrame(() => chat.taRef.current?.focus());
  }, [fixSeed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preserve rounded tauri chrome (same fix path as logs drawer / modals).
  useEffect(() => {
    const open = detail != null || deleteConfirm != null;
    document.body.classList.toggle("callai-drawer-open", open);
    return () => document.body.classList.remove("callai-drawer-open");
  }, [detail, deleteConfirm]);

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success({ message: t("ai:copied") });
      playSound("confirm");
    } catch {
      toast.error({ message: "clipboard failed" });
      playSound("warn");
    }
  }

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
          onDelete={() => {
            if (chat.selectedCount <= 0) return;
            playSound("soft");
            setDeleteConfirm({ kind: "many", count: chat.selectedCount });
          }}
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
          streamRef={chat.streamRef}
          onScrollStream={chat.onScrollStream}
          onLoadOlder={() => void chat.loadOlder()}
          onDetail={(msg) => {
            setDetail(detailFromMsg(msg, t("ai:detailTitle")));
            playSound("soft");
          }}
          onCopy={(msg) => {
            const d = detailFromMsg(msg, t("ai:detailTitle"));
            void copyText(d.body);
          }}
          onRetry={(text, intent) => void chat.send(text, intent)}
          onAcceptAlarm={(id, draft) => void chat.acceptAlarm(id, draft)}
          onAcceptPlugin={(id, draft) => void chat.acceptPlugin(id, draft)}
          onDismiss={chat.dismissMsg}
          onDelete={(id) => {
            playSound("soft");
            setDeleteConfirm({ kind: "one", id });
          }}
          onPointerDown={chat.onBubblePointerDown}
          onPointerEnd={chat.clearLongPress}
          onBubbleClick={chat.onBubbleClick}
        />

        <AiChatComposer
          intent={chat.intent}
          setIntent={chat.setIntent}
          ai={chat.ai}
          onModelChange={chat.setModel}
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

      <Drawer
        open={detail != null}
        title={detail?.title ?? t("ai:detailTitle")}
        placement="right"
        width="min(440px, 94vw)"
        pushBackground={false}
        onClose={() => setDetail(null)}
        className="ai-detail-drawer"
      >
        {detail ? (
          <div className="ai-detail-panel">
            <div className="ai-detail-toolbar">
              <IconButton
                label={t("ai:copyError")}
                icon={<IconCopy size={16} />}
                sfx="confirm"
                onClick={() => void copyText(detail.body)}
              />
            </div>
            {detail.summary && detail.summary !== detail.body ? (
              <p className="ai-detail-summary">{detail.summary}</p>
            ) : null}
            <pre className="ai-detail-body">{detail.body}</pre>
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={deleteConfirm != null}
        title={t("common:delete")}
        typewriter={false}
        onClose={() => {
          if (deleting) return;
          playSound("cancel");
          setDeleteConfirm(null);
        }}
        onOk={() => {
          if (deleting || !deleteConfirm) return;
          playSound("warn");
          void (async () => {
            setDeleting(true);
            try {
              if (deleteConfirm.kind === "one") {
                await chat.deleteMessage(deleteConfirm.id);
              } else if (deleteConfirm.kind === "many") {
                await chat.deleteSelected();
              } else {
                await chat.clearAllHistory();
              }
              setDeleteConfirm(null);
            } finally {
              setDeleting(false);
            }
          })();
        }}
      >
        {deleteConfirm?.kind === "one"
          ? t("ai:deleteMessageConfirm")
          : deleteConfirm?.kind === "many"
            ? t("ai:deleteSelectedConfirm", { count: deleteConfirm.count })
            : t("ai:clearHistoryConfirm")}
      </Modal>

    </div>
  );
}
