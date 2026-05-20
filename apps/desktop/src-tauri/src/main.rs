// Prevents the additional console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    cicd_agent_desktop_lib::run();
}
