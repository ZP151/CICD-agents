import nodeFs from "node:fs";
import nodeOs from "node:os";
import nodePath from "node:path";
import { KeyVaultSecrets } from "@mergepilot/core";

let activeConfigFile: string | null = null;
let loaded = false;

export const USER_AZURE_OPENAI_API_KEY_REF = "kv://aoai-key";
export const LOCAL_ENV_SECRET_SOURCE = "local_env";
export const KEY_VAULT_SECRET_SOURCE = "key_vault";

let secretHydrationError: string | null = null;

const CONFIG_TEMPLATE = `# MergePilot user configuration
# Secrets default to the local .env file. Enable Key Vault in Settings only when
# this Azure account has the required secrets/get and secrets/set permissions.

[llm]
provider = "azure"

[secrets]
source = "local_env"

[azure_openai]
endpoint = ""
chat_deployment = "gpt-5-mini"
# Optional low-latency deployment used only for the public action narrative.
narrative_deployment = ""
embedding_deployment = "text-embedding-3-small"
api_version = "2024-08-01-preview"
api_key_ref = ""

[azure_auth]
tenant_id = ""
client_id = ""

[cloud]
storage_account = ""
key_vault_url = ""
cosmos_endpoint = ""

[review]
auto_approve_enabled = true
stale_age_hours = 24
`;

export interface MergePilotUserConfig {
  llmProvider?: "azure" | "openai" | "";
  secretSource?: "key_vault" | "local_env";
  openaiModel?: string;
  openaiNarrativeModel?: string;
  openaiApiKeyRef?: string;
  azureEndpoint?: string;
  azureDeployment?: string;
  azureNarrativeDeployment?: string;
  azureEmbeddingDeployment?: string;
  azureApiVersion?: string;
  azureApiKeyRef?: string;
  azureTenantId?: string;
  azureClientId?: string;
  azureStorageAccount?: string;
  azureKeyVaultUrl?: string;
  azureCosmosEndpoint?: string;
  reviewAutoApproveEnabled?: boolean;
  reviewStaleAgeHours?: number;
}

export function mergePilotHomeDir(): string {
  return process.env.MERGEPILOT_HOME || nodePath.join(nodeOs.homedir(), ".mergepilot");
}

export function mergePilotUserConfigFile(): string {
  return process.env.MERGEPILOT_USER_CONFIG_FILE || nodePath.join(mergePilotHomeDir(), "config.toml");
}

export function mergePilotLocalEnvFile(): string {
  if (process.env.MERGEPILOT_LOCAL_ENV_FILE) return process.env.MERGEPILOT_LOCAL_ENV_FILE;
  if (process.env.MERGEPILOT_USER_CONFIG_FILE) {
    return nodePath.join(nodePath.dirname(process.env.MERGEPILOT_USER_CONFIG_FILE), ".env");
  }
  return nodePath.join(mergePilotHomeDir(), ".env");
}

export function ensureMergePilotLocalEnvFile(envFile = mergePilotLocalEnvFile()): void {
  nodeFs.mkdirSync(nodePath.dirname(envFile), { recursive: true });
  if (!nodeFs.existsSync(envFile)) {
    nodeFs.writeFileSync(
      envFile,
      [
        "# MergePilot local secrets",
        "# Keep this file on your machine only. Do not commit it.",
        "AZURE_OPENAI_API_KEY=",
        "OPENAI_API_KEY=",
        "",
      ].join("\n"),
      "utf8",
    );
  }
}

export function ensureMergePilotUserConfigFile(configFile = mergePilotUserConfigFile()): void {
  nodeFs.mkdirSync(nodePath.dirname(configFile), { recursive: true });
  if (!nodeFs.existsSync(configFile)) {
    nodeFs.writeFileSync(configFile, CONFIG_TEMPLATE, "utf8");
  }
}

export function readMergePilotUserConfig(
  configFile = mergePilotUserConfigFile(),
): MergePilotUserConfig {
  if (!nodeFs.existsSync(configFile)) return {};
  return configFromToml(nodeFs.readFileSync(configFile, "utf8"));
}

export function writeMergePilotUserConfig(
  config: MergePilotUserConfig,
  configFile = mergePilotUserConfigFile(),
): void {
  nodeFs.mkdirSync(nodePath.dirname(configFile), { recursive: true });
  nodeFs.writeFileSync(configFile, configToToml(config), "utf8");
}

