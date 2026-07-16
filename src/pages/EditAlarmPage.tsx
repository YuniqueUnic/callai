import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Input, Select, Switch } from "animal-island-ui";
import { toast } from "../ui/toast";
import type { AlarmDraft, AlarmPluginConfig, TemplateDto } from "../domain/types";
import { DEFAULT_NOTIFICATION } from "../domain/types";
import {
  commandPreview,
  defaultDraft,
  validateDraft,
} from "../domain/alarmRules";
import { client } from "../infra/client";
import { ElementImage } from "../ui/ElementImage";
import { IconButton } from "../ui/IconButton";
import { IconBack, IconSave } from "../ui/icons";
import { installSelectOptionTicks, playTick, unlockAudio } from "../ui/sounds";
import { EditScheduleSection } from "./edit-alarm/EditScheduleSection";
import { EditTaskSection } from "./edit-alarm/EditTaskSection";
import { EditPluginSection } from "./edit-alarm/EditPluginSection";
import { EditNotificationSection } from "./edit-alarm/EditNotificationSection";
import { EditTimeoutRetrySection } from "./edit-alarm/EditTimeoutRetrySection";

interface Props {
  alarmId?: string | null;
  onBack: () => void;
  onSaved: () => void;
}


export function EditAlarmPage({ alarmId, onBack, onSaved }: Props) {
  const { t, i18n } = useTranslation(["alarms", "common"]);
  const [draft, setDraft] = useState<AlarmDraft>(defaultDraft());
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [binaryPath, setBinaryPath] = useState<string | null>(null);
  const [scheduleMode, setScheduleMode] = useState<"daily" | "weekly" | "monthly" | "cron">("daily");
  const [newTime, setNewTime] = useState("09:00");
  const [saving, setSaving] = useState(false);
  const [argsText, setArgsText] = useState("callai warmup {{date}}");
  const [envKeySuggestions, setEnvKeySuggestions] = useState<string[]>([]);

  useEffect(() => {
    void unlockAudio();
    return installSelectOptionTicks();
  }, []);

  useEffect(() => {
    void (async () => {
      setTemplates(await client.listTemplates());
      if (alarmId) {
        const a = await client.getAlarm(alarmId);
        const d: AlarmDraft = {
          name: a.name,
          enabled: a.enabled,
          schedule: a.schedule,
          binary: a.binary,
          args: a.args,
          env_vars: a.env_vars,
          retry: a.retry,
          timeout_secs: a.timeout_secs ?? 20,
          notification: a.notification ?? { ...DEFAULT_NOTIFICATION },
          plugin: a.plugin ?? null,
        };
        setDraft(d);
        setArgsText(a.args.join("\n"));
        setScheduleMode(a.schedule.mode as "daily" | "weekly" | "monthly" | "cron");
      }
    })();
  }, [alarmId]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void client.checkBinary(draft.binary).then(setBinaryPath);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [draft.binary]);

  const preview = useMemo(
    () => commandPreview(draft.binary, argsText.split("\n").map((s) => s.trim()).filter(Boolean)),
    [draft.binary, argsText],
  );

  const isPluginAlarm =
    draft.binary.trim() === "__callai_plugin__" ||
    draft.binary.trim().toLowerCase() === "callai-plugin" ||
    Boolean(draft.plugin?.plugin_id);

  function patchPlugin(partial: Partial<AlarmPluginConfig>) {
    setDraft((d) => {
      const base: AlarmPluginConfig = d.plugin ?? {
        plugin_id: d.args[0] || "",
        popup: true,
        suppress_when_fullscreen: true,
        params: {},
      };
      const next = { ...base, ...partial };
      // UI no longer edits plugin.params — keep empty so ENV is sole override surface.
      next.params = {};
      // keep args[0] = plugin_id for runners without plugin field
      const args = [...(d.args || [])];
      if (next.plugin_id) {
        if (args.length === 0) args.push(next.plugin_id);
        else args[0] = next.plugin_id;
      }
      return {
        ...d,
        binary: "__callai_plugin__",
        args,
        plugin: next,
      };
    });
  }

  const pluginIdForEnv =
    draft.plugin?.plugin_id ||
    (isPluginAlarm ? draft.args[0] || "" : "") ||
    "";

  useEffect(() => {
    const id = pluginIdForEnv.trim();
    if (!id) {
      setEnvKeySuggestions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const summary = await client.getPlugin(id);
        if (cancelled) return;
        setEnvKeySuggestions(
          Array.isArray(summary.param_keys) ? summary.param_keys : [],
        );
      } catch {
        if (!cancelled) setEnvKeySuggestions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pluginIdForEnv]);

  function updateScheduleTimes(times: string[]) {
    setDraft((d) => {
      if (d.schedule.mode === "weekly") {
        return { ...d, schedule: { ...d.schedule, times } };
      }
      if (d.schedule.mode === "monthly") {
        return { ...d, schedule: { ...d.schedule, times } };
      }
      return { ...d, schedule: { mode: "daily", times } };
    });
  }

  async function onTemplate(id: string) {
    const d = await client.templateDraft(id);
    if (!d) return;
    setDraft(d);
    setArgsText(d.args.join("\n"));
    setScheduleMode(d.schedule.mode as "daily" | "weekly" | "monthly" | "cron");
  }

  async function save() {
    const next: AlarmDraft = {
      ...draft,
      // ENV is the only runtime param surface; drop legacy plugin.params on save.
      plugin: draft.plugin
        ? { ...draft.plugin, params: {} }
        : draft.plugin,
      args: argsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      schedule: (() => {
        const times =
          draft.schedule.mode === "daily" ||
          draft.schedule.mode === "weekly" ||
          draft.schedule.mode === "monthly"
            ? draft.schedule.times
            : ["08:00", "13:00", "18:00"];
        if (scheduleMode === "daily") {
          return { mode: "daily" as const, times };
        }
        if (scheduleMode === "weekly") {
          const days =
            draft.schedule.mode === "weekly" ? draft.schedule.days : [1, 2, 3, 4, 5];
          return { mode: "weekly" as const, days, times };
        }
        if (scheduleMode === "monthly") {
          const days =
            draft.schedule.mode === "monthly" ? draft.schedule.days : [1];
          return { mode: "monthly" as const, days, times };
        }
        return draft.schedule.mode === "cron"
          ? draft.schedule
          : { mode: "cron" as const, expression: "0 8,13,18 * * *" };
      })(),
    };
    const code = validateDraft(next);
    if (code) {
      toast.warning({ message: t(`alarms:ERR_${code}` as "alarms:ERR_INVALID_NAME") });
      return;
    }
    setSaving(true);
    try {
      if (alarmId) await client.updateAlarm(alarmId, next);
      else await client.createAlarm(next);
      toast.success({
        message: t("alarms:saveSuccess"),
        key: "alarm-save",
        duration: 3.6,
      });
      // brief beat so toast is visible before route change
      window.setTimeout(() => onSaved(), 280);
    } catch (err) {
      const c = (err as { code?: string })?.code ?? "INTERNAL";
      toast.error({
        message: t(`alarms:ERR_${c}` as "alarms:ERR_INTERNAL"),
        description: String((err as { message?: string })?.message ?? ""),
      });
    } finally {
      setSaving(false);
    }
  }

  const scheduleTimes =
    draft.schedule.mode === "daily" ||
    draft.schedule.mode === "weekly" ||
    draft.schedule.mode === "monthly"
      ? draft.schedule.times
      : ["08:00", "13:00", "18:00"];

  return (
    <div className="edit-page">
      <header className="edit-hero">
        <div className="edit-hero-brand">
          <ElementImage
            id="create-alarm"
            size={108}
            alt=""
            motion="breathe"
            className="edit-hero-deco"
          />
          <div className="edit-hero-copy">
            <h1>{alarmId ? t("alarms:edit") : t("alarms:create")}</h1>
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
            <IconButton
              label={t("common:save")}
              icon={<IconSave size={18} />}
              variant="primary"
              loading={saving}
              tooltipPlacement="bottom"
              sfx="confirm"
              onClick={() => void save()}
            />
          </div>
        </div>
      </header>

      <div className="app-main form-stack edit-main">
        <Card color="default" className="form-panel">
          <div className="field field-template" onPointerDown={() => void unlockAudio()}>
            <label>{t("alarms:template")}</label>
            <Select
              value=""
              placeholder={t("alarms:template")}
              options={[
                { key: "", label: "—" },
                ...templates.map((tpl) => ({
                  key: tpl.id,
                  label: i18n.language.startsWith("zh") ? tpl.name_zh : tpl.name_en,
                })),
              ]}
              onChange={(key) => {
                if (!key) return;
                playTick();
                void onTemplate(key);
              }}
            />
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>{t("alarms:name")}</label>
            <Input
              value={draft.name}
              allowClear
              placeholder={t("alarms:namePlaceholder")}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </div>

          <div className="field field-row" style={{ marginTop: 12 }}>
            <label>{t("alarms:enabled")}</label>
            <Switch
              checked={draft.enabled}
              onChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
            />
          </div>
        </Card>

        <EditScheduleSection
          draft={draft}
          scheduleMode={scheduleMode}
          scheduleTimes={scheduleTimes}
          newTime={newTime}
          setNewTime={setNewTime}
          setScheduleMode={setScheduleMode}
          setDraft={setDraft}
          updateScheduleTimes={updateScheduleTimes}
        />


        <EditTaskSection
          draft={draft}
          setDraft={setDraft}
          argsText={argsText}
          setArgsText={setArgsText}
          binaryPath={binaryPath}
          preview={preview}
          envKeySuggestions={envKeySuggestions}
        />

        {isPluginAlarm ? (
          <EditPluginSection
            pluginId={draft.plugin?.plugin_id || draft.args[0] || ""}
            popup={draft.plugin?.popup !== false}
            suppressWhenFullscreen={
              draft.plugin?.suppress_when_fullscreen !== false
            }
            onPatch={patchPlugin}
          />
        ) : null}


        <EditNotificationSection draft={draft} setDraft={setDraft} />


        <EditTimeoutRetrySection draft={draft} setDraft={setDraft} />
      </div>
    </div>
  );
}
