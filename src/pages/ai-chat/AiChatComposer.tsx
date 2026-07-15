import type { KeyboardEvent, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "animal-island-ui";
import type { AiIntent } from "../../ai/generate";
import type { SendKeyMode } from "../../ai/sendKeyMode";
import type { AiSettings } from "../../domain/types";
import { IconButton } from "../../ui/IconButton";
import { IconChevronDown, IconSend } from "../../ui/icons";
import { ModelAutocomplete } from "../../ui/ModelAutocomplete";
import { playSound } from "../../ui/sounds";

interface Props {
  intent: AiIntent;
  setIntent: (v: AiIntent) => void;
  ai: AiSettings;
  onModelChange: (model: string) => void;
  input: string;
  setInput: (v: string) => void;
  busy: boolean;
  selectMode: boolean;
  sendKeyMode: SendKeyMode;
  sendMenuOpen: boolean;
  setSendMenuOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  sendMenuRef: RefObject<HTMLDivElement | null>;
  taRef: RefObject<HTMLTextAreaElement | null>;
  modLabel: string;
  onSend: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  pickSendMode: (mode: SendKeyMode) => void;
}

export function AiChatComposer({
  intent,
  setIntent,
  ai,
  onModelChange,
  input,
  setInput,
  busy,
  selectMode,
  sendKeyMode,
  sendMenuOpen,
  setSendMenuOpen,
  sendMenuRef,
  taRef,
  modLabel,
  onSend,
  onKeyDown,
  pickSendMode,
}: Props) {
  const { t } = useTranslation(["ai", "settings"]);

  return (
    <div className="ai-composer-hud" role="region" aria-label={t("ai:send")}>
      <Card color="default" className="form-panel ai-composer-card">
        {/* Row 1: intent left · model right (single compact band) */}
        <div className="ai-composer-toolbar" role="group" aria-label={t("ai:intentLabel")}>
          <div className="segmented ai-composer-intent-seg">
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
                disabled={busy || selectMode}
                onClick={() => {
                  playSound("soft");
                  setIntent(key);
                }}
              >
                {t(`ai:${labelKey}`)}
              </button>
            ))}
          </div>

          <div className="ai-composer-model-slot">
            <ModelAutocomplete
              compact
              disabled={busy || selectMode}
              provider={ai.provider}
              baseUrl={ai.base_url}
              apiKey={ai.api_key}
              value={ai.model}
              placeholder={t("settings:aiModel")}
              onChange={onModelChange}
            />
          </div>
        </div>

        {/* Row 2: textarea + send */}
        <div className="ai-composer-row">
          <textarea
            ref={taRef}
            className="ai-composer-textarea"
            value={input}
            rows={1}
            placeholder={t("ai:placeholder")}
            disabled={busy || selectMode}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="ai-send-cluster" ref={sendMenuRef}>
            <IconButton
              label={t("ai:send")}
              icon={<IconSend size={18} />}
              variant="primary"
              loading={busy}
              disabled={!input.trim() || busy || selectMode}
              sfx="confirm"
              onClick={onSend}
            />
            <button
              type="button"
              className="ai-send-caret"
              aria-label={t("ai:sendKeyMenu")}
              aria-expanded={sendMenuOpen}
              disabled={busy || selectMode}
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
              </div>
            ) : null}
          </div>
        </div>
        <p className="meta ai-composer-key-hint">
          {sendKeyMode === "enter"
            ? t("ai:sendKeyEnterHint")
            : t("ai:sendKeyModEnterHint", { mod: modLabel })}
          {ai.model?.trim() ? ` · ${ai.model.trim()}` : ""}
        </p>
      </Card>
    </div>
  );
}
