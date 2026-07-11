// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if callai_lib::cli::is_cli_invocation(&args) {
        if let Err(err) = callai_lib::cli::run(args) {
            eprintln!("callai: {err}");
            std::process::exit(1);
        }
    } else {
        // Desktop app (default)
        callai_lib::run();
    }
}
