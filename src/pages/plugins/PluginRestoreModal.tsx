import { useTranslation } from "react-i18next";
import { Modal, Switch } from "animal-island-ui";
import type { PluginSummary } from "../../domain/types";
import { IconButton } from "../../ui/IconButton";
import { IconClose, IconRestore, IconTrash } from "../../ui/icons";

interface Props {
  target: PluginSummary | null;
  wipeData: boolean;
  restoring: boolean;
  onWipeChange: (wipe: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Island-style restore confirm (matches export / import-conflict modals).
 * Modal plate stays parchment even in app dark theme — high brown ink contrast.
 */
export function PluginRestoreModal({
  target,
  wipeData,
  restoring,
  onWipeChange,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useTranslation(["plugins", "common"]);

  return (
    <Modal
      open={!!target}
      title={t("plugins:restoreBuiltin", { defaultValue: "恢复内置" })}
      typewriter={false}
      footer={null}
      onClose={() => {
        if (!restoring) onClose();
      }}
    >
      <div className="plugin-confirm">
        <p className="plugin-confirm-lead">
          {t("plugins:restoreConfirm", {
            defaultValue: "恢复成内置界面。你的本地记录默认会留着。",
          })}
        </p>

        {target ? (
          <div className="plugin-confirm-target" aria-label={target.name}>
            <strong className="plugin-confirm-name">{target.name}</strong>
            <span className="plugin-confirm-meta">
              {target.id}
              <span aria-hidden> · </span>v{target.version}
            </span>
          </div>
        ) : null}

        <div className="plugin-confirm-row">
          <div className="plugin-confirm-row-copy">
            <span className="plugin-confirm-row-title">
              {t("plugins:restoreWipeData", {
                defaultValue: "同时清空数据",
              })}
            </span>
            <span className="plugin-confirm-row-hint meta">
              {t("plugins:restoreWipeHint", {
                defaultValue: "会清掉这个插件里的设置和记录",
              })}
            </span>
          </div>
          <Switch
            checked={wipeData}
            disabled={restoring}
            onChange={onWipeChange}
          />
        </div>

        <div className="row-actions plugin-confirm-actions">
          <IconButton
            label={
              wipeData
                ? t("plugins:restoreConfirmWipeAction", {
                    defaultValue: "恢复并清空",
                  })
                : t("plugins:restoreConfirmAction", {
                    defaultValue: "确认恢复",
                  })
            }
            icon={
              wipeData ? <IconTrash size={16} /> : <IconRestore size={16} />
            }
            variant={wipeData ? "danger" : "primary"}
            sfx={wipeData ? "warn" : "confirm"}
            disabled={restoring || !target}
            onClick={onConfirm}
          />
          <IconButton
            label={t("common:cancel", { defaultValue: "取消" })}
            icon={<IconClose size={16} />}
            sfx="cancel"
            disabled={restoring}
            onClick={onClose}
          />
        </div>
      </div>
    </Modal>
  );
}
