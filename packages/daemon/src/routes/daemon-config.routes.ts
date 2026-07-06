import type { FastifyInstance } from "fastify";
import {
  getDesktopAzureAuthConfig,
  KeyVaultSecrets,
  LLMClient,
  type Settings,
} from "@mergepilot/core";
import type { InlineLlmConfig } from "../chatSession.js";
import {
  mergePilotUserConfigFile,
  keyVaultSecretError,
  readMergePilotUserConfig,
  SYSTEM_AZURE_OPENAI_API_KEY_REF,
  SYSTEM_KEY_VAULT_URL,
  USER_AZURE_OPENAI_API_KEY_REF,
  KEY_VAULT_SECRET_SOURCE,
  LOCAL_ENV_SECRET_SOURCE,
  loadLocalSecretEnvNow,
  writeMergePilotUserConfig,
} from "../daemonEnv.js";
import { z } from "zod";

const LlmConfigSchema = z.object({
  llmProvider:     z.enum(["azure", "openai"]).optional(),
  azureEndpoint:   z.string().optional(),
  azureApiKey:     z.string().optional(),
  azureDeployment: z.string().optional(),
  azureEmbeddingDeployment: z.string().optional(),
  azureApiVersion: z.string().optional(),
  openaiApiKey:    z.string().optional(),
  openaiModel:     z.string().optional(),
}).optional();

const TestLlmConfigSchema = z.object({
  llmConfig: LlmConfigSchema.refine((value) => value !== undefined, {
    message: "llmConfig is required",
  }),
});

const DaemonConfigureSchema = z.object({
  llmProvider:     z.enum(["azure", "openai"]).optional(),
  secretSource:    z.enum(["key_vault", "local_env"]).optional(),
  azureEndpoint:   z.string().optional(),
  azureApiKey:     z.string().optional(),
  azureDeployment: z.string().optional(),
  azureEmbeddingDeployment: z.string().optional(),
  azureApiVersion: z.string().optional(),
  openaiApiKey:    z.string().optional(),
  openaiModel:     z.string().optional(),
  azureStorageAccount: z.string().optional(),
  azureKeyVaultUrl:    z.string().optional(),
  azureCosmosEndpoint: z.string().optional(),
  azureTenantId:       z.string().optional(),
  azureClientId:       z.string().optional(),
  reviewAutoApproveEnabled: z.boolean().optional(),
  reviewStaleAgeHours: z.coerce.number().positive().optional(),
});

function configValueFromEnv(): Record<string, unknown> {
  const azureAuthConfig = getDesktopAzureAuthConfig();
  const userConfig = readMergePilotUserConfig();
  return {
    llmProvider:     process.env["LLM_PROVIDER"] === "openai" ? "openai"
                   : process.env["LLM_PROVIDER"] === "azure"  ? "azure"
                   : process.env["AZURE_OPENAI_ENDPOINT"]     ? "azure"
                   : process.env["OPENAI_API_KEY"]            ? "openai"
                   : "",
    azureDeployment:          process.env["AZURE_OPENAI_CHAT_DEPLOYMENT"] ?? process.env["AZURE_OPENAI_DEPLOYMENT"] ?? "",
    azureEmbeddingDeployment: process.env["AZURE_OPENAI_EMBEDDING_DEPLOYMENT"] ?? "",
    azureApiVersion:          process.env["AZURE_OPENAI_API_VERSION"] ?? "",
    azureEndpoint:            process.env["AZURE_OPENAI_ENDPOINT"] ?? "",
    openaiModel:              process.env["OPENAI_MODEL"] ?? "",
    secretSource:    userConfig.secretSource ?? KEY_VAULT_SECRET_SOURCE,
    aoaiKeyInVault:   (userConfig.azureApiKeyRef ?? "").startsWith("kv://"),
    azureTenantId:       azureAuthConfig.tenantId ?? "",
    azureClientId:       azureAuthConfig.clientId ?? "",
    azureAuthUsesDefaultTenant: azureAuthConfig.usesDefaultTenant,
    azureAuthUsesDefaultClient: azureAuthConfig.usesDefaultClient,
    userConfigPath: mergePilotUserConfigFile(),
    keyVaultSecretError: keyVaultSecretError(),
  };
}

