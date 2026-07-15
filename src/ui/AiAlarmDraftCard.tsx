import { useTranslation } from "react-i18next";
import { Tag } from "animal-island-ui";
import type { AlarmDraft } from "../domain/types";
import {
  commandPreview,
  scheduleTimeChips,
} from "../domain/alarmRules";
import { ElementImage } from "./ElementImage";
import { IconButton } from "./IconButton";
import { IconPlus, IconTrash } from "./icons";

interface Props {
  draft: AlarmDraft;
  busy?: boolean;
  applied?: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

/** Preview of an AI-generated alarm — same visual language as Home alarm cards. */
export function AiAlarmDraftCard({
  draft,
  busy,
  applied,
  onAccept,
  onDismiss,
}: Props) {
  const { t } = useTranslation(["ai", "alarms", "common"]);
  const chips = scheduleTimeChips(draft.schedule, 3);
  const preview = commandPreview(draft.binary, draft.args ?? []);

  return (
    <article
      className={`alarm-card ai-draft-card ${applied ? "is-applied" : ""}`}
    >
      <div className="alarm-card-top">
        <div className="alarm-card-title">
          <div className="ai-draft-title-row">
            <ElementImage id="create-alarm" size={36} alt="" />
            <h3>{draft.name}</h3>
          </div>
          <div className="schedule-tags">
            <Tag
              color={
                chips.kind === "daily"
                  ? "brown"
                  : chips.kind === "weekly"
                    ? "app-teal"
                    : chips.kind === "monthly"
                      ? "app-orange"
                      : "purple"
              }
              size="small"
              variant="outlined"
            >
              {chips.kind === "daily"
                ? t("alarms:daily")
                : chips.kind === "weekly"
                  ? t("alarms:weekly")
                  : chips.kind === "monthly"
                    ? t("alarms:monthly")
                    : t("alarms:cron")}
            </Tag>
            {chips.visible.map((time) => (
              <Tag key={time} color="app-teal" size="small" variant="outlined">
                {time}
              </Tag>
            ))}
            {chips.overflow > 0 ? (
              <Tag color="app-orange" size="small" variant="dashed">
                +{chips.overflow}
              </Tag>
            ) : null}
            {draft.enabled ? null : (
              <Tag color="app-orange" size="small" variant="dashed">
                {t("alarms:paused")}
              </Tag>
            )}
          </div>
        </div>
      </div>

      <p className="ai-draft-cmd meta" title={preview}>
        <span className="ai-draft-cmd-label">{t("alarms:preview")}</span>
        <code>{preview}</code>
      </p>

      {draft.notification?.enabled ? (
        <p className="meta ai-draft-notify">
          {t("ai:draftNotify", {
            sound: draft.notification.sound_id || "default",
          })}
        </p>
      ) : null}

      <div className="card-actions ai-draft-actions">
        {applied ? (
          <span className="meta ai-draft-applied">{t("ai:alarmAdded")}</span>
        ) : (
          <>
            <IconButton
              label={t("ai:createAlarm")}
              icon={<IconPlus size={18} />}
              variant="primary"
              loading={busy}
              sfx="confirm"
              onClick={onAccept}
            />
            <IconButton
              label={t("common:cancel")}
              icon={<IconTrash size={16} />}
              sfx="cancel"
              onClick={onDismiss}
            />
          </>
        )}
      </div>
    </article>
  );
}
