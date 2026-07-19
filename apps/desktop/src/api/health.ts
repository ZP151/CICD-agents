import { RUNTIME_URL, messageFromErrorResponse } from "./runtime.js";

export interface HealthStatus {
  ok: boolean;
  version?: string;
  runtimeMode?: string;
  desktopVersion?: string;
  buildSha?: string;
  pid?: number;
  execPath?: string;
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
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Daemon health HTTP ${r.status}`, r));
  return r.json() as Promise<HealthStatus>;
}
