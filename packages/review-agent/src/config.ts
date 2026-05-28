import { z } from "zod";

const ConfigSchema = z.object({
  port: z.coerce.number().default(8080),
  host: z.string().default("0.0.0.0"),
  webhookSecret: z.string().default(""),
  azureOpenAiEndpoint: z.string().default(""),
  azureOpenAiApiKey: z.string().default(""),
  azureOpenAiApiVersion: z.string().default("2024-08-01-preview"),
  azureOpenAiChatDeployment: z.string().default("gpt-4o"),
  azureDevOpsOrg: z.string().default(""),
  azureDevOpsProject: z.string().default(""),
  servicePrincipalSecret: z.string().default(""),
  servicePrincipalClientId: z.string().default(""),
  servicePrincipalTenantId: z.string().default(""),
  keyVaultName: z.string().default(""),
  tablesConnectionString: z.string().default(""),
  appInsightsConnectionString: z.string().default(""),
  reviewMaxFilesPerPr: z.coerce.number().default(40),
  reviewAutoApproveEnabled: z.coerce.boolean().default(false),
  reviewAutoApproveReviewerId: z.string().default(""),
  reviewAutoApproveMaxChangedFiles: z.coerce.number().default(8),
  reviewAutoApproveTargetBranches: z.array(z.string()).default(["main"]),
  reviewAutoApproveSensitivePaths: z.array(z.string()).default([
    ".github/",
    "infra/",
    "deploy/",
    "security/",
    "auth/",
    "migrations/",
  ]),
});

export type ReviewAgentConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): ReviewAgentConfig {
  return ConfigSchema.parse({
    port: process.env.PORT,
    host: process.env.HOST,
    webhookSecret: process.env.ADO_WEBHOOK_SECRET,
    azureOpenAiEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
    azureOpenAiApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAiApiVersion: process.env.AZURE_OPENAI_API_VERSION,
    azureOpenAiChatDeployment: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
    azureDevOpsOrg: process.env.AZURE_DEVOPS_ORG,
    azureDevOpsProject: process.env.AZURE_DEVOPS_PROJECT,
    servicePrincipalSecret: process.env.ADO_SPN_SECRET,
    servicePrincipalClientId: process.env.ADO_SPN_CLIENT_ID,
    servicePrincipalTenantId: process.env.ADO_SPN_TENANT_ID,
    keyVaultName: process.env.KEY_VAULT_NAME,
    tablesConnectionString: process.env.AZURE_TABLES_CONNECTION_STRING,
    appInsightsConnectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    reviewMaxFilesPerPr: process.env.REVIEW_MAX_FILES_PER_PR,
    reviewAutoApproveEnabled: process.env.REVIEW_AUTO_APPROVE_ENABLED,
    reviewAutoApproveReviewerId: process.env.REVIEW_AUTO_APPROVE_REVIEWER_ID,
    reviewAutoApproveMaxChangedFiles: process.env.REVIEW_AUTO_APPROVE_MAX_CHANGED_FILES,
    reviewAutoApproveTargetBranches: csv(process.env.REVIEW_AUTO_APPROVE_TARGET_BRANCHES, ["main"]),
    reviewAutoApproveSensitivePaths: csv(process.env.REVIEW_AUTO_APPROVE_SENSITIVE_PATHS, [
      ".github/",
      "infra/",
      "deploy/",
      "security/",
      "auth/",
      "migrations/",
    ]),
  });
}

function csv(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}
