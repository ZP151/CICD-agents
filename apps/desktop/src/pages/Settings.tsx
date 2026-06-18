import { useTheme } from "../theme.js";
import { AccountSettingsSection } from "./settings/AccountSettingsSection.js";
import { AdditionalModelsSettingsSection } from "./settings/AdditionalModelsSettingsSection.js";
import { AppearanceSettingsSection } from "./settings/AppearanceSettingsSection.js";
import { useSettingsRuntime } from "./settings/useSettingsRuntime.js";

export default function Settings(): JSX.Element {
  const { theme, setTheme } = useTheme();
  const runtime = useSettingsRuntime();

  return (
    <div className="settings-page">
      <div className="settings-hero">
        <div>
          <h2 className="settings-title">Settings</h2>
          <p className="settings-subtitle">
            Tune the local workspace, identity context, and optional custom model providers.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {runtime.saved && <span className="text-xs text-emerald-500">Saved</span>}
        </div>
      </div>

      <AppearanceSettingsSection theme={theme} onThemeChange={setTheme} />

      <AdditionalModelsSettingsSection
        additionalModels={runtime.settings.additionalModels}
        availableAdditionalModels={runtime.availableAdditionalModels}
        editingModelId={runtime.editingModelId}
        modelDraft={runtime.modelDraft}
        testingModelId={runtime.testingModelId}
        onAddModel={runtime.startAddingModel}
        onCancelModelEdit={runtime.cancelModelEdit}
        onDeleteModel={runtime.deleteModel}
        onDisableModel={runtime.disableModel}
        onEditModel={runtime.startEditingModel}
        onModelDraftChange={runtime.updateModelDraft}
        onModelDraftDirectChange={runtime.setModelDraft}
        onSaveModelDraft={runtime.saveModelDraft}
        onTestModel={(model, source) => void runtime.testModel(model, source)}
      />

      {runtime.daemonStatus === "unreachable" && (
        <p className="settings-message settings-message-warning">
          Daemon is not reachable. Local preferences will still be saved.
        </p>
      )}

      <AccountSettingsSection
        authUser={runtime.authUser}
        health={runtime.health}
        settings={runtime.settings}
        onSettingChange={runtime.set}
      />
    </div>
  );
}
