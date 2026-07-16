import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Input, Tag } from "animal-island-ui";
import { client } from "../../infra/client";
import { toast } from "../../ui/toast";
import { playSound } from "../../ui/sounds";
import { IconButton } from "../../ui/IconButton";
import { IconDownload, IconOpen } from "../../ui/icons";

export type RegistryEntry = {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string | null;
  zip_url: string;
  homepage?: string | null;
  repository?: string | null;
  tags?: string[];
};

export type RegistryIndex = {
  schema: number;
  name: string;
  updated_at?: string | null;
  plugins: RegistryEntry[];
};

interface Props {
  installedIds: Set<string>;
  onInstalled: () => Promise<void>;
}

const DEFAULT_URL =
  "https://raw.githubusercontent.com/YuniqueUnic/callai-plugin-registry/main/registry.json";

export function PluginRegistryPanel({ installedIds, onInstalled }: Props) {
  const { t } = useTranslation(["plugins", "common"]);
  const [url, setUrl] = useState(DEFAULT_URL);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [index, setIndex] = useState<RegistryIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof client.fetchPluginRegistry !== "function") {
      setError(
        t("plugins:registryDesktopOnly", {
          defaultValue: "Registry browse requires desktop app",
        }),
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const idx = await client.fetchPluginRegistry(url.trim() || null);
      setIndex(idx);
    } catch (e) {
      setIndex(null);
      setError(String((e as { message?: string })?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [t, url]);

  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- initial load only

  async function installEntry(entry: RegistryEntry) {
    if (typeof client.importPluginZipUrl !== "function") return;
    setInstalling(entry.id);
    try {
      const mode = installedIds.has(entry.id) ? "overwrite" : "rename";
      const summary = await client.importPluginZipUrl(entry.zip_url, mode);
      if (!summary) {
        toast.success({
          message: t("plugins:importSkipped", {
            defaultValue: "已跳过（插件已存在）",
          }),
        });
      } else {
        playSound("confirm");
        toast.success({
          message: t("plugins:imported", {
            defaultValue: "已安装 {{name}}",
            name: summary.name,
          }),
        });
        await onInstalled();
      }
    } catch (e) {
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
    } finally {
      setInstalling(null);
    }
  }

  return (
    <div className="plugin-registry">
      <Card className="form-panel plugin-registry-toolbar">
        <div className="field">
          <label>
            {t("plugins:registryUrl", { defaultValue: "Registry URL" })}
          </label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={DEFAULT_URL}
          />
        </div>
        <div className="row-actions" style={{ marginTop: 10, gap: 8 }}>
          <IconButton
            label={t("plugins:registryRefresh", { defaultValue: "刷新目录" })}
            icon={<IconOpen size={16} />}
            variant="primary"
            sfx="soft"
            disabled={loading}
            onClick={() => void refresh()}
          />
        </div>
        <p className="meta" style={{ marginTop: 8 }}>
          {t("plugins:registryHint", {
            defaultValue:
              "GitHub raw registry.json。条目需提供 https zip_url（callai 插件包）。",
          })}
        </p>
      </Card>

      {loading ? (
        <p className="meta">{t("common:loading")}</p>
      ) : error ? (
        <Card className="form-panel">
          <p className="meta" style={{ color: "var(--error, #e05a5a)" }}>
            {error}
          </p>
          <p className="meta">
            {t("plugins:registryEmptyHint", {
              defaultValue:
                "若默认仓库尚不存在，可填本地/自建 registry URL，或参考 docs/plugin-registry.md。",
            })}
          </p>
        </Card>
      ) : !index || index.plugins.length === 0 ? (
        <Card className="form-panel">
          <p className="meta">
            {t("plugins:registryEmpty", { defaultValue: "目录为空" })}
          </p>
        </Card>
      ) : (
        <div className="plugin-list">
          {index.plugins.map((entry) => {
            const installed = installedIds.has(entry.id);
            return (
              <Card key={entry.id} className="plugin-card form-panel">
                <div className="plugin-card-head">
                  <div className="plugin-card-meta">
                    <strong className="plugin-name">{entry.name}</strong>
                    <div className="meta plugin-id-line">
                      <span className="plugin-id">{entry.id}</span>
                      <span aria-hidden>·</span>
                      <span>v{entry.version}</span>
                      {installed ? (
                        <Tag size="small">
                          {t("plugins:registryInstalled", {
                            defaultValue: "已安装",
                          })}
                        </Tag>
                      ) : null}
                    </div>
                  </div>
                  <div className="icon-actions plugin-card-actions">
                    <IconButton
                      label={
                        installed
                          ? t("plugins:registryReinstall", {
                              defaultValue: "覆盖安装",
                            })
                          : t("plugins:registryInstall", {
                              defaultValue: "安装",
                            })
                      }
                      icon={<IconDownload size={16} />}
                      variant="primary"
                      sfx="confirm"
                      disabled={installing === entry.id}
                      onClick={() => void installEntry(entry)}
                    />
                  </div>
                </div>
                <p className="plugin-desc">
                  {entry.description || t("plugins:noDesc")}
                </p>
                <div className="plugin-tags">
                  {(entry.tags || []).map((tag) => (
                    <Tag key={tag} size="small">
                      {tag}
                    </Tag>
                  ))}
                  {entry.author ? (
                    <Tag size="small">{entry.author}</Tag>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
