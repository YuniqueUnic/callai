import { useTranslation } from "react-i18next";
import { IconButton } from "../../ui/IconButton";
import { IconBack, IconClear, IconCopy, IconTrash } from "../../ui/icons";

interface Props {
  selectedCount: number;
  onSelectAll: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClearAll: () => void;
  onCancel: () => void;
}

export function AiSelectToolbar({
  selectedCount,
  onSelectAll,
  onCopy,
  onDelete,
  onClearAll,
  onCancel,
}: Props) {
  const { t } = useTranslation(["ai"]);
  return (
    <div className="ai-select-toolbar" role="toolbar">
      <span className="meta ai-select-count">
        {t("ai:selectedCount", { count: selectedCount })}
      </span>
      <div className="ai-select-actions">
        <IconButton
          label={t("ai:selectAll")}
          icon={<IconClear size={16} />}
          sfx="soft"
          onClick={onSelectAll}
        />
        <IconButton
          label={t("ai:copySelected")}
          icon={<IconCopy size={16} />}
          disabled={selectedCount === 0}
          sfx="confirm"
          onClick={onCopy}
        />
        <IconButton
          label={t("ai:deleteSelected")}
          icon={<IconTrash size={16} />}
          disabled={selectedCount === 0}
          sfx="cancel"
          onClick={onDelete}
        />
        <IconButton
          label={t("ai:clearHistory")}
          icon={<IconTrash size={16} />}
          sfx="cancel"
          onClick={onClearAll}
        />
        <IconButton
          label={t("ai:selectCancel")}
          icon={<IconBack size={16} />}
          sfx="soft"
          onClick={onCancel}
        />
      </div>
    </div>
  );
}