function keyVaultAccessMessage(action: "read" | "write", err: unknown): string {
  const status = (err as { statusCode?: number; status?: number })?.statusCode
    ?? (err as { statusCode?: number; status?: number })?.status;
  if (status === 401 || status === 403) {
    return `Azure Key Vault permission is missing. The signed-in Azure account needs secrets/${action === "read" ? "get" : "set"} access to ${SYSTEM_KEY_VAULT_URL}.`;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("AADSTS65001") || message.toLowerCase().includes("consent")) {
    return `Azure Key Vault consent is missing. Sign in again so MergePilot can request Key Vault access, then ensure the account has secrets/${action === "read" ? "get" : "set"} access to ${SYSTEM_KEY_VAULT_URL}.`;
  }
  if (message.includes("Automatic authentication has been disabled")) {
    return `Azure Key Vault sign-in is required. Sign in again so MergePilot can request Key Vault access, then ensure the account has secrets/${action === "read" ? "get" : "set"} access to ${SYSTEM_KEY_VAULT_URL}.`;
  }
  return `Azure Key Vault secret ${action} failed: ${message}`;
}

async function persistAoaiKeyIfPossible(
  cfg: z.infer<typeof DaemonConfigureSchema>,
  settings: Settings,
): Promise<{ ok: true; ref?: string } | { ok: false; statusCode: number; message: string }> {
  const effectiveKvUrl = cfg.azureKeyVaultUrl ?? settings.azureKeyVaultUrl ?? SYSTEM_KEY_VAULT_URL;
  if (!cfg.azureApiKey || !effectiveKvUrl) return { ok: true };
  try {
    const tempKv = new KeyVaultSecrets(effectiveKvUrl);
    await tempKv.setAoaiKey(cfg.azureApiKey);
    return { ok: true, ref: USER_AZURE_OPENAI_API_KEY_REF };
  } catch (err) {
    const status = (err as { statusCode?: number; status?: number })?.statusCode
      ?? (err as { statusCode?: number; status?: number })?.status;
    return {
      ok: false,
      statusCode: status === 401 || status === 403 ? 403 : 400,
      message: keyVaultAccessMessage("write", err),
    };
  }
}

async function persistModelSecretRefs(
  cfg: z.infer<typeof DaemonConfigureSchema>,
  settings: Settings,
): Promise<
  | { ok: true; refs: { openaiApiKeyRef?: string; azureApiKeyRef?: string } }
  | { ok: false; statusCode: number; message: string }
> {
  if (cfg.secretSource === LOCAL_ENV_SECRET_SOURCE) {
    return { ok: true, refs: {} };
  }
  const storedInKeyVault = await persistAoaiKeyIfPossible(cfg, settings);
  if (!storedInKeyVault.ok) return storedInKeyVault;
  return {
    ok: true,
    refs: {
      azureApiKeyRef: storedInKeyVault.ref ?? (
        cfg.llmProvider === "azure" ? SYSTEM_AZURE_OPENAI_API_KEY_REF : undefined
      ),
    },
  };
}

function mergeUserConfig(
  cfg: z.infer<typeof DaemonConfigureSchema>,
  secretRefs: { openaiApiKeyRef?: string; azureApiKeyRef?: string },
): void {
  const existing = readMergePilotUserConfig();
  writeMergePilotUserConfig({
    ...existing,
    llmProvider: cfg.llmProvider ?? existing.llmProvider,
    secretSource: cfg.secretSource ?? existing.secretSource,
    openaiModel: cfg.openaiModel ?? existing.openaiModel,
    openaiApiKeyRef: secretRefs.openaiApiKeyRef ?? existing.openaiApiKeyRef,
    azureEndpoint: cfg.azureEndpoint ?? existing.azureEndpoint,
    azureDeployment: cfg.azureDeployment ?? existing.azureDeployment,
    azureEmbeddingDeployment: cfg.azureEmbeddingDeployment ?? existing.azureEmbeddingDeployment,
    azureApiVersion: cfg.azureApiVersion ?? existing.azureApiVersion,
    azureApiKeyRef: secretRefs.azureApiKeyRef ?? existing.azureApiKeyRef,
    azureTenantId: cfg.azureTenantId ?? existing.azureTenantId,
    azureClientId: cfg.azureClientId ?? existing.azureClientId,
    azureStorageAccount: cfg.azureStorageAccount ?? existing.azureStorageAccount,
    azureKeyVaultUrl: cfg.azureKeyVaultUrl ?? existing.azureKeyVaultUrl ?? SYSTEM_KEY_VAULT_URL,
    azureCosmosEndpoint: cfg.azureCosmosEndpoint ?? existing.azureCosmosEndpoint,
    reviewAutoApproveEnabled: cfg.reviewAutoApproveEnabled ?? existing.reviewAutoApproveEnabled,
    reviewStaleAgeHours: cfg.reviewStaleAgeHours ?? existing.reviewStaleAgeHours,
  });
}

