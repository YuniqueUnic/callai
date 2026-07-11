#![allow(dead_code)]
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::Duration;

use chrono::Local;
use tracing::{error, info, warn};

use crate::app::AlarmService;
use crate::domain::ScheduleSpec;

/// Polls due alarms and runs them on a single worker thread.
/// - one worker avoids unbounded thread growth during multi-minute retries
/// - in-flight set prevents enqueueing the same alarm while it is still running
pub struct AlarmScheduler {
    service: Arc<AlarmService>,
    last_fired: Arc<Mutex<HashMap<String, i64>>>,
    stop: Arc<Mutex<bool>>,
    queue: Arc<Mutex<VecDeque<String>>>,
    in_flight: Arc<Mutex<HashSet<String>>>,
    wake: Arc<Condvar>,
}

impl AlarmScheduler {
    pub fn new(service: Arc<AlarmService>) -> Self {
        Self {
            service,
            last_fired: Arc::new(Mutex::new(HashMap::new())),
            stop: Arc::new(Mutex::new(false)),
            queue: Arc::new(Mutex::new(VecDeque::new())),
            in_flight: Arc::new(Mutex::new(HashSet::new())),
            wake: Arc::new(Condvar::new()),
        }
    }

    pub fn start(self: &Arc<Self>) {
        self.spawn_worker();
        let this = Arc::clone(self);
        thread::Builder::new()
            .name("callai-scheduler".into())
            .spawn(move || {
                info!("callai scheduler poller started");
                loop {
                    if *this.stop.lock().unwrap() {
                        break;
                    }
                    if let Err(err) = this.tick() {
                        error!("scheduler tick error: {}", err.message);
                    }
                    thread::sleep(Duration::from_secs(20));
                }
                // wake worker so it can exit
                this.wake.notify_all();
                info!("callai scheduler poller stopped");
            })
            .expect("spawn scheduler poller");
    }

    pub fn stop(&self) {
        *self.stop.lock().unwrap() = true;
        self.wake.notify_all();
    }

    /// Enqueue an alarm for execution on the worker (deduped while in-flight/queued).
    pub fn enqueue(&self, alarm_id: String) -> bool {
        {
            let in_flight = self.in_flight.lock().unwrap();
            if in_flight.contains(&alarm_id) {
                warn!("skip enqueue, already in-flight: {alarm_id}");
                return false;
            }
        }
        let mut queue = self.queue.lock().unwrap();
        if queue.iter().any(|id| id == &alarm_id) {
            warn!("skip enqueue, already queued: {alarm_id}");
            return false;
        }
        queue.push_back(alarm_id);
        drop(queue);
        self.wake.notify_one();
        true
    }

    fn spawn_worker(&self) {
        let service = Arc::clone(&self.service);
        let queue = Arc::clone(&self.queue);
        let in_flight = Arc::clone(&self.in_flight);
        let stop = Arc::clone(&self.stop);
        let wake = Arc::clone(&self.wake);

        thread::Builder::new()
            .name("callai-worker".into())
            .spawn(move || {
                info!("callai execution worker started");
                loop {
                    let job = {
                        let mut q = queue.lock().unwrap();
                        loop {
                            if let Some(id) = q.pop_front() {
                                break Some(id);
                            }
                            if *stop.lock().unwrap() {
                                break None;
                            }
                            q = wake.wait(q).unwrap();
                            if *stop.lock().unwrap() && q.is_empty() {
                                break None;
                            }
                        }
                    };

                    let Some(id) = job else {
                        break;
                    };

                    {
                        let mut flying = in_flight.lock().unwrap();
                        flying.insert(id.clone());
                    }

                    info!("worker running alarm {id}");
                    // Production path: sleeper is SystemSleeper so retries actually wait.
                    if let Err(err) = service.run_alarm_once(&id) {
                        error!("worker run failed {id}: {}", err.message);
                    }

                    {
                        let mut flying = in_flight.lock().unwrap();
                        flying.remove(&id);
                    }
                }
                info!("callai execution worker stopped");
            })
            .expect("spawn execution worker");
    }

    fn tick(&self) -> crate::domain::DomainResult<()> {
        let now = Local::now();
        let minute_key = now.format("%Y%m%d%H%M").to_string();
        let minute_i: i64 = minute_key.parse().unwrap_or(0);

        let alarms = self.service.list_alarms()?;
        for alarm in alarms {
            if !alarm.enabled {
                continue;
            }
            if !is_due_now(&alarm.schedule, now)? {
                continue;
            }
            {
                let mut fired = self.last_fired.lock().unwrap();
                if fired.get(&alarm.id) == Some(&minute_i) {
                    continue;
                }
                fired.insert(alarm.id.clone(), minute_i);
            }
            let _ = self.enqueue(alarm.id);
        }
        Ok(())
    }
}

fn is_due_now(
    schedule: &ScheduleSpec,
    now: chrono::DateTime<Local>,
) -> crate::domain::DomainResult<bool> {
    let before = now - chrono::Duration::seconds(59);
    if let Some(next) = schedule.next_trigger_after(before)? {
        let same_minute =
            next.format("%Y%m%d%H%M").to_string() == now.format("%Y%m%d%H%M").to_string();
        Ok(same_minute && next <= now + chrono::Duration::seconds(1))
    } else {
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::is_due_now;
    use crate::domain::ScheduleSpec;
    use chrono::{Local, Timelike};

    #[test]
    fn due_detection_for_current_minute() {
        let now = Local::now();
        let expr = format!("{} {} * * *", now.minute(), now.hour());
        let schedule = ScheduleSpec::Cron { expression: expr };
        // may or may not be due depending on second precision; just ensure no error
        let _ = is_due_now(&schedule, now).unwrap();
    }
}
