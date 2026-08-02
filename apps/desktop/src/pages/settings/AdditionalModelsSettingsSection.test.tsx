import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdditionalModelsSettingsSection, AvailableModelsDescription } from "./AdditionalModelsSettingsSection.js";
import type { AdditionalModelConfig } from "./settingsTypes.js";

function model(overrides: Partial<AdditionalModelConfig> = {}): AdditionalModelConfig {
  return {
    id: overrides.id ?? "model-1",
    provider: overrides.provider ?? "azure",
    label: overrides.label ?? "Team review model",
    enabled: overrides.enabled ?? true,
    available: overrides.available ?? true,
    testedAt: overrides.testedAt ?? "",
    azureEndpoint: overrides.azureEndpoint ?? "",
    azureApiKey: overrides.azureApiKey ?? "",
    azureDeployment: overrides.azureDeployment ?? "gpt-4o",
    azureNarrativeDeployment: overrides.azureNarrativeDeployment ?? "",
    azureApiVersion: overrides.azureApiVersion ?? "2024-08-01-preview",
    openaiApiKey: overrides.openaiApiKey ?? "",
    openaiModel: overrides.openaiModel ?? "",
    openaiNarrativeModel: overrides.openaiNarrativeModel ?? "",
    testError: overrides.testError ?? "",
  };
}

describe("AvailableModelsDescription", () => {
  it("renders available Chat models as wrapping badges instead of one long comma list", () => {
    const html = renderToStaticMarkup(
      <AvailableModelsDescription
        models={[
          model({
            id: "long-azure-model",
            label: "Very long Azure OpenAI model name for enterprise review workflows",
          }),
          model({ id: "openai-model", provider: "openai", label: "", openaiModel: "gpt-4.1-mini" }),
        ]}
      />,
    );

    expect(html).toContain("settings-model-badge-list");
    expect(html).toContain("settings-model-badge");
    expect(html).toContain("aria-label=\"Available Chat models\"");
    expect(html).toContain("Very long Azure OpenAI model name");
    expect(html).toContain("gpt-4.1-mini");
    expect(html).not.toContain(", ");
  });

  it("keeps the empty state compact", () => {
    const html = renderToStaticMarkup(<AvailableModelsDescription models={[]} />);

    expect(html).toContain("No custom models are available yet.");
    expect(html).not.toContain("settings-model-badge");
  });
});

describe("AdditionalModelsSettingsSection actions", () => {
  it("uses the shared workbench action states for model operations", () => {
    const configuredModel = model();
    const html = renderToStaticMarkup(
      <AdditionalModelsSettingsSection
        additionalModels={[configuredModel]}
        availableAdditionalModels={[configuredModel]}
        editingModelId={null}
        modelDraft={configuredModel}
        testingModelId={configuredModel.id}
        onAddModel={() => undefined}
        onCancelModelEdit={() => undefined}
        onDeleteModel={() => undefined}
        onDisableModel={() => undefined}
        onEditModel={() => undefined}
        onModelDraftChange={() => undefined}
        onModelDraftDirectChange={() => undefined}
        onSaveModelDraft={() => undefined}
        onTestModel={() => undefined}
      />,
    );

    expect(html).toContain("Add model");
    expect(html).toContain("workbench-loading-indicator");
    expect(html).toContain("Delete");
    expect(html).not.toContain("settings-text-button");
  });
});
