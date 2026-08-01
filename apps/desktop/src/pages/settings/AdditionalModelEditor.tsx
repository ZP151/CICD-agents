import { SegmentedChoice, SettingsRow, TextInput, ToggleSwitch } from "./SettingsControls.js";
import type { AdditionalModelConfig, AdditionalModelProvider } from "./settingsTypes.js";

export function AdditionalModelEditor({
  editingModelId,
  modelDraft,
  testingModelId,
  onCancel,
  onDraftChange,
  onDraftDirectChange,
  onSave,
  onTest,
}: {
  editingModelId: string;
  modelDraft: AdditionalModelConfig;
  testingModelId: string | null;
  onCancel: () => void;
  onDraftChange: <K extends keyof AdditionalModelConfig>(
    key: K,
    value: AdditionalModelConfig[K],
  ) => void;
  onDraftDirectChange: (updater: (model: AdditionalModelConfig) => AdditionalModelConfig) => void;
  onSave: () => void;
  onTest: (model: AdditionalModelConfig, source?: "draft" | "saved") => void;
}): JSX.Element {
  return (
    <div className="settings-list rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]/45">
      <SettingsRow title={editingModelId === "new" ? "Add model" : "Edit model"}>
        <SegmentedChoice<AdditionalModelProvider>
          value={modelDraft.provider}
          onChange={(value) => onDraftChange("provider", value)}
          options={[
            { label: "Azure OpenAI", value: "azure" },
            { label: "OpenAI", value: "openai" },
          ]}
        />
      </SettingsRow>
      <SettingsRow title="Display name" description="Optional. Used in the Chat model menu.">
        <TextInput
          label="Display name"
          placeholder="Team review model"
          value={modelDraft.label}
          onChange={(value) => onDraftChange("label", value)}
        />
      </SettingsRow>
      {modelDraft.provider === "azure" ? (
        <AzureModelFields modelDraft={modelDraft} onDraftChange={onDraftChange} />
      ) : (
        <OpenAiModelFields modelDraft={modelDraft} onDraftChange={onDraftChange} />
      )}
      <SettingsRow title="Enabled" description="Controls whether this model appears in Chat.">
        <ToggleSwitch
          checked={modelDraft.enabled && modelDraft.available}
          disabled={testingModelId === modelDraft.id}
          onChange={(value) => {
            if (!value) {
              onDraftDirectChange((current) => ({ ...current, enabled: false, available: false }));
              return;
            }
            onTest(modelDraft, "draft");
          }}
        />
      </SettingsRow>
      <SettingsRow title="Actions">
        <div className="settings-action-stack">
          <div className="settings-action-row">
            <button
              type="button"
              className="settings-text-button"
              onClick={() => onTest(modelDraft, "draft")}
              disabled={testingModelId === modelDraft.id}
            >
              {testingModelId === modelDraft.id ? "Testing..." : "Test connection"}
            </button>
            <button type="button" className="settings-text-button" onClick={onSave}>
              Save
            </button>
            <button type="button" className="settings-text-button" onClick={onCancel}>
              Cancel
            </button>
          </div>
          {modelDraft.available && (
            <p className="settings-feedback-line text-[rgb(var(--app-success))]">Connection verified.</p>
          )}
          {modelDraft.testError && (
            <p className="settings-feedback-line text-[rgb(var(--app-danger))]">
              {modelDraft.testError}
            </p>
          )}
        </div>
      </SettingsRow>
    </div>
  );
}

function AzureModelFields({
  modelDraft,
  onDraftChange,
}: {
  modelDraft: AdditionalModelConfig;
  onDraftChange: <K extends keyof AdditionalModelConfig>(
    key: K,
    value: AdditionalModelConfig[K],
  ) => void;
}): JSX.Element {
  return (
    <>
      <SettingsRow title="Endpoint">
        <TextInput
          label="Endpoint"
          placeholder="https://your-resource.openai.azure.com"
          value={modelDraft.azureEndpoint}
          onChange={(value) => onDraftChange("azureEndpoint", value)}
        />
      </SettingsRow>
      <SettingsRow title="API key">
        <TextInput
          label="API key"
          type="password"
          placeholder="Azure OpenAI key"
          value={modelDraft.azureApiKey}
          onChange={(value) => onDraftChange("azureApiKey", value)}
        />
      </SettingsRow>
      <SettingsRow title="Deployment">
        <TextInput
          label="Deployment"
          placeholder="my-chat-deployment"
          value={modelDraft.azureDeployment}
          onChange={(value) => onDraftChange("azureDeployment", value)}
        />
      </SettingsRow>
      <SettingsRow title="Fast action narration" description="Optional low-latency deployment for the first public action narrative. Planning and execution stay on the main deployment.">
        <TextInput
          label="Narration deployment"
          placeholder="optional low-latency deployment"
          value={modelDraft.azureNarrativeDeployment}
          onChange={(value) => onDraftChange("azureNarrativeDeployment", value)}
        />
      </SettingsRow>
      <SettingsRow title="API version">
        <TextInput
          label="API version"
          placeholder="2024-02-01"
          value={modelDraft.azureApiVersion}
          onChange={(value) => onDraftChange("azureApiVersion", value)}
        />
      </SettingsRow>
    </>
  );
}

function OpenAiModelFields({
  modelDraft,
  onDraftChange,
}: {
  modelDraft: AdditionalModelConfig;
  onDraftChange: <K extends keyof AdditionalModelConfig>(
    key: K,
    value: AdditionalModelConfig[K],
  ) => void;
}): JSX.Element {
  return (
    <>
      <SettingsRow title="API key">
        <TextInput
          label="API key"
          type="password"
          placeholder="OpenAI API key"
          value={modelDraft.openaiApiKey}
          onChange={(value) => onDraftChange("openaiApiKey", value)}
        />
      </SettingsRow>
      <SettingsRow title="Model">
        <TextInput
          label="Model"
          placeholder="model name"
          value={modelDraft.openaiModel}
          onChange={(value) => onDraftChange("openaiModel", value)}
        />
      </SettingsRow>
      <SettingsRow title="Fast action narration" description="Optional low-latency model for the first public action narrative. Planning and execution stay on the main model.">
        <TextInput
          label="Narration model"
          placeholder="optional low-latency model"
          value={modelDraft.openaiNarrativeModel}
          onChange={(value) => onDraftChange("openaiNarrativeModel", value)}
        />
      </SettingsRow>
    </>
  );
}
