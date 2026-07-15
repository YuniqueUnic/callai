import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "animal-island-ui";
import type { AlarmDraft, RetryInterval } from "../../domain/types";
import { DurationPicker } from "../../ui/DurationPicker";
import { playSound } from "../../ui/sounds";

const INTERVALS: RetryInterval[] = ["1m", "2m", "5m", "10m"];

interface Props {
  draft: AlarmDraft;
  setDraft: Dispatch<SetStateAction<AlarmDraft>>;
}

export function EditTimeoutRetrySection({ draft, setDraft }: Props) {
  const { t } = useTranslation(["alarms"]);
  return (
    <>
        <Card color="default" className="form-panel">
          <div className="field">
            <label className="label">{t("alarms:timeout")}</label>
            <div style={{ marginTop: 8 }}>
              <DurationPicker
                value={draft.timeout_secs ?? 20}
                onChange={(secs) =>
                  setDraft((d) => ({ ...d, timeout_secs: secs }))
                }
              />
            </div>
          </div>
        </Card>

<Card color="default" className="form-panel">
          <div className="field">
            <label className="label">{t("alarms:retry")}</label>
            <div className="segmented">
              {INTERVALS.map((interval) => (
                <button
                  key={interval}
                  type="button"
                  className={draft.retry.interval === interval ? "active" : ""}
                  onClick={() => {
                    playSound("soft");
                    setDraft((d) => ({
                      ...d,
                      retry: { ...d.retry, interval, max_attempts: 3 },
                    }));
                  }}
                >
                  {t(`alarms:interval_${interval}` as "alarms:interval_2m")}
                </button>
              ))}
            </div>
          </div>
        </Card>

    </>
  );
}
