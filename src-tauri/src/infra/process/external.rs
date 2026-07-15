use std::io::Read;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use crate::app::{CancelFlag, OutputChunkFn, ProcessOutput};
use crate::domain::{DomainError, DomainResult, ErrorCode};

/// Spawn an OS process, stream stdout/stderr, honor timeout + cancel.
pub(crate) fn run_external_process(
    binary: &str,
    args: &[String],
    env: &[(String, String)],
    timeout_secs: u32,
    cancel: Option<Arc<CancelFlag>>,
    on_chunk: Option<&OutputChunkFn>,
) -> DomainResult<ProcessOutput> {
    let started = Instant::now();
    let timeout = Duration::from_secs(u64::from(timeout_secs.max(1)));
    let mut child = spawn_child(binary, args, env)?;
    let rx = attach_stdio_pipes(&mut child);

    let mut stdout_buf = Vec::new();
    let mut stderr_buf = Vec::new();

    loop {
        drain_chunks(&rx, &mut stdout_buf, &mut stderr_buf, on_chunk, false);

        match child.try_wait() {
            Ok(Some(status)) => {
                drain_chunks(&rx, &mut stdout_buf, &mut stderr_buf, on_chunk, true);
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
                    return Ok(stop_output(
                        &stdout_buf,
                        &stderr_buf,
                        started,
                        canceled,
                        timed_out,
                        timeout_secs,
                    ));
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

fn spawn_child(
    binary: &str,
    args: &[String],
    env: &[(String, String)],
) -> DomainResult<Child> {
    let mut cmd = Command::new(binary);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (k, v) in env {
        cmd.env(k, v);
    }
    match cmd.spawn() {
        Ok(c) => Ok(c),
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

fn attach_stdio_pipes(child: &mut Child) -> Receiver<(bool, Vec<u8>)> {
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let (tx, rx) = mpsc::channel::<(bool, Vec<u8>)>();

    if let Some(mut out) = stdout {
        let tx = tx.clone();
        thread::spawn(move || pipe_reader(out, false, tx));
    }
    if let Some(mut err) = stderr {
        let tx = tx.clone();
        thread::spawn(move || pipe_reader(err, true, tx));
    }
    drop(tx);
    rx
}

fn pipe_reader(
    mut stream: impl Read + Send + 'static,
    is_err: bool,
    tx: mpsc::Sender<(bool, Vec<u8>)>,
) {
    let mut buf = [0u8; 4096];
    loop {
        match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if tx.send((is_err, buf[..n].to_vec())).is_err() {
                    break;
                }
            }
            Err(_) => break,
        }
    }
}

fn drain_chunks(
    rx: &Receiver<(bool, Vec<u8>)>,
    stdout_buf: &mut Vec<u8>,
    stderr_buf: &mut Vec<u8>,
    on_chunk: Option<&OutputChunkFn>,
    blocking_flush: bool,
) {
    if blocking_flush {
        while let Ok((is_err, chunk)) = rx.recv_timeout(Duration::from_millis(20)) {
            apply_chunk(is_err, &chunk, stdout_buf, stderr_buf, on_chunk);
        }
    } else {
        while let Ok((is_err, chunk)) = rx.try_recv() {
            apply_chunk(is_err, &chunk, stdout_buf, stderr_buf, on_chunk);
        }
    }
}

fn apply_chunk(
    is_err: bool,
    chunk: &[u8],
    stdout_buf: &mut Vec<u8>,
    stderr_buf: &mut Vec<u8>,
    on_chunk: Option<&OutputChunkFn>,
) {
    if is_err {
        stderr_buf.extend_from_slice(chunk);
    } else {
        stdout_buf.extend_from_slice(chunk);
    }
    if let Some(cb) = on_chunk {
        cb(&String::from_utf8_lossy(chunk), is_err);
    }
}

fn stop_output(
    stdout_buf: &[u8],
    stderr_buf: &[u8],
    started: Instant,
    canceled: bool,
    timed_out: bool,
    timeout_secs: u32,
) -> ProcessOutput {
    let mut stderr = String::from_utf8_lossy(stderr_buf).to_string();
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
    ProcessOutput {
        exit_code: -1,
        stdout: String::from_utf8_lossy(stdout_buf).to_string(),
        stderr,
        duration_ms: started.elapsed().as_millis() as i64,
        canceled,
        timed_out: timed_out && !canceled,
    }
}