export function loadDaemonEnv(): void {
  if (loaded) return;
  loaded = true;
  const isTestRuntime = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  const configFile = mergePilotUserConfigFile();
  if (!isTestRuntime) {
    ensureMergePilotUserConfigFile(configFile);
  }
  const explicitProcessEnv = new Set(Object.keys(process.env));

  if (nodeFs.existsSync(configFile)) {
    activeConfigFile = configFile;
  }
  const config = readMergePilotUserConfig(configFile);
  if (config.secretSource === LOCAL_ENV_SECRET_SOURCE) {
    if (!isTestRuntime) {
      ensureMergePilotLocalEnvFile();
    }
    loadLocalEnvSecrets(explicitProcessEnv);
  }
  applyUserConfigToEnv(config, explicitProcessEnv);
}

export async function hydrateDaemonSecretEnv(): Promise<void> {
  const config = readMergePilotUserConfig();
  if (config.secretSource === LOCAL_ENV_SECRET_SOURCE) {
    secretHydrationError = null;
    return;
  }
  await hydrateSecretEnvKey("AZURE_OPENAI_API_KEY", config);
}

export function keyVaultSecretError(): string | null {
  return secretHydrationError;
}

export function envSourceLabel(): string {
  return activeConfigFile ?? "process environment";
}

export function resetDaemonEnvForTests(): void {
  activeConfigFile = null;
  loaded = false;
}

export function loadLocalSecretEnvNow(explicitProcessEnv = new Set<string>()): void {
  ensureMergePilotLocalEnvFile();
  loadLocalEnvSecrets(explicitProcessEnv);
}

function applyUserConfigToEnv(config: MergePilotUserConfig, explicitProcessEnv: Set<string>): void {
  const wantsOpenAi = config.llmProvider === "openai" || !!config.openaiModel;
  const wantsAzure = config.llmProvider === "azure" || !!config.azureEndpoint;
  const localEnvSecrets = config.secretSource === LOCAL_ENV_SECRET_SOURCE;
  const entries: Array<[string, string | number | boolean | undefined]> = [
    ["LLM_PROVIDER", config.llmProvider],
    ["OPENAI_MODEL", wantsOpenAi ? config.openaiModel : undefined],
    ["OPENAI_NARRATIVE_MODEL", wantsOpenAi ? config.openaiNarrativeModel : undefined],
    ["OPENAI_API_KEY", localEnvSecrets ? undefined : wantsOpenAi ? config.openaiApiKeyRef : undefined],
    ["AZURE_OPENAI_ENDPOINT", wantsAzure ? config.azureEndpoint : undefined],
    ["AZURE_OPENAI_CHAT_DEPLOYMENT", wantsAzure ? config.azureDeployment : undefined],
    ["AZURE_OPENAI_NARRATIVE_DEPLOYMENT", wantsAzure ? config.azureNarrativeDeployment : undefined],
    ["AZURE_OPENAI_EMBEDDING_DEPLOYMENT", wantsAzure ? config.azureEmbeddingDeployment : undefined],
    ["AZURE_OPENAI_API_VERSION", wantsAzure ? config.azureApiVersion : undefined],
    ["AZURE_OPENAI_API_KEY", localEnvSecrets ? undefined : wantsAzure ? config.azureApiKeyRef : undefined],
    ["MERGEPILOT_SECRET_SOURCE", config.secretSource],
    ["MERGEPILOT_AZURE_TENANT_ID", config.azureTenantId],
    ["MERGEPILOT_AZURE_CLIENT_ID", config.azureClientId],
    ["AZURE_STORAGE_ACCOUNT", config.azureStorageAccount],
    ["AZURE_KEYVAULT_URL", config.azureKeyVaultUrl],
    ["AZURE_COSMOS_ENDPOINT", config.azureCosmosEndpoint],
    ["REVIEW_AUTO_APPROVE_ENABLED", config.reviewAutoApproveEnabled],
    ["REVIEW_STALE_AGE_HOURS", config.reviewStaleAgeHours],
  ];
  for (const [key, value] of entries) {
    if (value === undefined || value === "") continue;
    const configSecretRefWins = (key === "OPENAI_API_KEY" || key === "AZURE_OPENAI_API_KEY")
      && String(value).startsWith("kv://");
    if (explicitProcessEnv.has(key) && !configSecretRefWins) continue;
    process.env[key] = String(value);
  }
  if (!explicitProcessEnv.has("LLM_PROVIDER") && !process.env["LLM_PROVIDER"]) {
    if (config.azureEndpoint) process.env["LLM_PROVIDER"] = "azure";
    else if (config.openaiModel) process.env["LLM_PROVIDER"] = "openai";
  }
}

