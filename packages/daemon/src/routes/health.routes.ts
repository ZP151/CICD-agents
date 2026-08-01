import type { FastifyInstance } from "fastify";
import {
  completionTemperature,
  completionTokenLimit,
  isReasoningDeployment,
  type Settings,
} from "@mergepilot/core";
import { keyVaultSecretError } from "../daemonEnv.js";

let azureDeploymentProbeCache: {
  key: string;
  checkedAt: number;
  available: boolean;
  error: string;
} | null = null;

function gpt5ApiVersionConfigurationError(model: string, apiVersion: string): string | undefined {
  const isGpt5 = /^(?:gpt-?5(?:$|[-_.]|mini|nano|pro))/.test(
    model.trim().toLowerCase(),
  );
  if (!isGpt5 || apiVersion.trim() !== "2025-08-07") return undefined;
  return "Azure GPT-5 model version 2025-08-07 is not a Chat Completions API version. Use 2025-04-01-preview (or the Azure v1 endpoint) in the local MergePilot configuration.";
}

function azureDeploymentProbeKey(settings: Settings, deployment: string): string {
  return [
    settings.azureOpenAiEndpoint,
    settings.azureOpenAiApiVersion,
    deployment,
    settings.azureOpenAiApiKey ? settings.azureOpenAiApiKey.slice(0, 8) : "",
  ].join("|");
}

async function probeAzureDeployment(
  settings: Settings,
  deployment = settings.azureOpenAiChatDeployment,
): Promise<{ available: boolean; error: string }> {
  if (settings.llmProvider !== "azure") return { available: false, error: "" };
  if (!settings.azureOpenAiEndpoint || !settings.azureOpenAiApiKey || !deployment) {
    return { available: false, error: "Azure OpenAI endpoint, key, or chat deployment is missing." };
  }
  const configurationError = gpt5ApiVersionConfigurationError(deployment, settings.azureOpenAiApiVersion);
  if (configurationError) return { available: false, error: configurationError };

  const key = azureDeploymentProbeKey(settings, deployment);
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
    const encodedDeployment = encodeURIComponent(deployment);
    const apiVersion = encodeURIComponent(settings.azureOpenAiApiVersion);
    const response = await fetch(`${endpoint}/openai/deployments/${encodedDeployment}/chat/completions?api-version=${apiVersion}`, {
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
        // GPT-5 reasoning deployments can consume a small completion budget
        // before emitting the one-word probe response. A one-token check is
        // therefore reported as a false deployment outage by Azure.
        ...completionTokenLimit(deployment, 128),
        ...completionTemperature(deployment, 0),
        ...(isReasoningDeployment(deployment)
          ? { reasoning_effort: "minimal" }
          : {}),
      }),
      signal: ctrl.signal,
    });
    const body = response.ok ? "" : (await response.text()).trim();
    const probeReachedOutputLimit = /max_tokens or model output limit was reached/i.test(body);
    const error = response.ok || probeReachedOutputLimit
      ? ""
      : response.status === 404
        ? "Azure OpenAI deployment was not found on this resource."
        : body || `Azure OpenAI deployment check failed with HTTP ${response.status}.`;
    // Azure only returns this specific output-limit response after accepting
    // the endpoint, deployment, authentication and parameter shape. Treat it
    // as an available deployment rather than disabling desktop chat.
    const result = { available: response.ok || probeReachedOutputLimit, error };
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
    const azureNarrativeDeployment = settings.azureOpenAiNarrativeDeployment;
    const azureNarrator = azureNarrativeDeployment
      ? await probeAzureDeployment(settings, azureNarrativeDeployment)
      : undefined;
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
      azureNarrativeDeployment,
      azureNarrativeDeploymentAvailable: azureNarrator?.available,
      azureNarrativeDeploymentError: azureNarrator?.error ?? "",
      keyVaultSecretError: keyVaultSecretError(),
      cloudProjectLinkStore,
      cloudSecrets:      settings.secretSource !== "local_env" && !!(settings.azureKeyVaultUrl),
      cloudSessions:     !!(settings.azureCosmosEndpoint),
    };
  });
}
