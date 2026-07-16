import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Switch } from "animal-island-ui";
import { IconButton } from "../../ui/IconButton";
import { IconDownload, IconOpen, IconTrash } from "../../ui/icons";
import { isNewerVersion, isOlderVersion } from "../../domain/pluginVersion";
import type { ZipConflictMode } from "./types";

export type ConflictChoice = {
  mode: ZipConflictMode;
  force_downgrade: boolean;
  replace_data: boolean;
};

interface Props {
  open: boolean;
  pluginId?: string;
  packageVersion?: string;
  installedVersion?: string;
  packageName?: string;
  includesData?: boolean;
  onChoose: (choice: ConflictChoice) => void;
  onCancel: () => void;
}

export function PluginImportConflictModal({
  open,
  pluginId,
  packageVersion,
  installedVersion,
  packageName,
  includesData,
  onChoose,
  onCancel,
}: Props) {
  const { t } = useTranslation(["plugins", "common"]);
  const [replaceData, setReplaceData] = useState(false);

  const newer =
    packageVersion &&
    installedVersion &&
    isNewerVersion(packageVersion, installedVersion);
  const older =
    packageVersion &&
    installedVersion &&
    isOlderVersion(packageVersion, installedVersion);

  const hint = newer
    ? t("plugins:conflictUpdateHint", {
        defaultValue: "发现更高版本。更新会换掉界面，默认保留你的数据。",
      })
    : older
      ? t("plugins:conflictDowngradeHint", {
          defaultValue:
            "包版本比已装更旧。默认不允许降级；若坚持，请点「强制装旧版」。",
        })
      : t("plugins:importConflictHint", {
          defaultValue: "要覆盖原来的界面、另存成新插件，还是先取消？",
        });

  return (
    <Modal
      open={open}
      title={
        newer
          ? t("plugins:conflictUpdateTitle", { defaultValue: "可以更新" })
          : older
            ? t("plugins:conflictDowngradeTitle", {
                defaultValue: "版本更旧",
              })
            : t("plugins:importConflictTitle", {
                defaultValue: "已经有同名插件了",
              })
      }
      typewriter={false}
      onClose={onCancel}
    >
      <p className="meta" style={{ marginTop: 0 }}>
        {hint}
      </p>
      {pluginId ? (
        <div className="plugin-confirm-target" style={{ marginTop: 10 }}>
          <strong className="plugin-confirm-name">
            {packageName || pluginId}
          </strong>
          <span className="plugin-confirm-meta">
            {pluginId}
            {installedVersion ? ` · 已装 v${installedVersion}` : ""}
            {packageVersion ? ` · 包 v${packageVersion}` : ""}
          </span>
        </div>
      ) : null}

      {includesData ? (
        <div className="plugin-confirm-row" style={{ marginTop: 12 }}>
          <div className="plugin-confirm-row-copy">
            <span className="plugin-confirm-row-title">
              {t("plugins:replaceData", {
                defaultValue: "同时替换本地数据",
              })}
            </span>
            <span className="plugin-confirm-row-hint meta">
              {t("plugins:replaceDataHint", {
                defaultValue: "会用包里的记录覆盖你的设置与数据",
              })}
            </span>
          </div>
          <Switch checked={replaceData} onChange={setReplaceData} />
        </div>
      ) : null}

      <div
        className="row-actions"
        style={{ marginTop: 16, gap: 10, flexWrap: "wrap" }}
      >
        {older ? (
          <IconButton
            label={t("plugins:forceOlder", { defaultValue: "强制装旧版" })}
            icon={<IconDownload size={16} />}
            variant="danger"
            sfx="warn"
            onClick={() =>
              onChoose({
                mode: "overwrite",
                force_downgrade: true,
                replace_data: replaceData,
              })
            }
          />
        ) : (
          <IconButton
            label={
              newer
                ? t("plugins:updateNow", { defaultValue: "更新" })
                : t("plugins:conflictOverwrite", { defaultValue: "覆盖" })
            }
            icon={<IconDownload size={16} />}
            variant="primary"
            sfx="confirm"
            onClick={() =>
              onChoose({
                mode: "overwrite",
                force_downgrade: false,
                replace_data: replaceData,
              })
            }
          />
        )}
        <IconButton
          label={t("plugins:conflictRename", { defaultValue: "另存为" })}
          icon={<IconOpen size={16} />}
          sfx="soft"
          onClick={() =>
            onChoose({
              mode: "rename",
              force_downgrade: false,
              replace_data: false,
            })
          }
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
