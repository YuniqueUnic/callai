import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Input, Loading, Typewriter } from "animal-island-ui";
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
import { toast } from "../ui/toast";
import { playSound } from "../ui/sounds";
import { ElementImage } from "../ui/ElementImage";
import { IconButton } from "../ui/IconButton";
import { IconBack, IconSend } from "../ui/icons";

interface Props {
  onBack: () => void;
  onAlarmCreated: () => void;
  onPluginCreated: () => void;
}

type ChatMsg = { role: "user" | "assistant"; content: string };

export function AiChatPage({ onBack, onAlarmCreated, onPluginCreated }: Props) {
  const { t } = useTranslation(["ai", "common", "alarms"]);
  const [ai, setAi] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [input, setInput] = useState("");
  const [intent, setIntent] = useState<AiIntent>("alarm");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [previewAlarm, setPreviewAlarm] = useState<AlarmDraft | null>(null);
  const [previewPlugin, setPreviewPlugin] = useState<PluginDraft | null>(null);

  useEffect(() => {
    void getSettingsCached().then((s) => setAi(s.ai ?? DEFAULT_AI_SETTINGS));
  }, []);

  const configured = useMemo(
    () => Boolean(ai.base_url?.trim() && ai.api_key?.trim()),
    [ai],
  );

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (!configured) {
      toast.warning({ message: t("ai:needConfig") });
      return;
    }
    setBusy(true);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    const resolved = intent === "chat" ? guessIntent(text) : intent;
    try {
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
        const reply = await chatReply(ai, text, messages);
        setMessages((m) => [...m, { role: "assistant", content: reply }]);
      }
      playSound("confirm");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error({
        message: msg === "AI_NOT_CONFIGURED" ? t("ai:needConfig") : msg,
      });
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

      {/* relative chat stage: scroll body + fixed bottom composer HUD */}
      <div className="ai-stage">
        <div className="ai-scroll">
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
                    className={`ai-bubble ${m.role === "user" ? "is-user" : "is-bot"}`}
                  >
                    <div className="meta">
                      {m.role === "user" ? t("ai:you") : t("ai:assistant")}
                    </div>
                    <div className="ai-bubble-body">{m.content}</div>
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
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("ai:placeholder")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <IconButton
                label={t("ai:send")}
                icon={<IconSend size={18} />}
                variant="primary"
                loading={busy}
                disabled={!input.trim()}
                sfx="confirm"
                onClick={() => void send()}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
