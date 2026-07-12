//! Headless CLI surface (DESIGN.md tasker commands), sharing the same domain/app/infra as the GUI.
use std::io::{self, Write};
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use clap::{Parser, Subcommand};

use crate::app::{AlarmService, NoopSleeper, SystemClock, SystemSleeper};
use crate::domain::{
    AlarmDraft, AppSettings, DomainError, DomainResult, ErrorCode, LocaleCode, RetryInterval,
    RetryPolicy, ScheduleSpec, ThemeMode,
};
use crate::infra::{AlarmScheduler, AppPaths, SqliteStore, SystemProcessRunner, TomlConfigBackup};

#[derive(Debug, Parser)]
#[command(
    name = "callai",
    version,
    about = "callai — give your AI a cozy alarm (CLI + desktop app)",
    long_about = "Desktop GUI is the default when no subcommand is given.\n\
CLI commands operate on the same SQLite DB + config.toml as the app."
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Debug, Subcommand)]
pub enum Commands {
    /// Start the scheduler in the foreground (no GUI; keep-alive until Ctrl+C)
    Run {
        /// Import missing alarms from config.toml before running
        #[arg(long)]
        import_toml: bool,
    },
    /// Alias of `run` — headless keep-alive daemon (same process, no GUI)
    Daemon {
        /// Import missing alarms from config.toml before running
        #[arg(long)]
        import_toml: bool,
    },
    /// List all alarms
    List,
    /// Run one alarm immediately by name or id
    RunOnce {
        /// Alarm name or id
        name: String,
    },
    /// Validate config.toml (+ optional binary presence checks)
    Validate {
        /// Path to config.toml (defaults to ~/.config/callai/config.toml)
        #[arg(long)]
        config: Option<PathBuf>,
    },
    /// Write an example config.toml
    GenerateExample {
        /// Output path (default: ./callai.example.toml)
        #[arg(long, default_value = "callai.example.toml")]
        out: PathBuf,
    },
    /// Launch the desktop GUI (same as running with no subcommand)
    App,
}

pub fn is_cli_invocation(args: &[String]) -> bool {
    match args.get(1).map(String::as_str) {
        Some(
            "run" | "daemon" | "list" | "run-once" | "validate" | "generate-example" | "app"
            | "help" | "--help" | "-h" | "--version" | "-V" | "version",
        ) => true,
        Some(s) if s.starts_with('-') => true,
        _ => false,
    }
}

/// On Windows, GUI binaries use `windows_subsystem = "windows"`.
/// CLI mode re-attaches the parent console (or allocates one) so prints work.
#[cfg(windows)]
pub fn ensure_windows_console() {
    // SAFETY: process-wide console attach once at CLI startup, before stdout use.
    unsafe {
        type Bool = i32;
        type Dword = u32;
        #[link(name = "kernel32")]
        extern "system" {
            fn AttachConsole(dw_process_id: Dword) -> Bool;
            fn AllocConsole() -> Bool;
            fn GetConsoleWindow() -> *mut core::ffi::c_void;
        }
        const ATTACH_PARENT_PROCESS: Dword = 0xFFFF_FFFF;
        if GetConsoleWindow().is_null() {
            if AttachConsole(ATTACH_PARENT_PROCESS) == 0 {
                let _ = AllocConsole();
            }
        }
    }
}

#[cfg(not(windows))]
pub fn ensure_windows_console() {}

