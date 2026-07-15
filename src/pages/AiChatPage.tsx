import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Card, Loading, Typewriter } from "animal-island-ui";
import type { AiSettings, AlarmDraft, PluginDraft } from "../domain/types";
import { DEFAULT_AI_SETTINGS } from "../domain/types";
import { client } from "../infra/client";
import { getSettingsCached } from "../infra/settingsCache";
import {
  chatReply,
  generateAlarmDraft,
  generatePluginDraft,
  guessIntent,
  type AiIntent,
} from "../ai/generate";
import {
  isModEnter,
  isPrimarySendKey,
  loadSendKeyMode,
  modKeyLabel,
  saveSendKeyMode,
  type SendKeyMode,
} from "../ai/sendKeyMode";
import { toast } from "../ui/toast";
import { playSound } from "../ui/sounds";
import { ElementImage } from "../ui/ElementImage";
import { IconButton } from "../ui/IconButton";
import { IconBack, IconChevronDown, IconRefresh, IconSend } from "../ui/icons";

interface Props {
  onBack: () => void;
  onAlarmCreated: () => void;
  onPluginCreated: () => void;
}

type ChatMsg =
  | { role: "user" | "assistant"; content: string; kind?: "text" }
  | {
      role: "assistant";
      content: string;
      kind: "error";
      /** Last user text for retry */
      retryText: string;
      retryIntent: AiIntent;
    };

