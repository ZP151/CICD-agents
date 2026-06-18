// Prevents the additional console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mergepilot_desktop_lib::run();
}
