import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULTS,
  STORAGE_KEY,
  loadSettings,
} from "./settingsTypes.js";

describe("settingsTypes", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      clear: vi.fn(() => {
        store = {};
      }),
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("defaults model secrets to local .env for new installs", () => {
    expect(DEFAULTS.secretSource).toBe("local_env");
    expect(loadSettings().secretSource).toBe("local_env");
  });

  it("preserves an explicit Key Vault setting from existing users", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ secretSource: "key_vault" }));

    expect(loadSettings().secretSource).toBe("key_vault");
  });
});
