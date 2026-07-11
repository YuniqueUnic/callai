import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, Modal, Notification, Switch, Tag } from "animal-island-ui";
import type { Alarm } from "../domain/types";
import { isAlarmRunning, scheduleLabel } from "../domain/alarmRules";
import { client } from "../infra/client";
import { ElementImage } from "../ui/ElementImage";

interface Props {
  onCreate: () => void;
  onEdit: (id: string) => void;
  onLogs: (alarmId?: string) => void;
  onSettings: () => void;
}

export function HomePage({ onCreate, onEdit, onLogs, onSettings }: Props) {
  const { t } = useTranslation(["alarms", "common"]);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextMap, setNextMap] = useState<Record<string, string>>({});
  const [confirmRun, setConfirmRun] = useState<Alarm | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Alarm | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const list = await client.listAlarms();
      setAlarms(list);
      const entries = await Promise.all(
        list.map(async (a) => {
          try {
            const n = await client.nextTrigger(a.id);
            return [a.id, n ?? ""] as const;
          } catch {
            return [a.id, ""] as const;
          }
        }),
      );
      setNextMap(Object.fromEntries(entries));
    } catch (err) {
      Notification.error({
        message: t("alarms:ERR_INTERNAL"),
        description: String((err as { message?: string })?.message ?? err),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function toggle(alarm: Alarm, enabled: boolean) {
    try {
      await client.setEnabled(alarm.id, enabled);
      await refresh();
    } catch (err) {
      Notification.warning({
        message: t("alarms:ERR_INTERNAL"),
        description: String((err as { message?: string })?.message ?? err),
      });
    }
  }

  async function runNow(alarm: Alarm) {
    setBusyId(alarm.id);
    try {
      await client.runNow(alarm.id);
      Notification.success({ message: t("common:success") });
      await refresh();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      Notification.error({
        message: t(`alarms:ERR_${code ?? "INTERNAL"}` as "alarms:ERR_INTERNAL"),
      });
    } finally {
      setBusyId(null);
      setConfirmRun(null);
    }
  }

  async function remove(alarm: Alarm) {
    try {
      await client.deleteAlarm(alarm.id);
      Notification.success({ message: t("common:success") });
      await refresh();
    } catch (err) {
      Notification.error({
        message: t("alarms:ERR_ALARM_BUSY"),
        description: String((err as { message?: string })?.message ?? err),
      });
    } finally {
      setConfirmDelete(null);
    }
  }

  async function setAll(enabled: boolean) {
    await client.setAllEnabled(enabled);
    await refresh();
    Notification.success({
      message: enabled ? t("alarms:resumeAll") : t("alarms:pauseAll"),
    });
  }

  return (
    <div className="app-shell">
      <div className="app-header">
        <div className="header-brand">
          <ElementImage id="hero-perch" size={44} alt="" />
          <div>
            <h1>{t("alarms:title")}</h1>
            <p>{t("common:tagline")}</p>
          </div>
        </div>
        <div className="header-actions">
          <Button size="small" onClick={() => void setAll(false)}>
            {t("alarms:pauseAll")}
          </Button>
          <Button size="small" onClick={() => void setAll(true)}>
            {t("alarms:resumeAll")}
          </Button>
          <Button size="small" onClick={() => onLogs()}>
            {t("common:logs")}
          </Button>
          <Button size="small" type="primary" onClick={onSettings}>
            {t("common:settings")}
          </Button>
        </div>
      </div>

      <div className="app-main">
        {loading ? (
          <p className="meta">{t("common:loading")}</p>
        ) : alarms.length === 0 ? (
          <div className="empty-state">
            <ElementImage id="create-alarm" size={160} alt="" />
            <h2>{t("alarms:emptyTitle")}</h2>
            <p>{t("alarms:emptyHint")}</p>
          </div>
        ) : (
          <div className="alarm-grid">
            {alarms.map((alarm) => {
              const running = isAlarmRunning(alarm.lifecycle);
              return (
                <Card
                  key={alarm.id}
                  color="default"
                  className={`alarm-card ${alarm.enabled ? "" : "paused"}`}
                >
                  <div className="alarm-card-top">
                    <div>
                      <h3>{alarm.name}</h3>
                      <div className="meta">
                        {scheduleLabel(alarm.schedule, t("alarms:daily"))}
                      </div>
                    </div>
                    <Switch
                      checked={alarm.enabled}
                      onChange={(v) => void toggle(alarm, v)}
                      size="small"
                    />
                  </div>
                  <div className="meta">
                    {t("alarms:nextTrigger")}:{" "}
                    {nextMap[alarm.id]
                      ? new Date(nextMap[alarm.id]).toLocaleString()
                      : "—"}
                  </div>
                  <div className="row">
                    {!alarm.enabled && (
                      <span className="status-inline">
                        <ElementImage id="paused-sleep" size={26} alt="" />
                        <Tag color="brown" size="small">
                          {t("alarms:paused")}
                        </Tag>
                      </span>
                    )}
                    {running && (
                      <span className="status-inline">
                        <ElementImage id="running" size={26} alt="" />
                        <Tag color="app-yellow" size="small">
                          {t("alarms:running")}
                        </Tag>
                      </span>
                    )}
                    <Tag color="app-blue" size="small" variant="outlined">
                      {alarm.binary}
                    </Tag>
                  </div>
                  <div className="card-actions">
                    <Button
                      size="small"
                      type="primary"
                      loading={busyId === alarm.id}
                      onClick={() => setConfirmRun(alarm)}
                    >
                      {t("alarms:runNow")}
                    </Button>
                    <Button size="small" onClick={() => onLogs(alarm.id)}>
                      {t("alarms:viewLogs")}
                    </Button>
                    <Button size="small" onClick={() => onEdit(alarm.id)}>
                      {t("common:edit")}
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={() => setConfirmDelete(alarm)}
                    >
                      {t("common:delete")}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <button className="fab" type="button" aria-label={t("alarms:create")} onClick={onCreate}>
        +
      </button>

      <Modal
        open={!!confirmRun}
        title={t("alarms:runNow")}
        typewriter={false}
        onClose={() => setConfirmRun(null)}
        onOk={() => confirmRun && void runNow(confirmRun)}
      >
        {t("alarms:runConfirm")}
      </Modal>

      <Modal
        open={!!confirmDelete}
        title={t("common:delete")}
        typewriter={false}
        onClose={() => setConfirmDelete(null)}
        onOk={() => confirmDelete && void remove(confirmDelete)}
      >
        {t("alarms:deleteConfirm")}
      </Modal>
    </div>
  );
}
