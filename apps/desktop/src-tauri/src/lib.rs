use std::{process::Command, thread, time::Duration};
use std::sync::{Mutex, OnceLock};
use tauri::{
    AppHandle,
    Emitter,
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_shell::{process::{CommandChild, CommandEvent}, ShellExt};

/// The port on which the daemon is listening.  Set once during setup() and
/// read by the frontend via the `get_daemon_port` command.
static DAEMON_PORT: OnceLock<u16> = OnceLock::new();
const DEFAULT_DAEMON_PORT: u16 = 8787;

fn configured_daemon_port() -> u16 {
    daemon_port_from(std::env::var("MERGEPILOT_RUNTIME_PORT").ok().as_deref())
}

fn daemon_port_from(value: Option<&str>) -> u16 {
    value
        .and_then(|value| value.parse::<u16>().ok())
        .filter(|port| *port > 0)
        .unwrap_or(DEFAULT_DAEMON_PORT)
}

#[tauri::command]
fn get_daemon_port() -> u16 {
    *DAEMON_PORT.get().unwrap_or(&8787)
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimePortOwner {
    port: u16,
    pid: Option<u32>,
    path: Option<String>,
    command_line: Option<String>,
    recoverable: bool,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeRecoveryResult {
    ok: bool,
    port: u16,
    stopped_pid: Option<u32>,
    owner_before: RuntimePortOwner,
    owner_after: RuntimePortOwner,
}

#[tauri::command]
fn inspect_runtime_port_owner() -> RuntimePortOwner {
    inspect_runtime_port_owner_for_port(get_daemon_port())
}

#[tauri::command]
fn recover_daemon_runtime(app: AppHandle) -> Result<RuntimeRecoveryResult, String> {
    let port = get_daemon_port();
    let owner_before = inspect_runtime_port_owner_for_port(port);
    let mut stopped_pid = None;

    if let Some(pid) = owner_before.pid {
        if !owner_before.recoverable {
            return Err(format!(
                "Port {port} is owned by an unexpected process. Close it manually before restarting MergePilot."
            ));
        }
        stop_process_by_id(pid)?;
        stopped_pid = Some(pid);
        thread::sleep(Duration::from_millis(700));
    }

    kill_daemon(&app);
    start_daemon_sidecar(&app, port)?;
    thread::sleep(Duration::from_millis(500));

    Ok(RuntimeRecoveryResult {
        ok: true,
        port,
        stopped_pid,
        owner_before,
        owner_after: inspect_runtime_port_owner_for_port(port),
    })
}

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

fn inspect_runtime_port_owner_for_port(port: u16) -> RuntimePortOwner {
    #[cfg(target_os = "windows")]
    {
        return inspect_runtime_port_owner_windows(port);
    }

    #[allow(unreachable_code)]
    RuntimePortOwner {
        port,
        pid: None,
        path: None,
        command_line: None,
        recoverable: false,
    }
}

#[cfg(target_os = "windows")]
fn inspect_runtime_port_owner_windows(port: u16) -> RuntimePortOwner {
    let script = format!(
        "$c = Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; \
         if ($null -eq $c) {{ [pscustomobject]@{{ pid = $null; path = $null; commandLine = $null }} | ConvertTo-Json -Compress; exit 0 }}; \
         $p = Get-CimInstance Win32_Process -Filter \"ProcessId=$($c.OwningProcess)\" -ErrorAction SilentlyContinue; \
         [pscustomobject]@{{ pid = [int]$c.OwningProcess; path = $p.ExecutablePath; commandLine = $p.CommandLine }} | ConvertTo-Json -Compress"
    );

    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .output();

    let value = output
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .and_then(|text| serde_json::from_str::<serde_json::Value>(text.trim()).ok());

    let pid = value
        .as_ref()
        .and_then(|v| v.get("pid"))
        .and_then(|v| v.as_u64())
        .map(|v| v as u32);
    let path = value
        .as_ref()
        .and_then(|v| v.get("path"))
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let command_line = value
        .as_ref()
        .and_then(|v| v.get("commandLine"))
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());

    RuntimePortOwner {
        port,
        pid,
        recoverable: runtime_owner_is_recoverable(path.as_deref(), command_line.as_deref()),
        path,
        command_line,
    }
}

fn runtime_owner_is_recoverable(path: Option<&str>, command_line: Option<&str>) -> bool {
    let combined = format!("{} {}", path.unwrap_or(""), command_line.unwrap_or(""))
        .to_ascii_lowercase()
        .replace('/', "\\");

    combined.contains("mergepilot-daemon")
        || combined.contains("@mergepilot\\daemon")
        || combined.contains("packages\\daemon")
        || ((combined.contains("\\cicd-agents\\") || combined.contains("\\mergepilot\\"))
            && combined.contains("src\\bin.ts"))
}

fn stop_process_by_id(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let status = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &format!("Stop-Process -Id {pid} -Force -ErrorAction Stop"),
            ])
            .status()
            .map_err(|err| format!("Failed to stop process {pid}: {err}"))?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("Failed to stop process {pid}: exit code {:?}", status.code()));
    }

    #[allow(unreachable_code)]
    Err(format!("Runtime recovery is not supported on this platform for PID {pid}."))
}