function patchLiveProcessEnv(
  cfg: z.infer<typeof DaemonConfigureSchema>,
  secretRefs: { openaiApiKeyRef?: string; azureApiKeyRef?: string },
): void {
  if (cfg.llmProvider !== undefined) process.env["LLM_PROVIDER"] = cfg.llmProvider;
  if (cfg.openaiModel !== undefined) process.env["OPENAI_MODEL"] = cfg.openaiModel;
  if (cfg.secretSource !== undefined) process.env["MERGEPILOT_SECRET_SOURCE"] = cfg.secretSource;
  if (cfg.openaiApiKey !== undefined) process.env["OPENAI_API_KEY"] = cfg.openaiApiKey;
  else if (secretRefs.openaiApiKeyRef) process.env["OPENAI_API_KEY"] = secretRefs.openaiApiKeyRef;

  if (cfg.azureEndpoint !== undefined) process.env["AZURE_OPENAI_ENDPOINT"] = cfg.azureEndpoint;
  if (cfg.azureDeployment !== undefined) process.env["AZURE_OPENAI_CHAT_DEPLOYMENT"] = cfg.azureDeployment;
  if (cfg.azureEmbeddingDeployment !== undefined) process.env["AZURE_OPENAI_EMBEDDING_DEPLOYMENT"] = cfg.azureEmbeddingDeployment;
  if (cfg.azureApiVersion !== undefined) process.env["AZURE_OPENAI_API_VERSION"] = cfg.azureApiVersion;
  if (cfg.azureApiKey !== undefined) process.env["AZURE_OPENAI_API_KEY"] = cfg.azureApiKey;
  else if (secretRefs.azureApiKeyRef) process.env["AZURE_OPENAI_API_KEY"] = secretRefs.azureApiKeyRef;
  else if (cfg.secretSource === LOCAL_ENV_SECRET_SOURCE) {
    if (process.env["AZURE_OPENAI_API_KEY"]?.startsWith("kv://")) delete process.env["AZURE_OPENAI_API_KEY"];
    if (process.env["OPENAI_API_KEY"]?.startsWith("kv://")) delete process.env["OPENAI_API_KEY"];
    loadLocalSecretEnvNow();
  }

  if (cfg.azureStorageAccount !== undefined) process.env["AZURE_STORAGE_ACCOUNT"] = cfg.azureStorageAccount;
  if (cfg.azureKeyVaultUrl !== undefined) process.env["AZURE_KEYVAULT_URL"] = cfg.azureKeyVaultUrl;
  else if (secretRefs.azureApiKeyRef) process.env["AZURE_KEYVAULT_URL"] = SYSTEM_KEY_VAULT_URL;
  if (cfg.azureCosmosEndpoint !== undefined) process.env["AZURE_COSMOS_ENDPOINT"] = cfg.azureCosmosEndpoint;
  if (cfg.azureTenantId !== undefined) process.env["MERGEPILOT_AZURE_TENANT_ID"] = cfg.azureTenantId;
  if (cfg.azureClientId !== undefined) process.env["MERGEPILOT_AZURE_CLIENT_ID"] = cfg.azureClientId;
  if (cfg.reviewAutoApproveEnabled !== undefined) {
    process.env["REVIEW_AUTO_APPROVE_ENABLED"] = cfg.reviewAutoApproveEnabled ? "true" : "false";
  }
  if (cfg.reviewStaleAgeHours !== undefined) process.env["REVIEW_STALE_AGE_HOURS"] = String(cfg.reviewStaleAgeHours);
}

