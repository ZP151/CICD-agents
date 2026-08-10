import { useState } from "react";
import { useTheme } from "../theme.js";
import { InlineNotice, StatusBadge, WorkbenchHeader, WorkbenchPage } from "../components/workbench/WorkbenchPrimitives.js";
import {
  AccountSettingsSection,
  BuiltInCapabilitiesSettingsSection,
  DiagnosticsSettingsSection,
} from "./settings/AccountSettingsSection.js";
import { AdditionalModelsSettingsSection } from "./settings/AdditionalModelsSettingsSection.js";
import { AppearanceSettingsSection } from "./settings/AppearanceSettingsSection.js";
import { RuntimeSettingsSection } from "./settings/RuntimeSettingsSection.js";
import { SettingsSectionNav, type SettingsSectionId } from "./settings/SettingsSectionNav.js";
import { useSettingsRuntime } from "./settings/useSettingsRuntime.js";

export default function Settings(): JSX.Element {
  const { theme, setTheme } = useTheme();
  const runtime = useSettingsRuntime();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("settings-appearance");

  let sectionContent: JSX.Element;
  switch (activeSection) {
    case "settings-system":
      sectionContent = <RuntimeSettingsSection health={runtime.health} />;
      break;
    case "settings-account":
      sectionContent = (
        <AccountSettingsSection
          authUser={runtime.authUser}
          health={runtime.health}
          settings={runtime.settings}
          onSettingChange={runtime.set}
        />
      );
      break;
    case "settings-additional-models":
      sectionContent = (
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
      );
      break;
    case "settings-capabilities":
      sectionContent = <BuiltInCapabilitiesSettingsSection authUser={runtime.authUser} />;
      break;
    case "settings-diagnostics":
      sectionContent = <DiagnosticsSettingsSection />;
      break;
    case "settings-appearance":
    default:
      sectionContent = <AppearanceSettingsSection theme={theme} onThemeChange={setTheme} />;
      break;
  }

  return (
    <WorkbenchPage className="settings-page">
      <WorkbenchHeader
        title="Settings"
        description="Tune the local workspace, identity context, and optional custom model providers."
        actions={runtime.saved && <StatusBadge tone="success">Saved</StatusBadge>}
      />

      {runtime.settings.secretSource !== "local_env" && (runtime.daemonConfigKeyVaultError || runtime.health?.keyVaultSecretError) && (
        <InlineNotice tone="warning" title="Secret storage needs attention">
          {runtime.daemonConfigKeyVaultError || runtime.health?.keyVaultSecretError}
        </InlineNotice>
      )}

      {runtime.daemonStatus === "unreachable" && (
        <InlineNotice tone="warning" title="Daemon is not reachable">
          Local preferences will still be saved.
        </InlineNotice>
      )}

      <div className="settings-shell">
        <SettingsSectionNav activeSection={activeSection} onSectionChange={setActiveSection} />

        <div className="settings-content" aria-live="polite">
          <div className="settings-group">{sectionContent}</div>
        </div>
      </div>
    </WorkbenchPage>
  );
}