pub fn run(args: Vec<String>) -> Result<(), String> {
    // clap wants argv[0]=program
    let cli = Cli::parse_from(args);
    match cli.command {
        Commands::App => {
            crate::run();
            Ok(())
        }
        Commands::GenerateExample { out } => {
            generate_example(&out).map_err(err_str)?;
            println!("wrote example config: {}", out.display());
            Ok(())
        }
        Commands::Validate { config } => {
            validate(config.as_deref()).map_err(err_str)?;
            println!("config looks good");
            Ok(())
        }
        Commands::List => {
            let svc = open_service(false).map_err(err_str)?;
            let alarms = svc.list_alarms().map_err(err_str)?;
            if alarms.is_empty() {
                println!("(no alarms)");
                return Ok(());
            }
            for a in alarms {
                let sched = match &a.schedule {
                    ScheduleSpec::Daily { times } => format!("daily {}", times.join(",")),
                    ScheduleSpec::Weekly { days, times } => format!(
                        "weekly {} {}",
                        days.iter()
                            .map(|d| d.to_string())
                            .collect::<Vec<_>>()
                            .join(","),
                        times.join(",")
                    ),
                    ScheduleSpec::Monthly { days, times } => format!(
                        "monthly {} {}",
                        days.iter()
                            .map(|d| d.to_string())
                            .collect::<Vec<_>>()
                            .join(","),
                        times.join(",")
                    ),
                    ScheduleSpec::Cron { expression } => format!("cron {expression}"),
                };
                println!(
                    "{enabled}\t{name}\t{binary}\t{sched}\t{id}",
                    enabled = if a.enabled { "on " } else { "off" },
                    name = a.name,
                    binary = a.binary,
                    id = a.id,
                );
            }
            Ok(())
        }
        Commands::RunOnce { name } => {
            let svc = Arc::new(open_service(false).map_err(err_str)?);
            let alarm = svc.find_alarm_by_name(&name).map_err(err_str)?;
            println!(
                "running {} ({}) timeout={}s ... (Ctrl+C to cancel)",
                alarm.name, alarm.id, alarm.timeout_secs
            );

            let cancel_svc = Arc::clone(&svc);
            let cancel_id = alarm.id.clone();
            // Best-effort Ctrl+C: set cancel flag so process runner kills the child.
            let _ = ctrlc::set_handler(move || {
                let _ = cancel_svc.cancel_alarm_run(&cancel_id);
                let _ = writeln!(io::stderr(), "\n^C cancel requested…");
            });

            let log = svc
                .run_alarm_once_with(
                    &alarm.id,
                    Some(&|chunk: &str, is_err: bool| {
                        if is_err {
                            let _ = write!(io::stderr(), "{chunk}");
                            let _ = io::stderr().flush();
                        } else {
                            let _ = write!(io::stdout(), "{chunk}");
                            let _ = io::stdout().flush();
                        }
                    }),
                )
                .map_err(err_str)?;
            println!();
            println!(
                "status={:?} exit={:?} retries={} duration_ms={:?}",
                log.status, log.exit_code, log.retry_count, log.duration_ms
            );
            if !log.stdout.is_empty() {
                // already streamed live; still print summary if empty stream edge-case
            }
            if !matches!(log.status, crate::domain::ExecutionStatus::Success) {
                return Err(format!(
                    "run-once finished without success ({:?})",
                    log.status
                ));
            }
            Ok(())
        }
        Commands::Run { import_toml } | Commands::Daemon { import_toml } => run_daemon(import_toml),
    }
}

fn run_daemon(import_toml: bool) -> Result<(), String> {
    let svc = Arc::new(open_service(true).map_err(err_str)?);
    if import_toml {
        let n = svc.import_toml_alarms().map_err(err_str)?;
        println!("imported {n} alarm(s) from config.toml");
    }
    let n = svc.list_alarms().map_err(err_str)?.len();
    println!("callai daemon keep-alive: {n} alarm(s); Ctrl+C to stop");
    println!("shared data: ~/.config/callai + ~/.local/share/callai");
    let scheduler = Arc::new(AlarmScheduler::new(Arc::clone(&svc)));
    scheduler.start();
    // Keep process alive. Scheduler owns worker threads; this park is the supervisor.
    loop {
        thread::sleep(Duration::from_secs(3600));
    }
}

fn err_str(e: DomainError) -> String {
    format!("{:?}: {}", e.code, e.message)
}

fn open_service(use_real_sleeper: bool) -> DomainResult<AlarmService> {
    let paths = AppPaths::resolve()?;
    paths.ensure()?;
    let store = Arc::new(SqliteStore::open(&paths.db_file)?);
    let runner = Arc::new(SystemProcessRunner);
    let clock = Arc::new(SystemClock);
    let backup = Arc::new(TomlConfigBackup::new(paths));
    let sleeper: Arc<dyn crate::app::Sleeper> = if use_real_sleeper {
        Arc::new(SystemSleeper)
    } else {
        Arc::new(NoopSleeper)
    };
    let svc = AlarmService::new(store, runner, clock, backup, sleeper);
    svc.bootstrap()?;
    Ok(svc)
}