function patchLiveSettings(settings: Settings, cfg: z.infer<typeof DaemonConfigureSchema>): boolean {
  const provider = process.env["LLM_PROVIDER"] === "openai" ? "openai" : "azure";
  const isAzure = provider === "azure" && !!(process.env["AZURE_OPENAI_ENDPOINT"] && process.env["AZURE_OPENAI_API_KEY"]);
  const isOpenAI = provider === "openai" && !!(process.env["OPENAI_API_KEY"] && process.env["OPENAI_MODEL"]);
  const nowConfigured = isAzure || isOpenAI;
  const target = settings as Record<string, unknown>;

  target["llmProvider"] = provider;
  target["llmConfigured"] = nowConfigured;
  if (cfg.secretSource !== undefined) target["secretSource"] = cfg.secretSource;
  if (cfg.azureEndpoint !== undefined) target["azureOpenAiEndpoint"] = cfg.azureEndpoint;
  if (cfg.azureApiKey !== undefined) target["azureOpenAiApiKey"] = cfg.azureApiKey || settings.azureOpenAiApiKey;
  if (cfg.azureDeployment !== undefined) target["azureOpenAiChatDeployment"] = cfg.azureDeployment || settings.azureOpenAiChatDeployment;
  if (cfg.azureEmbeddingDeployment !== undefined) {
    target["azureOpenAiEmbeddingDeployment"] = cfg.azureEmbeddingDeployment || settings.azureOpenAiEmbeddingDeployment;
  }
  if (cfg.azureApiVersion !== undefined) target["azureOpenAiApiVersion"] = cfg.azureApiVersion || settings.azureOpenAiApiVersion;
  if (cfg.openaiApiKey !== undefined) target["openAiApiKey"] = cfg.openaiApiKey;
  if (cfg.openaiModel !== undefined) target["openAiModel"] = cfg.openaiModel;
  if (cfg.azureStorageAccount !== undefined) target["azureStorageAccount"] = cfg.azureStorageAccount;
  if (cfg.azureKeyVaultUrl !== undefined) target["azureKeyVaultUrl"] = cfg.azureKeyVaultUrl;
  if (cfg.azureCosmosEndpoint !== undefined) target["azureCosmosEndpoint"] = cfg.azureCosmosEndpoint;
  if (cfg.reviewAutoApproveEnabled !== undefined) target["reviewAutoApproveEnabled"] = cfg.reviewAutoApproveEnabled;
  if (cfg.reviewStaleAgeHours !== undefined) target["reviewStaleAgeHours"] = cfg.reviewStaleAgeHours;
  return nowConfigured;
}

export function registerDaemonConfigRoutes(
  app: FastifyInstance,
  {
    settings,
    buildInlineLlmSettings,
  }: {
    settings: Settings;
    buildInlineLlmSettings: (override?: InlineLlmConfig) => Settings;
  },
): void {
  app.get("/daemon/config", async () => ({
    ...configValueFromEnv(),
    azureStorageAccount: settings.azureStorageAccount ?? "",
    azureKeyVaultUrl:    settings.azureKeyVaultUrl ?? "",
    azureCosmosEndpoint: settings.azureCosmosEndpoint ?? "",
    reviewAutoApproveEnabled: settings.reviewAutoApproveEnabled,
    reviewStaleAgeHours: settings.reviewStaleAgeHours,
  }));

  app.post("/daemon/configure", async (req, reply) => {
    const parsed = DaemonConfigureSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const cfg = parsed.data;
    const secretRefResult = await persistModelSecretRefs(cfg, settings);
    if (!secretRefResult.ok) {
      return reply.code(secretRefResult.statusCode).send({
        ok: false,
        code: "key_vault_permission_required",
        message: secretRefResult.message,
      });
    }
    const secretRefs = secretRefResult.refs;
    mergeUserConfig(cfg, secretRefs);
    patchLiveProcessEnv(cfg, secretRefs);
    const nowConfigured = patchLiveSettings(settings, cfg);

    const cloudProjectLinkStore = !!settings.azureStorageAccount;
    return {
      ok: true,
      llmConfigured: nowConfigured,
      cloudProjectLinkStore,
      cloudSecrets:      settings.secretSource !== LOCAL_ENV_SECRET_SOURCE && !!(settings.azureKeyVaultUrl),
      cloudSessions:     !!(settings.azureCosmosEndpoint),
    };
  });

  app.post("/daemon/test-llm", async (req, reply) => {
    const parsed = TestLlmConfigSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const effectiveSettings = buildInlineLlmSettings(parsed.data.llmConfig);
    if (!effectiveSettings.llmConfigured) {
      return reply.code(400).send({ ok: false, message: "Model configuration is incomplete." });
    }
    try {
      const llm = new LLMClient(effectiveSettings);
      await llm.chat({
        messages: [
          { role: "system", content: "Reply with ok." },
          { role: "user", content: "health" },
        ],
        temperature: 0,
        maxTokens: 1,
        retries: 1,
      });
      return { ok: true, message: "Connection verified." };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ ok: false, message });
    }
  });
}
