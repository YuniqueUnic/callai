import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  Collapse,
  Input,
  Select,
  Switch,
  Tag,
} from "animal-island-ui";
import { toast } from "../ui/toast";
import type { AlarmDraft, NotificationType, RetryInterval, TemplateDto } from "../domain/types";
import { BUILTIN_SOUNDS, DEFAULT_NOTIFICATION } from "../domain/types";
import {
  commandPreview,
  defaultDraft,
  validateDraft,
} from "../domain/alarmRules";
import { client } from "../infra/client";
import { pickBinaryFile } from "../infra/dialog";
import { ElementImage } from "../ui/ElementImage";
import { IconButton } from "../ui/IconButton";
import { IconBack, IconFolder, IconPlus, IconSave, IconTrash, IconVolume } from "../ui/icons";
import { DurationPicker } from "../ui/DurationPicker";
import { TimePicker } from "../ui/TimePicker";
import { installSelectOptionTicks, playSound, playTick, unlockAudio } from "../ui/sounds";
import { playAlarmSoundPreview } from "../ui/alarmSounds";

interface Props {
  alarmId?: string | null;
  onBack: () => void;
  onSaved: () => void;
}

const INTERVALS: RetryInterval[] = ["1m", "2m", "5m", "10m"];

export function EditAlarmPage({ alarmId, onBack, onSaved }: Props) {
  const { t, i18n } = useTranslation(["alarms", "common"]);
  const [draft, setDraft] = useState<AlarmDraft>(defaultDraft());
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [binaryPath, setBinaryPath] = useState<string | null>(null);
  const [scheduleMode, setScheduleMode] = useState<"daily" | "weekly" | "monthly" | "cron">("daily");
  const [newTime, setNewTime] = useState("09:00");
  const [saving, setSaving] = useState(false);
  const [argsText, setArgsText] = useState("callai warmup {{date}}");

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

        <Card color="default" className="form-panel">
          <div className="panel-head">
            <h3>{t("alarms:schedule")}</h3>
            <ElementImage id="set-time" size={44} className="section-illus" alt="" />
          </div>
          <div className="field">
            <div className="schedule-mode" role="radiogroup" aria-label={t("alarms:schedule")}>
              {(
                [
                  ["daily", "alarms:daily"],
                  ["weekly", "alarms:weekly"],
                  ["monthly", "alarms:monthly"],
                  ["cron", "alarms:cron"],
                ] as const
              ).map(([mode, key]) => (
                <button
                  key={mode}
                  type="button"
                  className={scheduleMode === mode ? "active" : ""}
                  onClick={() => {
                    playSound("soft");
                    setScheduleMode(mode);
                    setDraft((d) => {
                      const times =
                        d.schedule.mode === "daily" ||
                        d.schedule.mode === "weekly" ||
                        d.schedule.mode === "monthly"
                          ? d.schedule.times
                          : scheduleTimes;
                      if (mode === "daily") {
                        return { ...d, schedule: { mode: "daily", times } };
                      }
                      if (mode === "weekly") {
                        const days =
                          d.schedule.mode === "weekly"
                            ? d.schedule.days
                            : [1, 2, 3, 4, 5];
                        return { ...d, schedule: { mode: "weekly", days, times } };
                      }
                      if (mode === "monthly") {
                        const days =
                          d.schedule.mode === "monthly" ? d.schedule.days : [1];
                        return { ...d, schedule: { mode: "monthly", days, times } };
                      }
                      return {
                        ...d,
                        schedule: {
                          mode: "cron",
                          expression:
                            d.schedule.mode === "cron"
                              ? d.schedule.expression
                              : "0 8,13,18 * * *",
                        },
                      };
                    });
                  }}
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>

          {scheduleMode !== "cron" ? (
            <div className="field" style={{ marginTop: 12 }}>
              {scheduleMode === "weekly" ? (
                <div className="times-row" style={{ marginBottom: 10 }} role="group" aria-label={t("alarms:weekdays")}>
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                    const selected =
                      draft.schedule.mode === "weekly" &&
                      draft.schedule.days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        className={`time-chip ${selected ? "active" : ""}`}
                        onClick={() => {
                          playTick();
                          setDraft((prev) => {
                            const times =
                              prev.schedule.mode === "weekly" ||
                              prev.schedule.mode === "daily" ||
                              prev.schedule.mode === "monthly"
                                ? prev.schedule.times
                                : scheduleTimes;
                            const days =
                              prev.schedule.mode === "weekly"
                                ? [...prev.schedule.days]
                                : [1, 2, 3, 4, 5];
                            const next = selected
                              ? days.filter((x) => x !== d)
                              : [...days, d].sort((a, b) => a - b);
                            return {
                              ...prev,
                              schedule: {
                                mode: "weekly",
                                days: next.length ? next : [d],
                                times,
                              },
                            };
                          });
                        }}
                      >
                        {t(`alarms:dow_${d}` as "alarms:dow_0")}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {scheduleMode === "monthly" ? (
                <div className="times-row" style={{ marginBottom: 10, flexWrap: "wrap" }} role="group" aria-label={t("alarms:monthDays")}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
                    const selected =
                      draft.schedule.mode === "monthly" &&
                      draft.schedule.days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        className={`time-chip ${selected ? "active" : ""}`}
                        onClick={() => {
                          playTick();
                          setDraft((prev) => {
                            const times =
                              prev.schedule.mode === "monthly" ||
                              prev.schedule.mode === "daily" ||
                              prev.schedule.mode === "weekly"
                                ? prev.schedule.times
                                : scheduleTimes;
                            const days =
                              prev.schedule.mode === "monthly"
                                ? [...prev.schedule.days]
                                : [1];
                            const next = selected
                              ? days.filter((x) => x !== d)
                              : [...days, d].sort((a, b) => a - b);
                            return {
                              ...prev,
                              schedule: {
                                mode: "monthly",
                                days: next.length ? next : [d],
                                times,
                              },
                            };
                          });
                        }}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <div className="times-row">
                {scheduleTimes.map((time) => (
                  <span className="time-chip" key={time}>
                    {time}
                    <button
                      type="button"
                      onClick={() => {
                        playSound("soft");
                        updateScheduleTimes(scheduleTimes.filter((x) => x !== time));
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ marginTop: 8 }}>
                <TimePicker
                  value={newTime}
                  onChange={setNewTime}
                  addLabel={t("alarms:addTime")}
                  onAdd={() => {
                    if (!newTime) return;
                    if (!scheduleTimes.includes(newTime)) {
                      updateScheduleTimes([...scheduleTimes, newTime].sort());
                    }
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="field" style={{ marginTop: 12 }}>
              <Input
                value={
                  draft.schedule.mode === "cron" ? draft.schedule.expression : ""
                }
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    schedule: { mode: "cron", expression: e.target.value },
                  }))
                }
              />
            </div>
          )}
        </Card>

        <Card color="default" className="form-panel">
          <div className="panel-head">
            <h3>{t("alarms:task")}</h3>
            <ElementImage id="task-checklist" size={44} className="section-illus" alt="" />
          </div>
          <div className="field">
            <label>{t("alarms:binary")}</label>
            <div className="row">
              <Input
                value={draft.binary}
                placeholder={t("alarms:binaryPlaceholder")}
                onChange={(e) => setDraft((d) => ({ ...d, binary: e.target.value }))}
                style={{ flex: 1, minWidth: 220 }}
              />
              <IconButton
                label={t("alarms:browse")}
                icon={<IconFolder size={16} />}
                onClick={() => {
                  void pickBinaryFile().then((path) => {
                    if (path) setDraft((d) => ({ ...d, binary: path }));
                  });
                }}
              />
              {binaryPath ? (
                <Tag color="app-green" size="small">
                  {t("alarms:binaryOk")}
                </Tag>
              ) : (
                <Tag color="app-orange" size="small">
                  {t("alarms:binaryMissing")}
                </Tag>
              )}
            </div>
            {binaryPath && <div className="hint">{binaryPath}</div>}
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>{t("alarms:args")}</label>
            <textarea
              className="raw"
              value={argsText}
              placeholder={t("alarms:argsPlaceholder")}
              onChange={(e) => setArgsText(e.target.value)}
            />
            <div className="hint meta">
              {"{{date}}"} · {"{{datetime}}"} · {"{{timestamp}}"}
            </div>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>{t("alarms:preview")}</label>
            <div className="preview-box">{preview}</div>
          </div>

          <Collapse
            question={t("alarms:env")}
            answer={
              <div className="env-editor">
                {draft.env_vars.map((env, idx) => (
                  <div className="env-row" key={`env-row-${idx}`}>
                    <Input
                      className="env-input env-key"
                      value={env.key}
                      placeholder="KEY"
                      onChange={(e) => {
                        const key = e.target.value;
                        setDraft((d) => {
                          const env_vars = d.env_vars.map((row, i) =>
                            i === idx ? { ...row, key } : row,
                          );
                          return { ...d, env_vars };
                        });
                      }}
                    />
                    <Input
                      className="env-input env-value"
                      value={env.value}
                      placeholder="value"
                      onChange={(e) => {
                        const value = e.target.value;
                        setDraft((d) => {
                          const env_vars = d.env_vars.map((row, i) =>
                            i === idx ? { ...row, value } : row,
                          );
                          return { ...d, env_vars };
                        });
                      }}
                    />
                    <div className="env-actions">
                      <IconButton
                        label={t("common:delete")}
                        sfx="warn"
                        icon={<IconTrash size={14} />}
                        variant="danger"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            env_vars: d.env_vars.filter((_, i) => i !== idx),
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
                <div className="env-add">
                  <IconButton
                    label={t("alarms:addEnv")}
                    sfx="confirm"
                    icon={<IconPlus size={16} />}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        env_vars: [...d.env_vars, { key: "", value: "" }],
                      }))
                    }
                  />
                </div>
              </div>
            }
          />
        </Card>

        

        <Card color="default" className="form-panel">
          <div className="panel-head">
            <h3>{t("alarms:notification")}</h3>
            <ElementImage id="notify-badge" size={44} className="section-illus" alt="" />
          </div>
          <div className="hint meta" style={{ marginBottom: 8 }}>
            {t("alarms:notificationHint")}
          </div>
          <div className="field row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <label className="label">{t("alarms:notifyEnable")}</label>
            <Switch
              checked={draft.notification?.enabled ?? true}
              onChange={(v) => {
                playSound("soft");
                setDraft((d) => ({
                  ...d,
                  notification: {
                    ...(d.notification ?? DEFAULT_NOTIFICATION),
                    enabled: v,
                  },
                }));
              }}
            />
          </div>
          <div
            className="field"
            style={{
              marginTop: 12,
              opacity: draft.notification?.enabled === false ? 0.45 : 1,
              pointerEvents: draft.notification?.enabled === false ? "none" : "auto",
            }}
          >
            <label className="label">{t("alarms:notifyType")}</label>
            <div className="segmented" style={{ marginTop: 8 }}>
              {(
                [
                  ["system_only", "notifySystemOnly"],
                  ["with_sound", "notifyWithSound"],
                ] as const
              ).map(([value, key]) => (
                <button
                  key={value}
                  type="button"
                  className={
                    (draft.notification?.notification_type ?? "with_sound") === value
                      ? "active"
                      : ""
                  }
                  onClick={() => {
                    playSound("soft");
                    setDraft((d) => ({
                      ...d,
                      notification: {
                        ...(d.notification ?? DEFAULT_NOTIFICATION),
                        notification_type: value as NotificationType,
                      },
                    }));
                  }}
                >
                  {t(`alarms:${key}` as "alarms:notifyWithSound")}
                </button>
              ))}
            </div>
          </div>
          {(draft.notification?.notification_type ?? "with_sound") === "with_sound" &&
            draft.notification?.enabled !== false && (
              <div className="field field-select field-sound" style={{ marginTop: 12 }}>
                <label className="label">{t("alarms:notifySound")}</label>
                <div className="row sound-select-row" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
                  <Select
                    value={draft.notification?.sound_id ?? "soft_chime"}
                    options={BUILTIN_SOUNDS.map((s) => ({
                      key: s.id,
                      label: t(`alarms:${s.labelKey}` as "alarms:soundSoftChime"),
                    }))}
                    onChange={(key) => {
                      if (!key) return;
                      playTick();
                      setDraft((d) => ({
                        ...d,
                        notification: {
                          ...(d.notification ?? DEFAULT_NOTIFICATION),
                          sound_id: key === "soft_chime" ? null : String(key),
                        },
                      }));
                    }}
                  />
                  <IconButton
                    label={t("alarms:previewSound")}
                    icon={<IconVolume size={16} />}
                    onClick={() => {
                      const id =
                        draft.notification?.sound_id ?? "soft_chime";
                      playAlarmSoundPreview(id);
                      void client.previewAlarmSound?.(id).catch(() => {
                        /* browser mock / no-op */
                      });
                    }}
                  />
                </div>
              </div>
            )}
        </Card>

        <Card color="default" className="form-panel">
          <div className="field">
            <label className="label">{t("alarms:timeout")}</label>
            <div style={{ marginTop: 8 }}>
              <DurationPicker
                value={draft.timeout_secs ?? 20}
                onChange={(secs) =>
                  setDraft((d) => ({ ...d, timeout_secs: secs }))
                }
              />
            </div>
          </div>
        </Card>

<Card color="default" className="form-panel">
          <div className="field">
            <label className="label">{t("alarms:retry")}</label>
            <div className="segmented">
              {INTERVALS.map((interval) => (
                <button
                  key={interval}
                  type="button"
                  className={draft.retry.interval === interval ? "active" : ""}
                  onClick={() => {
                    playSound("soft");
                    setDraft((d) => ({
                      ...d,
                      retry: { ...d.retry, interval, max_attempts: 3 },
                    }));
                  }}
                >
                  {t(`alarms:interval_${interval}` as "alarms:interval_2m")}
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
