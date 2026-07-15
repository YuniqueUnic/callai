import { useTranslation } from "react-i18next";
import type { Dispatch, SetStateAction } from "react";
import { Card, Input } from "animal-island-ui";
import type { AlarmDraft } from "../../domain/types";
import { ElementImage } from "../../ui/ElementImage";
import { TimePicker } from "../../ui/TimePicker";
import { playSound, playTick } from "../../ui/sounds";

type ScheduleMode = "daily" | "weekly" | "monthly" | "cron";

interface Props {
  draft: AlarmDraft;
  scheduleMode: ScheduleMode;
  scheduleTimes: string[];
  newTime: string;
  setNewTime: (v: string) => void;
  setScheduleMode: (m: ScheduleMode) => void;
  setDraft: Dispatch<SetStateAction<AlarmDraft>>;
  updateScheduleTimes: (times: string[]) => void;
}

export function EditScheduleSection({
  draft,
  scheduleMode,
  scheduleTimes,
  newTime,
  setNewTime,
  setScheduleMode,
  setDraft,
  updateScheduleTimes,
}: Props) {
  const { t } = useTranslation(["alarms", "common"]);
  return (
        <Card color="default" className="form-panel">
          <div className="panel-head">
            <h3>{t("alarms:schedule")}</h3>
            <ElementImage id="set-time" size={44} className="section-illus" alt="" />
          </div>
          <div className="field">
            <div className="schedule-mode" role="radiogroup" aria-label={t("alarms:schedule")}>
              {(
                [
                  ["daily", "alarms:daily"],
                  ["weekly", "alarms:weekly"],
                  ["monthly", "alarms:monthly"],
                  ["cron", "alarms:cron"],
                ] as const
              ).map(([mode, key]) => (
                <button
                  key={mode}
                  type="button"
                  className={scheduleMode === mode ? "active" : ""}
                  onClick={() => {
                    playSound("soft");
                    setScheduleMode(mode);
                    setDraft((d) => {
                      const times =
                        d.schedule.mode === "daily" ||
                        d.schedule.mode === "weekly" ||
                        d.schedule.mode === "monthly"
                          ? d.schedule.times
                          : scheduleTimes;
                      if (mode === "daily") {
                        return { ...d, schedule: { mode: "daily", times } };
                      }
                      if (mode === "weekly") {
                        const days =
                          d.schedule.mode === "weekly"
                            ? d.schedule.days
                            : [1, 2, 3, 4, 5];
                        return { ...d, schedule: { mode: "weekly", days, times } };
                      }
                      if (mode === "monthly") {
                        const days =
                          d.schedule.mode === "monthly" ? d.schedule.days : [1];
                        return { ...d, schedule: { mode: "monthly", days, times } };
                      }
                      return {
                        ...d,
                        schedule: {
                          mode: "cron",
                          expression:
                            d.schedule.mode === "cron"
                              ? d.schedule.expression
                              : "0 8,13,18 * * *",
                        },
                      };
                    });
                  }}
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>

          {scheduleMode !== "cron" ? (
            <div className="field" style={{ marginTop: 12 }}>
              {scheduleMode === "weekly" ? (
                <div className="times-row" style={{ marginBottom: 10 }} role="group" aria-label={t("alarms:weekdays")}>
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                    const selected =
                      draft.schedule.mode === "weekly" &&
                      draft.schedule.days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        className={`time-chip ${selected ? "active" : ""}`}
                        onClick={() => {
                          playTick();
                          setDraft((prev) => {
                            const times =
                              prev.schedule.mode === "weekly" ||
                              prev.schedule.mode === "daily" ||
                              prev.schedule.mode === "monthly"
                                ? prev.schedule.times
                                : scheduleTimes;
                            const days =
                              prev.schedule.mode === "weekly"
                                ? [...prev.schedule.days]
                                : [1, 2, 3, 4, 5];
                            const next = selected
                              ? days.filter((x) => x !== d)
                              : [...days, d].sort((a, b) => a - b);
                            return {
                              ...prev,
                              schedule: {
                                mode: "weekly",
                                days: next.length ? next : [d],
                                times,
                              },
                            };
                          });
                        }}
                      >
                        {t(`alarms:dow_${d}` as "alarms:dow_0")}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {scheduleMode === "monthly" ? (
                <div className="times-row" style={{ marginBottom: 10, flexWrap: "wrap" }} role="group" aria-label={t("alarms:monthDays")}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
                    const selected =
                      draft.schedule.mode === "monthly" &&
                      draft.schedule.days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        className={`time-chip ${selected ? "active" : ""}`}
                        onClick={() => {
                          playTick();
                          setDraft((prev) => {
                            const times =
                              prev.schedule.mode === "monthly" ||
                              prev.schedule.mode === "daily" ||
                              prev.schedule.mode === "weekly"
                                ? prev.schedule.times
                                : scheduleTimes;
                            const days =
                              prev.schedule.mode === "monthly"
                                ? [...prev.schedule.days]
                                : [1];
                            const next = selected
                              ? days.filter((x) => x !== d)
                              : [...days, d].sort((a, b) => a - b);
                            return {
                              ...prev,
                              schedule: {
                                mode: "monthly",
                                days: next.length ? next : [d],
                                times,
                              },
                            };
                          });
                        }}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <div className="times-row">
                {scheduleTimes.map((time) => (
                  <span className="time-chip" key={time}>
                    {time}
                    <button
                      type="button"
                      onClick={() => {
                        playSound("soft");
                        updateScheduleTimes(scheduleTimes.filter((x) => x !== time));
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ marginTop: 8 }}>
                <TimePicker
                  value={newTime}
                  onChange={setNewTime}
                  addLabel={t("alarms:addTime")}
                  onAdd={() => {
                    if (!newTime) return;
                    if (!scheduleTimes.includes(newTime)) {
                      updateScheduleTimes([...scheduleTimes, newTime].sort());
                    }
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="field" style={{ marginTop: 12 }}>
              <Input
                value={
                  draft.schedule.mode === "cron" ? draft.schedule.expression : ""
                }
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    schedule: { mode: "cron", expression: e.target.value },
                  }))
                }
              />
            </div>
          )}
        </Card>

  );
}
