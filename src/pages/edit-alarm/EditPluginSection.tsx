import { useTranslation } from "react-i18next";
import { Card, Input, Switch } from "animal-island-ui";
import type { AlarmPluginConfig } from "../../domain/types";

interface Props {
  pluginId: string;
  popup: boolean;
  suppressWhenFullscreen: boolean;
  onPatch: (partial: Partial<AlarmPluginConfig>) => void;
}

/**
 * Plugin run chrome only: which plugin + popup policy.
 * Runtime params / settings overrides live exclusively in Task → ENV
 * (same keys as storage.settings; not persisted as a second system).
 */
export function EditPluginSection({
  pluginId,
  popup,
  suppressWhenFullscreen,
  onPatch,
}: Props) {
  const { t } = useTranslation(["alarms", "common"]);

  return (
    <Card color="default" className="form-panel">
      <div className="panel-head">
        <h3>{t("alarms:pluginRun", { defaultValue: "插件运行" })}</h3>
      </div>
      <p className="meta" style={{ marginTop: 0 }}>
        {t("alarms:pluginRunHint", {
          defaultValue: "要不要弹出窗口。参数写在下面的环境变量里就好。",
        })}
      </p>
      <div className="field" style={{ marginTop: 10 }}>
        <label>plugin_id</label>
        <Input
          value={pluginId}
          onChange={(e) => onPatch({ plugin_id: e.target.value })}
        />
      </div>
      <div className="field field-row" style={{ marginTop: 12 }}>
        <label>
          {t("alarms:pluginPopup", { defaultValue: "弹出插件窗口" })}
        </label>
        <Switch checked={popup} onChange={(v) => onPatch({ popup: v })} />
      </div>
      <div className="field field-row" style={{ marginTop: 12 }}>
        <label>
          {t("alarms:pluginSuppressFs", {
            defaultValue: "全屏时不弹窗（仅通知）",
          })}
        </label>
        <Switch
          checked={suppressWhenFullscreen}
          onChange={(v) => onPatch({ suppress_when_fullscreen: v })}
        />
      </div>
    </Card>
  );
}
