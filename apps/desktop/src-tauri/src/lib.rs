use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

/// Returns the list of local + remote branch names for the given repo path.
/// Returns an empty vec if the path is not a git repository or git is unavailable.
#[allow(dead_code)]
#[tauri::command]
fn list_git_branches(repo_path: String) -> Vec<String> {
    let result = std::process::Command::new("git")
        .args(["branch", "-a", "--format=%(refname:short)"])
        .current_dir(&repo_path)
        .output();

    match result {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .map(|l| l.trim().to_string())
                // normalise remote refs: "origin/main" → "main"; skip "origin/HEAD -> …"
                .map(|l| {
                    if let Some(stripped) = l.strip_prefix("origin/") {
                        if stripped.contains(" -> ") {
                            return String::new();
                        }
                        return stripped.to_string();
                    }
                    l
                })
                .filter(|l| !l.is_empty())
                // deduplicate while preserving order
                .fold(Vec::<String>::new(), |mut acc, b| {
                    if !acc.contains(&b) { acc.push(b); }
                    acc
                })
        }
        _ => vec![],
    }
}

/// Holds the running daemon child process so we can kill it on exit.
struct DaemonProcess(Mutex<Option<CommandChild>>);

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(DaemonProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![list_git_branches])
        // Hide windows instead of quitting when the user closes them
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .setup(|app| {
            // ── System-tray ──────────────────────────────────────────────────
            let open_main =
                MenuItem::with_id(app, "open_main", "Open CI/CD Agent", true, None::<&str>)?;
            let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_main, &separator, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("CI/CD Agent")
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_main_window(tray.app_handle());
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open_main" => toggle_main_window(app),
                    "quit" => {
                        kill_daemon(app);
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // ── Start the daemon sidecar ──────────────────────────────────────
            // Use a different port in release builds to avoid colliding with a
            // developer's local daemon process on the default 8787 port.
            let daemon_port = if cfg!(debug_assertions) { "8787" } else { "18787" };
            match app.shell().sidecar("cicd-daemon") {
                Ok(cmd) => match cmd.env("RUNTIME_PORT", daemon_port).spawn() {
                    Ok((_rx, child)) => {
                        *app.state::<DaemonProcess>().0.lock().unwrap() = Some(child);
                        log::info!("cicd-daemon started");
                    }
                    Err(e) => {
                        log::error!("Failed to spawn cicd-daemon: {e}");
                        show_daemon_error(&app.handle(), &e.to_string());
                    }
                },
                Err(e) => {
                    log::error!("Failed to create sidecar command: {e}");
                    show_daemon_error(&app.handle(), &e.to_string());
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                kill_daemon(app_handle);
            }
        });
}

fn kill_daemon(app: &tauri::AppHandle) {
    if let Some(child) = app.state::<DaemonProcess>().0.lock().unwrap().take() {
        let _ = child.kill();
        log::info!("cicd-daemon stopped");
    }
}

fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

/// Opens the main window and writes an error message to the page console so
/// the user gets visible feedback when the daemon fails to start.
fn show_daemon_error(app: &tauri::AppHandle, msg: &str) {
    if let Some(win) = app.get_webview_window("main") {
        let escaped = msg.replace('\'', "\\'");
        let _ = win.eval(&format!(
            "console.error('CI/CD Agent: daemon failed to start — {escaped}')"
        ));
        let _ = win.show();
    }
}
