import {
  DefaultAzureCredential,
  InteractiveBrowserCredential,
  useIdentityPlugin,
  type TokenCredential,
} from "@azure/identity";
import { cachePersistencePlugin } from "@azure/identity-cache-persistence";
import { getSettings } from "../settings.js";
import { selectMsalAccount } from "./azureAuthAccountSelection.js";
import { browserCompletionTemplate } from "./azureAuthBrowser.js";
import {
  REDIRECT_URI,
  TOKEN_CACHE_NAME,
  desktopClientId,
  desktopTenantId,
} from "./azureAuthConfig.js";
import { createMsalClient, withMsalCacheAccess } from "./azureAuthMsal.js";
import { getCachedUser, hydrateCachedUser } from "./azureAuthSessionCache.js";

let pluginRegistered = false;

export function shouldUsePersistentAzureTokenCache(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.CI !== "true" && env.NODE_ENV !== "test" && env.VITEST !== "true";
}

function registerCachePersistence(): void {
  if (pluginRegistered) return;
  useIdentityPlugin(cachePersistencePlugin);
  pluginRegistered = true;
}

export function getAzureCredential(opts: {
  interactive?: boolean;
} = {}): TokenCredential {
  const tenantId = desktopTenantId();
  const clientId = desktopClientId();

  if (tenantId || clientId || opts.interactive) {
    const persistTokenCache = shouldUsePersistentAzureTokenCache();
    if (persistTokenCache) registerCachePersistence();
    return new InteractiveBrowserCredential({
      tenantId,
      clientId,
      redirectUri: REDIRECT_URI,
      disableAutomaticAuthentication: !opts.interactive,
      browserCustomizationOptions: {
        successMessage: browserCompletionTemplate({
          title: "You're signed in",
          message: "Microsoft sign-in is complete. Return to the app to continue your work.",
        }),
        errorMessage: browserCompletionTemplate({
          title: "Sign-in did not complete",
          message: "Return to the app and start Microsoft sign-in again.",
          tone: "error",
        }),
      },
      ...(persistTokenCache
        ? {
            tokenCachePersistenceOptions: {
              enabled: true,
              name: TOKEN_CACHE_NAME,
            },
          }
        : {}),
    });
  }

  return new DefaultAzureCredential();
}

export function getAzureCachedScopeCredential(defaultScope: string): TokenCredential {
  const fallback = getAzureCredential({ interactive: false });
  return {
    async getToken(scopes, options) {
      const requestedScope = Array.isArray(scopes) ? scopes[0] : scopes;
      const scope = requestedScope || defaultScope;
      if (desktopClientId()) {
        return withMsalCacheAccess(async () => {
          let msalError: unknown;
          try {
            hydrateCachedUser(getSettings().dataDir);
          } catch {
            // Best-effort account hydration; MSAL cache lookup below can still work.
          }
          const client = await createMsalClient();
          const accounts = await client.getTokenCache().getAllAccounts();
          const account = selectMsalAccount(accounts, undefined, getCachedUser());
          if (account) {
            try {
              const result = await client.acquireTokenSilent({
                scopes: [scope],
                account,
              });
              if (result?.accessToken) {
                return {
                  token: result.accessToken,
                  expiresOnTimestamp: result.expiresOn?.getTime() ?? Date.now() + 3_600_000,
                };
              }
            } catch (err) {
              msalError = err;
            }
          }
          if (msalError) throw msalError;
          if (accounts.length === 0) {
            throw new Error("No signed-in Azure account is available. Sign in again to enable Azure Key Vault access.");
          }
          return fallback.getToken(scopes, options);
        });
      }
      return fallback.getToken(scopes, options);
    },
  };
}
