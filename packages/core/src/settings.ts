import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

const SettingsSchema = z.object({
  azureOpenAiEndpoint: z.string().default(""),
  azureOpenAiApiVersion: z.string().default("2024-08-01-preview"),
  azureOpenAiApiKey: z.string().default(""),
  azureOpenAiChatDeployment: z.string().default("gpt-4o"),
  azureOpenAiEmbeddingDeployment: z.string().default("text-embedding-3-small"),
  azureDevOpsOrg: z.string().default(""),
  azureDevOpsProject: z.string().default(""),
  runtimeHost: z.string().default("127.0.0.1"),
  runtimePort: z.coerce.number().default(8787),
  runtimeIdleTimeoutSec: z.coerce.number().default(1800),
  runtimeDataDir: z.string().default(""),
  runtimeLogLevel: z.string().default("info"),
  plannerMaxSteps: z.coerce.number().default(12),
  plannerTokenBudget: z.coerce.number().default(12000),
  indexMaxFileBytes: z.coerce.number().default(512 * 1024),
  indexEmbedBatch: z.coerce.number().default(64),
  telemetryEnabled: z.coerce.boolean().default(false),
  appInsightsConnectionString: z.string().default(""),
});

export type Settings = z.infer<typeof SettingsSchema> & {
  readonly dataDir: string;
  readonly runtimeUrl: string;
  readonly llmConfigured: boolean;
};

let cached: Settings | null = null;

function readEnv(): Record<string, string | undefined> {
  return {
    azureOpenAiEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
    azureOpenAiApiVersion: process.env.AZURE_OPENAI_API_VERSION,
    azureOpenAiApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAiChatDeployment: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
    azureOpenAiEmbeddingDeployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
    azureDevOpsOrg: process.env.AZURE_DEVOPS_ORG,
    azureDevOpsProject: process.env.AZURE_DEVOPS_PROJECT,
    runtimeHost: process.env.RUNTIME_HOST,
    runtimePort: process.env.RUNTIME_PORT,
    runtimeIdleTimeoutSec: process.env.RUNTIME_IDLE_TIMEOUT_SEC,
    runtimeDataDir: process.env.RUNTIME_DATA_DIR,
    runtimeLogLevel: process.env.RUNTIME_LOG_LEVEL,
    plannerMaxSteps: process.env.PLANNER_MAX_STEPS,
    plannerTokenBudget: process.env.PLANNER_TOKEN_BUDGET,
    indexMaxFileBytes: process.env.INDEX_MAX_FILE_BYTES,
    indexEmbedBatch: process.env.INDEX_EMBED_BATCH,
    telemetryEnabled: process.env.TELEMETRY_ENABLED,
    appInsightsConnectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
  };
}

function defaultDataDir(): string {
  return path.join(os.homedir(), ".cicd-agent");
}

export function getSettings(): Settings {
  if (cached) return cached;
  const raw = readEnv();
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined && v !== ""),
  );
  const parsed = SettingsSchema.parse(cleaned);
  const dataDir = parsed.runtimeDataDir || defaultDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  cached = {
    ...parsed,
    dataDir,
    runtimeUrl: `http://${parsed.runtimeHost}:${parsed.runtimePort}`,
    llmConfigured: Boolean(parsed.azureOpenAiEndpoint && parsed.azureOpenAiApiKey),
  };
  return cached;
}

export function resetSettingsForTests(): void {
  cached = null;
}
