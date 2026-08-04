import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULTS,
  STORAGE_KEY,
  additionalModelIsConfigured,
  loadSettings,
  saveSettings,
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

  it("never persists model credentials in WebView localStorage", () => {
    saveSettings({
      ...DEFAULTS,
      additionalModels: [{
        id: "azure-model",
        provider: "azure",
        label: "Built-in GPT-5 mini",
        enabled: true,
        available: true,
        testedAt: "2026-08-04T00:00:00.000Z",
        testError: "",
        azureEndpoint: "https://example.openai.azure.com",
        azureApiKey: "secret-that-must-not-persist",
        azureDeployment: "gpt-5-mini",
        azureNarrativeDeployment: "gpt-5-mini-2",
        azureApiVersion: "2025-04-01-preview",
        openaiApiKey: "other-secret-that-must-not-persist",
        openaiModel: "",
        openaiNarrativeModel: "",
      }],
    });

    expect(store[STORAGE_KEY]).not.toContain("secret-that-must-not-persist");
    const restored = loadSettings().additionalModels[0]!;
    expect(restored.azureApiKey).toBe("");
    expect(additionalModelIsConfigured(restored)).toBe(true);
  });
});
