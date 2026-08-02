import type { AuthUser, HealthStatus } from "../../api";
import {
  StatusBadge,
  WorkbenchSegmentedControl,
  WorkbenchSettingsRow,
  WorkbenchSettingsSection,
} from "../../components/workbench/WorkbenchPrimitives.js";
import { TextInput } from "./SettingsControls.js";
import { accountLabel, type AppSettings } from "./settingsTypes.js";

export function AccountSettingsSection({
  authUser,
  health,
  settings,
  onSettingChange,
}: {
  authUser: AuthUser;
  health: HealthStatus | null;
  settings: AppSettings;
  onSettingChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}): JSX.Element {
  const signedIn = authUser.authenticated;
  const accountTitle = signedIn
    ? [accountLabel(authUser), authUser.upn ?? authUser.oid].filter(Boolean).join(" - ")
    : "Not signed in";
  const authMode = signedIn ? (authUser.fromCache ? "Cached" : "Active") : "No account";
  const cloudEnabled = Boolean(health?.cloudProjectLinkStore || health?.cloudSessions);
  const azureAuthConfigured = Boolean(settings.azureTenantId.trim() && settings.azureClientId.trim());

  return (
    <WorkbenchSettingsSection title="Account">
      <div className="settings-account-summary" title={accountTitle}>
        <div className="settings-avatar">
          {accountLabel(authUser).slice(0, 1).toUpperCase()}
        </div>
        <div className="settings-account-summary-chips">
          <StatusBadge tone={signedIn ? "success" : "neutral"}>
            {signedIn ? "Signed in" : "Not signed in"}
          </StatusBadge>
          <StatusBadge tone={signedIn ? "success" : "neutral"}>{authMode}</StatusBadge>
          <StatusBadge tone={cloudEnabled ? "success" : "neutral"}>
            {cloudEnabled ? "Cloud enabled" : "Local fallback"}
          </StatusBadge>
        </div>
      </div>
      <WorkbenchSettingsRow
        title="Model secrets"
        description="Choose where the built-in model API key is loaded from."
      >
        <WorkbenchSegmentedControl
          ariaLabel="Model secret source"
          value={settings.secretSource}
          onValueChange={(value) => onSettingChange("secretSource", value)}
          options={[
            { label: "Key Vault", value: "key_vault" },
            { label: "Local .env", value: "local_env" },
          ]}
        />
      </WorkbenchSettingsRow>
      <details className="settings-advanced">
        <summary>
          <span>Advanced Azure auth</span>
          <StatusBadge tone={azureAuthConfigured ? "success" : "warning"}>
            {azureAuthConfigured ? "Configured" : "Incomplete"}
          </StatusBadge>
        </summary>
        <div className="settings-advanced-list">
          <WorkbenchSettingsRow
            title="Azure tenant ID"
            description="Must match the tenant of the MergePilot app registration."
          >
            <TextInput
              label="Azure tenant ID"
              placeholder="Tenant ID"
              value={settings.azureTenantId}
              onChange={(value) => onSettingChange("azureTenantId", value)}
            />
          </WorkbenchSettingsRow>
          <WorkbenchSettingsRow
            title="Azure client ID"
            description="Application client ID for Azure DevOps delegated access."
          >
            <div className="flex min-w-0 items-center gap-2">
              <TextInput
                label="Azure client ID"
                placeholder="Application (client) ID"
                value={settings.azureClientId}
                onChange={(value) => onSettingChange("azureClientId", value)}
              />
              <StatusBadge tone={authUser.azureAuthConfig?.usesDefaultClient ? "warning" : "success"}>
                {authUser.azureAuthConfig?.usesDefaultClient ? "Missing" : "Configured"}
              </StatusBadge>
            </div>
          </WorkbenchSettingsRow>
        </div>
      </details>
    </WorkbenchSettingsSection>
  );
}