function loadLocalEnvSecrets(explicitProcessEnv: Set<string>): void {
  const envFile = mergePilotLocalEnvFile();
  if (!nodeFs.existsSync(envFile)) return;
  const allowedSecretKeys = new Set(["AZURE_OPENAI_API_KEY", "OPENAI_API_KEY"]);
  for (const rawLine of nodeFs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!allowedSecretKeys.has(key) || explicitProcessEnv.has(key)) continue;
    const value = parseEnvValue(line.slice(eq + 1).trim());
    if (value) process.env[key] = value;
  }
}

async function hydrateSecretEnvKey(
  key: "OPENAI_API_KEY" | "AZURE_OPENAI_API_KEY",
  config: MergePilotUserConfig = {},
): Promise<void> {
  const value = process.env[key] ?? "";
  try {
    const secret = await readKeyVaultSecret(value, config);
    if (secret) {
      process.env[key] = secret;
      secretHydrationError = null;
    } else if (value.startsWith("kv://")) {
      delete process.env[key];
    }
  } catch (err) {
    if (value.startsWith("kv://")) delete process.env[key];
    secretHydrationError = keyVaultAccessMessage("read", err);
  }
}

async function readKeyVaultSecret(ref: string, config: MergePilotUserConfig): Promise<string | null> {
  if (!ref.startsWith("kv://")) return null;
  const vaultUrl = config.azureKeyVaultUrl;
  if (!vaultUrl) {
    throw new Error("A Key Vault URL is required when Key Vault is selected as the secret source.");
  }
  const kv = new KeyVaultSecrets(vaultUrl);
  const reader = kv as KeyVaultSecrets & {
    getAoaiKeyByRef?: (secretRef: string) => Promise<string | null>;
  };
  return reader.getAoaiKeyByRef ? reader.getAoaiKeyByRef(ref) : kv.getAoaiKey();
}

function configFromToml(content: string): MergePilotUserConfig {
  const sections: Record<string, Record<string, string>> = {};
  let current = "";
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const section = /^\[([^\]]+)\]$/.exec(line);
    if (section) {
      current = section[1] ?? "";
      sections[current] ??= {};
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0 || !current) continue;
    const key = line.slice(0, eq).trim();
    const value = parseTomlValue(line.slice(eq + 1).trim());
    sections[current] ??= {};
    const values = sections[current];
    if (values) values[key] = value;
  }
  const staleAge = Number(sections["review"]?.["stale_age_hours"]);
  return {
    llmProvider: providerValue(sections["llm"]?.["provider"]),
    secretSource: secretSourceValue(sections["secrets"]?.["source"]),
    openaiModel: sections["openai"]?.["model"],
    openaiNarrativeModel: sections["openai"]?.["narrative_model"],
    openaiApiKeyRef: sections["openai"]?.["api_key_ref"],
    azureEndpoint: sections["azure_openai"]?.["endpoint"],
    azureDeployment: sections["azure_openai"]?.["chat_deployment"],
    azureNarrativeDeployment: sections["azure_openai"]?.["narrative_deployment"],
    azureEmbeddingDeployment: sections["azure_openai"]?.["embedding_deployment"],
    azureApiVersion: sections["azure_openai"]?.["api_version"],
    azureApiKeyRef: sections["azure_openai"]?.["api_key_ref"],
    azureTenantId: sections["azure_auth"]?.["tenant_id"],
    azureClientId: sections["azure_auth"]?.["client_id"],
    azureStorageAccount: sections["cloud"]?.["storage_account"],
    azureKeyVaultUrl: sections["cloud"]?.["key_vault_url"],
    azureCosmosEndpoint: sections["cloud"]?.["cosmos_endpoint"],
    reviewAutoApproveEnabled: booleanValue(sections["review"]?.["auto_approve_enabled"]),
    reviewStaleAgeHours: Number.isFinite(staleAge) && staleAge > 0 ? staleAge : undefined,
  };
}

