import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeyVaultSecrets, resetSettingsForTests } from "@mergepilot/core";
import { buildApp } from "../src/server.js";
import {
  resetDaemonEnvForTests,
  writeMergePilotUserConfig,
} from "../src/daemonEnv.js";

const savedEnv = {
  MERGEPILOT_USER_CONFIG_FILE: process.env.MERGEPILOT_USER_CONFIG_FILE,
  MERGEPILOT_LOCAL_ENV_FILE: process.env.MERGEPILOT_LOCAL_ENV_FILE,
  MERGEPILOT_SECRET_SOURCE: process.env.MERGEPILOT_SECRET_SOURCE,
  RUNTIME_DATA_DIR: process.env.RUNTIME_DATA_DIR,
  RUNTIME_HOST: process.env.RUNTIME_HOST,
  RUNTIME_PORT: process.env.RUNTIME_PORT,
  AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
  AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
  AZURE_KEYVAULT_URL: process.env.AZURE_KEYVAULT_URL,
};

describe("daemon config routes", () => {
  let tmp = "";
  let app: Awaited<ReturnType<typeof buildApp>> | null = null;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-config-routes-"));
    for (const key of Object.keys(savedEnv)) {
      delete process.env[key];
    }
    process.env.MERGEPILOT_USER_CONFIG_FILE = path.join(tmp, "config.toml");
    process.env.MERGEPILOT_LOCAL_ENV_FILE = path.join(tmp, ".env");
    process.env.RUNTIME_DATA_DIR = tmp;
    process.env.RUNTIME_HOST = "127.0.0.1";
    process.env.RUNTIME_PORT = "0";
    resetDaemonEnvForTests();
    resetSettingsForTests();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (app) {
      await app.close();
      app = null;
    }
    resetDaemonEnvForTests();
    resetSettingsForTests();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("keeps Azure model key saves local unless Key Vault is explicitly enabled", async () => {
    writeMergePilotUserConfig({
      llmProvider: "azure",
      secretSource: "local_env",
      azureEndpoint: "https://example.openai.azure.com",
      azureDeployment: "gpt-4o",
      azureApiVersion: "2024-08-01-preview",
    }, process.env.MERGEPILOT_USER_CONFIG_FILE!);
    const setAoaiKey = vi.spyOn(KeyVaultSecrets.prototype, "setAoaiKey").mockRejectedValue(
      new Error("Key Vault should not be called for local_env model secrets"),
    );

    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/daemon/configure",
      payload: {
        llmProvider: "azure",
        azureEndpoint: "https://example.openai.azure.com",
        azureDeployment: "gpt-4o",
        azureNarrativeDeployment: "gpt-4o-mini-fast",
        azureApiVersion: "2024-08-01-preview",
        azureApiKey: "local-model-key",
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, llmConfigured: true });
    expect(setAoaiKey).not.toHaveBeenCalled();
    const config = await app.inject({ method: "GET", url: "/daemon/config" });
    expect(config.json()).toMatchObject({ azureNarrativeDeployment: "gpt-4o-mini-fast" });
  });

  it("explains Key Vault app permission failures without leaking raw AADSTS text", async () => {
    writeMergePilotUserConfig({
      llmProvider: "azure",
      secretSource: "key_vault",
      azureEndpoint: "https://example.openai.azure.com",
      azureDeployment: "gpt-4o",
      azureApiVersion: "2024-08-01-preview",
      azureKeyVaultUrl: "https://example.vault.azure.net/",
    }, process.env.MERGEPILOT_USER_CONFIG_FILE!);
    vi.spyOn(KeyVaultSecrets.prototype, "setAoaiKey").mockRejectedValue(
      new Error("invalid_client: AADSTS650057: Invalid resource. The client requested access to https://vault.azure.net."),
    );

    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/daemon/configure",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        secretSource: "key_vault",
        llmProvider: "azure",
        azureEndpoint: "https://example.openai.azure.com",
        azureDeployment: "gpt-4o",
        azureApiVersion: "2024-08-01-preview",
        azureKeyVaultUrl: "https://example.vault.azure.net/",
        azureApiKey: "model-key",
      }),
    });

    expect(response.statusCode, response.body).toBe(400);
    expect(response.json()).toMatchObject({
      ok: false,
      code: "key_vault_permission_required",
    });
    expect(response.body).toContain("Azure Key Vault app permission is not configured");
    expect(response.body).toContain("Local .env");
    expect(response.body).not.toContain("AADSTS650057");
    expect(response.body).not.toContain("invalid_client");
  });
});
