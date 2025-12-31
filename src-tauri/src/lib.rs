use tauri::{Manager, WindowEvent};
use tauri_plugin_log::{Builder, Target, TargetKind};
use std::sync::{Arc, Mutex};

// Shared state to store backend PID
struct BackendPid(Arc<Mutex<Option<u32>>>);

#[tauri::command]
fn store_backend_pid(state: tauri::State<BackendPid>, pid: u32) {
    *state.0.lock().unwrap() = Some(pid);
    log::info!("Stored backend PID: {}", pid);
}

#[tauri::command]
fn cleanup_backend(state: tauri::State<BackendPid>) {
    log::info!("Cleanup backend command called");
    if let Some(pid) = *state.0.lock().unwrap() {
        log::info!("Killing backend process tree for PID: {}", pid);
        kill_process_tree(pid);
    } else {
        log::warn!("No backend PID stored - skipping cleanup");
    }
}

#[cfg(target_os = "windows")]
fn kill_process_tree(pid: u32) {
    use std::process::Command;
    log::info!("Attempting to kill process tree for PID: {}", pid);
    
    // Use taskkill /F /T to forcefully kill process tree
    match Command::new("taskkill")
        .args(&["/F", "/T", "/PID", &pid.to_string()])
        .output()
    {
        Ok(output) => {
            if output.status.success() {
                log::info!("Successfully killed process tree for PID: {}", pid);
            } else {
                log::warn!("Failed to kill process tree: {:?}", String::from_utf8_lossy(&output.stderr));
            }
        }
        Err(e) => {
            log::error!("Error executing taskkill: {}", e);
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn kill_process_tree(pid: u32) {
    use std::process::Command;
    log::info!("Attempting to kill process tree for PID: {}", pid);
    
    // On Unix-like systems, kill the process group
    let _ = Command::new("kill")
        .args(&["-9", &pid.to_string()])
        .output();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let targets = [
        Target::new(TargetKind::Stdout),
        Target::new(TargetKind::Webview),
    ];

    let log_plugin = Builder::new().targets(targets).build();
    
    // Initialize shared state for backend PID
    let backend_pid = BackendPid(Arc::new(Mutex::new(None)));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(log_plugin)
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(backend_pid)
        .invoke_handler(tauri::generate_handler![store_backend_pid, cleanup_backend])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let backend_pid_state = app.state::<BackendPid>();
            let pid_arc = backend_pid_state.0.clone();
            
            // Add window close event handler as fallback
            window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { .. } = event {
                    log::info!("Window close requested (Rust fallback) - cleaning up backend process");
                    if let Some(pid) = *pid_arc.lock().unwrap() {
                        // Call cleanup directly (frontend should have already done this)
                        log::info!("Rust fallback: Killing backend process tree for PID: {}", pid);
                        kill_process_tree(pid);
                    } else {
                        log::warn!("No backend PID stored - skipping cleanup");
                    }
                }
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}