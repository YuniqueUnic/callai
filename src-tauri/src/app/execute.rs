use std::sync::Arc;

use crate::domain::{
    expand_arg_templates, resolve_process_argv, Alarm, DomainResult, ExecutionLog, ExecutionStatus,
};

use super::{AlarmService, CancelFlag, OutputChunkFn, ProcessOutput};

impl AlarmService {
    pub(crate) fn execute_alarm_loop(
        &self,
        alarm: &mut Alarm,
        cancel: Arc<CancelFlag>,
        on_chunk: Option<&OutputChunkFn>,
    ) -> DomainResult<ExecutionLog> {
        alarm.mark_running();
        self.store.upsert_alarm(alarm)?;

        let started = self.clock.now_utc();
        let templated = expand_arg_templates(&alarm.args, started);
        let (resolved_binary, expanded_args) = resolve_process_argv(&alarm.binary, &templated)?;
        let env = build_run_env(alarm);

        maybe_notify_non_builtin_start(alarm);

        let mut log = ExecutionLog {
            id: 0,
            alarm_id: alarm.id.clone(),
            alarm_name: alarm.name.clone(),
            started_at: started,
            finished_at: None,
            status: ExecutionStatus::Running,
            exit_code: None,
            duration_ms: None,
            retry_count: 0,
            command_preview: crate::domain::preview_command(&resolved_binary, &expanded_args),
            stdout: String::new(),
            stderr: String::new(),
        };
        log.id = self.store.insert_log(&log)?;

        let (attempt, last_output, success, canceled, timed_out) = self.run_attempts(
            alarm,
            &resolved_binary,
            &expanded_args,
            &env,
            Arc::clone(&cancel),
            on_chunk,
            &mut log,
        );

        let finished = self.clock.now_utc();
        let out = last_output.unwrap_or(ProcessOutput {
            exit_code: -1,
            stdout: String::new(),
            stderr: "no output".into(),
            duration_ms: 0,
            canceled: false,
            timed_out: false,
        });

        log.finished_at = Some(finished);
        log.exit_code = Some(out.exit_code);
        log.duration_ms = Some((finished - started).num_milliseconds().max(out.duration_ms));
        log.retry_count = attempt;
        log.stdout = out.stdout;
        log.stderr = out.stderr;
        log.status = final_status(success, canceled || out.canceled, timed_out || out.timed_out);
        self.store.update_log(&log)?;

        alarm.mark_idle();
        self.store.upsert_alarm(alarm)?;
        Ok(log)
    }

    /// Run binary with retries; returns (attempt, last_output, success, canceled, timed_out).
    fn run_attempts(
        &self,
        alarm: &mut Alarm,
        binary: &str,
        args: &[String],
        env: &[(String, String)],
        cancel: Arc<CancelFlag>,
        on_chunk: Option<&OutputChunkFn>,
        log: &mut ExecutionLog,
    ) -> (u32, Option<ProcessOutput>, bool, bool, bool) {
        let mut attempt: u32 = 0;
        #[allow(unused_assignments)]
        let mut last_output: Option<ProcessOutput> = None;
        let mut success = false;
        let mut canceled = false;
        let mut timed_out = false;

        loop {
            if cancel.is_requested() {
                canceled = true;
                last_output = Some(canceled_output(None));
                break;
            }

            match self.runner.run(
                binary,
                args,
                env,
                alarm.timeout_secs,
                Some(Arc::clone(&cancel)),
                on_chunk,
            ) {
                Ok(out) if out.exit_code == 0 && !out.canceled && !out.timed_out => {
                    last_output = Some(out);
                    success = true;
                    break;
                }
                Ok(out) => {
                    canceled = out.canceled;
                    timed_out = out.timed_out;
                    last_output = Some(out);
                    if canceled || timed_out {
                        break;
                    }
                }
                Err(err) => {
                    last_output = Some(ProcessOutput {
                        exit_code: -1,
                        stdout: String::new(),
                        stderr: err.message,
                        duration_ms: 0,
                        canceled: false,
                        timed_out: false,
                    });
                }
            }

            if attempt + 1 >= alarm.retry.max_attempts {
                break;
            }
            attempt += 1;
            alarm.mark_retrying(attempt);
            let _ = self.store.upsert_alarm(alarm);
            log.status = ExecutionStatus::Retrying;
            log.retry_count = attempt;
            let _ = self.store.update_log(log);

            if let Some(secs) = alarm.retry.wait_seconds_for_attempt(attempt - 1) {
                if cooperative_retry_wait(self, &cancel, secs, &mut last_output) {
                    canceled = true;
                    break;
                }
            }
        }

        (attempt, last_output, success, canceled, timed_out)
    }
}

fn build_run_env(alarm: &Alarm) -> Vec<(String, String)> {
    let mut env: Vec<(String, String)> = alarm
        .env_vars
        .iter()
        .map(|e| (e.key.clone(), e.value.clone()))
        .collect();
    if let Ok(json) = serde_json::to_string(&alarm.notification) {
        env.push(("CALLAI_NOTIFY".into(), json));
    }
    if let Some(ref cfg) = alarm.plugin {
        if let Ok(json) = serde_json::to_string(cfg) {
            env.push(("CALLAI_PLUGIN".into(), json));
        }
    } else if crate::infra::plugin::is_builtin_plugin(&alarm.binary) {
        if let Some(pid) = alarm.args.first() {
            let cfg = crate::domain::AlarmPluginConfig {
                plugin_id: pid.clone(),
                ..Default::default()
            };
            if let Ok(json) = serde_json::to_string(&cfg) {
                env.push(("CALLAI_PLUGIN".into(), json));
            }
        }
    }
    env
}

fn maybe_notify_non_builtin_start(alarm: &Alarm) {
    if !crate::infra::builtin_alarm::is_builtin_alarm(&alarm.binary)
        && alarm.notification.wants_notification()
    {
        let _ = crate::infra::builtin_alarm::notify_trigger(
            &alarm.name,
            &alarm.command_preview(),
            &alarm.notification,
        );
    }
}

fn final_status(success: bool, canceled: bool, timed_out: bool) -> ExecutionStatus {
    if success {
        ExecutionStatus::Success
    } else if canceled {
        ExecutionStatus::Canceled
    } else if timed_out {
        ExecutionStatus::Timeout
    } else {
        ExecutionStatus::Failed
    }
}

fn canceled_output(prev: Option<&ProcessOutput>) -> ProcessOutput {
    ProcessOutput {
        exit_code: -1,
        stdout: prev.map(|o| o.stdout.clone()).unwrap_or_default(),
        stderr: {
            let mut s = prev.map(|o| o.stderr.clone()).unwrap_or_default();
            if !s.is_empty() {
                s.push('\n');
            }
            s.push_str("execution canceled by user");
            s
        },
        duration_ms: prev.map(|o| o.duration_ms).unwrap_or(0),
        canceled: true,
        timed_out: false,
    }
}

/// Poll-sleep during retry wait; returns true if canceled.
fn cooperative_retry_wait(
    svc: &AlarmService,
    cancel: &CancelFlag,
    secs: u64,
    last_output: &mut Option<ProcessOutput>,
) -> bool {
    let mut remaining = secs;
    while remaining > 0 {
        if cancel.is_requested() {
            *last_output = Some(canceled_output(last_output.as_ref()));
            return true;
        }
        let step = remaining.min(1);
        svc.sleeper.sleep_secs(step);
        remaining = remaining.saturating_sub(step);
    }
    false
}
