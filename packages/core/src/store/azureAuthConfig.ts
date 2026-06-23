export const IDENTITY_SCOPE = "https://graph.microsoft.com/User.Read";
export const KEY_VAULT_SCOPE = "https://vault.azure.net/.default";
export const STORAGE_SCOPE = "https://storage.azure.com/.default";
export const COSMOS_SCOPE = "https://cosmos.azure.com/.default";
export const CLOUD_RESOURCE_SCOPES = [
  KEY_VAULT_SCOPE,
  STORAGE_SCOPE,
  COSMOS_SCOPE,
];
export const AZURE_DEVOPS_SCOPE = "499b84ac-1321-427f-aa17-267ca6975798/.default";
export const AZURE_DEVOPS_USER_IMPERSONATION_SCOPE = "499b84ac-1321-427f-aa17-267ca6975798/user_impersonation";
export const AZURE_DEVOPS_SCOPES = [
  AZURE_DEVOPS_SCOPE,
  AZURE_DEVOPS_USER_IMPERSONATION_SCOPE,
];

export const TOKEN_CACHE_NAME = "mergepilot";
export const REDIRECT_URI = "http://localhost";
export const MSAL_CACHE_SERVICE = "Microsoft.Developer.IdentityService";
export const MSAL_CACHE_ACCOUNT = "MSALCache";

const DEFAULT_DESKTOP_TENANT_ID = "1f432b2e-9e7a-4aa0-ace2-53af62d309f6";
const DEFAULT_DESKTOP_CLIENT_ID = "03da33ef-7161-4b27-ae80-3079313f131d";

export function desktopAppName(): string {
  return process.env.MERGEPILOT_APP_NAME?.trim()
    || "MergePilot";
}

export function desktopAppReturnUri(): string {
  return process.env.MERGEPILOT_RETURN_URI?.trim()
    || "";
}

export function desktopTenantId(): string | undefined {
  return process.env.MERGEPILOT_AZURE_TENANT_ID
    ?? process.env.AZURE_TENANT_ID
    ?? DEFAULT_DESKTOP_TENANT_ID;
}

export function desktopClientId(): string | undefined {
  return process.env.MERGEPILOT_AZURE_CLIENT_ID
    ?? process.env.AZURE_CLIENT_ID
    ?? DEFAULT_DESKTOP_CLIENT_ID;
}

function hasConfiguredTenantId(): boolean {
  return !!(
    process.env.MERGEPILOT_AZURE_TENANT_ID
    || process.env.AZURE_TENANT_ID
  );
}

function hasConfiguredClientId(): boolean {
  return !!(
    process.env.MERGEPILOT_AZURE_CLIENT_ID
    || process.env.AZURE_CLIENT_ID
  );
}

export function getDesktopAzureAuthConfig(): {
  tenantId?: string;
  clientId?: string;
  usesDefaultTenant: boolean;
  usesDefaultClient: boolean;
  azureDevOpsScopes: string[];
} {
  return {
    tenantId: desktopTenantId(),
    clientId: desktopClientId(),
    usesDefaultTenant: !hasConfiguredTenantId(),
    usesDefaultClient: !hasConfiguredClientId(),
    azureDevOpsScopes: AZURE_DEVOPS_SCOPES,
  };
}
