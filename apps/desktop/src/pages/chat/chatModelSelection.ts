export type ConversationModelChoice = "built_in" | string;

// The built-in Azure deployment is configured by the installer/runtime.  Keep
// the always-visible composer label aligned with its documented default rather
// than advertising the retired GPT-4o fallback.
export const DEFAULT_CONVERSATION_MODEL_LABEL = "GPT-5 mini";

export interface CustomConversationModel {
  id: string;
  label: string;
  provider: "azure" | "openai";
}

export function readCustomConversationModels(): CustomConversationModel[] {
  try {
    const raw = localStorage.getItem("mergepilot_settings");
    if (!raw) return [];
    const settings = JSON.parse(raw) as Record<string, unknown>;
    const models = Array.isArray(settings["additionalModels"]) ? settings["additionalModels"] : [];
    return models.flatMap((item): CustomConversationModel[] => {
      const model = item as Record<string, unknown>;
      if (model["enabled"] !== true) return [];
      if (model["available"] !== true) return [];
      const id = String(model["id"] ?? "").trim();
      if (!id) return [];
      const provider = model["provider"] === "openai" ? "openai" : "azure";
      const label = String(model["label"] ?? "").trim();
      if (provider === "openai") {
        const openaiModel = String(model["openaiModel"] ?? "").trim();
        const key = String(model["openaiApiKey"] ?? "").trim();
        if (!key || !openaiModel) return [];
        return [{ id, label: label || `OpenAI · ${openaiModel}`, provider }];
      }
      const deployment = String(model["azureDeployment"] ?? "").trim();
      const endpoint = String(model["azureEndpoint"] ?? "").trim();
      const key = String(model["azureApiKey"] ?? "").trim();
      if (!endpoint || !key || !deployment) return [];
      return [{ id, label: label || `Azure OpenAI · ${deployment}`, provider }];
    });
  } catch {
    return [];
  }
}

export function readInitialConversationModelChoice(): ConversationModelChoice {
  const stored = localStorage.getItem("mergepilot_active_model");
  if (!stored || stored === "built_in") return "built_in";
  return readCustomConversationModels().some((model) => model.id === stored) ? stored : "built_in";
}
