import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Card, Collapse, Input, Tag } from "animal-island-ui";
import type { AlarmDraft } from "../../domain/types";
import { ElementImage } from "../../ui/ElementImage";
import { IconButton } from "../../ui/IconButton";
import { IconFolder, IconPlus, IconTrash } from "../../ui/icons";
import { pickBinaryFile } from "../../infra/dialog";
import { SuggestInput } from "../../ui/SuggestInput";

interface Props {
  draft: AlarmDraft;
  setDraft: Dispatch<SetStateAction<AlarmDraft>>;
  argsText: string;
  setArgsText: (v: string) => void;
  binaryPath: string | null;
  preview: string;
  /** Plugin param keys for ENV autocomplete (manifest + discovered settings). */
  envKeySuggestions?: string[];
}

export function EditTaskSection({
  draft,
  setDraft,
  argsText,
  setArgsText,
  binaryPath,
  preview,
  envKeySuggestions = [],
}: Props) {
  const { t } = useTranslation(["alarms", "common"]);
  // Only plugin settings keys (manifest + discovered storage) — no host CALLAI_* aliases.
  const keyOptions = Array.from(
    new Set(envKeySuggestions.filter(Boolean)),
  ).sort();

  return (
    <Card color="default" className="form-panel">
      <div className="panel-head">
        <h3>{t("alarms:task")}</h3>
        <ElementImage
          id="task-checklist"
          size={44}
          className="section-illus"
          alt=""
        />
      </div>
      <div className="field">
        <label>{t("alarms:binary")}</label>
        <div className="row">
          <Input
            value={draft.binary}
            placeholder={t("alarms:binaryPlaceholder")}
            onChange={(e) =>
              setDraft((d) => ({ ...d, binary: e.target.value }))
            }
            style={{ flex: 1, minWidth: 220 }}
          />
          <IconButton
            label={t("alarms:browse")}
            icon={<IconFolder size={16} />}
            onClick={() => {
              void pickBinaryFile().then((path) => {
                if (path) setDraft((d) => ({ ...d, binary: path }));
              });
            }}
          />
          {binaryPath ? (
            <Tag color="app-green" size="small">
              {t("alarms:binaryOk")}
            </Tag>
          ) : (
            <Tag color="app-orange" size="small">
              {t("alarms:binaryMissing")}
            </Tag>
          )}
        </div>
        {binaryPath && <div className="hint">{binaryPath}</div>}
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label>{t("alarms:args")}</label>
        <textarea
          className="raw"
          value={argsText}
          placeholder={t("alarms:argsPlaceholder")}
          onChange={(e) => setArgsText(e.target.value)}
        />
        <div className="hint meta">
          {"{{date}}"} · {"{{datetime}}"} · {"{{timestamp}}"}
        </div>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label>{t("alarms:preview")}</label>
        <div className="preview-box">{preview}</div>
      </div>

      <Collapse
        question={t("alarms:env")}
        answer={
          <div className="env-editor">
            {envKeySuggestions.length > 0 ? (
              <p className="meta" style={{ margin: "0 0 8px" }}>
                {t("alarms:envPluginHint", {
                  defaultValue: "这里可以临时改这次的参数，不会改掉插件里已保存的设置。",
                })}
              </p>
            ) : null}
            {draft.env_vars.map((env, idx) => (
              <div className="env-row" key={`env-row-${idx}`}>
                <SuggestInput
                  className="env-key env-key-suggest"
                  inputClassName="env-key-field"
                  value={env.key}
                  placeholder="key / mode"
                  options={keyOptions}
                  emptyLabel="—"
                  aria-label="ENV key"
                  onChange={(key) => {
                    setDraft((d) => {
                      const env_vars = d.env_vars.map((row, i) =>
                        i === idx ? { ...row, key } : row,
                      );
                      return { ...d, env_vars };
                    });
                  }}
                />
                <Input
                  className="env-input env-value"
                  value={env.value}
                  placeholder="value"
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraft((d) => {
                      const env_vars = d.env_vars.map((row, i) =>
                        i === idx ? { ...row, value } : row,
                      );
                      return { ...d, env_vars };
                    });
                  }}
                />
                <div className="env-actions">
                  <IconButton
                    label={t("common:delete")}
                    sfx="warn"
                    icon={<IconTrash size={14} />}
                    variant="danger"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        env_vars: d.env_vars.filter((_, i) => i !== idx),
                      }))
                    }
                  />
                </div>
              </div>
            ))}
            <div className="env-add">
              <IconButton
                label={t("alarms:addEnv")}
                sfx="confirm"
                icon={<IconPlus size={16} />}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    env_vars: [...d.env_vars, { key: "", value: "" }],
                  }))
                }
              />
            </div>
          </div>
        }
      />
    </Card>
  );
}
