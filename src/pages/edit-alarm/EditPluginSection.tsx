import { useTranslation } from "react-i18next";
import { Card, Input, Switch } from "animal-island-ui";
import type { AlarmPluginConfig } from "../../domain/types";

interface Props {
  pluginId: string;
  popup: boolean;
  suppressWhenFullscreen: boolean;
  onPatch: (partial: Partial<AlarmPluginConfig>) => void;
}

export function EditPluginSection({
  pluginId,
  popup,
  suppressWhenFullscreen,
  onPatch,
}: Props) {
  const { t } = useTranslation(["alarms"]);
  return (
    <Card color="default" className="form-panel">
      <div className="panel-head">
        <h3>{t("alarms:pluginRun", { defaultValue: "插件运行" })}</h3>
      </div>
      <p className="meta" style={{ marginTop: 0 }}>
        {t("alarms:pluginRunHint", {
          defaultValue:
            "只负责触发时机与是否弹窗；业务参数请在插件窗口内配置。",
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
