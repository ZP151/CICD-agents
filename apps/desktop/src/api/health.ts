import { RUNTIME_URL } from "./runtime.js";

export interface HealthStatus {
  ok: boolean;
  uptimeSec?: number;
  llmConfigured?: boolean;
  llmProvider?: "azure" | "openai";
  envSource?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
  azureEndpoint?: string;
  azureDeploymentAvailable?: boolean;
  azureDeploymentError?: string;
  keyVaultSecretError?: string | null;
  cloudProjectLinkStore?: boolean;
  cloudSecrets?: boolean;
  cloudSessions?: boolean;
}

export async function fetchHealth(): Promise<HealthStatus> {
  const r = await fetch(`${RUNTIME_URL}/healthz`);
  if (!r.ok) throw new Error(`/healthz HTTP ${r.status}`);
  return r.json() as Promise<HealthStatus>;
}
