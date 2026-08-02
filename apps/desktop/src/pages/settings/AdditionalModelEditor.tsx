import { TextInput } from "./SettingsControls.js";
import {
  ActionButton,
  WorkbenchSegmentedControl,
  WorkbenchSettingsRow,
  WorkbenchToggle,
} from "../../components/workbench/WorkbenchPrimitives.js";
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
      <WorkbenchSettingsRow title={editingModelId === "new" ? "Add model" : "Edit model"}>
        <WorkbenchSegmentedControl<AdditionalModelProvider>
          ariaLabel="Model provider"
          value={modelDraft.provider}
          onValueChange={(value) => onDraftChange("provider", value)}
          options={[
            { label: "Azure OpenAI", value: "azure" },
            { label: "OpenAI", value: "openai" },
          ]}
        />
      </WorkbenchSettingsRow>
      <WorkbenchSettingsRow title="Display name" description="Optional. Used in the Chat model menu.">
        <TextInput
          label="Display name"
          placeholder="Team review model"
          value={modelDraft.label}
          onChange={(value) => onDraftChange("label", value)}
        />
      </WorkbenchSettingsRow>
      {modelDraft.provider === "azure" ? (
        <AzureModelFields modelDraft={modelDraft} onDraftChange={onDraftChange} />
      ) : (
        <OpenAiModelFields modelDraft={modelDraft} onDraftChange={onDraftChange} />
      )}
      <WorkbenchSettingsRow title="Enabled" description="Controls whether this model appears in Chat.">
        <WorkbenchToggle
          ariaLabel="Enable model"
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
      </WorkbenchSettingsRow>
      <WorkbenchSettingsRow title="Actions">
        <div className="settings-action-stack">
          <div className="settings-action-row">
            <ActionButton
              tone="secondary"
              onClick={() => onTest(modelDraft, "draft")}
              loading={testingModelId === modelDraft.id}
            >
              Test connection
            </ActionButton>
            <ActionButton tone="primary" onClick={onSave}>
              Save
            </ActionButton>
            <ActionButton tone="quiet" onClick={onCancel}>
              Cancel
            </ActionButton>
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
      </WorkbenchSettingsRow>
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
      <WorkbenchSettingsRow title="Endpoint">
        <TextInput
          label="Endpoint"
          placeholder="https://your-resource.openai.azure.com"
          value={modelDraft.azureEndpoint}
          onChange={(value) => onDraftChange("azureEndpoint", value)}
        />
      </WorkbenchSettingsRow>
      <WorkbenchSettingsRow title="API key">
        <TextInput
          label="API key"
          type="password"
          placeholder="Azure OpenAI key"
          value={modelDraft.azureApiKey}
          onChange={(value) => onDraftChange("azureApiKey", value)}
        />
      </WorkbenchSettingsRow>
      <WorkbenchSettingsRow title="Deployment">
        <TextInput
          label="Deployment"
          placeholder="my-chat-deployment"
          value={modelDraft.azureDeployment}
          onChange={(value) => onDraftChange("azureDeployment", value)}
        />
      </WorkbenchSettingsRow>
      <WorkbenchSettingsRow title="Fast action narration" description="Optional low-latency deployment for the first public action narrative. Planning and execution stay on the main deployment.">
        <TextInput
          label="Narration deployment"
          placeholder="optional low-latency deployment"
          value={modelDraft.azureNarrativeDeployment}
          onChange={(value) => onDraftChange("azureNarrativeDeployment", value)}
        />
      </WorkbenchSettingsRow>
      <WorkbenchSettingsRow title="API version">
        <TextInput
          label="API version"
          placeholder="2024-02-01"
          value={modelDraft.azureApiVersion}
          onChange={(value) => onDraftChange("azureApiVersion", value)}
        />
      </WorkbenchSettingsRow>
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
      <WorkbenchSettingsRow title="API key">
        <TextInput
          label="API key"
          type="password"
          placeholder="OpenAI API key"
          value={modelDraft.openaiApiKey}
          onChange={(value) => onDraftChange("openaiApiKey", value)}
        />
      </WorkbenchSettingsRow>
      <WorkbenchSettingsRow title="Model">
        <TextInput
          label="Model"
          placeholder="model name"
          value={modelDraft.openaiModel}
          onChange={(value) => onDraftChange("openaiModel", value)}
        />
      </WorkbenchSettingsRow>
      <WorkbenchSettingsRow title="Fast action narration" description="Optional low-latency model for the first public action narrative. Planning and execution stay on the main model.">
        <TextInput
          label="Narration model"
          placeholder="optional low-latency model"
          value={modelDraft.openaiNarrativeModel}
          onChange={(value) => onDraftChange("openaiNarrativeModel", value)}
        />
      </WorkbenchSettingsRow>
    </>
  );
}
