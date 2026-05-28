use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_shell::{process::{CommandChild, CommandEvent}, ShellExt};

/// Resolve the git executable path.  On Windows the Tauri process may inherit
/// a minimal PATH, so we probe a few well-known locations before falling back
/// to the bare "git" name (which works when Git for Windows is in PATH).
fn git_executable() -> String {
    #[cfg(target_os = "windows")]
    {
        let candidates = [
            r"C:\Program Files\Git\cmd\git.exe",
            r"C:\Program Files\Git\bin\git.exe",
            r"C:\Program Files (x86)\Git\cmd\git.exe",
        ];
        for c in &candidates {
            if std::path::Path::new(c).exists() {
                return c.to_string();
            }
        }
        // Also try LOCALAPPDATA\Programs\Git
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let p = format!(r"{}\Programs\Git\cmd\git.exe", local);
            if std::path::Path::new(&p).exists() {
                return p;
            }
        }
    }
    "git".to_string()
}

/// Parse `git branch -a` output into a deduplicated list of short branch names.
/// The plain `git branch -a` format (no --format flag) avoids the cmd.exe `%`
/// variable-expansion problem that corrupts `--format=%(refname:short)` on Windows.
fn parse_git_branch_output(stdout: &str) -> Vec<String> {
    let mut seen = Vec::<String>::new();
    for line in stdout.lines() {
        // Strip leading "* " (current branch marker) or "  "
        let trimmed = line.trim_start_matches('*').trim();
        if trimmed.is_empty() || trimmed.contains(" -> ") {
            continue;
        }
        // Normalise remote tracking refs: "remotes/origin/main" → "main"
        let name = if let Some(after_remotes) = trimmed.strip_prefix("remotes/") {
            // e.g. "origin/main" → strip remote name prefix
            if let Some((_remote, branch)) = after_remotes.split_once('/') {
                branch.to_string()
            } else {
                after_remotes.to_string()
            }
        } else {
            trimmed.to_string()
        };
        if !name.is_empty() && !seen.contains(&name) {
            seen.push(name);
        }
    }
    seen
}

/// Returns the list of local + remote branch names for the given repo path.
/// Returns an empty vec if the path is not a git repository or git is unavailable.
#[allow(dead_code)]
#[tauri::command]
fn list_git_branches(repo_path: String) -> Vec<String> {
    let git = git_executable();
    // Use `git branch -a` without `--format` to avoid cmd.exe `%` expansion
    // corrupting the format string on Windows.
    let result = std::process::Command::new(&git)
        .args(["branch", "-a"])
        .current_dir(&repo_path)
        .output();

    match result {
        Ok(output) if output.status.success() => {
            parse_git_branch_output(&String::from_utf8_lossy(&output.stdout))
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
                Ok(cmd) => match cmd
                    // Pass port both ways: CLI arg is the most reliable mechanism for
                    // sidecar processes; env var is the existing fallback.
                    .args(["--port", daemon_port])
                    .env("RUNTIME_PORT", daemon_port)
                    .spawn() {
                    Ok((mut rx, child)) => {
                        *app.state::<DaemonProcess>().0.lock().unwrap() = Some(child);
                        log::info!("cicd-daemon started on port {daemon_port}");

                        // Consume the output receiver on a background thread so
                        // stdout/stderr are logged and early exits are detected.
                        let handle = app.handle().clone();
                        tauri::async_runtime::spawn(async move {
                            while let Some(event) = rx.recv().await {
                                match event {
                                    CommandEvent::Stdout(line) => {
                                        log::info!("[daemon] {}", String::from_utf8_lossy(&line));
                                    }
                                    CommandEvent::Stderr(line) => {
                                        log::warn!("[daemon] {}", String::from_utf8_lossy(&line));
                                    }
                                    CommandEvent::Terminated(payload) => {
                                        let code = payload.code.unwrap_or(-1);
                                        log::error!("cicd-daemon exited with code {code}");
                                        if code != 0 {
                                            show_daemon_error(
                                                &handle,
                                                &format!("The daemon process exited unexpectedly (code {code}). Check that your LLM settings are configured in Settings."),
                                            );
                                        }
                                        break;
                                    }
                                    _ => {}
                                }
                            }
                        });
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
