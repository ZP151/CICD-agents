fn main() {
    // Native shell icons are embedded during the Rust build. Keep their change
    // tracking explicit so `cargo build` cannot reuse a binary with stale icon
    // resources after the icon-generation script has run.
    for path in [
        "icons/icon.ico",
        "icons/icon.png",
        "icons/32x32.png",
        "icons/48x48.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "../src/assets/mergepilot-icon-source.png",
        "../src/assets/mergepilot-icon-reference.png",
        "../src/assets/mergepilot-taskbar-32.png",
        "tauri.conf.json",
    ] {
        println!("cargo:rerun-if-changed={path}");
    }
    for size in [
        16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 96, 128, 256,
    ] {
        println!("cargo:rerun-if-changed=icons/taskbar/{size}x{size}.png");
    }
    tauri_build::build();
}
