import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input, Switch } from "animal-island-ui";
import type { AiProvider, AiSettings, AppSettings, McpSettings } from "../domain/types";
import {
  AI_PROVIDER_DEFAULTS,
  DEFAULT_AI_SETTINGS,
  DEFAULT_MCP_SETTINGS,
} from "../domain/types";
import { client } from "../infra/client";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { toast } from "../ui/toast";
import { playSound } from "../ui/sounds";
import { ElementImage } from "../ui/ElementImage";
import { IconButton } from "../ui/IconButton";
import { IconCopy, IconEye, IconEyeOff, IconRefresh } from "../ui/icons";
import { ProviderPicker } from "../ui/ProviderPicker";
import { ModelAutocomplete } from "../ui/ModelAutocomplete";

interface Props {
  settings: AppSettings;
  /** Immediate persist (switches / generate / provider). */
  onSave: (next: AppSettings, opts?: { silent?: boolean }) => Promise<void>;
  /** Optimistic local settings update without DB write. */
  onLocal: (next: AppSettings) => void;
}

export function SettingsAiMcpPanel({ settings, onSave, onLocal }: Props) {
  const { t } = useTranslation(["settings", "common"]);
  const ai: AiSettings = settings.ai ?? DEFAULT_AI_SETTINGS;
  const mcp: McpSettings = settings.mcp ?? DEFAULT_MCP_SETTINGS;
  const [showAiKey, setShowAiKey] = useState(false);
  const [showMcpToken, setShowMcpToken] = useState(false);
  const [busyToken, setBusyToken] = useState(false);

  // Always save the latest snapshot (parent may re-render mid-debounce).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const pendingSaveRef = useRef<AppSettings | null>(null);

  const { schedule: scheduleSave, flush: flushSave, cancel: cancelSave } =
    useDebouncedCallback((next: AppSettings) => {
      pendingSaveRef.current = null;
      void onSave(next, { silent: true });
    }, 550);

  // Flush pending debounce on unmount so typed text is not lost.
  useEffect(() => {
    return () => {
      const pending = pendingSaveRef.current;
      cancelSave();
      if (pending) {
        void onSave(pending, { silent: true });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only flush
  }, []);

  function applyLocal(next: AppSettings) {
    pendingSaveRef.current = next;
    onLocal(next);
    scheduleSave(next);
  }

  async function patchAiImmediate(partial: Partial<AiSettings>) {
    cancelSave();
    pendingSaveRef.current = null;
    const next = { ...settingsRef.current, ai: { ...ai, ...partial } };
    onLocal(next);
    await onSave(next);
  }

  async function patchMcpImmediate(partial: Partial<McpSettings>) {
    cancelSave();
    pendingSaveRef.current = null;
    const next = { ...settingsRef.current, mcp: { ...mcp, ...partial } };
    onLocal(next);
    await onSave(next);
  }

  function patchAiDebounced(partial: Partial<AiSettings>) {
    const next = {
      ...settingsRef.current,
      ai: { ...(settingsRef.current.ai ?? DEFAULT_AI_SETTINGS), ...partial },
    };
    applyLocal(next);
  }

  function patchMcpDebounced(partial: Partial<McpSettings>) {
    const next = {
      ...settingsRef.current,
      mcp: { ...(settingsRef.current.mcp ?? DEFAULT_MCP_SETTINGS), ...partial },
    };
    applyLocal(next);
  }

  async function onProviderChange(provider: AiProvider) {
    const defaults = AI_PROVIDER_DEFAULTS[provider];
    playSound("soft");
    await patchAiImmediate({
      provider,
      base_url: defaults.base_url || ai.base_url,
      model: defaults.model,
    });
  }

  async function generateToken() {
    setBusyToken(true);
    try {
      const token = await client.generateSecretToken();
      await patchMcpImmediate({ auth_token: token });
      playSound("confirm");
      toast.success({ message: t("settings:mcpTokenGenerated") });
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
    } finally {
      setBusyToken(false);
    }
  }

  async function copyText(label: string, value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success({ message: t("settings:copied", { label }) });
      playSound("soft");
    } catch {
      toast.error({ message: t("settings:copyFail") });
    }
  }

  const endpoint = `http://${mcp.listen_host || "127.0.0.1"}:${mcp.port || 3927}/mcp`;

  return (
    <>
      <div className="field settings-block">
        <div className="panel-head">
          <label className="label">{t("settings:aiSection")}</label>
          <ElementImage id="chat-global" size={28} alt="" className="deco-mini" />
        </div>
        <p className="meta settings-section-hint">{t("settings:aiHint")}</p>

        <div className="field">
          <label className="label">{t("settings:aiProvider")}</label>
          <ProviderPicker
            value={ai.provider ?? "openai"}
            onChange={(p) => {
              void onProviderChange(p);
            }}
          />
        </div>

        <div className="field">
          <label className="label">{t("settings:aiBaseUrl")}</label>
          <Input
            value={ai.base_url}
            placeholder="https://api.openai.com/v1"
            onChange={(e) => {
              patchAiDebounced({ base_url: e.target.value });
            }}
            onBlur={() => flushSave(settingsRef.current)}
          />
        </div>

        <div className="field">
          <ModelAutocomplete
            provider={ai.provider ?? "openai"}
            baseUrl={ai.base_url}
            apiKey={ai.api_key}
            value={ai.model}
            placeholder={AI_PROVIDER_DEFAULTS[ai.provider ?? "openai"].model}
            onChange={(model) => {
              patchAiDebounced({ model });
            }}
          />
        </div>

        <div className="field">
          <div className="panel-head">
            <label className="label">{t("settings:aiApiKey")}</label>
            <span className="secret-tools">
              <IconButton
                label={showAiKey ? t("settings:mask") : t("settings:unmask")}
                icon={showAiKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                onClick={() => {
                  playSound("soft");
                  setShowAiKey((v) => !v);
                }}
              />
              <IconButton
                label={t("settings:copy")}
                icon={<IconCopy size={16} />}
                disabled={!ai.api_key}
                onClick={() => void copyText("API key", ai.api_key)}
              />
            </span>
          </div>
          <Input
            type={showAiKey ? "text" : "password"}
            value={ai.api_key}
            placeholder="sk-…"
            autoComplete="off"
            onChange={(e) => {
              patchAiDebounced({ api_key: e.target.value });
            }}
            onBlur={() => flushSave(settingsRef.current)}
          />
        </div>
      </div>

      <div className="field settings-block">
        <div className="panel-head">
          <label className="label">{t("settings:mcpSection")}</label>
          <ElementImage id="multi-device" size={28} alt="" className="deco-mini" />
        </div>
        <p className="meta settings-section-hint">{t("settings:mcpHint")}</p>

        <div className="settings-row">
          <span>{t("settings:mcpEnabled")}</span>
          <Switch
            checked={!!mcp.enabled}
            onChange={(v) => {
              playSound("soft");
              void patchMcpImmediate({ enabled: v });
            }}
          />
        </div>

        <div className="field">
          <label className="label">{t("settings:mcpHost")}</label>
          <Input
            value={mcp.listen_host}
            placeholder="127.0.0.1"
            onChange={(e) => {
              patchMcpDebounced({ listen_host: e.target.value });
            }}
            onBlur={() => flushSave(settingsRef.current)}
          />
        </div>

        <div className="field">
          <label className="label">{t("settings:mcpPort")}</label>
          <Input
            value={String(mcp.port ?? 3927)}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/\D/g, "")) || 0;
              patchMcpDebounced({
                port: Math.min(65535, Math.max(1, n || 3927)),
              });
            }}
            onBlur={() => flushSave(settingsRef.current)}
          />
        </div>

        <div className="field">
          <div className="panel-head">
            <label className="label">{t("settings:mcpToken")}</label>
            <span className="secret-tools">
              <IconButton
                label={showMcpToken ? t("settings:mask") : t("settings:unmask")}
                icon={
                  showMcpToken ? <IconEyeOff size={16} /> : <IconEye size={16} />
                }
                onClick={() => {
                  playSound("soft");
                  setShowMcpToken((v) => !v);
                }}
              />
              <IconButton
                label={t("settings:generate")}
                icon={<IconRefresh size={16} />}
                loading={busyToken}
                onClick={() => void generateToken()}
              />
              <IconButton
                label={t("settings:copy")}
                icon={<IconCopy size={16} />}
                disabled={!mcp.auth_token}
                onClick={() => void copyText("token", mcp.auth_token)}
              />
            </span>
          </div>
          <Input
            type={showMcpToken ? "text" : "password"}
            value={mcp.auth_token}
            placeholder={t("settings:mcpTokenPlaceholder")}
            autoComplete="off"
            onChange={(e) => {
              patchMcpDebounced({ auth_token: e.target.value });
            }}
            onBlur={() => flushSave(settingsRef.current)}
          />
          <p className="meta" style={{ marginTop: 6 }}>
            {t("settings:mcpTokenAutoHint")}
          </p>
        </div>

        <div className="field">
          <div className="panel-head">
            <label className="label">{t("settings:mcpEndpoint")}</label>
            <IconButton
              label={t("settings:copy")}
              icon={<IconCopy size={16} />}
              onClick={() => void copyText("endpoint", endpoint)}
            />
          </div>
          <Input value={endpoint} readOnly />
          <p className="meta" style={{ marginTop: 8 }}>
            {t("settings:mcpStdioHint")}
          </p>
          <code className="settings-code">callai mcp-server</code>
          <p className="meta" style={{ marginTop: 8 }}>
            {t("settings:mcpHttpDaemonHint")}
          </p>
          <code className="settings-code">callai mcp-server --http</code>
        </div>
      </div>
    </>
  );
}
