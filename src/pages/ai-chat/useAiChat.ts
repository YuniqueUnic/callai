import { useEffect, useMemo, useRef, useState } from "react";
import type { AiSettings } from "../../domain/types";
import { DEFAULT_AI_SETTINGS } from "../../domain/types";
import { getSettingsCached } from "../../infra/settingsCache";
import type { AiIntent } from "../../ai/generate";
import {
  isModEnter,
  isPrimarySendKey,
  loadSendKeyMode,
  modKeyLabel,
  saveSendKeyMode,
  type SendKeyMode,
} from "../../ai/sendKeyMode";
import { playSound } from "../../ui/sounds";
import { useAiChatHistory } from "./useAiChatHistory";
import { useAiChatSelection } from "./useAiChatSelection";
import { useAiChatSend } from "./useAiChatSend";

export function useAiChat(opts: {
  onAlarmCreated: () => void;
  onPluginCreated: () => void;
}) {
  const [ai, setAi] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [input, setInput] = useState("");
  const [intent, setIntent] = useState<AiIntent>("alarm");
  const [busy, setBusy] = useState(false);
  const [rawOpen, setRawOpen] = useState<Record<string, boolean>>({});
  const [sendKeyMode, setSendKeyMode] = useState<SendKeyMode>(() =>
    loadSendKeyMode(),
  );
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const sendMenuRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const history = useAiChatHistory();
  const selection = useAiChatSelection({
    messages: history.messages,
    setMessages: history.setMessages,
    setHasMore: history.setHasMore,
  });

  useEffect(() => {
    void getSettingsCached().then((s) => setAi(s.ai ?? DEFAULT_AI_SETTINGS));
  }, []);

  useEffect(() => {
    if (!sendMenuOpen) return;
    const onDoc = (e: globalThis.PointerEvent) => {
      if (sendMenuRef.current?.contains(e.target as Node)) return;
      setSendMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDoc, true);
    return () => document.removeEventListener("pointerdown", onDoc, true);
  }, [sendMenuOpen]);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(160, el.scrollHeight)}px`;
  }, [input]);

  useEffect(() => {
    const el = history.streamRef.current;
    if (!el || !history.stickBottomRef.current) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [history.messages, busy, history.streamRef, history.stickBottomRef]);

  const configured = useMemo(
    () => Boolean(ai.base_url?.trim() && ai.api_key?.trim()),
    [ai],
  );
  const modLabel = modKeyLabel();

  const sendApi = useAiChatSend({
    ai,
    configured,
    messages: history.messages,
    setMessages: history.setMessages,
    busy,
    setBusy,
    input,
    setInput,
    intent,
    stickToBottom: history.stickToBottom,
    onAlarmCreated: opts.onAlarmCreated,
    onPluginCreated: opts.onPluginCreated,
  });

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;
    if (e.nativeEvent.isComposing) return;
    if (sendKeyMode === "enter") {
      if (e.shiftKey || isModEnter(e)) return;
      e.preventDefault();
      void sendApi.send();
      return;
    }
    if (isPrimarySendKey(e, "mod_enter")) {
      e.preventDefault();
      void sendApi.send();
    }
  }

  function pickSendMode(mode: SendKeyMode) {
    setSendKeyMode(mode);
    saveSendKeyMode(mode);
    setSendMenuOpen(false);
    playSound("soft");
  }

  return {
    ai,
    input,
    setInput,
    intent,
    setIntent,
    busy,
    messages: history.messages,
    historyReady: history.historyReady,
    hasMore: history.hasMore,
    loadingOlder: history.loadingOlder,
    selectMode: selection.selectMode,
    selected: selection.selected,
    selectedCount: selection.selectedCount,
    rawOpen,
    setRawOpen,
    sendKeyMode,
    sendMenuOpen,
    setSendMenuOpen,
    sendMenuRef,
    taRef,
    streamRef: history.streamRef,
    configured,
    modLabel,
    loadOlder: history.loadOlder,
    onScrollStream: history.onScrollStream,
    exitSelect: selection.exitSelect,
    onBubblePointerDown: selection.onBubblePointerDown,
    clearLongPress: selection.clearLongPress,
    onBubbleClick: selection.onBubbleClick,
    copySelected: selection.copySelected,
    deleteSelected: selection.deleteSelected,
    clearAllHistory: selection.clearAllHistory,
    selectAllLoaded: selection.selectAllLoaded,
    send: sendApi.send,
    acceptAlarm: sendApi.acceptAlarm,
    acceptPlugin: sendApi.acceptPlugin,
    dismissMsg: sendApi.dismissMsg,
    pickSendMode,
    onComposerKeyDown,
    toggleSelectMode: selection.toggleSelectMode,
  };
}
