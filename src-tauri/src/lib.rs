// src-tauri/src/lib.rs

mod monitor;

use monitor::system::{SystemMonitor, SystemSnapshot};
use std::sync::Mutex;
use tauri::State;

// Get real-time CPU, RAM, process and drive information.
#[tauri::command]
fn get_system_snapshot(
    monitor: State<'_, Mutex<SystemMonitor>>,
) -> Result<SystemSnapshot, String> {
    let mut monitor = monitor
        .lock()
        .map_err(|error| format!("Failed to lock system monitor: {error}"))?;

    Ok(monitor.snapshot())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(SystemMonitor::new()))
        .invoke_handler(tauri::generate_handler![
            greet,
            get_system_snapshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}