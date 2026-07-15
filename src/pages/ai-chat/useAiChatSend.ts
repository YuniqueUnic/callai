import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import type { AiSettings } from "../../domain/types";
import { client } from "../../infra/client";
import {
  AiParseError,
  chatReply,
  generateAlarmDraft,
  generatePluginDraft,
  guessIntent,
  type AiIntent,
} from "../../ai/generate";
import { splitStreamingOutput } from "../../ai/splitModelOutput";
import {
  nowIso,
  toStored,
  type ChatMsg,
  type StreamPhase,
} from "../../ai/chatHistory";
import { toast } from "../../ui/toast";
import { playSound } from "../../ui/sounds";

/** Rotate cozy island-style status lines while tokens stream in. */
function pickStreamingMood(
  t: (key: string) => string,
  elapsedMs: number,
): string {
  const keys = [
    "ai:moodThinking",
    "ai:moodBusy",
    "ai:moodWorking",
    "ai:moodPondering",
    "ai:moodSketching",
    "ai:moodBrewing",
  ] as const;
  const i = Math.floor(elapsedMs / 2800) % keys.length;
  return t(keys[i]);
}

function nid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function persistMsg(m: ChatMsg): Promise<void> {
  const row = toStored(m);
  if (!row) return;
  try {
    await client.upsertAiChatMessage(row);
  } catch {
    /* best-effort */
  }
}

