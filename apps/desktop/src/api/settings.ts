import { RUNTIME_URL, messageFromErrorResponse } from "./runtime.js";

export interface DaemonConfigPayload {
  llmProvider?: "azure" | "openai";
  secretSource?: "key_vault" | "local_env";
  azureEndpoint?: string;
  azureApiKey?: string;
  azureDeployment?: string;
  azureNarrativeDeployment?: string;
  azureEmbeddingDeployment?: string;
  azureApiVersion?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  openaiNarrativeModel?: string;
  azureStorageAccount?: string;
  azureKeyVaultUrl?: string;
  azureCosmosEndpoint?: string;
  azureTenantId?: string;
  azureClientId?: string;
  reviewAutoApproveEnabled?: boolean;
  reviewStaleAgeHours?: number;
}

export type LlmProviderConfig = Pick<
  DaemonConfigPayload,
  "llmProvider" | "azureEndpoint" | "azureApiKey" | "azureDeployment" | "azureNarrativeDeployment" | "azureEmbeddingDeployment" | "azureApiVersion" | "openaiApiKey" | "openaiModel" | "openaiNarrativeModel"
>;

export interface DaemonConfig {
  llmProvider: string;
  secretSource: "key_vault" | "local_env";
  azureDeployment: string;
  azureNarrativeDeployment: string;
  azureEmbeddingDeployment: string;
  azureApiVersion: string;
  azureEndpoint: string;
  openaiModel: string;
  openaiNarrativeModel: string;
  aoaiKeyInVault: boolean;
  azureStorageAccount: string;
  azureKeyVaultUrl: string;
  azureCosmosEndpoint: string;
  azureTenantId: string;
  azureClientId: string;
  azureAuthUsesDefaultTenant: boolean;
  azureAuthUsesDefaultClient: boolean;
  reviewAutoApproveEnabled: boolean;
  reviewStaleAgeHours: number;
  keyVaultSecretError?: string | null;
}

export interface AzureDevOpsRemoteSuggestion {
  remoteName: string;
  remoteUrl: string;
  adoOrgUrl: string;
  adoProject: string;
  adoRepoName: string;
}

export async function fetchGitBranchesFromDaemon(repoPath: string): Promise<string[]> {
  try {
    const r = await fetch(`${RUNTIME_URL}/git/branches?repoPath=${encodeURIComponent(repoPath)}`);
    if (!r.ok) return [];
    const data = (await r.json()) as { branches: string[] };
    return data.branches ?? [];
  } catch {
    return [];
  }
}

export async function fetchAzureDevOpsRemoteSuggestionFromDaemon(repoPath: string): Promise<AzureDevOpsRemoteSuggestion | null> {
  try {
    const r = await fetch(`${RUNTIME_URL}/git/azure-devops-remote?repoPath=${encodeURIComponent(repoPath)}`);
    if (!r.ok) return null;
    const data = (await r.json()) as { suggestion: AzureDevOpsRemoteSuggestion | null };
    return data.suggestion ?? null;
  } catch {
    return null;
  }
}

export async function fetchDaemonConfig(): Promise<DaemonConfig | null> {
  try {
    const r = await fetch(`${RUNTIME_URL}/daemon/config`);
    if (!r.ok) return null;
    return (await r.json()) as DaemonConfig;
  } catch {
    return null;
  }
}

export async function configureDaemon(
  cfg: DaemonConfigPayload,
): Promise<{ ok: boolean; llmConfigured: boolean; cloudProjectLinkStore?: boolean; cloudSecrets?: boolean; cloudSessions?: boolean }> {
  const r = await fetch(`${RUNTIME_URL}/daemon/configure`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cfg),
  });
  if (!r.ok) {
    throw new Error(await messageFromErrorResponse(`Save settings HTTP ${r.status}`, r));
  }
  return (await r.json()) as { ok: boolean; llmConfigured: boolean; cloudProjectLinkStore?: boolean; cloudSecrets?: boolean; cloudSessions?: boolean };
}

export async function testLlmConfig(
  llmConfig: LlmProviderConfig,
): Promise<{ ok: boolean; message: string }> {
  const r = await fetch(`${RUNTIME_URL}/daemon/test-llm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ llmConfig }),
  });
  const body = await r.clone().json().catch(() => ({})) as { ok?: boolean; message?: string; error?: unknown };
  if (!r.ok || !body.ok) {
    throw new Error(
      body.message ??
        (body.error ? String(body.error) : await messageFromErrorResponse(`Test model HTTP ${r.status}`, r)),
    );
  }
  return { ok: true, message: body.message ?? "Connection verified." };
}
