import { useTranslation } from "react-i18next";
import { Modal } from "animal-island-ui";
import { IconButton } from "../../ui/IconButton";
import { IconClose } from "../../ui/icons";
import type { ImportProgress } from "./types";

interface Props {
  progress: ImportProgress;
  onClose: () => void;
}

export function PluginImportProgressModal({ progress, onClose }: Props) {
  const { t } = useTranslation(["plugins", "common"]);
  const open = progress.phase !== "idle" && progress.phase !== "conflict";
  const busy =
    progress.phase === "reading" ||
    progress.phase === "parsing" ||
    progress.phase === "installing";
  const ok = progress.phase === "success";
  const err = progress.phase === "error";

  const title = ok
    ? t("plugins:importSuccessTitle", { defaultValue: "安装完成" })
    : err
      ? t("plugins:importFailTitle", { defaultValue: "安装失败" })
      : t("plugins:importProgressTitle", { defaultValue: "正在安装插件" });

  const body =
    progress.message ||
    (progress.phase === "reading"
      ? t("plugins:importReading", { defaultValue: "正在读取文件…" })
      : progress.phase === "parsing"
        ? t("plugins:importParsing", { defaultValue: "正在解析插件包…" })
        : progress.phase === "installing"
          ? t("plugins:importInstalling", { defaultValue: "正在安装…" })
          : progress.phase === "success"
            ? t("plugins:importSuccessBody", {
                defaultValue: "已装好 {{name}}",
                name: progress.pluginName || progress.pluginId || "",
              })
            : progress.phase === "error"
              ? progress.message ||
                t("plugins:importFailBody", { defaultValue: "出了点小状况" })
              : "");

  return (
    <Modal
      open={open}
      title={title}
      typewriter={false}
      footer={null}
      maskClosable={!busy}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className={`plugin-import-progress is-${progress.phase}`}>
        <div className="plugin-import-progress-visual" aria-hidden>
          {busy ? (
            <div className="plugin-import-spinner" />
          ) : ok ? (
            <div className="plugin-import-mark is-ok">✓</div>
          ) : err ? (
            <div className="plugin-import-mark is-err">!</div>
          ) : null}
        </div>
        {progress.fileName ? (
          <p className="meta plugin-import-file">{progress.fileName}</p>
        ) : null}
        <p className="plugin-import-msg">{body}</p>
        {!busy ? (
          <div className="row-actions" style={{ marginTop: 12 }}>
            <IconButton
              label={t("common:confirm", { defaultValue: "好的" })}
              icon={<IconClose size={16} />}
              variant="primary"
              sfx={ok ? "confirm" : "soft"}
              onClick={onClose}
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
