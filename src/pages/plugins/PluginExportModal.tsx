import { useTranslation } from "react-i18next";
import { Modal } from "animal-island-ui";
import type { PluginSummary } from "../../domain/types";
import { IconButton } from "../../ui/IconButton";
import { IconDownload } from "../../ui/icons";

interface Props {
  target: PluginSummary | null;
  exporting: boolean;
  onClose: () => void;
  onExport: (includeData: boolean) => void;
}

export function PluginExportModal({
  target,
  exporting,
  onClose,
  onExport,
}: Props) {
  const { t } = useTranslation(["plugins"]);
  return (
    <Modal
      open={!!target}
      title={t("plugins:exportZip", { defaultValue: "导出插件" })}
      typewriter={false}
      onClose={() => !exporting && onClose()}
    >
      <p className="meta" style={{ marginTop: 0 }}>
        {t("plugins:exportHint", {
          defaultValue:
            "裸包仅含 manifest + UI（适合分享/市场）；含数据会附带 data.db（设置与本地记录）。",
        })}
      </p>
      {target ? (
        <p>
          <strong>{target.name}</strong>
          <span className="meta"> · {target.id}</span>
        </p>
      ) : null}
      <div
        className="row-actions"
        style={{ marginTop: 16, gap: 10, flexWrap: "wrap" }}
      >
        <IconButton
          label={t("plugins:exportBare", { defaultValue: "导出裸包" })}
          icon={<IconDownload size={16} />}
          variant="primary"
          sfx="confirm"
          disabled={exporting}
          onClick={() => onExport(false)}
        />
        <IconButton
          label={t("plugins:exportWithData", {
            defaultValue: "导出（含数据）",
          })}
          icon={<IconDownload size={16} />}
          sfx="soft"
          disabled={exporting}
          onClick={() => onExport(true)}
        />
      </div>
    </Modal>
  );
}
