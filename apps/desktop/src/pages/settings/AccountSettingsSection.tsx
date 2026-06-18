import type { AuthUser, HealthStatus } from "../../api";
import { SettingsRow, SettingsSection, StatusPill, TextInput } from "./SettingsControls.js";
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
  return (
    <SettingsSection title="Account">
      <SettingsRow
        title="Identity"
        description="Authentication actions stay in the workspace account menu."
      >
        {authUser.authenticated ? (
          <div className="settings-account">
            <div className="settings-avatar">
              {accountLabel(authUser).slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 text-right">
              <p className="truncate text-xs font-medium text-zinc-200">{accountLabel(authUser)}</p>
              <p className="truncate text-[10px] text-zinc-500">{authUser.upn ?? authUser.oid}</p>
            </div>
          </div>
        ) : (
          <StatusPill>Not signed in</StatusPill>
        )}
      </SettingsRow>
      <SettingsRow
        title="Tenant account"
        description="Used for Azure DevOps OAuth and managed cloud storage when available."
      >
        <StatusPill tone={authUser.authenticated ? "success" : "neutral"}>
          {authUser.authenticated ? (authUser.fromCache ? "Cached" : "Active") : "No account"}
        </StatusPill>
      </SettingsRow>
      <SettingsRow
        title="Azure tenant ID"
        description="Must match the tenant of the MergePilot app registration."
      >
        <TextInput
          label="Azure tenant ID"
          placeholder="Tenant ID"
          value={settings.azureTenantId}
          onChange={(value) => onSettingChange("azureTenantId", value)}
        />
      </SettingsRow>
      <SettingsRow
        title="Azure client ID"
        description="Application client ID for the registered app that has Azure DevOps user_impersonation consent."
      >
        <div className="flex min-w-0 items-center gap-2">
          <TextInput
            label="Azure client ID"
            placeholder="Application (client) ID"
            value={settings.azureClientId}
            onChange={(value) => onSettingChange("azureClientId", value)}
          />
          <StatusPill tone={authUser.azureAuthConfig?.usesDefaultClient ? "warning" : "success"}>
            {authUser.azureAuthConfig?.usesDefaultClient ? "Default" : "Configured"}
          </StatusPill>
        </div>
      </SettingsRow>
      <SettingsRow
        title="Project Link storage"
        description="Project Link records can use managed cloud storage when configured."
      >
        <StatusPill tone={health?.cloudProjectLinkStore ? "success" : "neutral"}>
          {health?.cloudProjectLinkStore ? "Cloud enabled" : "Local fallback"}
        </StatusPill>
      </SettingsRow>
      <SettingsRow
        title="Session storage"
        description="Conversation and checkpoint metadata can use managed cloud storage when configured."
      >
        <StatusPill tone={health?.cloudSessions ? "success" : "neutral"}>
          {health?.cloudSessions ? "Cloud enabled" : "Local fallback"}
        </StatusPill>
      </SettingsRow>
    </SettingsSection>
  );
}
