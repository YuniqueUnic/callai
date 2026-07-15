import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Card, Select, Switch } from "animal-island-ui";
import type { AlarmDraft, NotificationType } from "../../domain/types";
import { BUILTIN_SOUNDS, DEFAULT_NOTIFICATION } from "../../domain/types";
import { ElementImage } from "../../ui/ElementImage";
import { IconButton } from "../../ui/IconButton";
import { IconVolume } from "../../ui/icons";
import { playAlarmSoundPreview } from "../../ui/alarmSounds";
import { playSound, playTick } from "../../ui/sounds";
import { client } from "../../infra/client";

interface Props {
  draft: AlarmDraft;
  setDraft: Dispatch<SetStateAction<AlarmDraft>>;
}

export function EditNotificationSection({ draft, setDraft }: Props) {
  const { t } = useTranslation(["alarms"]);
  return (
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

  );
}
