use std::sync::Arc;

use which::which;

use crate::app::{CancelFlag, OutputChunkFn, ProcessOutput, ProcessRunner};
use crate::domain::DomainResult;

mod external;

pub struct SystemProcessRunner;

impl ProcessRunner for SystemProcessRunner {
    fn run(
        &self,
        binary: &str,
        args: &[String],
        env: &[(String, String)],
        timeout_secs: u32,
        cancel: Option<Arc<CancelFlag>>,
        on_chunk: Option<&OutputChunkFn>,
    ) -> DomainResult<ProcessOutput> {
        if crate::infra::builtin_alarm::is_builtin_alarm(binary) {
            let notification = env
                .iter()
                .find(|(k, _)| k == "CALLAI_NOTIFY")
                .and_then(|(_, v)| serde_json::from_str(v).ok())
                .unwrap_or_default();
            let out = crate::infra::builtin_alarm::run_builtin_alarm(
                args,
                timeout_secs,
                cancel,
                &notification,
            )?;
            if let Some(cb) = on_chunk {
                if !out.stdout.is_empty() {
                    cb(&out.stdout, false);
                }
                if !out.stderr.is_empty() {
                    cb(&out.stderr, true);
                }
            }
            return Ok(out);
        }

        if crate::infra::plugin::is_builtin_plugin(binary) {
            let out = crate::infra::plugin::run_builtin_plugin(args, env, timeout_secs, cancel)?;
            if let Some(cb) = on_chunk {
                if !out.stdout.is_empty() {
                    cb(&out.stdout, false);
                }
                if !out.stderr.is_empty() {
                    cb(&out.stderr, true);
                }
            }
            return Ok(out);
        }

        external::run_external_process(binary, args, env, timeout_secs, cancel, on_chunk)
    }

    fn which(&self, binary: &str) -> DomainResult<Option<String>> {
        if let Some(marker) = crate::infra::builtin_alarm::builtin_which(binary) {
            return Ok(Some(marker));
        }
        if binary.contains('/') || binary.contains('\\') {
            let path = std::path::Path::new(binary);
            return Ok(if path.exists() {
                Some(binary.to_string())
            } else {
                None
            });
        }
        Ok(which(binary).ok().map(|p| p.display().to_string()))
    }
}
