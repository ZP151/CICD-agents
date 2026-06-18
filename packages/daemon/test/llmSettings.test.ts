import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSettings } from "@mergepilot/core";
import { buildEffectiveLlmSettings } from "../src/llmSettings.js";

const savedEnv = {
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
  AZURE_OPENAI_CHAT_DEPLOYMENT: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
  AZURE_OPENAI_API_VERSION: process.env.AZURE_OPENAI_API_VERSION,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
};

describe("llmSettings", () => {
  beforeEach(() => {
    process.env.LLM_PROVIDER = "azure";
    process.env.AZURE_OPENAI_ENDPOINT = "https://env.openai.azure.com";
    process.env.AZURE_OPENAI_API_KEY = "env-azure-key";
    process.env.AZURE_OPENAI_CHAT_DEPLOYMENT = "env-deployment";
    process.env.AZURE_OPENAI_API_VERSION = "2024-10-21";
    process.env.OPENAI_API_KEY = "env-openai-key";
    process.env.OPENAI_MODEL = "env-openai-model";
  });

  afterEach(() => {
    restoreEnv();
  });

  it("returns base settings when no inline override is supplied", () => {
    const base = getSettings();
    const effective = buildEffectiveLlmSettings();

    expect(effective.llmProvider).toBe(base.llmProvider);
    expect(effective.azureOpenAiEndpoint).toBe(base.azureOpenAiEndpoint);
    expect(effective.azureOpenAiApiKey).toBe(base.azureOpenAiApiKey);
  });

  it("applies Azure inline values only to Azure settings", () => {
    const effective = buildEffectiveLlmSettings({
      llmProvider: "azure",
      azureEndpoint: "https://inline.openai.azure.com",
      azureApiKey: "inline-azure-key",
      azureDeployment: "inline-deployment",
      azureApiVersion: "2025-01-01-preview",
      openaiApiKey: "ignored-openai-key",
      openaiModel: "ignored-model",
    });

    expect(effective.llmProvider).toBe("azure");
    expect(effective.azureOpenAiEndpoint).toBe("https://inline.openai.azure.com");
    expect(effective.azureOpenAiApiKey).toBe("inline-azure-key");
    expect(effective.azureOpenAiChatDeployment).toBe("inline-deployment");
    expect(effective.azureOpenAiApiVersion).toBe("2025-01-01-preview");
    expect(effective.openAiApiKey).toBe("env-openai-key");
    expect(effective.openAiModel).toBe("env-openai-model");
    expect(effective.llmConfigured).toBe(true);
  });

  it("applies OpenAI inline values only to OpenAI settings", () => {
    const effective = buildEffectiveLlmSettings({
      llmProvider: "openai",
      azureEndpoint: "ignored-azure-endpoint",
      azureApiKey: "ignored-azure-key",
      openaiApiKey: "inline-openai-key",
      openaiModel: "gpt-test",
    });

    expect(effective.llmProvider).toBe("openai");
    expect(effective.openAiApiKey).toBe("inline-openai-key");
    expect(effective.openAiModel).toBe("gpt-test");
    expect(effective.azureOpenAiEndpoint).toBe("https://env.openai.azure.com");
    expect(effective.azureOpenAiApiKey).toBe("env-azure-key");
    expect(effective.llmConfigured).toBe(true);
  });
});

function restoreEnv(): void {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
