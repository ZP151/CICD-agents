import { getSettings, type Settings } from "@mergepilot/core";

export interface InlineLlmConfig {
  llmProvider?: "azure" | "openai";
  azureEndpoint?: string;
  azureApiKey?: string;
  azureDeployment?: string;
  azureNarrativeDeployment?: string;
  azureApiVersion?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  openaiNarrativeModel?: string;
}

/**
 * Merge inline LLM config from the desktop client on top of runtime defaults.
 * The selected provider decides which inline values can affect runtime calls.
 */
export function buildEffectiveLlmSettings(override?: InlineLlmConfig): Settings {
  const base = getSettings();
  if (!override) return base;
  const isAzure = (override.llmProvider ?? "azure") === "azure";
  const provider: "azure" | "openai" = isAzure ? "azure" : "openai";
  // Model settings restored by the desktop intentionally omit the secret.
  // Treat an empty inline field as absent so the daemon-owned `.env` / Key
  // Vault credential remains the source of truth after an application restart.
  const configured = (value: string | undefined, fallback: string): string => value?.trim() || fallback;
  return {
    ...base,
    llmProvider: provider,
    azureOpenAiEndpoint: isAzure ? configured(override.azureEndpoint, base.azureOpenAiEndpoint) : base.azureOpenAiEndpoint,
    azureOpenAiApiKey: isAzure ? configured(override.azureApiKey, base.azureOpenAiApiKey) : base.azureOpenAiApiKey,
    azureOpenAiChatDeployment: isAzure ? configured(override.azureDeployment, base.azureOpenAiChatDeployment) : base.azureOpenAiChatDeployment,
    azureOpenAiNarrativeDeployment: isAzure ? configured(override.azureNarrativeDeployment, base.azureOpenAiNarrativeDeployment) : base.azureOpenAiNarrativeDeployment,
    azureOpenAiApiVersion: isAzure ? configured(override.azureApiVersion, base.azureOpenAiApiVersion) : base.azureOpenAiApiVersion,
    openAiApiKey: !isAzure ? configured(override.openaiApiKey, base.openAiApiKey) : base.openAiApiKey,
    openAiModel: !isAzure ? configured(override.openaiModel, base.openAiModel) : base.openAiModel,
    openAiNarrativeModel: !isAzure ? configured(override.openaiNarrativeModel, base.openAiNarrativeModel) : base.openAiNarrativeModel,
    llmConfigured: isAzure
      ? Boolean(
          configured(override.azureEndpoint, base.azureOpenAiEndpoint) &&
          configured(override.azureApiKey, base.azureOpenAiApiKey),
        )
      : Boolean(
          configured(override.openaiApiKey, base.openAiApiKey) &&
          configured(override.openaiModel, base.openAiModel),
        ),
  };
}