export function useAiChatSend(opts: {
  ai: AiSettings;
  configured: boolean;
  messages: ChatMsg[];
  setMessages: Dispatch<SetStateAction<ChatMsg[]>>;
  busy: boolean;
  setBusy: (v: boolean) => void;
  input: string;
  setInput: (v: string) => void;
  intent: AiIntent;
  stickToBottom: () => void;
  onAlarmCreated: () => void;
  onPluginCreated: (pluginId: string) => void;
}) {
  const { t } = useTranslation(["ai", "alarms"]);

  function formatError(e: unknown): string {
    let msg = "";
    if (e instanceof Error) msg = e.message;
    else if (e && typeof e === "object" && "message" in e)
      msg = String((e as { message: unknown }).message ?? "");
    else if (typeof e === "string") msg = e;
    else {
      try {
        msg = JSON.stringify(e);
      } catch {
        msg = "unknown error";
      }
    }
    if (!msg || msg === "[object Object]") msg = "unknown error";
    if (msg === "AI_NOT_CONFIGURED") return t("ai:needConfig");
    if (/JSON|parse|Zod|schema|AI response/i.test(msg)) {
      return t("ai:parseFail", { msg });
    }
    return msg;
  }

  async function send(overrideText?: string, overrideIntent?: AiIntent) {
    const text = (overrideText ?? opts.input).trim();
    if (!text || opts.busy) return;
    if (!opts.configured) {
      toast.warning({ message: t("ai:needConfig") });
      return;
    }
    const resolvedIntent =
      overrideIntent ??
      (opts.intent === "chat" ? guessIntent(text) : opts.intent);
    const isRetry = overrideText != null;

    opts.setBusy(true);
    opts.stickToBottom();
    const genId = nid();
    const ts = nowIso();
    const userId = nid();
    let historySnapshot = opts.messages;

    if (!isRetry) {
      opts.setInput("");
      const userMsg: ChatMsg = {
        id: userId,
        role: "user",
        content: text,
        createdAt: ts,
      };
      historySnapshot = [...opts.messages, userMsg];
      opts.setMessages((m) => [
        ...m,
        userMsg,
        {
          id: genId,
          role: "assistant",
          kind: "generating",
          content: t("ai:phaseConnecting"),
          createdAt: nowIso(),
        },
      ]);
      void persistMsg(userMsg);
    } else {
      opts.setMessages((m) => [
        ...m,
        {
          id: genId,
          role: "assistant",
          kind: "generating",
          content: t("ai:phaseConnecting"),
          createdAt: nowIso(),
        },
      ]);
    }

    const streamHandlers = {
      onPhase: (
        phase: StreamPhase,
        info: { chars: number; elapsedMs: number },
      ) => {
        const phaseLabel =
          phase === "connecting"
            ? t("ai:phaseConnecting")
            : phase === "waiting"
              ? t("ai:phaseWaiting")
              : phase === "streaming"
                ? pickStreamingMood(t, info.elapsedMs)
                : t("ai:phaseDone");
        opts.setMessages((m) =>
          m.map((msg) =>
            msg.id === genId &&
            msg.role === "assistant" &&
            msg.kind === "generating"
              ? {
                  ...msg,
                  content: phaseLabel,
                  progress: {
                    phase,
                    chars: info.chars,
                    elapsedMs: info.elapsedMs,
                  },
                }
              : msg,
          ),
        );
      },
      onDelta: (_delta: string, full: string) => {
        const split = splitStreamingOutput(full);
        opts.setMessages((m) =>
          m.map((msg) =>
            msg.id === genId &&
            msg.role === "assistant" &&
            msg.kind === "generating"
              ? {
                  ...msg,
                  streamText: full,
                  thinking: split.thinking || undefined,
                }
              : msg,
          ),
        );
      },
    };

    try {
      let finalMsg: ChatMsg;
      if (resolvedIntent === "alarm") {
        const { draft, thinking } = await generateAlarmDraft(
          opts.ai,
          text,
          streamHandlers,
        );
        finalMsg = {
          id: genId,
          role: "assistant",
          kind: "alarm_draft",
          content: t("ai:alarmReady", { name: draft.name }),
          createdAt: nowIso(),
          draft,
          thinking: thinking || undefined,
        };
      } else if (resolvedIntent === "plugin") {
        const { draft, thinking } = await generatePluginDraft(
          opts.ai,
          text,
          streamHandlers,
        );
        finalMsg = {
          id: genId,
          role: "assistant",
          kind: "plugin_draft",
          content: t("ai:pluginReady", { name: draft.manifest.name }),
          createdAt: nowIso(),
          draft,
          thinking: thinking || undefined,
        };
      } else {
        const hist = historySnapshot
          .filter(
            (m) =>
              m.role === "user" ||
              (m.role === "assistant" && m.kind === "text"),
          )
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));
        const { reply, thinking } = await chatReply(
          opts.ai,
          text,
          hist,
          streamHandlers,
        );
        finalMsg = {
          id: genId,
          role: "assistant",
          kind: "text",
          content: reply,
          createdAt: nowIso(),
          thinking: thinking || undefined,
        };
      }
      opts.setMessages((m) =>
        m.map((msg) => (msg.id === genId ? finalMsg : msg)),
      );
      void persistMsg(finalMsg);
      playSound("confirm");
    } catch (e) {
      const errText = formatError(e);
      const raw = e instanceof AiParseError ? e.raw : "";
      const thinking = raw
        ? splitStreamingOutput(raw).thinking || undefined
        : undefined;
      const errMsg: ChatMsg = {
        id: genId,
        role: "assistant",
        kind: "error",
        content: errText,
        createdAt: nowIso(),
        retryText: text,
        retryIntent: resolvedIntent,
        raw,
        thinking,
      };
      opts.setMessages((m) => m.map((msg) => (msg.id === genId ? errMsg : msg)));
      void persistMsg(errMsg);
      if (!isRetry) opts.setInput(text);
      toast.error({ message: errText });
      playSound("warn");
    } finally {
      opts.setBusy(false);
    }
  }

  async function acceptAlarm(
    msgId: string,
    draft: import("../../domain/types").AlarmDraft,
  ) {
    if (opts.busy) return;
    opts.setBusy(true);
    try {
      await client.createAlarm(draft);
      opts.setMessages((m) =>
        m.map((msg) =>
          msg.id === msgId &&
          msg.role === "assistant" &&
          msg.kind === "alarm_draft"
            ? { ...msg, applied: true }
            : msg,
        ),
      );
      try {
        await client.setAiChatApplied(msgId, true);
      } catch {
        /* ignore */
      }
      toast.success({ message: t("alarms:createSuccess") });
      playSound("confirm");
      opts.onAlarmCreated();
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
      playSound("warn");
    } finally {
      opts.setBusy(false);
    }
  }

  async function acceptPlugin(
    msgId: string,
    draft: import("../../domain/types").PluginDraft,
  ) {
    if (opts.busy) return;
    opts.setBusy(true);
    try {
      // Fix flow: if plugin already exists, overwrite ui.html (keep id).
      const existing = await client.listPlugins().catch(() => []);
      const hit = existing.find((p) => p.id === draft.manifest.id);
      if (hit && typeof client.pluginSetSource === "function") {
        await client.pluginSetSource(draft.manifest.id, draft.ui_html);
      } else {
        await client.installPlugin(draft);
      }
      opts.setMessages((m) =>
        m.map((msg) =>
          msg.id === msgId &&
          msg.role === "assistant" &&
          msg.kind === "plugin_draft"
            ? { ...msg, applied: true }
            : msg,
        ),
      );
      try {
        await client.setAiChatApplied(msgId, true);
      } catch {
        /* ignore */
      }
      toast.success({ message: t("ai:pluginInstalled") });
      playSound("confirm");
      window.dispatchEvent(
        new CustomEvent("callai:plugins-changed", {
          detail: { id: draft.manifest.id },
        }),
      );
      opts.onPluginCreated(draft.manifest.id);
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
      playSound("warn");
    } finally {
      opts.setBusy(false);
    }
  }

  function dismissMsg(msgId: string) {
    opts.setMessages((m) => m.filter((msg) => msg.id !== msgId));
    void client.deleteAiChatMessages([msgId]).catch(() => undefined);
    playSound("cancel");
  }

  return { send, acceptAlarm, acceptPlugin, dismissMsg };
}