/// Holds the running daemon child process so we can kill it on exit.
struct DaemonProcess(Mutex<Option<CommandChild>>);

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if argv.iter().any(|arg| is_auth_return_uri(arg)) {
                complete_browser_auth_return(app);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(DaemonProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            list_git_branches,
            get_daemon_port,
            inspect_runtime_port_owner,
            recover_daemon_runtime
        ])
        // Hide windows instead of quitting when the user closes them
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .setup(|app| {
            // The bundled ICO provides exact taskbar payloads, but Windows
            // development windows can otherwise inherit a low-resolution
            // default window-class icon. Bind the retained 256px source to the
            // live main window as well so the taskbar has a high-DPI image in
            // both `tauri dev` and packaged runs.
            if let Some(main_window) = app.get_webview_window("main") {
                let window_icon = Image::from_bytes(include_bytes!("../icons/128x128@2x.png"))?;
                main_window.set_icon(window_icon)?;
            }

            // Windows development runs are not installed, so explicitly claim the
            // configured scheme for the current executable. Release installers
            // register it from tauri.conf.json.
            #[cfg(all(debug_assertions, target_os = "windows"))]
            app.deep_link().register_all()?;

            let return_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                if event.urls().iter().any(|url| is_auth_return_uri(url.as_str())) {
                    complete_browser_auth_return(&return_handle);
                }
            });

            // ── System-tray ──────────────────────────────────────────────────
            let open_main =
                MenuItem::with_id(app, "open_main", "Open MergePilot", true, None::<&str>)?;
            let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_main, &separator, &quit])?;

            // The taskbar and tray both render at high-DPI sizes.  Use the
            // retained 256px PNG as tray source instead of a decoded 32px
            // default frame, leaving Windows with a high-resolution source.
            let tray_icon = Image::from_bytes(include_bytes!("../icons/128x128@2x.png"))?;
            TrayIconBuilder::new()
                .icon(tray_icon)
                .menu(&menu)
                .tooltip("MergePilot")
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
            // Packaged releases retain 8787. A worktree can opt into its own
            // port so a UX/dev instance never takes over an installed app's
            // runtime during parallel validation.
            let daemon_port_num = configured_daemon_port();
            let _ = DAEMON_PORT.set(daemon_port_num);
            if let Err(e) = start_daemon_sidecar(&app.handle(), daemon_port_num) {
                log::error!("Failed to start mergepilot-daemon: {e}");
                show_daemon_error(&app.handle(), &e);
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
        log::info!("mergepilot-daemon stopped");
    }
}

fn start_daemon_sidecar(app: &AppHandle, port: u16) -> Result<(), String> {
    if let Some(stopped_pid) = ensure_runtime_port_available(port)? {
        log::warn!("stopped stale MergePilot runtime on port {port} before starting sidecar: pid {stopped_pid}");
    }

    let daemon_port = port.to_string();
    let cmd = app
        .shell()
        .sidecar("mergepilot-daemon")
        .map_err(|err| format!("Failed to create sidecar command: {err}"))?;

    let (mut rx, child) = cmd
        // Pass port both ways: CLI arg is the most reliable mechanism for
        // sidecar processes; env var is the existing fallback.
        .args(["--port", daemon_port.as_str()])
        .env("RUNTIME_PORT", daemon_port.as_str())
        .env("MERGEPILOT_RUNTIME_MODE", "desktop-sidecar")
        .env("MERGEPILOT_RETURN_URI", "mergepilot://auth/complete")
        .env("MERGEPILOT_DESKTOP_VERSION", env!("CARGO_PKG_VERSION"))
        .env("MERGEPILOT_DAEMON_VERSION", env!("CARGO_PKG_VERSION"))
        .env("MERGEPILOT_BUILD_SHA", option_env!("GITHUB_SHA").unwrap_or(""))
        .spawn()
        .map_err(|err| format!("Failed to spawn mergepilot-daemon: {err}"))?;

    *app.state::<DaemonProcess>().0.lock().unwrap() = Some(child);
    log::info!("mergepilot-daemon started on port {port}");

    // Consume the output receiver on a background thread so stdout/stderr are
    // logged and early exits are detected.
    let handle = app.clone();
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
                    log::error!("mergepilot-daemon exited with code {code}");
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

    Ok(())
}

