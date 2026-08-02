import { AdditionalModelEditor } from "./AdditionalModelEditor.js";
import { ActionButton } from "../../components/workbench/WorkbenchPrimitives.js";
import { SettingsRow, SettingsSection, ToggleSwitch } from "./SettingsControls.js";
import {
  additionalModelDescription,
  additionalModelName,
  type AdditionalModelConfig,
} from "./settingsTypes.js";

export function AdditionalModelsSettingsSection({
  additionalModels,
  availableAdditionalModels,
  editingModelId,
  modelDraft,
  testingModelId,
  onAddModel,
  onCancelModelEdit,
  onDeleteModel,
  onDisableModel,
  onEditModel,
  onModelDraftChange,
  onModelDraftDirectChange,
  onSaveModelDraft,
  onTestModel,
}: {
  additionalModels: AdditionalModelConfig[];
  availableAdditionalModels: AdditionalModelConfig[];
  editingModelId: string | null;
  modelDraft: AdditionalModelConfig;
  testingModelId: string | null;
  onAddModel: () => void;
  onCancelModelEdit: () => void;
  onDeleteModel: (model: AdditionalModelConfig) => void;
  onDisableModel: (model: AdditionalModelConfig) => void;
  onEditModel: (model: AdditionalModelConfig) => void;
  onModelDraftChange: <K extends keyof AdditionalModelConfig>(
    key: K,
    value: AdditionalModelConfig[K],
  ) => void;
  onModelDraftDirectChange: (
    updater: (model: AdditionalModelConfig) => AdditionalModelConfig,
  ) => void;
  onSaveModelDraft: () => void;
  onTestModel: (model: AdditionalModelConfig, source?: "draft" | "saved") => void;
}): JSX.Element {
  return (
    <SettingsSection title="Additional Models">
      <SettingsRow
        title="Available in Chat"
        description={<AvailableModelsDescription models={availableAdditionalModels} />}
      />
      <SettingsRow title="Models" description="Optional model choices for Chat.">
        <ActionButton
          tone="secondary"
          onClick={onAddModel}
          disabled={editingModelId !== null}
        >
          Add model
        </ActionButton>
      </SettingsRow>

      {additionalModels.length === 0 && editingModelId === null && (
        <p className="settings-message">No additional models configured.</p>
      )}

      {additionalModels.map((model) => (
        <SettingsRow
          key={model.id}
          title={additionalModelName(model)}
          description={additionalModelDescription(model)}
        >
          <div className="settings-action-stack">
            <div className="settings-action-row">
              <ToggleSwitch
                checked={model.enabled && model.available}
                disabled={testingModelId === model.id}
                onChange={(value) => {
                  if (!value) {
                    onDisableModel(model);
                    return;
                  }
                  onTestModel(model);
                }}
              />
              <ActionButton
                tone="quiet"
                onClick={() => onTestModel(model)}
                loading={testingModelId === model.id}
              >
                Test
              </ActionButton>
              <ActionButton tone="quiet" onClick={() => onEditModel(model)}>
                Edit
              </ActionButton>
              <ActionButton tone="danger" onClick={() => onDeleteModel(model)}>
                Delete
              </ActionButton>
            </div>
            {model.testError && (
              <p className="settings-feedback-line text-[rgb(var(--app-danger))]">{model.testError}</p>
            )}
          </div>
        </SettingsRow>
      ))}

      {editingModelId !== null && (
        <AdditionalModelEditor
          editingModelId={editingModelId}
          modelDraft={modelDraft}
          testingModelId={testingModelId}
          onCancel={onCancelModelEdit}
          onDraftChange={onModelDraftChange}
          onDraftDirectChange={onModelDraftDirectChange}
          onSave={onSaveModelDraft}
          onTest={onTestModel}
        />
      )}
    </SettingsSection>
  );
}

export function AvailableModelsDescription({
  models,
}: {
  models: AdditionalModelConfig[];
}): JSX.Element {
  if (models.length === 0) {
    return <span>No custom models are available yet.</span>;
  }

  return (
    <span className="settings-model-badge-list" aria-label="Available Chat models">
      {models.map((model) => (
        <span key={model.id} className="settings-model-badge" title={additionalModelName(model)}>
          {additionalModelName(model)}
        </span>
      ))}
    </span>
  );
}