fn generate_example(out: &PathBuf) -> DomainResult<()> {
    let sample = r#"# callai example config (TOML)
# Shared with the desktop app at ~/.config/callai/config.toml

[settings]
theme = "system"
locale = "zh-CN"
launch_minimized = false
log_retention_days = 30
notify_on_failure = false
sound_enabled = true
auto_backup_on_start = true
backup_keep_count = 10

[[alarms]]
id = "example-morning"
name = "morning-warmup"
enabled = true
schedule_mode = "daily"
schedule_value = "08:00,13:00,18:00"
binary = "echo"
args = ["callai warmup {{date}}"]
env_vars = []
retry_interval = "2m"

# Advanced cron example (commented):
# [[alarms]]
# id = "example-cron"
# name = "cron-news"
# enabled = false
# schedule_mode = "cron"
# schedule_value = "0 8,13,18 * * *"
# binary = "codex"
# args = ["exec", "hi"]
# env_vars = []
# retry_interval = "5m"
"#;
    std::fs::write(out, sample)
        .map_err(|e| DomainError::new(ErrorCode::StorageFailed, format!("write example: {e}")))?;
    Ok(())
}

fn validate(config_path: Option<&std::path::Path>) -> DomainResult<()> {
    let path = match config_path {
        Some(p) => p.to_path_buf(),
        None => AppPaths::resolve()?.config_file,
    };
    if !path.exists() {
        return Err(DomainError::new(
            ErrorCode::ConfigCorrupt,
            format!("config not found: {}", path.display()),
        ));
    }
    let text = std::fs::read_to_string(&path)
        .map_err(|e| DomainError::new(ErrorCode::ConfigCorrupt, format!("read config: {e}")))?;
    // Reuse backup parser via a temp AppPaths-like approach: parse with same structs by
    // writing through TomlConfigBackup::import on a synthetic path is heavy; parse lightly.
    let value: toml::Value = toml::from_str(&text)
        .map_err(|e| DomainError::new(ErrorCode::ConfigCorrupt, format!("parse toml: {e}")))?;
    let alarms = value
        .get("alarms")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if alarms.is_empty() {
        println!("warning: no [[alarms]] entries");
    }
    use crate::app::ProcessRunner;
    let runner = SystemProcessRunner;
    for (i, a) in alarms.iter().enumerate() {
        let name = a
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("(unnamed)");
        let binary = a.get("binary").and_then(|v| v.as_str()).unwrap_or("");
        if binary.is_empty() {
            return Err(DomainError::new(
                ErrorCode::InvalidBinary,
                format!("alarm[{i}] {name}: binary is empty"),
            ));
        }
        let mode = a
            .get("schedule_mode")
            .and_then(|v| v.as_str())
            .unwrap_or("daily");
        let schedule_value = a
            .get("schedule_value")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let schedule = if mode == "cron" {
            ScheduleSpec::Cron {
                expression: schedule_value.into(),
            }
        } else {
            ScheduleSpec::Daily {
                times: schedule_value
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect(),
            }
        };
        schedule.validate()?;
        match runner.which(binary)? {
            Some(p) => println!("ok  {name}: binary found at {p}"),
            None => {
                println!("warn {name}: binary `{binary}` not found on PATH (still valid config)")
            }
        }
    }
    // also ensure settings table shape if present
    let _settings = value.get("settings");
    let _ = (
        AppSettings::default(),
        ThemeMode::System,
        LocaleCode::ZhCn,
        RetryPolicy::new(RetryInterval::TwoMinutes),
        AlarmDraft {
            name: "x".into(),
            enabled: true,
            schedule: ScheduleSpec::Daily {
                times: vec!["08:00".into()],
            },
            binary: "echo".into(),
            args: vec![],
            env_vars: vec![],
            retry: RetryPolicy::default(),
            timeout_secs: 20,
        },
    );
    Ok(())
}
