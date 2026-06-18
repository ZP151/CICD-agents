export interface AzureUser {
  /** AAD Object ID, stable and unique per user per tenant. */
  oid: string;
  /** MSAL account id used to acquire tokens for the currently selected account. */
  homeAccountId?: string;
  /** Tenant associated with the selected MSAL account. */
  tenantId?: string;
  /** MSAL username for the selected account. */
  username?: string;
  /** User Principal Name if present in token. */
  upn?: string;
  /** Display name if present. */
  name?: string;
  /** Microsoft Graph profile photo as a data URL, when available. */
  avatarDataUrl?: string;
}

export interface AzureCachedAccount {
  homeAccountId: string;
  localAccountId?: string;
  tenantId?: string;
  username?: string;
  name?: string;
  avatarDataUrl?: string;
}

export type BrowserLoginChoice = "default" | "edge" | "chrome";

export class AzureAuthenticationRequiredError extends Error {
  readonly statusCode = 401;
  readonly code = "azure_auth_required";

  constructor(message = "Azure credential expired or missing. Please sign in again.") {
    super(message);
    this.name = "AzureAuthenticationRequiredError";
  }
}
