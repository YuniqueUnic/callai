import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "../../infra/client";
import { fromStored, type ChatMsg } from "../../ai/chatHistory";
import { toast } from "../../ui/toast";

const PAGE_SIZE = 30;

export function useAiChatHistory() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);
  const stickBottomRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await client.listAiChatMessages(null, PAGE_SIZE);
        if (cancelled) return;
        const mapped = page.messages
          .map(fromStored)
          .filter((m): m is ChatMsg => m != null);
        setMessages(mapped);
        setHasMore(page.has_more);
        stickBottomRef.current = true;
      } catch {
        /* empty */
      } finally {
        if (!cancelled) setHistoryReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingOlder || messages.length === 0) return;
    const oldest = messages[0]?.createdAt;
    if (!oldest) return;
    const el = streamRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;
    setLoadingOlder(true);
    stickBottomRef.current = false;
    try {
      const page = await client.listAiChatMessages(oldest, PAGE_SIZE);
      const mapped = page.messages
        .map(fromStored)
        .filter((m): m is ChatMsg => m != null);
      setMessages((cur) => {
        const ids = new Set(cur.map((m) => m.id));
        const prepend = mapped.filter((m) => !ids.has(m.id));
        return [...prepend, ...cur];
      });
      setHasMore(page.has_more);
      requestAnimationFrame(() => {
        if (!el) return;
        el.scrollTop = el.scrollHeight - prevHeight + prevTop;
      });
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
    } finally {
      setLoadingOlder(false);
    }
  }, [hasMore, loadingOlder, messages]);

  function onScrollStream() {
    const el = streamRef.current;
    if (!el) return;
    const distBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickBottomRef.current = distBottom < 80;
    if (el.scrollTop < 48) void loadOlder();
  }

  function stickToBottom() {
    stickBottomRef.current = true;
  }

  return {
    messages,
    setMessages,
    historyReady,
    hasMore,
    setHasMore,
    loadingOlder,
    streamRef,
    stickBottomRef,
    loadOlder,
    onScrollStream,
    stickToBottom,
  };
}
