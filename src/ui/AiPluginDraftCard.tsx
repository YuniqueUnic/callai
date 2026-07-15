import { useTranslation } from "react-i18next";
import { Tag } from "animal-island-ui";
import type { PluginDraft } from "../domain/types";
import { ElementImage } from "./ElementImage";
import { IconButton } from "./IconButton";
import { IconPlus, IconTrash } from "./icons";

interface Props {
  draft: PluginDraft;
  busy?: boolean;
  applied?: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

export function AiPluginDraftCard({
  draft,
  busy,
  applied,
  onAccept,
  onDismiss,
}: Props) {
  const { t } = useTranslation(["ai", "plugins", "common"]);
  const m = draft.manifest;

  return (
    <article
      className={`alarm-card ai-draft-card ai-plugin-draft ${applied ? "is-applied" : ""}`}
    >
      <div className="alarm-card-top">
        <div className="alarm-card-title">
          <div className="ai-draft-title-row">
            <ElementImage id="task-checklist" size={36} alt="" />
            <div>
              <h3>{m.name}</h3>
              <p className="meta" style={{ margin: 0 }}>
                {m.id} · v{m.version}
              </p>
            </div>
          </div>
          <div className="schedule-tags">
            {(m.permissions ?? []).slice(0, 4).map((p) => (
              <Tag key={p} color="app-orange" size="small" variant="outlined">
                {p}
              </Tag>
            ))}
          </div>
        </div>
      </div>
      {m.description ? (
        <p className="meta ai-draft-desc">{m.description}</p>
      ) : null}
      <div className="card-actions ai-draft-actions">
        {applied ? (
          <span className="meta ai-draft-applied">{t("ai:pluginInstalled")}</span>
        ) : (
          <>
            <IconButton
              label={t("ai:installPlugin")}
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
