import { useEffect } from "react";

export const WINDOW_STATE_STORAGE_KEY = "mergepilot.window-state.v2";
const LEGACY_WINDOW_STATE_STORAGE_KEY = "win_state";
const WINDOW_STATE_VERSION = 2;
const MIN_WINDOW_WIDTH = 1024;
const MIN_WINDOW_HEIGHT = 640;
const MAX_WINDOW_EDGE = 10_000;

export const DEFAULT_WINDOW_SIZE = { width: 1280, height: 800 } as const;

interface PersistedWindowState {
  version: typeof WINDOW_STATE_VERSION;
  width: number;
  height: number;
  maximized: boolean;
}

export function parsePersistedWindowState(raw: string | null): PersistedWindowState | null {
  if (!raw) return null;

  try {
    const candidate = JSON.parse(raw) as Partial<PersistedWindowState>;
    if (
      candidate.version !== WINDOW_STATE_VERSION ||
      typeof candidate.width !== "number" ||
      typeof candidate.height !== "number" ||
      typeof candidate.maximized !== "boolean" ||
      !Number.isFinite(candidate.width) ||
      !Number.isFinite(candidate.height) ||
      candidate.width < MIN_WINDOW_WIDTH ||
      candidate.height < MIN_WINDOW_HEIGHT ||
      candidate.width > MAX_WINDOW_EDGE ||
      candidate.height > MAX_WINDOW_EDGE
    ) {
      return null;
    }

    return {
      version: WINDOW_STATE_VERSION,
      width: Math.round(candidate.width),
      height: Math.round(candidate.height),
      maximized: candidate.maximized,
    };
  } catch {
    return null;
  }
}

export function useWindowState() {
  useEffect(() => {
    if (!("__TAURI__" in window)) return;

    async function restore() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const saved = parsePersistedWindowState(localStorage.getItem(WINDOW_STATE_STORAGE_KEY));

        // v1 stored physical dimensions but restored them as logical pixels. It is not safe to
        // migrate that payload across DPI settings, so fall back to the Tauri-configured default.
        localStorage.removeItem(LEGACY_WINDOW_STATE_STORAGE_KEY);
        if (!saved) return;

        const win = getCurrentWindow();
        if (saved.maximized) {
          await win.maximize();
          return;
        }

        const { LogicalSize } = await import("@tauri-apps/api/dpi");
        await win.setSize(new LogicalSize(saved.width, saved.height));
      } catch {
        // Ignore window state failures; they should not block app startup.
      }
    }

    async function persist() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const [outerSize, scaleFactor, maximized] = await Promise.all([
          win.outerSize(),
          win.scaleFactor(),
          win.isMaximized(),
        ]);
        const logicalSize = outerSize.toLogical(scaleFactor);
        const state: PersistedWindowState = {
          version: WINDOW_STATE_VERSION,
          width: Math.round(logicalSize.width),
          height: Math.round(logicalSize.height),
          maximized,
        };

        if (parsePersistedWindowState(JSON.stringify(state))) {
          localStorage.setItem(WINDOW_STATE_STORAGE_KEY, JSON.stringify(state));
        }
      } catch {
        // Ignore window state failures; they should not affect the UI.
      }
    }

    void restore();
    const interval = setInterval(() => {
      void persist();
    }, 5000);
    window.addEventListener("beforeunload", persist);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", persist);
    };
  }, []);
}
