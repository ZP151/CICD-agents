import type { FastifyInstance } from "fastify";
import {
  type Settings,
} from "@mergepilot/core";
import { keyVaultSecretError } from "../daemonEnv.js";

function gpt5ApiVersionConfigurationError(model: string, apiVersion: string): string | undefined {
  const isGpt5 = /^(?:gpt-?5(?:$|[-_.]|mini|nano|pro))/.test(
    model.trim().toLowerCase(),
  );
  if (!isGpt5 || apiVersion.trim() !== "2025-08-07") return undefined;
  return "Azure GPT-5 model version 2025-08-07 is not a Chat Completions API version. Use 2025-04-01-preview (or the Azure v1 endpoint) in the local MergePilot configuration.";
}

function azureDeploymentConfiguration(
  settings: Settings,
  deployment = settings.azureOpenAiChatDeployment,
): { available: boolean; error: string } {
  if (settings.llmProvider !== "azure") return { available: false, error: "" };
  if (!settings.azureOpenAiEndpoint || !settings.azureOpenAiApiKey || !deployment) {
    return { available: false, error: "Azure OpenAI endpoint, key, or chat deployment is missing." };
  }
  const configurationError = gpt5ApiVersionConfigurationError(deployment, settings.azureOpenAiApiVersion);
  if (configurationError) return { available: false, error: configurationError };
  return { available: true, error: "" };
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
    // This route is polled while the desktop starts and by local runtime
    // recovery. It reports daemon ownership and validates local configuration
    // only. Calling the configured main and narrator deployments here used to
    // create two hidden GPT-5 requests per poll; with a single-entry cache the
    // deployments evicted one another and added seconds of avoidable queueing
    // before a user's first public narrative.
    const azureDeployment = azureDeploymentConfiguration(settings);
    const azureNarrativeDeployment = settings.azureOpenAiNarrativeDeployment;
    const azureNarrator = azureNarrativeDeployment
      ? azureDeploymentConfiguration(settings, azureNarrativeDeployment)
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
