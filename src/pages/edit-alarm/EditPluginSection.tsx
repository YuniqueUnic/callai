import { useTranslation } from "react-i18next";
import { Card, Input, Switch } from "animal-island-ui";
import type { AlarmPluginConfig } from "../../domain/types";

interface Props {
  pluginId: string;
  popup: boolean;
  suppressWhenFullscreen: boolean;
  params: Record<string, string | number | boolean | null>;
  onPatch: (partial: Partial<AlarmPluginConfig>) => void;
}

function paramsToRows(
  params: Record<string, string | number | boolean | null>,
): { key: string; value: string }[] {
  const rows = Object.entries(params || {}).map(([key, value]) => ({
    key,
    value: value == null ? "" : String(value),
  }));
  return rows.length ? rows : [{ key: "", value: "" }];
}

function rowsToParams(
  rows: { key: string; value: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    out[k] = r.value;
  }
  return out;
}

/** Built-in quick fields for known plugin ids (same keys as storage settings). */
function QuickParams({
  pluginId,
  params,
  onPatch,
}: {
  pluginId: string;
  params: Record<string, string | number | boolean | null>;
  onPatch: (partial: Partial<AlarmPluginConfig>) => void;
}) {
  const id = pluginId.trim();
  function setParam(key: string, value: string) {
    onPatch({ params: { ...params, [key]: value } });
  }
  if (id === "meal-spin") {
    const mode = String(params.mode ?? "food");
    return (
      <div className="field" style={{ marginTop: 12 }}>
        <label>mode</label>
        <select
          className="native-select"
          value={mode === "drink" ? "drink" : "food"}
          onChange={(e) => setParam("mode", e.target.value)}
        >
          <option value="food">food（吃什么）</option>
          <option value="drink">drink（喝什么）</option>
        </select>
      </div>
    );
  }
  if (id === "todo") {
    const filter = String(params.filter ?? "all");
    return (
      <div className="field" style={{ marginTop: 12 }}>
        <label>filter</label>
        <select
          className="native-select"
          value={["all", "open", "done"].includes(filter) ? filter : "all"}
          onChange={(e) => setParam("filter", e.target.value)}
        >
          <option value="all">all</option>
          <option value="open">open</option>
          <option value="done">done</option>
        </select>
      </div>
    );
  }
  if (id === "pomodoro") {
    const mode = String(params.mode ?? "focus");
    return (
      <div className="field" style={{ marginTop: 12 }}>
        <label>mode</label>
        <select
          className="native-select"
          value={["focus", "short", "long"].includes(mode) ? mode : "focus"}
          onChange={(e) => setParam("mode", e.target.value)}
        >
          <option value="focus">focus</option>
          <option value="short">short</option>
          <option value="long">long</option>
        </select>
      </div>
    );
  }
  if (id === "work-report") {
    const kind = String(params.kind ?? "daily");
    return (
      <div className="field" style={{ marginTop: 12 }}>
        <label>kind</label>
        <select
          className="native-select"
          value={
            ["daily", "weekly", "monthly"].includes(kind) ? kind : "daily"
          }
          onChange={(e) => setParam("kind", e.target.value)}
        >
          <option value="daily">daily</option>
          <option value="weekly">weekly</option>
          <option value="monthly">monthly</option>
        </select>
      </div>
    );
  }
  return null;
}

export function EditPluginSection({
  pluginId,
  popup,
  suppressWhenFullscreen,
  params,
  onPatch,
}: Props) {
  const { t } = useTranslation(["alarms", "common"]);
  const rows = paramsToRows(params);

  function patchRows(next: { key: string; value: string }[]) {
    onPatch({ params: rowsToParams(next) });
  }

  return (
    <Card color="default" className="form-panel">
      <div className="panel-head">
        <h3>{t("alarms:pluginRun", { defaultValue: "插件运行" })}</h3>
      </div>
      <p className="meta" style={{ marginTop: 0 }}>
        {t("alarms:pluginRunHint", {
          defaultValue:
            "触发时机、弹窗，以及与插件 settings 同名的参数覆盖（ENV 可强制覆盖）。",
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

      <QuickParams pluginId={pluginId} params={params} onPatch={onPatch} />

      <div className="field" style={{ marginTop: 14 }}>
        <label>
          {t("alarms:pluginParams", {
            defaultValue: "参数覆盖 (与插件 settings 同名)",
          })}
        </label>
        <p className="meta" style={{ margin: "4px 0 8px" }}>
          {t("alarms:pluginParamsHint", {
            defaultValue:
              "与 storage.settings 同一套 key。ENV：CALLAI_PLUGIN_PARAM_* / CALLAI_PLUGIN_MODE。",
          })}
        </p>
        <div className="env-editor">
          {rows.map((row, idx) => (
            <div className="env-row" key={`param-row-${idx}`}>
              <Input
                className="env-input env-key"
                placeholder="key"
                value={row.key}
                onChange={(e) => {
                  const next = rows.map((r, i) =>
                    i === idx ? { ...r, key: e.target.value } : r,
                  );
                  patchRows(next);
                }}
              />
              <Input
                className="env-input env-value"
                placeholder="value"
                value={row.value}
                onChange={(e) => {
                  const next = rows.map((r, i) =>
                    i === idx ? { ...r, value: e.target.value } : r,
                  );
                  patchRows(next);
                }}
              />
              <div className="env-actions">
                <button
                  type="button"
                  className="linkish"
                  onClick={() => patchRows(rows.filter((_, i) => i !== idx))}
                >
                  {t("common:delete", { defaultValue: "删" })}
                </button>
              </div>
            </div>
          ))}
          <div className="env-add">
            <button
              type="button"
              className="linkish"
              onClick={() => patchRows([...rows, { key: "", value: "" }])}
            >
              {t("alarms:addParam", { defaultValue: "+ 参数" })}
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
