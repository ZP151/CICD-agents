import type { AuthUser, LlmProviderConfig } from "../../api";

export const STORAGE_KEY = "mergepilot_settings";

export interface AppSettings {
  workMode: "coding" | "everyday";
  defaultOpenDestination: "vscode" | "system" | "none";
  terminalShell: "powershell" | "cmd" | "git_bash";
  language: "auto" | "en" | "zh-CN";
  inferenceSpeed: "fast" | "balanced" | "deep";
  codeReviewMode: "inline" | "detached";
  suggestedPrompts: boolean;
  additionalModels: AdditionalModelConfig[];
  azureTenantId: string;
  azureClientId: string;
}

export type AdditionalModelProvider = "azure" | "openai";

export interface AdditionalModelConfig {
  id: string;
  provider: AdditionalModelProvider;
  label: string;
  enabled: boolean;
  available: boolean;
  testedAt: string;
  testError: string;
  azureEndpoint: string;
  azureApiKey: string;
  azureDeployment: string;
  azureApiVersion: string;
  openaiApiKey: string;
  openaiModel: string;
}

export const DEFAULTS: AppSettings = {
  workMode: "coding",
  defaultOpenDestination: "vscode",
  terminalShell: "powershell",
  language: "auto",
  inferenceSpeed: "fast",
  codeReviewMode: "inline",
  suggestedPrompts: true,
  additionalModels: [],
  azureTenantId: "",
  azureClientId: "",
};

export type DaemonStatus = "unknown" | "checking" | "configured" | "unconfigured" | "unreachable";

export function createEmptyAdditionalModel(): AdditionalModelConfig {
  return {
    id: makeModelId(),
    provider: "azure",
    label: "",
    enabled: false,
    available: false,
    testedAt: "",
    testError: "",
    azureEndpoint: "",
    azureApiKey: "",
    azureDeployment: "",
    azureApiVersion: "",
    openaiApiKey: "",
    openaiModel: "",
  };
}

export function normalizeAdditionalModels(value: unknown): AdditionalModelConfig[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = item as Record<string, unknown>;
    return {
      id: cleanString(raw.id) || makeModelId(),
      provider: raw.provider === "openai" ? "openai" : "azure",
      label: cleanString(raw.label),
      enabled: raw.enabled === true,
      available: raw.available === true,
      testedAt: cleanString(raw.testedAt),
      testError: cleanString(raw.testError),
      azureEndpoint: cleanString(raw.azureEndpoint),
      azureApiKey: cleanString(raw.azureApiKey),
      azureDeployment: cleanString(raw.azureDeployment),
      azureApiVersion: cleanString(raw.azureApiVersion),
      openaiApiKey: cleanString(raw.openaiApiKey),
      openaiModel: cleanString(raw.openaiModel),
    };
  });
}

export function additionalModelName(model: AdditionalModelConfig): string {
  const fallback = model.provider === "openai" ? model.openaiModel : model.azureDeployment;
  return model.label.trim() || fallback.trim() || "Untitled model";
}

export function additionalModelDescription(model: AdditionalModelConfig): string {
  const provider = model.provider === "openai" ? "OpenAI" : "Azure OpenAI";
  const configured =
    model.provider === "openai"
      ? Boolean(model.openaiApiKey.trim() && model.openaiModel.trim())
      : Boolean(
          model.azureEndpoint.trim() && model.azureApiKey.trim() && model.azureDeployment.trim(),
        );
  if (!configured) return `${provider} · missing required fields`;
  if (model.available) return `${provider} · available`;
  if (model.testError) return `${provider} · test failed`;
  return `${provider} · not tested`;
}

export function additionalModelIsConfigured(model: AdditionalModelConfig): boolean {
  return model.provider === "openai"
    ? Boolean(model.openaiApiKey.trim() && model.openaiModel.trim())
    : Boolean(
        model.azureEndpoint.trim() && model.azureApiKey.trim() && model.azureDeployment.trim(),
      );
}

export function llmConfigFromModel(model: AdditionalModelConfig): LlmProviderConfig {
  return model.provider === "openai"
    ? {
        llmProvider: "openai",
        openaiApiKey: model.openaiApiKey.trim(),
        openaiModel: model.openaiModel.trim(),
      }
    : {
        llmProvider: "azure",
        azureEndpoint: model.azureEndpoint.trim(),
        azureApiKey: model.azureApiKey.trim(),
        azureDeployment: model.azureDeployment.trim(),
        azureApiVersion: model.azureApiVersion.trim(),
      };
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings> & Record<string, unknown>;
      const stored = { ...DEFAULTS, ...parsed };
      return {
        workMode: stored.workMode,
        defaultOpenDestination: stored.defaultOpenDestination,
        terminalShell: stored.terminalShell,
        language: stored.language,
        inferenceSpeed: stored.inferenceSpeed,
        codeReviewMode: stored.codeReviewMode,
        suggestedPrompts: stored.suggestedPrompts,
        additionalModels: normalizeAdditionalModels(parsed.additionalModels),
        azureTenantId: cleanString(parsed.azureTenantId),
        azureClientId: cleanString(parsed.azureClientId),
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function accountLabel(authUser: AuthUser): string {
  if (!authUser.authenticated) return "Not signed in";
  return authUser.name ?? authUser.upn ?? "Signed in";
}

function makeModelId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `model-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