export function AiChatPage({ onBack, onAlarmCreated, onPluginCreated }: Props) {
  const { t } = useTranslation(["ai", "common", "alarms"]);
  const [ai, setAi] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [input, setInput] = useState("");
  const [intent, setIntent] = useState<AiIntent>("alarm");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [previewAlarm, setPreviewAlarm] = useState<AlarmDraft | null>(null);
  const [previewPlugin, setPreviewPlugin] = useState<PluginDraft | null>(null);
  const [sendKeyMode, setSendKeyMode] = useState<SendKeyMode>(() =>
    loadSendKeyMode(),
  );
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const sendMenuRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void getSettingsCached().then((s) => setAi(s.ai ?? DEFAULT_AI_SETTINGS));
  }, []);

  useEffect(() => {
    if (!sendMenuOpen) return;
    const onDoc = (e: PointerEvent) => {
      if (sendMenuRef.current?.contains(e.target as Node)) return;
      setSendMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDoc, true);
    return () => document.removeEventListener("pointerdown", onDoc, true);
  }, [sendMenuOpen]);

  // Auto-grow textarea (capped by CSS max-height).
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 160;
    el.style.height = `${Math.min(max, el.scrollHeight)}px`;
  }, [input]);

  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const configured = useMemo(
    () => Boolean(ai.base_url?.trim() && ai.api_key?.trim()),
    [ai],
  );

  const modLabel = modKeyLabel();

  async function runGenerate(
    text: string,
    resolved: AiIntent,
    history: ChatMsg[],
  ) {
    if (resolved === "alarm") {
      const draft = await generateAlarmDraft(ai, text);
      setPreviewAlarm(draft);
      setPreviewPlugin(null);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: t("ai:alarmReady", { name: draft.name }) },
      ]);
    } else if (resolved === "plugin") {
      const draft = await generatePluginDraft(ai, text);
      setPreviewPlugin(draft);
      setPreviewAlarm(null);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: t("ai:pluginReady", { name: draft.manifest.name }),
        },
      ]);
    } else {
      const hist = history
        .filter((m) => m.kind !== "error")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
      const reply = await chatReply(ai, text, hist);
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    }
  }

  function formatError(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "AI_NOT_CONFIGURED") return t("ai:needConfig");
    if (/JSON|parse|Zod|schema|AI response/i.test(msg)) {
      return t("ai:parseFail", { msg });
    }
    return msg;
  }

  async function send(overrideText?: string, overrideIntent?: AiIntent) {
    const text = (overrideText ?? input).trim();
    if (!text || busy) return;
    if (!configured) {
      toast.warning({ message: t("ai:needConfig") });
      return;
    }
    const resolvedIntent =
      overrideIntent ?? (intent === "chat" ? guessIntent(text) : intent);
    const isRetry = overrideText != null;

    setBusy(true);
    if (!isRetry) {
      setInput("");
      setMessages((m) => [...m, { role: "user", content: text }]);
    }

    const historySnapshot = messages;
    try {
      await runGenerate(
        text,
        resolvedIntent,
        isRetry
          ? historySnapshot
          : [...historySnapshot, { role: "user", content: text }],
      );
      playSound("confirm");
    } catch (e) {
      const errText = formatError(e);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          kind: "error",
          content: errText,
          retryText: text,
          retryIntent: resolvedIntent,
        },
      ]);
      // Restore composer text on first-send failure so user can edit.
      if (!isRetry) setInput(text);
      toast.error({ message: errText });
      playSound("warn");
    } finally {
      setBusy(false);
    }
  }

  async function applyAlarm() {
    if (!previewAlarm) return;
    setBusy(true);
    try {
      await client.createAlarm(previewAlarm);
      toast.success({ message: t("alarms:createSuccess") });
      setPreviewAlarm(null);
      onAlarmCreated();
      playSound("confirm");
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function applyPlugin() {
    if (!previewPlugin) return;
    setBusy(true);
    try {
      await client.installPlugin(previewPlugin);
      toast.success({ message: t("ai:pluginInstalled") });
      setPreviewPlugin(null);
      onPluginCreated();
      playSound("confirm");
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
    } finally {
      setBusy(false);
    }
  }

  function onComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;
    if (e.nativeEvent.isComposing) return;

    if (sendKeyMode === "enter") {
      // Enter sends; Shift+Enter or Mod+Enter inserts newline.
      if (e.shiftKey || isModEnter(e)) return;
      e.preventDefault();
      void send();
      return;
    }

    // mod_enter: only Mod+Enter sends; plain Enter = newline
    if (isPrimarySendKey(e, "mod_enter")) {
      e.preventDefault();
      void send();
    }
  }

  function pickSendMode(mode: SendKeyMode) {
    setSendKeyMode(mode);
    saveSendKeyMode(mode);
    setSendMenuOpen(false);
    playSound("soft");
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

      <div className="ai-stage">
        <div className="ai-scroll" ref={streamRef}>
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
              {messages.length === 0 ? (
                <div className="ai-welcome">
                  <Typewriter speed={18}>{t("ai:welcome")}</Typewriter>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div
                    key={`${m.role}-${i}`}
                    className={`ai-bubble ${
                      m.role === "user" ? "is-user" : "is-bot"
                    } ${m.kind === "error" ? "is-error" : ""}`}
                  >
                    <div className="meta">
                      {m.role === "user" ? t("ai:you") : t("ai:assistant")}
                    </div>
                    <div className="ai-bubble-body">{m.content}</div>
                    {m.kind === "error" ? (
                      <div className="ai-error-actions">
                        <IconButton
                          label={t("ai:retry")}
                          icon={<IconRefresh size={16} />}
                          variant="primary"
                          loading={busy}
                          sfx="confirm"
                          onClick={() =>
                            void send(m.retryText, m.retryIntent)
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ))
              )}
              {busy ? (
                <div className="ai-loading">
                  <Loading />
                </div>
              ) : null}
            </div>
          </Card>

          {previewAlarm ? (
            <Card color="app-teal" className="form-panel ai-preview">
              <div className="panel-head">
                <h3>{previewAlarm.name}</h3>
                <ElementImage
                  id="create-alarm"
                  size={40}
                  alt=""
                  className="section-illus"
                />
              </div>
              <pre className="ai-json">
                {JSON.stringify(previewAlarm, null, 2)}
              </pre>
              <div className="row-actions">
                <IconButton
                  label={t("ai:createAlarm")}
                  icon={<ElementImage id="success-check" size={18} alt="" />}
                  variant="primary"
                  loading={busy}
                  sfx="confirm"
                  onClick={() => void applyAlarm()}
                />
                <IconButton
                  label={t("common:cancel")}
                  icon={<IconBack size={16} />}
                  sfx="cancel"
                  onClick={() => setPreviewAlarm(null)}
                />
              </div>
            </Card>
          ) : null}

          {previewPlugin ? (
            <Card color="app-orange" className="form-panel ai-preview">
              <div className="panel-head">
                <h3>
                  {previewPlugin.manifest.name}
                  <span className="meta" style={{ marginLeft: 8 }}>
                    {previewPlugin.manifest.id}
                  </span>
                </h3>
                <ElementImage
                  id="task-checklist"
                  size={40}
                  alt=""
                  className="section-illus"
                />
              </div>
              <pre className="ai-json">
                {JSON.stringify(previewPlugin.manifest, null, 2)}
              </pre>
              <div className="row-actions">
                <IconButton
                  label={t("ai:installPlugin")}
                  icon={<ElementImage id="success-check" size={18} alt="" />}
                  variant="primary"
                  loading={busy}
                  sfx="confirm"
                  onClick={() => void applyPlugin()}
                />
                <IconButton
                  label={t("common:cancel")}
                  icon={<IconBack size={16} />}
                  sfx="cancel"
                  onClick={() => setPreviewPlugin(null)}
                />
              </div>
            </Card>
          ) : null}
        </div>

        <div className="ai-composer-hud" role="region" aria-label={t("ai:send")}>
          <Card color="default" className="form-panel ai-composer-card">
            <div className="field">
              <label className="label">{t("ai:intentLabel")}</label>
              <div className="segmented">
                {(
                  [
                    ["alarm", "intentAlarm"],
                    ["plugin", "intentPlugin"],
                    ["chat", "intentChat"],
                  ] as const
                ).map(([key, labelKey]) => (
                  <button
                    key={key}
                    type="button"
                    className={intent === key ? "active" : ""}
                    onClick={() => {
                      playSound("soft");
                      setIntent(key);
                    }}
                  >
                    {t(`ai:${labelKey}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-composer-row">
              <textarea
                ref={taRef}
                className="ai-composer-textarea"
                value={input}
                rows={1}
                placeholder={t("ai:placeholder")}
                disabled={busy}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onComposerKeyDown}
              />
              <div className="ai-send-cluster" ref={sendMenuRef}>
                <IconButton
                  label={t("ai:send")}
                  icon={<IconSend size={18} />}
                  variant="primary"
                  loading={busy}
                  disabled={!input.trim()}
                  sfx="confirm"
                  onClick={() => void send()}
                />
                <button
                  type="button"
                  className="ai-send-caret"
                  aria-label={t("ai:sendKeyMenu")}
                  aria-expanded={sendMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => {
                    playSound("soft");
                    setSendMenuOpen((v) => !v);
                  }}
                >
                  <IconChevronDown size={14} />
                </button>
                {sendMenuOpen ? (
                  <div className="ai-send-menu" role="menu">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={sendKeyMode === "enter"}
                      className={sendKeyMode === "enter" ? "active" : ""}
                      onClick={() => pickSendMode("enter")}
                    >
                      {t("ai:sendKeyEnter")}
                    </button>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={sendKeyMode === "mod_enter"}
                      className={sendKeyMode === "mod_enter" ? "active" : ""}
                      onClick={() => pickSendMode("mod_enter")}
                    >
                      {t("ai:sendKeyModEnter", { mod: modLabel })}
                    </button>
                    <p className="meta ai-send-menu-hint">
                      {sendKeyMode === "enter"
                        ? t("ai:sendKeyEnterHint")
                        : t("ai:sendKeyModEnterHint", { mod: modLabel })}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
            <p className="meta ai-composer-key-hint">
              {sendKeyMode === "enter"
                ? t("ai:sendKeyEnterHint")
                : t("ai:sendKeyModEnterHint", { mod: modLabel })}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
