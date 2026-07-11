use std::process::Command;
use std::time::Instant;

use which::which;

use crate::app::{ProcessOutput, ProcessRunner};
use crate::domain::{DomainError, DomainResult, ErrorCode};

pub struct SystemProcessRunner;

impl ProcessRunner for SystemProcessRunner {
    fn run(
        &self,
        binary: &str,
        args: &[String],
        env: &[(String, String)],
    ) -> DomainResult<ProcessOutput> {
        let started = Instant::now();
        let mut cmd = Command::new(binary);
        cmd.args(args);
        for (k, v) in env {
            cmd.env(k, v);
        }
        match cmd.output() {
            Ok(output) => {
                let exit_code = output.status.code().unwrap_or(-1);
                Ok(ProcessOutput {
                    exit_code,
                    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                    duration_ms: started.elapsed().as_millis() as i64,
                })
            }
            Err(err) => {
                let msg = err.to_string();
                let code = if msg.contains("os error 2") || msg.contains("not found") {
                    ErrorCode::BinaryNotFound
                } else if msg.contains("Permission denied") || msg.contains("os error 13") {
                    ErrorCode::PermissionDenied
                } else {
                    ErrorCode::ExecutionFailed
                };
                Err(DomainError::new(code, msg))
            }
        }
    }

    fn which(&self, binary: &str) -> DomainResult<Option<String>> {
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
