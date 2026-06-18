import { ensureRunning, RuntimeClient } from "./runtimeClient.js";

export const PAT_KEYRING_SERVICE = "mergepilot";
export const PAT_KEYRING_USER = "azure-devops-pat";

export async function createRuntimeClient(): Promise<RuntimeClient> {
  const url = await ensureRunning();
  return new RuntimeClient(url);
}
