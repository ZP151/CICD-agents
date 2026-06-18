import { AdditionalModelEditor } from "./AdditionalModelEditor.js";
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
        description={
          availableAdditionalModels.length > 0
            ? availableAdditionalModels.map(additionalModelName).join(", ")
            : "No custom models are available yet."
        }
      />
      <SettingsRow title="Models" description="Optional model choices for Chat.">
        <button
          type="button"
          onClick={onAddModel}
          className="settings-text-button"
          disabled={editingModelId !== null}
        >
          Add model
        </button>
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
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
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
              <button
                type="button"
                className="settings-text-button"
                onClick={() => onTestModel(model)}
                disabled={testingModelId === model.id}
              >
                {testingModelId === model.id ? "Testing..." : "Test"}
              </button>
              <button
                type="button"
                className="settings-text-button"
                onClick={() => onEditModel(model)}
              >
                Edit
              </button>
              <button
                type="button"
                className="settings-text-button"
                onClick={() => onDeleteModel(model)}
              >
                Delete
              </button>
            </div>
            {model.testError && (
              <p className="max-w-[360px] text-right text-[11px] text-red-500">{model.testError}</p>
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
