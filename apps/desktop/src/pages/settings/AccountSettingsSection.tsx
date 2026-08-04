import { useCallback, useEffect, useState } from "react";
import type { AuthUser, HealthStatus } from "../../api";
import { fetchDeliveryWritesState, setDeliveryWritesEnabled } from "../../api/delivery.js";
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
      <BuiltInCapabilitiesSection authUser={authUser} />
    </WorkbenchSettingsSection>
  );
}

/**
 * Built-in capabilities (Cycle 00 product simplification): Azure DevOps is a
 * product capability, not a connector you install. The global read-only kill
 * switch turns off every remote delivery write from one place.
 */
function BuiltInCapabilitiesSection({ authUser }: { authUser: AuthUser }): JSX.Element {
  const [writesEnabled, setWritesEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDeliveryWritesState()
      .then((state) => {
        if (!cancelled) setWritesEnabled(state.enabled);
      })
      .catch(() => {
        if (!cancelled) setError("Could not read the remote-write kill switch.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleWrites = useCallback(() => {
    const next = !(writesEnabled ?? true);
    setError(null);
    setDeliveryWritesEnabled(next)
      .then((state) => setWritesEnabled(state.enabled))
      .catch(() => setError("Could not update the remote-write kill switch."));
  }, [writesEnabled]);

  return (
    <WorkbenchSettingsSection title="Built-in capabilities">
      <WorkbenchSettingsRow
        title="Azure DevOps"
        description={
          authUser.authenticated
            ? `${accountLabel(authUser)} — reauthenticate from the Account section above.`
            : "Sign in with Microsoft to read and verify Azure DevOps."
        }
      >
        <StatusBadge tone={authUser.authenticated ? "success" : "neutral"}>
          {authUser.authenticated ? "Connected" : "Not connected"}
        </StatusBadge>
      </WorkbenchSettingsRow>
      <WorkbenchSettingsRow
        title="Remote writes"
        description={
          writesEnabled === false
            ? "All remote Azure DevOps writes are blocked. Reads and verification still work."
            : "Approved actions can write to Azure DevOps after explicit approval."
        }
      >
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[rgb(var(--app-text))]">
          <input
            type="checkbox"
            checked={writesEnabled ?? true}
            onChange={toggleWrites}
            aria-label="Allow approved remote writes"
            className="h-3.5 w-3.5 rounded border-[rgb(var(--app-border-strong))] text-[rgb(var(--app-accent))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--app-accent))]"
          />
          Allow approved remote writes
        </label>
      </WorkbenchSettingsRow>
      {error && <p className="text-xs text-[rgb(var(--app-warning))]">{error}</p>}
    </WorkbenchSettingsSection>
  );
}
