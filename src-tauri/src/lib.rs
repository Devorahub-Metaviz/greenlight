use std::net::TcpStream;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use tauri::{Manager, RunEvent, Url};

// Windows CREATE_NO_WINDOW: node.exe is a console-subsystem binary, so spawning
// it without this flag flashes a visible console window. Closing that window
// (it looks like leftover debug output) kills the child process along with
// it, taking the whole app down with a confusing "Failed to fetch".
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

// Fixed local port for the bundled Next.js server. This is a packaged,
// single-user desktop app, so a fixed port is fine for v1.
const APP_PORT: u16 = 47932;

struct ServerProcess(Mutex<Option<Child>>);

// std::env::current_exe() on Windows can return a `\\?\` extended-length
// (verbatim) path. That form is fine for Win32 file APIs but Node's own
// module resolution (realpathSync in run_main) does not understand it and
// fails with EISDIR on the bare "C:" it mis-parses out of the prefix. Strip
// it before these paths are ever used as command/argv for the node sidecar.
fn simplify(p: &std::path::Path) -> std::path::PathBuf {
    match p.to_str() {
        Some(s) => match s.strip_prefix(r"\\?\") {
            Some(stripped) => std::path::PathBuf::from(stripped),
            None => p.to_path_buf(),
        },
        None => p.to_path_buf(),
    }
}

// Candidate roots for our bundled resources, tried in order. resource_dir()
// is the documented API, but Windows NSIS installs were observed to place
// `app/` and `binaries/` directly next to the exe (no `resources/` wrapper),
// so the exe's own directory is checked too and whichever actually has the
// files wins. Kept resilient rather than betting on one exact convention.
fn candidate_roots(app: &tauri::AppHandle) -> Vec<std::path::PathBuf> {
    let mut roots = Vec::new();
    if let Ok(r) = app.path().resource_dir() {
        roots.push(simplify(&r));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            roots.push(simplify(dir));
        }
    }
    roots
}

fn find_existing(app: &tauri::AppHandle, rel: &[&str]) -> Option<std::path::PathBuf> {
    for root in candidate_roots(app) {
        let mut p = root;
        for seg in rel {
            p = p.join(seg);
        }
        if p.exists() {
            return Some(p);
        }
    }
    None
}

fn node_binary_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    // Staged by CI as "binaries/node" (no extension) on every platform - Windows
    // can still execute it via an explicit full path without a .exe suffix.
    find_existing(app, &["binaries", "node"])
}

fn server_entry_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    find_existing(app, &["app", "server.js"])
}

// Injects a visible failure message into the still-showing splash page,
// instead of leaving it spinning forever with no feedback.
fn show_startup_error(app: &tauri::AppHandle, message: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let escaped = message.replace('\\', "\\\\").replace('"', "\\\"");
        let _ = window.eval(&format!(
            "window.__greenlightStartupFailed && window.__greenlightStartupFailed(\"{escaped}\")"
        ));
    }
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
        .plugin(tauri_plugin_dialog::init())
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

                    let mut cmd = Command::new(&node_bin);
                    cmd.arg(&server_js)
                        .current_dir(&cwd)
                        .env("PORT", APP_PORT.to_string())
                        .env("HOSTNAME", "127.0.0.1")
                        .env("NODE_ENV", "production")
                        .env("GREENLIGHT_DATA_DIR", &data_dir)
                        .stdout(Stdio::null())
                        .stderr(Stdio::null());
                    #[cfg(windows)]
                    cmd.creation_flags(CREATE_NO_WINDOW);
                    let child = cmd.spawn();

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
                                    show_startup_error(&nav_handle, "The background server didn't respond in time.");
                                }
                            });
                        }
                        Err(e) => {
                            log::error!("failed to spawn Greenlight server: {e}");
                            show_startup_error(&app_handle, &format!("Couldn't launch the server process: {e}"));
                        }
                    }
                }
                _ => {
                    // Dev mode (`tauri dev`): devUrl already points at `next dev`,
                    // no bundled sidecar to spawn. In a real build, missing
                    // resources means something staged wrong - surface it
                    // instead of leaving the splash spinning forever.
                    if cfg!(debug_assertions) {
                        log::info!("no bundled server resources found; assuming dev mode");
                    } else {
                        show_startup_error(&app_handle, "Bundled app resources are missing from this install.");
                    }
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
