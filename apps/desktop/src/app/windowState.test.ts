import { describe, expect, it } from "vitest";
import {
  DEFAULT_WINDOW_SIZE,
  parsePersistedWindowState,
  WINDOW_STATE_STORAGE_KEY,
} from "./windowState.js";

describe("window state persistence", () => {
  it("does not restore the legacy physical-pixel payload that can override the configured minimum", () => {
    expect(parsePersistedWindowState(JSON.stringify({ x: 12, y: 20, w: 280, h: 560 }))).toBeNull();
    expect(WINDOW_STATE_STORAGE_KEY).not.toBe("win_state");
  });

  it("accepts only versioned logical sizes at or above the desktop workbench minimum", () => {
    expect(
      parsePersistedWindowState(
        JSON.stringify({ version: 2, width: 1280, height: 800, maximized: false }),
      ),
    ).toEqual({ version: 2, width: 1280, height: 800, maximized: false });
    expect(
      parsePersistedWindowState(
        JSON.stringify({ version: 2, width: 720, height: 480, maximized: false }),
      ),
    ).toBeNull();
    expect(
      parsePersistedWindowState(
        JSON.stringify({ version: 2, width: 1280, height: 800, maximized: true }),
      ),
    ).toMatchObject({ maximized: true });
  });

  it("uses a laptop-sized default instead of restoring an invalid saved size", () => {
    expect(DEFAULT_WINDOW_SIZE).toEqual({ width: 1280, height: 800 });
  });
});
