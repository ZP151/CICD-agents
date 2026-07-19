import type { FastifyInstance } from "fastify";
import type { Settings } from "@mergepilot/core";
import { keyVaultSecretError } from "../daemonEnv.js";

let azureDeploymentProbeCache: {
  key: string;
  checkedAt: number;
  available: boolean;
  error: string;
} | null = null;

function azureDeploymentProbeKey(settings: Settings): string {
  return [
    settings.azureOpenAiEndpoint,
    settings.azureOpenAiApiVersion,
    settings.azureOpenAiChatDeployment,
    settings.azureOpenAiApiKey ? settings.azureOpenAiApiKey.slice(0, 8) : "",
  ].join("|");
}

async function probeAzureDeployment(settings: Settings): Promise<{ available: boolean; error: string }> {
  if (settings.llmProvider !== "azure") return { available: false, error: "" };
  if (!settings.azureOpenAiEndpoint || !settings.azureOpenAiApiKey || !settings.azureOpenAiChatDeployment) {
    return { available: false, error: "Azure OpenAI endpoint, key, or chat deployment is missing." };
  }

  const key = azureDeploymentProbeKey(settings);
  const now = Date.now();
  if (azureDeploymentProbeCache?.key === key && now - azureDeploymentProbeCache.checkedAt < 30_000) {
    return {
      available: azureDeploymentProbeCache.available,
      error: azureDeploymentProbeCache.error,
    };
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 3000);
  try {
    const endpoint = settings.azureOpenAiEndpoint.replace(/\/+$/, "");
    const deployment = encodeURIComponent(settings.azureOpenAiChatDeployment);
    const apiVersion = encodeURIComponent(settings.azureOpenAiApiVersion);
    const response = await fetch(`${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`, {
      method: "POST",
      headers: {
        "api-key": settings.azureOpenAiApiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "Reply with ok." },
          { role: "user", content: "health" },
        ],
        max_tokens: 1,
        temperature: 0,
      }),
      signal: ctrl.signal,
    });
    const body = response.ok ? "" : (await response.text()).trim();
    const error = response.ok
      ? ""
      : response.status === 404
        ? "Azure OpenAI deployment was not found on this resource."
        : body || `Azure OpenAI deployment check failed with HTTP ${response.status}.`;
    const result = { available: response.ok, error };
    azureDeploymentProbeCache = { key, checkedAt: now, ...result };
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const result = { available: false, error };
    azureDeploymentProbeCache = { key, checkedAt: now, ...result };
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export function registerHealthRoutes(
  app: FastifyInstance,
  {
    settings,
    startedAt,
    envSourceLabel,
  }: {
    settings: Settings;
    startedAt: number;
    envSourceLabel: () => string;
  },
): void {
  app.get("/healthz", async () => {
    const azureDeployment = await probeAzureDeployment(settings);
    const cloudProjectLinkStore = !!settings.azureStorageAccount;
    return {
      ok: true,
      version: process.env.MERGEPILOT_DAEMON_VERSION ?? process.env.npm_package_version ?? "0.1.0",
      runtimeMode: process.env.MERGEPILOT_RUNTIME_MODE ?? "source",
      desktopVersion: process.env.MERGEPILOT_DESKTOP_VERSION ?? "",
      buildSha: process.env.MERGEPILOT_BUILD_SHA ?? process.env.GITHUB_SHA ?? "",
      pid: process.pid,
      execPath: process.execPath,
      uptimeSec: (Date.now() - startedAt) / 1000,
      llmConfigured: settings.llmConfigured,
      llmProvider: settings.llmProvider,
      envSource: envSourceLabel(),
      azureDeployment: settings.azureOpenAiChatDeployment,
      azureApiVersion: settings.azureOpenAiApiVersion,
      azureEndpoint: settings.azureOpenAiEndpoint,
      azureDeploymentAvailable: azureDeployment.available,
      azureDeploymentError: azureDeployment.error,
      keyVaultSecretError: keyVaultSecretError(),
      cloudProjectLinkStore,
      cloudSecrets:      settings.secretSource !== "local_env" && !!(settings.azureKeyVaultUrl),
      cloudSessions:     !!(settings.azureCosmosEndpoint),
    };
  });
}