function configToToml(config: MergePilotUserConfig): string {
  const secretSource = config.secretSource ?? LOCAL_ENV_SECRET_SOURCE;
  const azureApiKeyRef = secretSource === KEY_VAULT_SECRET_SOURCE
    ? config.azureApiKeyRef ?? ""
    : "";
  const openaiApiKeyRef = secretSource === KEY_VAULT_SECRET_SOURCE
    ? config.openaiApiKeyRef ?? ""
    : "";
  return [
    "# MergePilot user configuration",
    "# Secrets default to the local .env file. Enable Key Vault in Settings only when",
    "# this Azure account has the required secrets/get and secrets/set permissions.",
    "",
    "[llm]",
    `provider = ${tomlString(config.llmProvider ?? "azure")}`,
    "",
    "[secrets]",
    `source = ${tomlString(secretSource)}`,
    "",
    "[openai]",
    `model = ${tomlString(config.openaiModel ?? "")}`,
    `narrative_model = ${tomlString(config.openaiNarrativeModel ?? "")}`,
    `api_key_ref = ${tomlString(openaiApiKeyRef)}`,
    "",
    "[azure_openai]",
    `endpoint = ${tomlString(config.azureEndpoint ?? "")}`,
    `chat_deployment = ${tomlString(config.azureDeployment ?? "gpt-5-mini")}`,
    `narrative_deployment = ${tomlString(config.azureNarrativeDeployment ?? "")}`,
    `embedding_deployment = ${tomlString(config.azureEmbeddingDeployment ?? "text-embedding-3-small")}`,
    `api_version = ${tomlString(config.azureApiVersion ?? "2024-08-01-preview")}`,
    `api_key_ref = ${tomlString(azureApiKeyRef)}`,
    "",
    "[azure_auth]",
    `tenant_id = ${tomlString(config.azureTenantId ?? "")}`,
    `client_id = ${tomlString(config.azureClientId ?? "")}`,
    "",
    "[cloud]",
    `storage_account = ${tomlString(config.azureStorageAccount ?? "")}`,
    `key_vault_url = ${tomlString(config.azureKeyVaultUrl ?? "")}`,
    `cosmos_endpoint = ${tomlString(config.azureCosmosEndpoint ?? "")}`,
    "",
    "[review]",
    `auto_approve_enabled = ${config.reviewAutoApproveEnabled ?? true}`,
    `stale_age_hours = ${config.reviewStaleAgeHours ?? 24}`,
    "",
  ].join("\n");
}

function parseTomlValue(value: string): string {
  if (value === "true" || value === "false") return value;
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return value;
}

function parseEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function providerValue(value: string | undefined): "azure" | "openai" | "" | undefined {
  return value === "azure" || value === "openai" || value === "" ? value : undefined;
}

function secretSourceValue(value: string | undefined): "key_vault" | "local_env" | undefined {
  return value === KEY_VAULT_SECRET_SOURCE || value === LOCAL_ENV_SECRET_SOURCE ? value : undefined;
}

function booleanValue(value: string | undefined): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function keyVaultAccessMessage(action: "read" | "write", err: unknown): string {
  const status = (err as { statusCode?: number; status?: number })?.statusCode
    ?? (err as { statusCode?: number; status?: number })?.status;
  if (status === 401 || status === 403) {
    return `Azure Key Vault permission is missing. The signed-in Azure account needs secrets/${action === "read" ? "get" : "set"} access to the Key Vault configured locally.`;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (
    message.includes("AADSTS650057") ||
    message.toLowerCase().includes("invalid_resource") ||
    message.toLowerCase().includes("invalid client")
  ) {
    return `Azure Key Vault app permission is not configured. Keep Settings > Account > Secret source set to Local .env, or ask an Azure administrator to grant the MergePilot app delegated Key Vault access and secrets/${action === "read" ? "get" : "set"} permission to the configured vault.`;
  }
  if (message.includes("AADSTS65001") || message.toLowerCase().includes("consent")) {
    return `Azure Key Vault consent is missing. Sign in again so MergePilot can request Key Vault access, then ensure the account has secrets/${action === "read" ? "get" : "set"} access to the configured vault.`;
  }
  if (message.includes("Automatic authentication has been disabled")) {
    return `Azure Key Vault sign-in is required. Sign in again so MergePilot can request Key Vault access, then ensure the account has secrets/${action === "read" ? "get" : "set"} access to the configured vault.`;
  }
  return `Azure Key Vault secret ${action} failed: ${message}`;
}
