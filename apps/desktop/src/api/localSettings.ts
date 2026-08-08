export type ConversationModelChoice = "built_in" | string;

// Read at call time so Settings / Project Link changes are picked up without a page reload.
export function readLlmConfig(
  conversationModelChoice: ConversationModelChoice = "built_in",
): Record<string, unknown> | undefined {
  try {
    if (conversationModelChoice === "built_in") return undefined;

    const raw = localStorage.getItem("mergepilot_settings");
    if (!raw) return undefined;
    const settings = JSON.parse(raw) as Record<string, unknown>;
    const models = Array.isArray(settings["additionalModels"]) ? settings["additionalModels"] : [];
    const selected = models.find((item) => {
      const model = item as Record<string, unknown>;
      return (
        model["id"] === conversationModelChoice &&
        model["enabled"] === true &&
        model["available"] === true
      );
    }) as Record<string, unknown> | undefined;
    if (!selected) return undefined;

    const provider = selected["provider"] === "openai" ? "openai" : "azure";
    const hasAzureCustomModel = Boolean(
      selected["azureEndpoint"] && selected["azureApiKey"] && selected["azureDeployment"],
    );
    const hasOpenAiCustomModel = Boolean(selected["openaiApiKey"] && selected["openaiModel"]);
    if (provider === "azure" && !hasAzureCustomModel) return undefined;
    if (provider === "openai" && !hasOpenAiCustomModel) return undefined;

    const config: Record<string, unknown> = { llmProvider: provider };
    if (selected["azureEndpoint"]) config["azureEndpoint"] = selected["azureEndpoint"];
    if (selected["azureApiKey"]) config["azureApiKey"] = selected["azureApiKey"];
    if (selected["azureDeployment"]) config["azureDeployment"] = selected["azureDeployment"];
    if (selected["azureNarrativeDeployment"]) config["azureNarrativeDeployment"] = selected["azureNarrativeDeployment"];
    if (selected["azureApiVersion"]) config["azureApiVersion"] = selected["azureApiVersion"];
    if (selected["openaiApiKey"]) config["openaiApiKey"] = selected["openaiApiKey"];
    if (selected["openaiModel"]) config["openaiModel"] = selected["openaiModel"];
    if (selected["openaiNarrativeModel"]) config["openaiNarrativeModel"] = selected["openaiNarrativeModel"];
    return Object.keys(config).length > 0 ? config : undefined;
  } catch {
    return undefined;
  }
}

export function readProjectLinkData(
  projectLinkId: string | undefined,
): Record<string, unknown> | undefined {
  if (!projectLinkId) return undefined;
  try {
    const raw = localStorage.getItem("mergepilot_project_links_v1");
    if (!raw) return undefined;
    const all = JSON.parse(raw) as Array<Record<string, unknown>>;
    const projectLink = all.find((item) => item["id"] === projectLinkId);
    if (!projectLink) return undefined;
    // Credential containment (ADR-0005): never echo a persisted PAT into a
    // request body, including legacy localStorage written before 4a-1.
    return { ...projectLink, adoPat: "" };
  } catch {
    return undefined;
  }
}
