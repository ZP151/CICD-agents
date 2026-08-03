import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

/**
 * A fresh desktop installation targets the GPT-5 mini deployment name, but
 * contains no endpoint or credential. Users can replace this with their own
 * Azure deployment in their local MergePilot config.
 */
export const PROJECT_CHAT_DEPLOYMENT = "gpt-5-mini";
export const PROJECT_EMBEDDING_DEPLOYMENT = "mergepilot-embeddings";
/** Azure Chat Completions data-plane preview that supports GPT-5 tool use. */
export const GPT5_AZURE_CHAT_API_VERSION = "2025-04-01-preview";

const SettingsSchema = z.object({
  llmProvider: z.enum(["azure", "openai"]).default("azure"),
  azureOpenAiEndpoint: z.string().default(""),
  azureOpenAiApiVersion: z.string().default(GPT5_AZURE_CHAT_API_VERSION),
  azureOpenAiApiKey: z.string().default(""),
  azureOpenAiChatDeployment: z.string().default(PROJECT_CHAT_DEPLOYMENT),
  /** Optional low-latency deployment used only for public action narration. */
  azureOpenAiNarrativeDeployment: z.string().default(""),
  azureOpenAiEmbeddingDeployment: z.string().default(PROJECT_EMBEDDING_DEPLOYMENT),
  openAiApiKey: z.string().default(""),
  openAiModel: z.string().default(""),
  /** Optional low-latency model used only for public action narration. */
  openAiNarrativeModel: z.string().default(""),
  openAiEmbeddingModel: z.string().default("text-embedding-3-small"),
  secretSource: z.enum(["key_vault", "local_env"]).default("local_env"),
  azureDevOpsOrg: z.string().default(""),
  azureDevOpsProject: z.string().default(""),
  runtimeHost: z.string().default("127.0.0.1"),
  runtimePort: z.coerce.number().default(8787),
  runtimeIdleTimeoutSec: z.coerce.number().default(1800),
  runtimeDataDir: z.string().default(""),
  runtimeLogLevel: z.string().default("info"),
  plannerMaxSteps: z.coerce.number().default(12),
  plannerToolBudget: z.coerce.number().default(24),
  plannerTokenBudget: z.coerce.number().default(12000),
  indexMaxFileBytes: z.coerce.number().default(512 * 1024),
  indexEmbedBatch: z.coerce.number().default(64),
  telemetryEnabled: z.coerce.boolean().default(false),
  appInsightsConnectionString: z.string().default(""),
  reviewAutoApproveEnabled: z.coerce.boolean().default(true),
  reviewStaleAgeHours: z.coerce.number().positive().default(24),
  // ── Azure cloud persistence (optional — falls back to local JSON when unset) ──
  /** Azure Storage account name for Project Link persistence (Table Storage) */
  azureStorageAccount: z.string().default(""),
  /** Azure Key Vault URL for secret storage, e.g. https://my-vault.vault.azure.net/ */
  azureKeyVaultUrl: z.string().default(""),
  /** Azure Cosmos DB endpoint for chat session persistence */
  azureCosmosEndpoint: z.string().default(""),
  /** Cosmos DB session TTL in seconds (default 90 days) */
  azureCosmosSessionTtlSec: z.coerce.number().default(7_776_000),
});

export type Settings = z.infer<typeof SettingsSchema> & {
  readonly dataDir: string;
  readonly runtimeUrl: string;
  readonly llmConfigured: boolean;
};

let cached: Settings | null = null;

function readEnv(): Record<string, string | undefined> {
  return {
    llmProvider: process.env.LLM_PROVIDER,
    azureOpenAiEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
    azureOpenAiApiVersion: process.env.AZURE_OPENAI_API_VERSION,
    azureOpenAiApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAiChatDeployment: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
    azureOpenAiNarrativeDeployment: process.env.AZURE_OPENAI_NARRATIVE_DEPLOYMENT,
    azureOpenAiEmbeddingDeployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
    openAiApiKey: process.env.OPENAI_API_KEY,
    openAiModel: process.env.OPENAI_MODEL,
    openAiNarrativeModel: process.env.OPENAI_NARRATIVE_MODEL,
    openAiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
    secretSource: process.env.MERGEPILOT_SECRET_SOURCE,
    azureDevOpsOrg: process.env.AZURE_DEVOPS_ORG,
    azureDevOpsProject: process.env.AZURE_DEVOPS_PROJECT,
    runtimeHost: process.env.RUNTIME_HOST,
    runtimePort: process.env.RUNTIME_PORT,
    runtimeIdleTimeoutSec: process.env.RUNTIME_IDLE_TIMEOUT_SEC,
    runtimeDataDir: process.env.RUNTIME_DATA_DIR,
    runtimeLogLevel: process.env.RUNTIME_LOG_LEVEL,
    plannerMaxSteps: process.env.PLANNER_MAX_STEPS,
    plannerToolBudget: process.env.PLANNER_TOOL_BUDGET,
    plannerTokenBudget: process.env.PLANNER_TOKEN_BUDGET,
    indexMaxFileBytes: process.env.INDEX_MAX_FILE_BYTES,
    indexEmbedBatch: process.env.INDEX_EMBED_BATCH,
    telemetryEnabled: process.env.TELEMETRY_ENABLED,
    appInsightsConnectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    reviewAutoApproveEnabled: process.env.REVIEW_AUTO_APPROVE_ENABLED,
    reviewStaleAgeHours: process.env.REVIEW_STALE_AGE_HOURS,
    azureStorageAccount:      process.env.AZURE_STORAGE_ACCOUNT,
    azureKeyVaultUrl:         process.env.AZURE_KEYVAULT_URL,
    azureCosmosEndpoint:      process.env.AZURE_COSMOS_ENDPOINT,
    azureCosmosSessionTtlSec: process.env.AZURE_COSMOS_SESSION_TTL_SEC,
  };
}

function defaultDataDir(): string {
  return path.join(os.homedir(), ".mergepilot");
}

export function getSettings(): Settings {
  if (cached) return cached;
  const raw = readEnv();
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined && v !== ""),
  );
  const parsed = SettingsSchema.parse(cleaned);
  const llmProvider =
    parsed.llmProvider === "openai" || (!parsed.azureOpenAiEndpoint && parsed.openAiApiKey)
      ? "openai"
      : "azure";
  const dataDir = parsed.runtimeDataDir || defaultDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  cached = {
    ...parsed,
    llmProvider,
    dataDir,
    runtimeUrl: `http://${parsed.runtimeHost}:${parsed.runtimePort}`,
    llmConfigured: llmProvider === "azure"
      ? Boolean(parsed.azureOpenAiEndpoint && parsed.azureOpenAiApiKey)
      : Boolean(parsed.openAiApiKey && parsed.openAiModel),
  };
  return cached;
}

export function resetSettingsForTests(): void {
  cached = null;
}
