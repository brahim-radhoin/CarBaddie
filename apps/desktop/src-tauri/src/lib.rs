use tauri::{Manager, WindowEvent};
use tauri_plugin_log::{Builder, Target, TargetKind};
use std::sync::{Arc, Mutex};
use std::io::{Read, Write};
use std::net::TcpListener;

// Shared state to store backend PID
struct BackendPid(Arc<Mutex<Option<u32>>>);

// Shared state for OAuth listener socket
struct OAuthListener(Arc<Mutex<Option<TcpListener>>>);

/// Step 1: Bind a local loopback port dynamically (non-blocking) and return the assigned port.
#[tauri::command]
fn start_oauth_listener(state: tauri::State<OAuthListener>) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    *state.0.lock().unwrap() = Some(listener);
    log::info!("OAuth local listener bound to 127.0.0.1:{}", port);
    Ok(port)
}

/// Step 2: Waits for the system browser to redirect back with the Google OAuth authorization code.
/// Google redirects to http://127.0.0.1:<port>/?code=...
/// This command serves a confirmation page and returns the query string to the caller.
#[tauri::command]
fn wait_oauth_token(state: tauri::State<OAuthListener>) -> Result<String, String> {
    let listener = state.0.lock().unwrap().take()
        .ok_or_else(|| "OAuth listener was not initialized".to_string())?;

    let redirect_html = r#"<!DOCTYPE html><html><head><meta charset="utf-8"><title>CarBaddie – Connected</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0b0f17; color: #94a3b8; }
.card { text-align: center; background: #131b2e; border: 1px solid #1e293b; border-radius: 16px; padding: 36px 48px; max-width: 420px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); }
.logo { font-size: 24px; font-weight: 800; color: #f59e0b; letter-spacing: -0.5px; margin-bottom: 8px; }
.msg { font-size: 14px; color: #10b981; font-weight: 600; margin: 16px 0 8px; }
.hint { font-size: 12px; color: #64748b; }
</style></head>
<body><div class="card"><div class="logo">CarBaddie</div><div class="msg">&#10003; Sign-in Successful</div><div class="hint">Your garage records are now synced. You may close this tab.</div></div>
<script>setTimeout(function(){ window.close(); }, 1500);</script>
</body></html>"#;

    let (tx, rx) = std::sync::mpsc::channel::<String>();

    std::thread::spawn(move || {
        for _ in 0..15 {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = [0u8; 4096];
                if let Ok(n) = stream.read(&mut buf) {
                    let req = String::from_utf8_lossy(&buf[..n]);
                    if req.starts_with("GET") {
                        let mut query_found = None;
                        if let Some(first_line) = req.lines().next() {
                            if let Some(path) = first_line.split_whitespace().nth(1) {
                                if let Some(q_idx) = path.find('?') {
                                    query_found = Some(path[q_idx + 1..].to_string());
                                }
                            }
                        }

                        let resp = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            redirect_html.len(),
                            redirect_html
                        );
                        stream.write_all(resp.as_bytes()).ok();

                        if let Some(query) = query_found {
                            tx.send(query).ok();
                            break;
                        }
                    }
                }
            }
        }
    });

    match rx.recv_timeout(std::time::Duration::from_secs(180)) {
        Ok(query) => Ok(query),
        Err(_) => Err("Google Sign-In timed out. Please try again.".to_string()),
    }
}

#[tauri::command]
fn store_backend_pid(state: tauri::State<BackendPid>, pid: u32) {
    *state.0.lock().unwrap() = Some(pid);
    log::info!("Stored backend PID: {}", pid);
}

#[tauri::command]
fn cleanup_backend(state: tauri::State<BackendPid>) {
    log::info!("Cleanup backend command called");
    // take() so the backend is only killed once; close triggers this from several places.
    if let Some(pid) = state.0.lock().unwrap().take() {
        log::info!("Killing backend process tree for PID: {}", pid);
        kill_process_tree(pid);
    } else {
        log::info!("Backend already stopped - nothing to clean up");
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
    let oauth_listener = OAuthListener(Arc::new(Mutex::new(None)));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(log_plugin)
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(backend_pid)
        .manage(oauth_listener)
        .invoke_handler(tauri::generate_handler![
            store_backend_pid,
            cleanup_backend,
            start_oauth_listener,
            wait_oauth_token
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let backend_pid_state = app.state::<BackendPid>();
            let pid_arc = backend_pid_state.0.clone();
            
            // Add window close event handler as fallback
            window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { .. } = event {
                    log::info!("Window close requested (Rust fallback) - cleaning up backend process");
                    if let Some(pid) = pid_arc.lock().unwrap().take() {
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