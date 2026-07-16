import { useTranslation } from "react-i18next";
import { Modal } from "animal-island-ui";
import { IconButton } from "../../ui/IconButton";
import { IconDownload, IconOpen, IconTrash } from "../../ui/icons";
import type { ZipConflictMode } from "./types";

interface Props {
  open: boolean;
  pluginId?: string;
  onChoose: (mode: ZipConflictMode) => void;
  onCancel: () => void;
}

export function PluginImportConflictModal({
  open,
  pluginId,
  onChoose,
  onCancel,
}: Props) {
  const { t } = useTranslation(["plugins", "common"]);
  return (
    <Modal
      open={open}
      title={t("plugins:importConflictTitle", {
        defaultValue: "插件已存在",
      })}
      typewriter={false}
      onClose={onCancel}
    >
      <p className="meta" style={{ marginTop: 0 }}>
        {t("plugins:importConflictHint", {
          defaultValue:
            "检测到同名插件 id。选择：覆盖（替换 UI）、另存为新 id、或取消。",
        })}
      </p>
      {pluginId ? (
        <p>
          <code>{pluginId}</code>
        </p>
      ) : null}
      <div
        className="row-actions"
        style={{ marginTop: 16, gap: 10, flexWrap: "wrap" }}
      >
        <IconButton
          label={t("plugins:conflictOverwrite", { defaultValue: "覆盖" })}
          icon={<IconDownload size={16} />}
          variant="primary"
          sfx="confirm"
          onClick={() => onChoose("overwrite")}
        />
        <IconButton
          label={t("plugins:conflictRename", { defaultValue: "另存为" })}
          icon={<IconOpen size={16} />}
          sfx="soft"
          onClick={() => onChoose("rename")}
        />
        <IconButton
          label={t("common:cancel", { defaultValue: "取消" })}
          icon={<IconTrash size={16} />}
          sfx="cancel"
          onClick={onCancel}
        />
      </div>
    </Modal>
  );
}
