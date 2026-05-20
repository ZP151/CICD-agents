use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

/// Holds the running daemon child process so we can kill it on exit.
struct DaemonProcess(Mutex<Option<CommandChild>>);

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(DaemonProcess(Mutex::new(None)))
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
            match app.shell().sidecar("cicd-daemon") {
                Ok(cmd) => match cmd.spawn() {
                    Ok((_rx, child)) => {
                        *app.state::<DaemonProcess>().0.lock().unwrap() = Some(child);
                        log::info!("cicd-daemon started");
                    }
                    Err(e) => {
                        log::error!("Failed to spawn cicd-daemon: {e}");
                        show_daemon_error(app, &e.to_string());
                    }
                },
                Err(e) => {
                    log::error!("Failed to create sidecar command: {e}");
                    show_daemon_error(app, &e.to_string());
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
