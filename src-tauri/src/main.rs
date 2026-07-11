// Prevents an extra console window on Windows GUI releases.
// CLI mode re-attaches / allocates a console so stdout/stderr work.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let is_cli = callai_lib::cli::is_cli_invocation(&args);

    #[cfg(windows)]
    if is_cli {
        callai_lib::cli::ensure_windows_console();
    }

    if is_cli {
        if let Err(err) = callai_lib::cli::run(args) {
            eprintln!("callai: {err}");
            std::process::exit(1);
        }
    } else {
        // Desktop app: scheduler threads keep running; close only hides to tray.
        callai_lib::run();
    }
}
