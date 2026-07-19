import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureMergePilotUserConfigFile,
  ensureMergePilotLocalEnvFile,
  envSourceLabel,
  loadDaemonEnv,
  readMergePilotUserConfig,
  resetDaemonEnvForTests,
  writeMergePilotUserConfig,
} from "../src/daemonEnv.js";

const savedEnv = {
  MERGEPILOT_HOME: process.env.MERGEPILOT_HOME,
  MERGEPILOT_LOCAL_ENV_FILE: process.env.MERGEPILOT_LOCAL_ENV_FILE,
  MERGEPILOT_USER_CONFIG_FILE: process.env.MERGEPILOT_USER_CONFIG_FILE,
  AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
  AZURE_OPENAI_API_VERSION: process.env.AZURE_OPENAI_API_VERSION,
  AZURE_OPENAI_CHAT_DEPLOYMENT: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
  AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  LLM_PROVIDER: process.env.LLM_PROVIDER,
};

let tmp = "";
let cwd = "";

describe("daemonEnv", () => {
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-env-"));
    cwd = process.cwd();
    resetDaemonEnvForTests();
    for (const key of Object.keys(savedEnv)) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.chdir(cwd);
    resetDaemonEnvForTests();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(tmp, { force: true, recursive: true });
  });

  it("creates the user config template", () => {
    const configFile = path.join(tmp, ".mergepilot", "config.toml");

    ensureMergePilotUserConfigFile(configFile);

    const content = fs.readFileSync(configFile, "utf8");
    expect(content).toContain("[llm]");
    expect(content).toContain("[secrets]");
    expect(content).toContain("source = \"local_env\"");
    expect(content).toContain("[azure_openai]");
    expect(content).toContain("embedding_deployment = \"text-embedding-3-small\"");
    expect(content).toContain("key_vault_url = \"https://devagentkv001.vault.azure.net/\"");
    expect(content).toContain("api_key_ref = \"\"");
  });

  it("round-trips user config without writing plaintext model secrets", () => {
    const configFile = path.join(tmp, ".mergepilot", "config.toml");

    writeMergePilotUserConfig({
      llmProvider: "azure",
      secretSource: "key_vault",
      azureEndpoint: "https://example.openai.azure.com",
      azureDeployment: "mergepilot-chat",
      azureEmbeddingDeployment: "text-embedding-3-small",
      azureApiKeyRef: "kv://secret/mergepilot-aoai-key",
      azureKeyVaultUrl: "https://devagentkv001.vault.azure.net/",
      reviewAutoApproveEnabled: false,
      reviewStaleAgeHours: 48,
    }, configFile);

    const content = fs.readFileSync(configFile, "utf8");
    expect(content).toContain("endpoint = \"https://example.openai.azure.com\"");
    expect(content).toContain("api_key_ref = \"kv://secret/mergepilot-aoai-key\"");
    expect(content).not.toContain("sk-");
    expect(readMergePilotUserConfig(configFile)).toMatchObject({
      llmProvider: "azure",
      secretSource: "key_vault",
      azureEndpoint: "https://example.openai.azure.com",
      azureEmbeddingDeployment: "text-embedding-3-small",
      azureApiKeyRef: "kv://secret/mergepilot-aoai-key",
      azureKeyVaultUrl: "https://devagentkv001.vault.azure.net/",
      reviewAutoApproveEnabled: false,
      reviewStaleAgeHours: 48,
    });
  });

  it("supports Azure OpenAI keys referenced from Azure Key Vault", () => {
    const configFile = path.join(tmp, ".mergepilot", "config.toml");

    writeMergePilotUserConfig({
      llmProvider: "azure",
      secretSource: "key_vault",
      azureEndpoint: "https://example.openai.azure.com",
      azureDeployment: "mergepilot-chat",
      azureEmbeddingDeployment: "text-embedding-3-small",
      azureApiVersion: "2024-08-01-preview",
      azureApiKeyRef: "kv://aoai-key",
      azureKeyVaultUrl: "https://devagentkv001.vault.azure.net/",
    }, configFile);

    const content = fs.readFileSync(configFile, "utf8");
    expect(content).toContain("api_key_ref = \"kv://aoai-key\"");
    expect(content).toContain("key_vault_url = \"https://devagentkv001.vault.azure.net/\"");
    expect(content).not.toContain("sk-");
    expect(readMergePilotUserConfig(configFile)).toMatchObject({
      llmProvider: "azure",
      azureApiKeyRef: "kv://aoai-key",
      azureKeyVaultUrl: "https://devagentkv001.vault.azure.net/",
    });
  });

  it("loads user config into the runtime environment", () => {
    const workdir = path.join(tmp, "app");
    const userConfig = path.join(tmp, "user", "config.toml");
    fs.mkdirSync(workdir, { recursive: true });
    writeMergePilotUserConfig({
      llmProvider: "azure",
      secretSource: "local_env",
      azureEndpoint: "https://example.openai.azure.com",
      azureDeployment: "mergepilot-chat",
      azureEmbeddingDeployment: "text-embedding-3-small",
      azureApiKeyRef: "kv://secret/mergepilot-aoai-key",
      azureKeyVaultUrl: "https://devagentkv001.vault.azure.net/",
    }, userConfig);
    const localEnvFile = path.join(tmp, "user", ".env");
    fs.writeFileSync(localEnvFile, "AZURE_OPENAI_API_KEY=local-env-key\n", "utf8");
    process.env.MERGEPILOT_LOCAL_ENV_FILE = localEnvFile;
    process.env.MERGEPILOT_USER_CONFIG_FILE = userConfig;
    process.chdir(workdir);

    loadDaemonEnv();

    expect(process.env.LLM_PROVIDER).toBe("azure");
    expect(process.env.AZURE_OPENAI_ENDPOINT).toBe("https://example.openai.azure.com");
    expect(process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT).toBe("text-embedding-3-small");
    expect(process.env.AZURE_OPENAI_API_KEY).toBe("local-env-key");
    expect(process.env.AZURE_KEYVAULT_URL).toBe("https://devagentkv001.vault.azure.net/");
    expect(envSourceLabel()).toBe(userConfig);
  });

  it("defaults new installs to local .env secrets instead of Key Vault", () => {
    const userConfig = path.join(tmp, "user", "config.toml");
    process.env.MERGEPILOT_USER_CONFIG_FILE = userConfig;
    ensureMergePilotUserConfigFile(userConfig);

    loadDaemonEnv();

    expect(process.env.OPENAI_API_KEY).toBeUndefined();
    expect(process.env.AZURE_OPENAI_API_KEY).toBeUndefined();
    expect(process.env.MERGEPILOT_SECRET_SOURCE).toBe("local_env");
    expect(process.env.AZURE_KEYVAULT_URL).toBe("https://devagentkv001.vault.azure.net/");
  });

  it("creates a local .env placeholder for local secret storage", () => {
    const localEnvFile = path.join(tmp, "user", ".env");

    ensureMergePilotLocalEnvFile(localEnvFile);

    expect(fs.readFileSync(localEnvFile, "utf8")).toContain("AZURE_OPENAI_API_KEY=");
  });

  it("does not load Key Vault refs unless Key Vault source is selected", () => {
    const userConfig = path.join(tmp, "user", "config.toml");
    writeMergePilotUserConfig({
      llmProvider: "azure",
      azureEndpoint: "https://example.openai.azure.com",
      azureApiKeyRef: "kv://secret/mergepilot-aoai-key",
      azureKeyVaultUrl: "https://devagentkv001.vault.azure.net/",
    }, userConfig);
    process.env.MERGEPILOT_USER_CONFIG_FILE = userConfig;
    process.env.AZURE_OPENAI_ENDPOINT = "https://explicit.openai.azure.com";

    loadDaemonEnv();

    expect(process.env.AZURE_OPENAI_ENDPOINT).toBe("https://explicit.openai.azure.com");
    expect(process.env.AZURE_OPENAI_API_KEY).toBeUndefined();
  });

  it("clears inactive Key Vault secret refs when writing local env config", () => {
    const configFile = path.join(tmp, ".mergepilot", "config.toml");

    writeMergePilotUserConfig({
      llmProvider: "azure",
      secretSource: "local_env",
      azureEndpoint: "https://example.openai.azure.com",
      azureDeployment: "gpt-4o",
      azureApiKeyRef: "kv://secret/mergepilot-aoai-key",
      openaiApiKeyRef: "kv://secret/openai-key",
    }, configFile);

    const content = fs.readFileSync(configFile, "utf8");
    expect(content).toContain("source = \"local_env\"");
    expect(content).toContain("api_key_ref = \"\"");
    expect(content).not.toContain("kv://secret/mergepilot-aoai-key");
    expect(content).not.toContain("kv://secret/openai-key");
  });

  it("prefers configured Key Vault secret references over explicit plaintext secret environment values", () => {
    const userConfig = path.join(tmp, "user", "config.toml");
    writeMergePilotUserConfig({
      llmProvider: "azure",
      secretSource: "key_vault",
      azureEndpoint: "https://example.openai.azure.com",
      azureDeployment: "mergepilot-chat",
      azureApiKeyRef: "kv://secret/mergepilot-aoai-key",
      azureKeyVaultUrl: "https://devagentkv001.vault.azure.net/",
    }, userConfig);
    process.env.MERGEPILOT_USER_CONFIG_FILE = userConfig;
    process.env.AZURE_OPENAI_API_KEY = "plaintext-key";

    loadDaemonEnv();

    expect(process.env.AZURE_OPENAI_API_KEY).toBe("kv://secret/mergepilot-aoai-key");
  });
});
