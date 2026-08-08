/**
 * Azure user identity resolution for the desktop app.
 *
 * This is the compatibility entry Module. Credential construction, identity
 * decoding, MSAL session/token flow, auth config, browser launching, and disk
 * user cache live in focused Modules nearby.
 */
export {
  AZURE_DEVOPS_SCOPE,
  AZURE_DEVOPS_USER_IMPERSONATION_SCOPE,
  getDesktopAzureAuthConfig,
} from "./azureAuthConfig.js";
export { getAzureCredential } from "./azureAuthCredential.js";
export {
  clearPersistedUser,
  getAzureDevOpsToken,
  getCachedAzureAccounts,
  getCurrentUser,
  isAzureAuthAvailable,
  isAzureAuthenticationRequiredError,
  loadPersistedUser,
  loginWithBrowser,
  loginWithCachedAccount,
  persistUserCache,
  requireCurrentUser,
  resetUserCache,
  trySilentMsalLogin,
} from "./azureAuthSession.js";
export {
  AzureAuthenticationRequiredError,
  AzureDevOpsConsentDeclinedError,
  isAzureDevOpsConsentDeclinedError,
} from "./azureAuthTypes.js";
export type { AzureCachedAccount, AzureUser, BrowserLoginChoice } from "./azureAuthTypes.js";
