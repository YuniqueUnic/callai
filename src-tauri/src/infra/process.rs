use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use which::which;

use crate::app::{CancelFlag, OutputChunkFn, ProcessOutput, ProcessRunner};
use crate::domain::{DomainError, DomainResult, ErrorCode};

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
        let started = Instant::now();
        let timeout = Duration::from_secs(u64::from(timeout_secs.max(1)));

        let mut cmd = Command::new(binary);
        cmd.args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for (k, v) in env {
            cmd.env(k, v);
        }

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(err) => {
                let msg = err.to_string();
                let code = if msg.contains("os error 2") || msg.contains("not found") {
                    ErrorCode::BinaryNotFound
                } else if msg.contains("Permission denied") || msg.contains("os error 13") {
                    ErrorCode::PermissionDenied
                } else {
                    ErrorCode::ExecutionFailed
                };
                return Err(DomainError::new(code, msg));
            }
        };

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let (tx, rx) = mpsc::channel::<(bool, Vec<u8>)>();

        if let Some(mut out) = stdout {
            let tx = tx.clone();
            thread::spawn(move || {
                let mut buf = [0u8; 4096];
                loop {
                    match out.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            if tx.send((false, buf[..n].to_vec())).is_err() {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }
            });
        }
        if let Some(mut err) = stderr {
            let tx = tx.clone();
            thread::spawn(move || {
                let mut buf = [0u8; 4096];
                loop {
                    match err.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            if tx.send((true, buf[..n].to_vec())).is_err() {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }
            });
        }
        drop(tx);

        let mut stdout_buf = Vec::new();
        let mut stderr_buf = Vec::new();

        loop {
            while let Ok((is_err, chunk)) = rx.try_recv() {
                if is_err {
                    stderr_buf.extend_from_slice(&chunk);
                } else {
                    stdout_buf.extend_from_slice(&chunk);
                }
                if let Some(cb) = on_chunk {
                    cb(&String::from_utf8_lossy(&chunk), is_err);
                }
            }

            match child.try_wait() {
                Ok(Some(status)) => {
                    while let Ok((is_err, chunk)) = rx.recv_timeout(Duration::from_millis(20)) {
                        if is_err {
                            stderr_buf.extend_from_slice(&chunk);
                        } else {
                            stdout_buf.extend_from_slice(&chunk);
                        }
                        if let Some(cb) = on_chunk {
                            cb(&String::from_utf8_lossy(&chunk), is_err);
                        }
                    }
                    return Ok(ProcessOutput {
                        exit_code: status.code().unwrap_or(-1),
                        stdout: String::from_utf8_lossy(&stdout_buf).to_string(),
                        stderr: String::from_utf8_lossy(&stderr_buf).to_string(),
                        duration_ms: started.elapsed().as_millis() as i64,
                        canceled: false,
                        timed_out: false,
                    });
                }
                Ok(None) => {
                    let canceled = cancel.as_ref().map(|c| c.is_requested()).unwrap_or(false);
                    let timed_out = started.elapsed() >= timeout;
                    if canceled || timed_out {
                        let _ = child.kill();
                        let _ = child.wait();
                        while let Ok((is_err, chunk)) = rx.try_recv() {
                            if is_err {
                                stderr_buf.extend_from_slice(&chunk);
                            } else {
                                stdout_buf.extend_from_slice(&chunk);
                            }
                        }
                        let mut stderr = String::from_utf8_lossy(&stderr_buf).to_string();
                        if timed_out && !canceled {
                            if !stderr.is_empty() {
                                stderr.push('\n');
                            }
                            stderr.push_str(&format!(
                                "execution timed out after {timeout_secs}s (process stopped)"
                            ));
                        }
                        if canceled {
                            if !stderr.is_empty() {
                                stderr.push('\n');
                            }
                            stderr.push_str("execution canceled by user");
                        }
                        return Ok(ProcessOutput {
                            exit_code: -1,
                            stdout: String::from_utf8_lossy(&stdout_buf).to_string(),
                            stderr,
                            duration_ms: started.elapsed().as_millis() as i64,
                            canceled,
                            timed_out: timed_out && !canceled,
                        });
                    }
                    thread::sleep(Duration::from_millis(30));
                }
                Err(err) => {
                    let _ = child.kill();
                    return Err(DomainError::new(
                        ErrorCode::ExecutionFailed,
                        format!("wait process: {err}"),
                    ));
                }
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
