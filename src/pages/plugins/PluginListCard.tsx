import { useTranslation } from "react-i18next";
import { Card, Tag } from "animal-island-ui";
import type { PluginSummary } from "../../domain/types";
import { IconButton } from "../../ui/IconButton";
import {
  IconChat,
  IconDownload,
  IconLogs,
  IconOpen,
  IconRestore,
  IconTrash,
} from "../../ui/icons";
import type { BuiltinCatalogItem } from "./types";

interface Props {
  plugin: PluginSummary;
  catalog: BuiltinCatalogItem[];
  onOpen: () => void;
  onLogs: () => void;
  onFix: () => void;
  onExport: () => void;
  onRestore?: () => void;
  onDelete: () => void;
}

export function PluginListCard({
  plugin: p,
  catalog,
  onOpen,
  onLogs,
  onFix,
  onExport,
  onRestore,
  onDelete,
}: Props) {
  const { t } = useTranslation(["plugins", "common"]);
  const cat = catalog.find((c) => c.id === p.id);
  return (
    <Card className="plugin-card form-panel">
      <div className="plugin-card-head">
        <div className="plugin-card-meta">
          <strong className="plugin-name">{p.name}</strong>
          <div className="meta plugin-id-line">
            <span className="plugin-id">{p.id}</span>
            <span aria-hidden>·</span>
            <span>v{p.version}</span>
            {cat?.update_available ? <Tag size="small">update</Tag> : null}
            {cat?.user_edited ? <Tag size="small">edited</Tag> : null}
          </div>
        </div>
        <div className="icon-actions plugin-card-actions">
          <IconButton
            label={t("plugins:open")}
            icon={<IconOpen size={16} />}
            variant="primary"
            sfx="soft"
            onClick={onOpen}
          />
          <IconButton
            label={t("plugins:logs", { defaultValue: "日志" })}
            icon={<IconLogs size={16} />}
            sfx="soft"
            onClick={onLogs}
          />
          <IconButton
            label={t("plugins:fixWithAi", { defaultValue: "AI 修复" })}
            icon={<IconChat size={16} />}
            sfx="confirm"
            onClick={onFix}
          />
          <IconButton
            label={t("plugins:exportZip", { defaultValue: "导出" })}
            icon={<IconDownload size={16} />}
            sfx="soft"
            onClick={onExport}
          />
          {cat ? (
            <IconButton
              label={t("plugins:restoreBuiltin", {
                defaultValue: "恢复内置",
              })}
              icon={<IconRestore size={16} />}
              sfx="soft"
              onClick={() => onRestore?.()}
            />
          ) : null}
          <IconButton
            label={t("common:delete")}
            icon={<IconTrash size={16} />}
            variant="danger"
            sfx="soft"
            onClick={onDelete}
          />
        </div>
      </div>
      <p className="plugin-desc">{p.description || t("plugins:noDesc")}</p>
      <div className="plugin-tags">
        {p.permissions.map((perm) => (
          <Tag key={perm} size="small">
            {perm}
          </Tag>
        ))}
      </div>
      <div className="meta plugin-stats">
        <span>
          {t("plugins:records")}: {p.record_count}
        </span>
        {p.last_run_at ? (
          <span>
            {t("plugins:lastRun")}: {new Date(p.last_run_at).toLocaleString()}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
