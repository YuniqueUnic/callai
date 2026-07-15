import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Drawer, Input, Switch } from "animal-island-ui";
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
import { IconCopy, IconEye, IconEyeOff, IconLogs, IconRefresh } from "../ui/icons";
import { ProviderPicker } from "../ui/ProviderPicker";
import { ModelAutocomplete } from "../ui/ModelAutocomplete";
import { McpLogsPanel } from "./McpLogsPanel";

interface Props {
  settings: AppSettings;
  /** Persist (switches / generate / provider / debounced text). */
  onSave: (next: AppSettings, opts?: { silent?: boolean }) => Promise<void>;
}

/**
 * Text fields stay in local state while typing so SettingsPage does not
 * re-render on every keystroke. Parent settings are updated only on
 * debounce / blur / immediate actions.
 */
function SettingsAiMcpPanelImpl({ settings, onSave }: Props) {
  const { t } = useTranslation(["settings", "common"]);
  const savedAi: AiSettings = settings.ai ?? DEFAULT_AI_SETTINGS;
  const savedMcp: McpSettings = settings.mcp ?? DEFAULT_MCP_SETTINGS;

  const [showAiKey, setShowAiKey] = useState(false);
  const [showMcpToken, setShowMcpToken] = useState(false);
  const [busyToken, setBusyToken] = useState(false);
  const [mcpLogsOpen, setMcpLogsOpen] = useState(false);

  // Local drafts for free-text fields (fast typing path).
  const [baseUrl, setBaseUrl] = useState(savedAi.base_url);
  const [apiKey, setApiKey] = useState(savedAi.api_key);
  const [model, setModel] = useState(savedAi.model);
  const [mcpHost, setMcpHost] = useState(savedMcp.listen_host);
  const [mcpPort, setMcpPort] = useState(String(savedMcp.port ?? 3927));
  const [mcpToken, setMcpToken] = useState(savedMcp.auth_token);

  useEffect(() => {
    document.body.classList.toggle("callai-drawer-open", mcpLogsOpen);
    document.body.classList.toggle("callai-logs-open", mcpLogsOpen);
    return () => {
      document.body.classList.remove("callai-drawer-open");
      document.body.classList.remove("callai-logs-open");
    };
  }, [mcpLogsOpen]);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const draftRef = useRef({
    baseUrl,
    apiKey,
    model,
    mcpHost,
    mcpPort,
    mcpToken,
  });
  draftRef.current = { baseUrl, apiKey, model, mcpHost, mcpPort, mcpToken };

  // Sync local drafts when parent commits a new snapshot (provider switch, generate, external load).
  // Skip while we still have a pending local edit that has not been saved yet.
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (dirtyRef.current) return;
    setBaseUrl(savedAi.base_url);
    setApiKey(savedAi.api_key);
    setModel(savedAi.model);
    setMcpHost(savedMcp.listen_host);
    setMcpPort(String(savedMcp.port ?? 3927));
    setMcpToken(savedMcp.auth_token);
  }, [
    savedAi.base_url,
    savedAi.api_key,
    savedAi.model,
    savedAi.provider,
    savedMcp.listen_host,
    savedMcp.port,
    savedMcp.auth_token,
    savedMcp.enabled,
  ]);

  const buildNext = useCallback((): AppSettings => {
    const d = draftRef.current;
    const cur = settingsRef.current;
    const ai = cur.ai ?? DEFAULT_AI_SETTINGS;
    const mcp = cur.mcp ?? DEFAULT_MCP_SETTINGS;
    const portNum = Math.min(
      65535,
      Math.max(1, Number(d.mcpPort.replace(/\D/g, "")) || 3927),
    );
    return {
      ...cur,
      ai: {
        ...ai,
        base_url: d.baseUrl,
        api_key: d.apiKey,
        model: d.model,
      },
      mcp: {
        ...mcp,
        listen_host: d.mcpHost,
        port: portNum,
        auth_token: d.mcpToken,
      },
    };
  }, []);

  const { schedule: scheduleSave, cancel: cancelSave } = useDebouncedCallback(
    () => {
      const next = buildNext();
      dirtyRef.current = false;
      void onSave(next, { silent: true });
    },
    600,
  );

  const markDirtyAndSchedule = useCallback(() => {
    dirtyRef.current = true;
    scheduleSave();
  }, [scheduleSave]);

  const flushNow = useCallback(
    async (opts?: { silent?: boolean }) => {
      cancelSave();
      const next = buildNext();
      dirtyRef.current = false;
      await onSave(next, opts);
    },
    [buildNext, cancelSave, onSave],
  );

  // Flush pending text on unmount.
  useEffect(() => {
    return () => {
      if (!dirtyRef.current) {
        cancelSave();
        return;
      }
      cancelSave();
      const next = buildNext();
      dirtyRef.current = false;
      void onSave(next, { silent: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only
  }, []);


  async function patchMcpImmediate(partial: Partial<McpSettings>) {
    cancelSave();
    dirtyRef.current = false;
    const cur = settingsRef.current;
    const mcp = { ...(cur.mcp ?? DEFAULT_MCP_SETTINGS), ...partial };
    if (partial.listen_host != null) setMcpHost(partial.listen_host);
    if (partial.port != null) setMcpPort(String(partial.port));
    if (partial.auth_token != null) setMcpToken(partial.auth_token);
    await onSave({ ...cur, mcp });
  }

  async function onProviderChange(provider: AiProvider) {
    const defaults = AI_PROVIDER_DEFAULTS[provider];
    playSound("soft");
    // Flush any pending text first so we don't lose api key mid-type.
    if (dirtyRef.current) await flushNow({ silent: true });
    const cur = settingsRef.current;
    const aiPrev = cur.ai ?? DEFAULT_AI_SETTINGS;
    const nextAi: AiSettings = {
      ...aiPrev,
      provider,
      base_url: defaults.base_url || draftRef.current.baseUrl || aiPrev.base_url,
      model: defaults.model,
      api_key: draftRef.current.apiKey,
    };
    setBaseUrl(nextAi.base_url);
    setModel(nextAi.model);
    setApiKey(nextAi.api_key);
    dirtyRef.current = false;
    await onSave({ ...cur, ai: nextAi });
  }

  async function generateToken() {
    setBusyToken(true);
    try {
      if (dirtyRef.current) await flushNow({ silent: true });
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

  const endpoint = `http://${mcpHost || "127.0.0.1"}:${Number(mcpPort) || 3927}/mcp`;

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
            value={savedAi.provider ?? "openai"}
            onChange={(p) => {
              void onProviderChange(p);
            }}
          />
        </div>

        <div className="field">
          <label className="label">{t("settings:aiBaseUrl")}</label>
          <Input
            value={baseUrl}
            placeholder="https://api.openai.com/v1"
            onChange={(e) => {
              setBaseUrl(e.target.value);
              markDirtyAndSchedule();
            }}
            onBlur={() => {
              if (dirtyRef.current) void flushNow({ silent: true });
            }}
          />
          <p className="meta" style={{ marginTop: 6 }}>
            {t("settings:aiBaseUrlHint")}
          </p>
        </div>

        <div className="field">
          <ModelAutocomplete
            provider={savedAi.provider ?? "openai"}
            baseUrl={baseUrl}
            apiKey={apiKey}
            value={model}
            placeholder={AI_PROVIDER_DEFAULTS[savedAi.provider ?? "openai"].model}
            onChange={(nextModel) => {
              setModel(nextModel);
              markDirtyAndSchedule();
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
                disabled={!apiKey}
                onClick={() => void copyText("API key", apiKey)}
              />
            </span>
          </div>
          <Input
            type={showAiKey ? "text" : "password"}
            value={apiKey}
            placeholder="sk-…"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setApiKey(e.target.value);
              markDirtyAndSchedule();
            }}
            onBlur={() => {
              if (dirtyRef.current) void flushNow({ silent: true });
            }}
          />
        </div>
      </div>

      <div className="field settings-block">
        <div className="panel-head">
          <label className="label">{t("settings:mcpSection")}</label>
          <span className="secret-tools">
            <IconButton
              label={t("settings:mcpLogs", { defaultValue: "MCP 日志" })}
              icon={<IconLogs size={16} />}
              sfx="soft"
              tooltipPlacement="bottom"
              onClick={() => setMcpLogsOpen(true)}
            />
            <ElementImage id="multi-device" size={28} alt="" className="deco-mini" />
          </span>
        </div>
        <p className="meta settings-section-hint">{t("settings:mcpHint")}</p>

        <div className="settings-row">
          <span>{t("settings:mcpEnabled")}</span>
          <Switch
            checked={!!savedMcp.enabled}
            onChange={(v) => {
              playSound("soft");
              void (async () => {
                if (dirtyRef.current) await flushNow({ silent: true });
                await patchMcpImmediate({ enabled: v });
              })();
            }}
          />
        </div>
        <p className="meta settings-section-hint">{t("settings:mcpEnabledNote")}</p>

        <div className="field">
          <label className="label">{t("settings:mcpHost")}</label>
          <Input
            value={mcpHost}
            placeholder="127.0.0.1"
            onChange={(e) => {
              setMcpHost(e.target.value);
              markDirtyAndSchedule();
            }}
            onBlur={() => {
              if (dirtyRef.current) void flushNow({ silent: true });
            }}
          />
        </div>

        <div className="field">
          <label className="label">{t("settings:mcpPort")}</label>
          <Input
            value={mcpPort}
            inputMode="numeric"
            onChange={(e) => {
              setMcpPort(e.target.value.replace(/\D/g, "").slice(0, 5));
              markDirtyAndSchedule();
            }}
            onBlur={() => {
              if (dirtyRef.current) void flushNow({ silent: true });
            }}
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
                disabled={!mcpToken}
                onClick={() => void copyText("token", mcpToken)}
              />
            </span>
          </div>
          <Input
            type={showMcpToken ? "text" : "password"}
            value={mcpToken}
            placeholder={t("settings:mcpTokenPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setMcpToken(e.target.value);
              markDirtyAndSchedule();
            }}
            onBlur={() => {
              if (dirtyRef.current) void flushNow({ silent: true });
            }}
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
          <div className="settings-cli-stack">
            <p className="meta settings-cli-label">
              {t("settings:mcpStdioHint")}
            </p>
            <code className="settings-code">callai mcp-server</code>
            <p className="meta settings-cli-label">
              {t("settings:mcpHttpDaemonHint")}
            </p>
            <code className="settings-code">callai mcp-server --http</code>
          </div>
        </div>
      </div>

      <Drawer
        open={mcpLogsOpen}
        title={t("settings:mcpLogs", { defaultValue: "MCP 日志" })}
        placement="right"
        width="min(420px, 92vw)"
        pushBackground={false}
        onClose={() => setMcpLogsOpen(false)}
        className="logs-drawer mcp-logs-drawer"
      >
        {mcpLogsOpen ? <McpLogsPanel /> : null}
      </Drawer>
    </>
  );
}

export const SettingsAiMcpPanel = memo(SettingsAiMcpPanelImpl);
