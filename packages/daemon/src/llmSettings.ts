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
  return {
    ...base,
    llmProvider: provider,
    azureOpenAiEndpoint: isAzure ? (override.azureEndpoint ?? base.azureOpenAiEndpoint) : base.azureOpenAiEndpoint,
    azureOpenAiApiKey: isAzure ? (override.azureApiKey ?? base.azureOpenAiApiKey) : base.azureOpenAiApiKey,
    azureOpenAiChatDeployment: isAzure ? (override.azureDeployment ?? base.azureOpenAiChatDeployment) : base.azureOpenAiChatDeployment,
    azureOpenAiNarrativeDeployment: isAzure ? (override.azureNarrativeDeployment ?? base.azureOpenAiNarrativeDeployment) : base.azureOpenAiNarrativeDeployment,
    azureOpenAiApiVersion: isAzure ? (override.azureApiVersion ?? base.azureOpenAiApiVersion) : base.azureOpenAiApiVersion,
    openAiApiKey: !isAzure ? (override.openaiApiKey ?? base.openAiApiKey) : base.openAiApiKey,
    openAiModel: !isAzure ? (override.openaiModel ?? base.openAiModel) : base.openAiModel,
    openAiNarrativeModel: !isAzure ? (override.openaiNarrativeModel ?? base.openAiNarrativeModel) : base.openAiNarrativeModel,
    llmConfigured: isAzure
      ? Boolean(
          (override.azureEndpoint ?? base.azureOpenAiEndpoint) &&
          (override.azureApiKey ?? base.azureOpenAiApiKey),
        )
      : Boolean(
          (override.openaiApiKey ?? base.openAiApiKey) &&
          (override.openaiModel ?? base.openAiModel),
        ),
  };
}