fn ensure_runtime_port_available(port: u16) -> Result<Option<u32>, String> {
    let owner = inspect_runtime_port_owner_for_port(port);
    let Some(pid) = owner.pid else {
        return Ok(None);
    };

    if !owner.recoverable {
        return Err(format!(
            "Port {port} is already used by an unexpected process. Close it manually before starting MergePilot."
        ));
    }

    stop_process_by_id(pid)?;
    thread::sleep(Duration::from_millis(700));

    let owner_after = inspect_runtime_port_owner_for_port(port);
    if let Some(after_pid) = owner_after.pid {
        return Err(format!(
            "Port {port} is still owned by process {after_pid} after stopping stale MergePilot runtime {pid}."
        ));
    }

    Ok(Some(pid))
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
            "console.error('MergePilot: daemon failed to start — {escaped}')"
        ));
        let _ = win.show();
    }
}

fn is_auth_return_uri(value: &str) -> bool {
    value == "mergepilot://auth/complete" || value.starts_with("mergepilot://auth/complete?")
}

fn reveal_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// The browser never passes an identity or token back through this URI.  It
/// only tells the already-running desktop app to re-read the credential that
/// MSAL has stored locally.  Emitting an event as well as focusing the window
/// avoids relying on background WebView timers to notice the completed login.
fn complete_browser_auth_return(app: &tauri::AppHandle) {
    reveal_main_window(app);
    let _ = app.emit("mergepilot-auth-complete", ());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn treats_installed_mergepilot_daemon_as_recoverable() {
        assert!(runtime_owner_is_recoverable(
            Some(r"C:\Program Files\MergePilot\mergepilot-daemon.exe"),
            Some(r#""\\?\C:\Program Files\MergePilot\mergepilot-daemon.exe" --port 8787"#),
        ));
    }

    #[test]
    fn uses_default_runtime_port_when_no_valid_override_is_present() {
        assert_eq!(daemon_port_from(None), 8787);
        assert_eq!(daemon_port_from(Some("invalid")), 8787);
        assert_eq!(daemon_port_from(Some("0")), 8787);
        assert_eq!(daemon_port_from(Some("8788")), 8788);
    }

    #[test]
    fn treats_stale_direct_installed_daemon_as_recoverable() {
        assert!(runtime_owner_is_recoverable(
            Some(r"C:\Program Files\MergePilot\mergepilot-daemon.exe"),
            Some(r#""C:\Program Files\MergePilot\mergepilot-daemon.exe" --port 8787"#),
        ));
    }

    #[test]
    fn treats_source_daemon_as_recoverable() {
        assert!(runtime_owner_is_recoverable(
            Some(r"C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64\node.exe"),
            Some(r#"node packages\daemon\src\bin.ts --port 8787"#),
        ));
    }

    #[test]
    fn treats_pnpm_source_daemon_as_recoverable() {
        assert!(runtime_owner_is_recoverable(
            Some(r"C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64\node.exe"),
            Some(r#""C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64\node.exe" "C:\Users\15492\Develop\Agents\CICD-agents\node_modules\tsx\dist\cli.mjs" src\bin.ts"#),
        ));
    }

    #[test]
    fn accepts_only_the_configured_credential_free_auth_return_uri() {
        assert!(is_auth_return_uri("mergepilot://auth/complete"));
        assert!(is_auth_return_uri("mergepilot://auth/complete?source=browser"));
        assert!(!is_auth_return_uri("mergepilot://auth/completex"));
        assert!(!is_auth_return_uri("mergepilot://auth/complete/credential"));
    }

    #[test]
    fn rejects_unrelated_port_owner() {
        assert!(!runtime_owner_is_recoverable(
            Some(r"C:\Windows\System32\svchost.exe"),
            Some("svchost.exe"),
        ));
    }
}
