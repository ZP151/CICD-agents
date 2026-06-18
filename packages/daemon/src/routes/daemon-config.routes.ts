import type { FastifyInstance } from "fastify";
import nodeFs from "node:fs";
import nodeOs from "node:os";
import nodePath from "node:path";
import {
  getDesktopAzureAuthConfig,
  KeyVaultSecrets,
  LLMClient,
  type Settings,
} from "@mergepilot/core";
import type { InlineLlmConfig } from "../chatSession.js";
import { z } from "zod";

const LlmConfigSchema = z.object({
  llmProvider:     z.enum(["azure", "openai"]).optional(),
  azureEndpoint:   z.string().optional(),
  azureApiKey:     z.string().optional(),
  azureDeployment: z.string().optional(),
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
  azureEndpoint:   z.string().optional(),
  azureApiKey:     z.string().optional(),
  azureDeployment: z.string().optional(),
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
  return {
    llmProvider:     process.env["LLM_PROVIDER"] === "openai" ? "openai"
                   : process.env["LLM_PROVIDER"] === "azure"  ? "azure"
                   : process.env["AZURE_OPENAI_ENDPOINT"]     ? "azure"
                   : process.env["OPENAI_API_KEY"]            ? "openai"
                   : "",
    azureDeployment:  process.env["AZURE_OPENAI_CHAT_DEPLOYMENT"] ?? process.env["AZURE_OPENAI_DEPLOYMENT"] ?? "",
    azureApiVersion:  process.env["AZURE_OPENAI_API_VERSION"] ?? "",
    azureEndpoint:    process.env["AZURE_OPENAI_ENDPOINT"] ?? "",
    openaiModel:      process.env["OPENAI_MODEL"] ?? "",
    aoaiKeyInVault:   (process.env["AZURE_OPENAI_API_KEY"] ?? "").startsWith("kv://"),
    azureTenantId:       azureAuthConfig.tenantId ?? "",
    azureClientId:       azureAuthConfig.clientId ?? "",
    azureAuthUsesDefaultTenant: azureAuthConfig.usesDefaultTenant,
    azureAuthUsesDefaultClient: azureAuthConfig.usesDefaultClient,
  };
}

function buildEnvLines(
  cfg: z.infer<typeof DaemonConfigureSchema>,
  settings: Settings,
): string[] {
  const lines: string[] = [];
  const effectiveKvUrl = cfg.azureKeyVaultUrl ?? settings.azureKeyVaultUrl;

  if (cfg.llmProvider === "azure" || (!cfg.llmProvider && cfg.azureEndpoint)) {
    lines.push("LLM_PROVIDER=azure");
    if (cfg.azureEndpoint)   lines.push(`AZURE_OPENAI_ENDPOINT=${cfg.azureEndpoint}`);
    if (cfg.azureDeployment) lines.push(`AZURE_OPENAI_CHAT_DEPLOYMENT=${cfg.azureDeployment}`);
    if (cfg.azureApiVersion) lines.push(`AZURE_OPENAI_API_VERSION=${cfg.azureApiVersion}`);
    if (cfg.azureApiKey) {
      lines.push(effectiveKvUrl ? "AZURE_OPENAI_API_KEY=kv://aoai-key" : `AZURE_OPENAI_API_KEY=${cfg.azureApiKey}`);
    }
  } else if (cfg.llmProvider === "openai" || cfg.openaiApiKey) {
    lines.push("LLM_PROVIDER=openai");
    if (cfg.openaiApiKey) lines.push(`OPENAI_API_KEY=${cfg.openaiApiKey}`);
    if (cfg.openaiModel)  lines.push(`OPENAI_MODEL=${cfg.openaiModel}`);
  }

  if (cfg.azureStorageAccount !== undefined) lines.push(`AZURE_STORAGE_ACCOUNT=${cfg.azureStorageAccount}`);
  if (cfg.azureKeyVaultUrl    !== undefined) lines.push(`AZURE_KEYVAULT_URL=${cfg.azureKeyVaultUrl}`);
  if (cfg.azureCosmosEndpoint !== undefined) lines.push(`AZURE_COSMOS_ENDPOINT=${cfg.azureCosmosEndpoint}`);
  if (cfg.azureTenantId       !== undefined) lines.push(`MERGEPILOT_AZURE_TENANT_ID=${cfg.azureTenantId}`);
  if (cfg.azureClientId       !== undefined) lines.push(`MERGEPILOT_AZURE_CLIENT_ID=${cfg.azureClientId}`);
  if (cfg.reviewAutoApproveEnabled !== undefined) lines.push(`REVIEW_AUTO_APPROVE_ENABLED=${cfg.reviewAutoApproveEnabled ? "true" : "false"}`);
  if (cfg.reviewStaleAgeHours !== undefined) lines.push(`REVIEW_STALE_AGE_HOURS=${cfg.reviewStaleAgeHours}`);
  return lines;
}

async function persistAoaiKeyIfPossible(
  cfg: z.infer<typeof DaemonConfigureSchema>,
  settings: Settings,
): Promise<boolean> {
  const effectiveKvUrl = cfg.azureKeyVaultUrl ?? settings.azureKeyVaultUrl;
  if (!cfg.azureApiKey || !effectiveKvUrl) return false;
  try {
    const tempKv = new KeyVaultSecrets(effectiveKvUrl);
    await tempKv.setAoaiKey(cfg.azureApiKey);
    return true;
  } catch {
    return false;
  }
}

function mergeEnvFile(envFile: string, lines: string[]): void {
  if (lines.length === 0) return;
  const newKeys = new Set(lines.map((line) => line.split("=")[0] ?? ""));
  let existing: string[] = [];
  if (nodeFs.existsSync(envFile)) {
    existing = nodeFs.readFileSync(envFile, "utf8")
      .split("\n")
      .filter((line) => {
        const key = (line.split("=")[0] ?? "").trim();
        return key && !newKeys.has(key);
      });
  }
  nodeFs.mkdirSync(nodePath.dirname(envFile), { recursive: true });
  nodeFs.writeFileSync(envFile, [...existing, ...lines].join("\n") + "\n", "utf8");
  for (const line of lines) {
    const eqIdx = line.indexOf("=");
    if (eqIdx > 0) process.env[line.slice(0, eqIdx)] = line.slice(eqIdx + 1);
  }
}

function patchLiveSettings(settings: Settings, cfg: z.infer<typeof DaemonConfigureSchema>): boolean {
  const provider = process.env["LLM_PROVIDER"] === "openai" ? "openai" : "azure";
  const isAzure = provider === "azure" && !!(process.env["AZURE_OPENAI_ENDPOINT"] && process.env["AZURE_OPENAI_API_KEY"]);
  const isOpenAI = provider === "openai" && !!(process.env["OPENAI_API_KEY"] && process.env["OPENAI_MODEL"]);
  const nowConfigured = isAzure || isOpenAI;
  const target = settings as Record<string, unknown>;

  target["llmProvider"] = provider;
  target["llmConfigured"] = nowConfigured;
  if (cfg.azureEndpoint !== undefined) target["azureOpenAiEndpoint"] = cfg.azureEndpoint;
  if (cfg.azureApiKey !== undefined) target["azureOpenAiApiKey"] = cfg.azureApiKey || settings.azureOpenAiApiKey;
  if (cfg.azureDeployment !== undefined) target["azureOpenAiChatDeployment"] = cfg.azureDeployment || settings.azureOpenAiChatDeployment;
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
    const envFile = nodePath.join(nodeOs.homedir(), ".mergepilot", ".env");
    const storedInKeyVault = await persistAoaiKeyIfPossible(cfg, settings);
    const lines = buildEnvLines(cfg, settings).map((line) => (
      line === "AZURE_OPENAI_API_KEY=kv://aoai-key" && !storedInKeyVault
        ? `AZURE_OPENAI_API_KEY=${cfg.azureApiKey ?? ""}`
        : line
    ));
    mergeEnvFile(envFile, lines);
    const nowConfigured = patchLiveSettings(settings, cfg);

    const cloudProjectLinkStore = !!settings.azureStorageAccount;
    return {
      ok: true,
      llmConfigured: nowConfigured,
      cloudProjectLinkStore,
      cloudSecrets:      !!(settings.azureKeyVaultUrl),
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
