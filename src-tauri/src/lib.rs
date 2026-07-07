use std::net::TcpStream;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent, Url};

// Fixed local port for the bundled Next.js server. This is a packaged,
// single-user desktop app, so a fixed port is fine for v1.
const APP_PORT: u16 = 47932;

struct ServerProcess(Mutex<Option<Child>>);

fn node_binary_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let resource_dir = app.path().resource_dir().ok()?;
    // Staged by CI as "binaries/node" (no extension) on every platform - Windows
    // can still execute it via an explicit full path without a .exe suffix.
    Some(resource_dir.join("binaries").join("node"))
}

fn server_entry_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let resource_dir = app.path().resource_dir().ok()?;
    Some(resource_dir.join("app").join("server.js"))
}

fn wait_for_port(port: u16, timeout: Duration) -> bool {
    let start = std::time::Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_handle = app.handle().clone();
            let node_bin = node_binary_path(&app_handle);
            let server_js = server_entry_path(&app_handle);
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("greenlight-data"));
            std::fs::create_dir_all(&data_dir).ok();

            match (node_bin, server_js) {
                (Some(node_bin), Some(server_js)) if node_bin.exists() && server_js.exists() => {
                    let cwd = server_js
                        .parent()
                        .map(|p| p.to_path_buf())
                        .unwrap_or_else(|| std::env::current_dir().unwrap());

                    let child = Command::new(&node_bin)
                        .arg(&server_js)
                        .current_dir(&cwd)
                        .env("PORT", APP_PORT.to_string())
                        .env("HOSTNAME", "127.0.0.1")
                        .env("NODE_ENV", "production")
                        .env("GREENLIGHT_DATA_DIR", &data_dir)
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .spawn();

                    match child {
                        Ok(child) => {
                            *app.state::<ServerProcess>().0.lock().unwrap() = Some(child);

                            let nav_handle = app_handle.clone();
                            std::thread::spawn(move || {
                                if wait_for_port(APP_PORT, Duration::from_secs(25)) {
                                    if let Some(window) = nav_handle.get_webview_window("main") {
                                        let url = format!("http://127.0.0.1:{APP_PORT}");
                                        if let Ok(parsed) = Url::parse(&url) {
                                            let _ = window.navigate(parsed);
                                        }
                                    }
                                } else {
                                    log::error!("Greenlight server did not become ready in time");
                                }
                            });
                        }
                        Err(e) => log::error!("failed to spawn Greenlight server: {e}"),
                    }
                }
                _ => {
                    // Dev mode (`tauri dev`): devUrl already points at `next dev`,
                    // no bundled sidecar to spawn.
                    log::info!("no bundled server resources found; assuming dev mode");
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(mut child) = app_handle.state::<ServerProcess>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
