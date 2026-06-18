import { useEffect } from "react";

export function useWindowState() {
  useEffect(() => {
    if (!("__TAURI__" in window)) return;

    async function restore() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const saved = localStorage.getItem("win_state");
        if (!saved) return;
        const { x, y, w, h } = JSON.parse(saved) as {
          x: number;
          y: number;
          w: number;
          h: number;
        };
        const { LogicalSize, LogicalPosition } = await import("@tauri-apps/api/dpi");
        await win.setSize(new LogicalSize(w, h));
        await win.setPosition(new LogicalPosition(x, y));
      } catch {
        // Ignore window state failures; they should not block app startup.
      }
    }

    async function persist() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const pos = await win.outerPosition();
        const size = await win.outerSize();
        localStorage.setItem(
          "win_state",
          JSON.stringify({ x: pos.x, y: pos.y, w: size.width, h: size.height }),
        );
      } catch {
        // Ignore window state failures; they should not affect the UI.
      }
    }

    void restore();
    const interval = setInterval(() => {
      void persist();
    }, 5000);
    window.addEventListener("beforeunload", () => {
      void persist();
    });
    return () => clearInterval(interval);
  }, []);
}
