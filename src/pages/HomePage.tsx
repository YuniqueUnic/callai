import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, Modal, Notification, Switch, Tag } from "animal-island-ui";
import type { Alarm } from "../domain/types";
import { isAlarmRunning, scheduleLabel } from "../domain/alarmRules";
import { formatDateTime } from "../domain/format";
import { client } from "../infra/client";
import { ElementImage } from "../ui/ElementImage";
import { IconButton } from "../ui/IconButton";
import {
  IconBolt,
  IconEdit,
  IconLogs,
  IconPause,
  IconPlay,
  IconPlus,
  IconTrash,
} from "../ui/icons";

interface Props {
  onCreate: () => void;
  onEdit: (id: string) => void;
  onLogs: (alarmId?: string) => void;
}

export function HomePage({ onCreate, onEdit, onLogs }: Props) {
  const { t, i18n } = useTranslation(["alarms", "common"]);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextMap, setNextMap] = useState<Record<string, string>>({});
  const [confirmRun, setConfirmRun] = useState<Alarm | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Alarm | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      Notification.success({
        message: enabled ? t("alarms:resumeSuccess") : t("alarms:pauseSuccess"),
      });
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
      const log = await client.runNow(alarm.id);
      if (log.status === "success") {
        Notification.success({ message: t("alarms:runSuccess") });
      } else {
        Notification.warning({
          message: t("alarms:ERR_EXECUTION_FAILED"),
          description: log.stderr || undefined,
          btn: (
            <Button size="small" onClick={() => onLogs(alarm.id)}>
              {t("alarms:viewLogs")}
            </Button>
          ),
        });
      }
      await refresh();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      Notification.error({
        message: t(`alarms:ERR_${code ?? "INTERNAL"}` as "alarms:ERR_INTERNAL"),
        description: String((err as { message?: string })?.message ?? err),
      });
    } finally {
      setBusyId(null);
      setConfirmRun(null);
    }
  }

  async function remove(alarm: Alarm) {
    setDeleting(true);
    try {
      await client.deleteAlarm(alarm.id);
      setAlarms((prev) => prev.filter((a) => a.id !== alarm.id));
      Notification.success({ message: t("alarms:deleteSuccess") });
      await refresh();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      Notification.error({
        message:
          code === "ALARM_BUSY" || code === "ErrAlarmBusy"
            ? t("alarms:ERR_ALARM_BUSY")
            : t("alarms:ERR_INTERNAL"),
        description: String((err as { message?: string })?.message ?? err),
      });
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  async function setAll(enabled: boolean) {
    try {
      await client.setAllEnabled(enabled);
      await refresh();
      Notification.success({
        message: enabled ? t("alarms:resumeSuccess") : t("alarms:pauseSuccess"),
      });
    } catch (err) {
      Notification.error({
        message: t("alarms:ERR_INTERNAL"),
        description: String((err as { message?: string })?.message ?? err),
      });
    }
  }

  return (
    <>
      <div className="app-header">
        <div className="header-brand">
          <ElementImage id="hero-perch" size={44} alt="" />
          <div>
            <h1>{t("alarms:title")}</h1>
            <p>{t("common:tagline")}</p>
          </div>
        </div>
        <div className="header-actions">
          <IconButton
            label={t("alarms:pauseAll")}
            icon={<IconPause size={18} />}
            onClick={() => void setAll(false)}
          />
          <IconButton
            label={t("alarms:resumeAll")}
            icon={<IconPlay size={18} />}
            variant="primary"
            onClick={() => void setAll(true)}
          />
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
                    <div className="alarm-card-title">
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

                  <div className="alarm-next">
                    <span className="alarm-next-label">{t("alarms:nextTrigger")}</span>
                    <strong>
                      {nextMap[alarm.id]
                        ? formatDateTime(nextMap[alarm.id], i18n.language)
                        : "—"}
                    </strong>
                  </div>

                  <div className="row alarm-status-row">
                    {!alarm.enabled && (
                      <span className="status-inline">
                        <ElementImage id="paused-sleep" size={22} alt="" />
                        <Tag color="brown" size="small">
                          {t("alarms:paused")}
                        </Tag>
                      </span>
                    )}
                    {running && (
                      <span className="status-inline">
                        <ElementImage id="running" size={22} alt="" />
                        <Tag color="app-yellow" size="small">
                          {t("alarms:running")}
                        </Tag>
                      </span>
                    )}
                    <Tag color="app-blue" size="small" variant="outlined">
                      {alarm.binary}
                    </Tag>
                  </div>

                  <div className="card-actions icon-actions">
                    <IconButton
                      label={t("common:edit")}
                      icon={<IconEdit size={16} />}
                      onClick={() => onEdit(alarm.id)}
                    />
                    <IconButton
                      label={t("alarms:viewLogs")}
                      icon={<IconLogs size={16} />}
                      onClick={() => onLogs(alarm.id)}
                    />
                    <IconButton
                      label={t("common:delete")}
                      icon={<IconTrash size={16} />}
                      variant="danger"
                      disabled={running || deleting}
                      onClick={() => setConfirmDelete(alarm)}
                    />
                    <IconButton
                      label={t("alarms:runNow")}
                      icon={<IconBolt size={16} />}
                      variant="primary"
                      loading={busyId === alarm.id}
                      disabled={running}
                      onClick={() => setConfirmRun(alarm)}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <button
        className="fab"
        type="button"
        aria-label={t("alarms:create")}
        title={t("alarms:create")}
        onClick={onCreate}
      >
        <IconPlus size={28} />
      </button>

      <Modal
        open={!!confirmRun}
        title={t("alarms:runNow")}
        typewriter={false}
        onClose={() => setConfirmRun(null)}
        onOk={() => {
          if (confirmRun) void runNow(confirmRun);
        }}
      >
        {t("alarms:runConfirm")}
      </Modal>

      <Modal
        open={!!confirmDelete}
        title={t("common:delete")}
        typewriter={false}
        onClose={() => !deleting && setConfirmDelete(null)}
        onOk={() => {
          if (confirmDelete) void remove(confirmDelete);
        }}
      >
        {t("alarms:deleteConfirm")}
        {confirmDelete ? (
          <div className="meta" style={{ marginTop: 8 }}>
            {confirmDelete.name}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
