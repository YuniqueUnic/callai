import {
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import { client } from "../../infra/client";
import {
  messageText,
  selectable,
  type ChatMsg,
} from "../../ai/chatHistory";
import { toast } from "../../ui/toast";
import { playSound } from "../../ui/sounds";

const LONG_PRESS_MS = 500;

export function useAiChatSelection(opts: {
  messages: ChatMsg[];
  setMessages: Dispatch<SetStateAction<ChatMsg[]>>;
  setHasMore: (v: boolean) => void;
}) {
  const { t } = useTranslation(["ai"]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const longPressTimer = useRef<number | null>(null);
  const longPressId = useRef<string | null>(null);
  const skipClickRef = useRef(false);

  function enterSelect(id: string) {
    setSelectMode(true);
    setSelected(new Set([id]));
    playSound("soft");
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectMode() {
    if (selectMode) exitSelect();
    else {
      setSelectMode(true);
      playSound("soft");
    }
  }

  function onBubblePointerDown(id: string, e: ReactPointerEvent) {
    if (e.button !== 0) return;
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
    }
    longPressId.current = id;
    longPressTimer.current = window.setTimeout(() => {
      if (longPressId.current === id) {
        skipClickRef.current = true;
        enterSelect(id);
      }
    }, LONG_PRESS_MS);
  }

  function clearLongPress() {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressId.current = null;
  }

  function onBubbleClick(id: string) {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    if (selectMode) toggleSelect(id);
  }

  async function copySelected() {
    const texts = opts.messages
      .filter((m) => selected.has(m.id))
      .map(messageText)
      .join("\n\n---\n\n");
    if (!texts.trim()) return;
    try {
      await navigator.clipboard.writeText(texts);
      toast.success({ message: t("ai:copied") });
      playSound("confirm");
    } catch {
      toast.error({ message: "clipboard failed" });
      playSound("warn");
    }
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      await client.deleteAiChatMessages(ids);
      opts.setMessages((m) => m.filter((msg) => !selected.has(msg.id)));
      exitSelect();
      toast.success({ message: t("ai:deleted") });
      playSound("cancel");
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
      playSound("warn");
    }
  }

  async function clearAllHistory() {
    if (!window.confirm(t("ai:clearHistoryConfirm"))) return;
    try {
      await client.clearAiChatMessages();
      opts.setMessages([]);
      opts.setHasMore(false);
      exitSelect();
      toast.success({ message: t("ai:deleted") });
      playSound("cancel");
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
    }
  }

  function selectAllLoaded() {
    setSelected(
      new Set(opts.messages.filter(selectable).map((m) => m.id)),
    );
    setSelectMode(true);
  }

  return {
    selectMode,
    selected,
    selectedCount: selected.size,
    enterSelect,
    exitSelect,
    toggleSelect,
    toggleSelectMode,
    onBubblePointerDown,
    clearLongPress,
    onBubbleClick,
    copySelected,
    deleteSelected,
    clearAllHistory,
    selectAllLoaded,
  };
}
