import { afterEach, describe, expect, it } from "vitest";
import { getSettings, resetSettingsForTests } from "../src/settings.js";

describe("settings", () => {
  const previousEnv = {
    AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    REVIEW_STALE_AGE_HOURS: process.env.REVIEW_STALE_AGE_HOURS,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetSettingsForTests();
  });

  it("defaults review stale age to 24 hours", () => {
    delete process.env.REVIEW_STALE_AGE_HOURS;
    resetSettingsForTests();

    expect(getSettings().reviewStaleAgeHours).toBe(24);
  });

  it("reads review stale age from the environment", () => {
    process.env.REVIEW_STALE_AGE_HOURS = "6";
    resetSettingsForTests();

    expect(getSettings().reviewStaleAgeHours).toBe(6);
  });

  it("uses Azure as the configured built-in provider when Azure env is present", () => {
    process.env.LLM_PROVIDER = "azure";
    process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com";
    process.env.AZURE_OPENAI_API_KEY = "test-key";
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    resetSettingsForTests();

    const settings = getSettings();

    expect(settings.llmProvider).toBe("azure");
    expect(settings.llmConfigured).toBe(true);
    expect(settings.azureOpenAiChatDeployment).toBe("mergepilot-chat");
  });

  it("uses OpenAI as a configured custom provider only when key and model are present", () => {
    delete process.env.AZURE_OPENAI_ENDPOINT;
    delete process.env.AZURE_OPENAI_API_KEY;
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "custom-model";
    resetSettingsForTests();

    const settings = getSettings();

    expect(settings.llmProvider).toBe("openai");
    expect(settings.llmConfigured).toBe(true);
    expect(settings.openAiModel).toBe("custom-model");
  });

  it("does not mark OpenAI custom API as configured without a model", () => {
    delete process.env.AZURE_OPENAI_ENDPOINT;
    delete process.env.AZURE_OPENAI_API_KEY;
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.OPENAI_MODEL;
    resetSettingsForTests();

    const settings = getSettings();

    expect(settings.llmProvider).toBe("openai");
    expect(settings.llmConfigured).toBe(false);
  });
});
