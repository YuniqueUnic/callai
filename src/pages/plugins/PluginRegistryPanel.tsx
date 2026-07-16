import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Input, Tag } from "animal-island-ui";
import { client } from "../../infra/client";
import { toast } from "../../ui/toast";
import { playSound } from "../../ui/sounds";
import { IconButton } from "../../ui/IconButton";
import { IconDownload, IconRefresh } from "../../ui/icons";
import {
  isNewerVersion,
  isOlderVersion,
  type MarketUpdateInfo,
} from "../../domain/pluginVersion";

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
  /** id → installed version */
  installedVersions: Map<string, string>;
  onInstalled: () => Promise<void>;
  /** Notify parent of latest market index (for installed-tab update badges). */
  onIndexLoaded?: (index: RegistryIndex | null) => void;
}

const DEFAULT_URL =
  "https://raw.githubusercontent.com/YuniqueUnic/callai-plugin-registry/main/registry.json";

export function PluginRegistryPanel({
  installedVersions,
  onInstalled,
  onIndexLoaded,
}: Props) {
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
          defaultValue: "市场需要在桌面应用里打开",
        }),
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const idx = await client.fetchPluginRegistry(url.trim() || null);
      setIndex(idx);
      onIndexLoaded?.(idx);
    } catch (e) {
      setIndex(null);
      onIndexLoaded?.(null);
      setError(String((e as { message?: string })?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [onIndexLoaded, t, url]);

  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- initial load only

  async function installEntry(
    entry: RegistryEntry,
    mode: "install" | "update" | "reinstall" | "force_old",
  ) {
    if (typeof client.importPluginZipUrl !== "function") return;
    setInstalling(entry.id);
    try {
      const installed = installedVersions.get(entry.id);
      const conflict =
        mode === "install" && !installed
          ? "rename"
          : "overwrite";
      const force_downgrade = mode === "force_old";
      const summary = await client.importPluginZipUrl(
        entry.zip_url,
        conflict,
        force_downgrade,
        false, // never replace data from market by default
      );
      if (!summary) {
        toast.success({
          message: t("plugins:importSkipped", {
            defaultValue: "已跳过（这个插件已在）",
          }),
        });
      } else {
        playSound("confirm");
        toast.success({
          message:
            mode === "update"
              ? t("plugins:updated", {
                  defaultValue: "已更新 {{name}} → v{{version}}",
                  name: summary.name,
                  version: summary.version,
                })
              : t("plugins:imported", {
                  defaultValue: "已装好 {{name}}",
                  name: summary.name,
                }),
        });
        await onInstalled();
      }
    } catch (e) {
      playSound("warn");
      toast.error({
        message: String((e as { message?: string })?.message ?? e),
      });
    } finally {
      setInstalling(null);
    }
  }

  const rows = useMemo(() => {
    if (!index) return [];
    return index.plugins.map((entry) => {
      const local = installedVersions.get(entry.id);
      const installed = local != null;
      const update = installed && isNewerVersion(entry.version, local!);
      const older = installed && isOlderVersion(entry.version, local!);
      return { entry, installed, local, update, older };
    });
  }, [index, installedVersions]);

  return (
    <div className="plugin-registry">
      <Card className="form-panel plugin-registry-toolbar">
        <div className="field">
          <label>
            {t("plugins:registryUrl", { defaultValue: "市场地址" })}
          </label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={DEFAULT_URL}
          />
        </div>
        <div className="row-actions" style={{ marginTop: 10, gap: 8 }}>
          <IconButton
            label={t("plugins:registryRefresh", { defaultValue: "刷新" })}
            icon={<IconRefresh size={16} />}
            variant="primary"
            sfx="soft"
            disabled={loading}
            onClick={() => void refresh()}
          />
        </div>
        <p className="meta" style={{ marginTop: 8 }}>
          {t("plugins:registryHint", {
            defaultValue: "填入市场目录地址，即可浏览可安装的插件。",
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
              defaultValue: "可以换一个市场地址再试试。",
            })}
          </p>
        </Card>
      ) : !index || index.plugins.length === 0 ? (
        <Card className="form-panel">
          <p className="meta">
            {t("plugins:registryEmpty", {
              defaultValue: "市场里暂时空空的",
            })}
          </p>
        </Card>
      ) : (
        <div className="plugin-list">
          {rows.map(({ entry, installed, local, update, older }) => (
            <Card key={entry.id} className="plugin-card form-panel">
              <div className="plugin-card-head">
                <div className="plugin-card-meta">
                  <strong className="plugin-name">{entry.name}</strong>
                  <div className="meta plugin-id-line">
                    <span className="plugin-id">{entry.id}</span>
                    <span aria-hidden>·</span>
                    <span>v{entry.version}</span>
                    {installed && local ? (
                      <span>
                        · {t("plugins:installedVer", { defaultValue: "已装" })}{" "}
                        v{local}
                      </span>
                    ) : null}
                    {update ? (
                      <Tag size="small" color="app-green">
                        {t("plugins:updateAvailable", {
                          defaultValue: "有更新",
                        })}
                      </Tag>
                    ) : null}
                    {installed && !update ? (
                      <Tag size="small">
                        {t("plugins:registryInstalled", {
                          defaultValue: "已安装",
                        })}
                      </Tag>
                    ) : null}
                  </div>
                </div>
                <div className="icon-actions plugin-card-actions">
                  {!installed ? (
                    <IconButton
                      label={t("plugins:registryInstall", {
                        defaultValue: "安装",
                      })}
                      icon={<IconDownload size={16} />}
                      variant="primary"
                      sfx="confirm"
                      disabled={installing === entry.id}
                      onClick={() => void installEntry(entry, "install")}
                    />
                  ) : update ? (
                    <IconButton
                      label={t("plugins:updateNow", {
                        defaultValue: "更新",
                      })}
                      icon={<IconDownload size={16} />}
                      variant="primary"
                      sfx="confirm"
                      disabled={installing === entry.id}
                      onClick={() => void installEntry(entry, "update")}
                    />
                  ) : older ? (
                    <IconButton
                      label={t("plugins:forceOlder", {
                        defaultValue: "强制装旧版",
                      })}
                      icon={<IconDownload size={16} />}
                      sfx="warn"
                      disabled={installing === entry.id}
                      onClick={() => void installEntry(entry, "force_old")}
                    />
                  ) : (
                    <IconButton
                      label={t("plugins:registryReinstall", {
                        defaultValue: "重新安装",
                      })}
                      icon={<IconDownload size={16} />}
                      sfx="soft"
                      disabled={installing === entry.id}
                      onClick={() => void installEntry(entry, "reinstall")}
                    />
                  )}
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
          ))}
        </div>
      )}
    </div>
  );
}

/** Build id → market update info from registry + installed versions. */
export function buildMarketUpdates(
  index: RegistryIndex | null | undefined,
  installedVersions: Map<string, string>,
): Map<string, MarketUpdateInfo> {
  const out = new Map<string, MarketUpdateInfo>();
  if (!index) return out;
  for (const p of index.plugins) {
    const local = installedVersions.get(p.id);
    if (local && isNewerVersion(p.version, local)) {
      out.set(p.id, {
        version: p.version,
        zip_url: p.zip_url,
        name: p.name,
      });
    }
  }
  return out;
}
