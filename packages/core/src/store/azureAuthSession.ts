import { getSettings } from "../settings.js";
import { DefaultAzureCredential } from "@azure/identity";
import { selectMsalAccount } from "./azureAuthAccountSelection.js";
import { browserCompletionTemplate, openBrowser } from "./azureAuthBrowser.js";
import { getAzureCredential } from "./azureAuthCredential.js";
import {
  AZURE_DEVOPS_SCOPES,
  IDENTITY_SCOPE,
  desktopClientId,
} from "./azureAuthConfig.js";
import { decodeUserFromJwt, fetchGraphAvatar } from "./azureAuthIdentity.js";
import { createMsalClient, withMsalCacheAccess } from "./azureAuthMsal.js";
import { getCachedUser, hydrateCachedUser, setCachedUser } from "./azureAuthSessionCache.js";
import {
  AzureAuthenticationRequiredError,
  type AzureCachedAccount,
  type AzureUser,
  type BrowserLoginChoice,
} from "./azureAuthTypes.js";

export {
  clearPersistedUser,
  loadPersistedUser,
  persistUserCache,
  resetUserCache,
} from "./azureAuthSessionCache.js";

/**
 * Resolve the current user's identity from the active Azure credential.
 * Falls back to `{ oid: "anonymous" }` when no credential is available.
 */
export async function getCurrentUser(opts: { refreshProfile?: boolean } = {}): Promise<AzureUser> {
  const cached = hydrateCachedUser(getSettings().dataDir) ?? getCachedUser();
  if (cached && !opts.refreshProfile) return cached;

  try {
    const cred = getAzureCredential({ interactive: false });
    const token = await cred.getToken(IDENTITY_SCOPE);
    if (token?.token) {
      const decoded = decodeUserFromJwt(token.token);
      return setCachedUser({
        ...cached,
        ...decoded,
        avatarDataUrl: (await fetchGraphAvatar(token.token)) ?? cached?.avatarDataUrl,
      })!;
    }
  } catch {
    // No cached credential via @azure/identity; try MSAL next.
  }

  if (desktopClientId()) {
    try {
      const user = await trySilentMsalLogin(cached?.homeAccountId);
      if (user) {
        return setCachedUser({
          ...cached,
          ...user,
          avatarDataUrl: user.avatarDataUrl ?? cached?.avatarDataUrl,
        })!;
      }
    } catch {
      // MSAL cache miss or error; fall through.
    }
  }

  if (cached) return cached;
  return setCachedUser({ oid: "anonymous" })!;
}

export async function trySilentMsalLogin(homeAccountId?: string): Promise<AzureUser | null> {
  return withMsalCacheAccess(async () => {
    const client = await createMsalClient();
    const accounts = await client.getTokenCache().getAllAccounts();
    if (accounts.length === 0) return null;
    const account = homeAccountId
      ? accounts.find((candidate) => candidate.homeAccountId === homeAccountId)
      : accounts[0];
    if (!account) return null;
    try {
      const result = await client.acquireTokenSilent({
        scopes: [IDENTITY_SCOPE],
        account,
      });
      if (!result?.accessToken) return null;
      return {
        ...decodeUserFromJwt(result.idToken ?? result.accessToken),
        homeAccountId: account.homeAccountId,
        tenantId: account.tenantId,
        username: account.username,
        avatarDataUrl: await fetchGraphAvatar(result.accessToken),
      };
    } catch {
      return null;
    }
  });
}

export async function getCachedAzureAccounts(): Promise<AzureCachedAccount[]> {
  return withMsalCacheAccess(async () => {
    const client = await createMsalClient();
    const accounts = await client.getTokenCache().getAllAccounts();
    return Promise.all(
      accounts.map(async (account) => {
        let avatarDataUrl: string | undefined;
        try {
          const result = await client.acquireTokenSilent({
            scopes: [IDENTITY_SCOPE],
            account,
          });
          avatarDataUrl = result?.accessToken
            ? await fetchGraphAvatar(result.accessToken)
            : undefined;
        } catch {
          avatarDataUrl = undefined;
        }
        return {
          homeAccountId: account.homeAccountId,
          localAccountId: account.localAccountId,
          tenantId: account.tenantId,
          username: account.username,
          name: account.name,
          avatarDataUrl,
        };
      }),
    );
  });
}

export async function loginWithCachedAccount(homeAccountId: string): Promise<AzureUser | null> {
  const user = await trySilentMsalLogin(homeAccountId);
  if (!user) return null;
  return setCachedUser(user);
}

export async function getAzureDevOpsToken(
  opts: {
    interactive?: boolean;
    browser?: BrowserLoginChoice;
    loginHint?: string;
    homeAccountId?: string;
  } = {},
): Promise<string> {
  const clientId = desktopClientId();
  if (clientId) {
    const silentToken = await withMsalCacheAccess(async () => {
      try {
        hydrateCachedUser(getSettings().dataDir);
      } catch {
        // Best-effort active account hydration.
      }

      const client = await createMsalClient();
      const accounts = await client.getTokenCache().getAllAccounts();
      const account = selectMsalAccount(accounts, opts.homeAccountId, getCachedUser());

      if (account) {
        for (const scope of AZURE_DEVOPS_SCOPES) {
          try {
            const result = await client.acquireTokenSilent({
              scopes: [scope],
              account,
            });
            if (result?.accessToken) return result.accessToken;
          } catch {
            // Consent may not have been granted; try another ADO scope or interactive flow.
          }
        }
      }

      return null;
    });
    if (silentToken) return silentToken;

    if (opts.interactive) {
      const client = await createMsalClient();
      const accounts = await withMsalCacheAccess(async () =>
        client.getTokenCache().getAllAccounts(),
      );
      const account = selectMsalAccount(accounts, opts.homeAccountId, getCachedUser());
      for (const scope of AZURE_DEVOPS_SCOPES) {
        try {
          const result = await client.acquireTokenInteractive({
            scopes: [scope],
            account: account ?? undefined,
            loginHint: opts.loginHint ?? account?.username,
            openBrowser: (url) => openBrowser(url, opts.browser ?? "default"),
            successTemplate: browserCompletionTemplate({
              title: "Azure DevOps access is enabled",
              message: "Your account is connected for Azure DevOps. Return to the app to continue.",
            }),
            errorTemplate: browserCompletionTemplate({
              title: "Azure DevOps sign-in did not complete",
              message: "Return to the app and retry Azure DevOps consent.",
              tone: "error",
            }),
          });
          if (result?.accessToken) return result.accessToken;
        } catch {
          // Try the alternate ADO delegated scope before falling back.
        }
      }
    }
  }

  for (const scope of AZURE_DEVOPS_SCOPES) {
    try {
      const token = await getAzureCredential({ interactive: false }).getToken(scope);
      if (token?.token) return token.token;
    } catch {
      // Normalize below after all ADO scopes are exhausted.
    }
  }

  if (clientId) {
    const fallbackCredential = new DefaultAzureCredential();
    for (const scope of AZURE_DEVOPS_SCOPES) {
      try {
        const token = await fallbackCredential.getToken(scope);
        if (token?.token) return token.token;
      } catch {
        // Normalize below after all non-interactive credential sources are exhausted.
      }
    }
  }

  throw new AzureAuthenticationRequiredError(
    "Azure DevOps OAuth token is unavailable for the signed-in account. Sign in again with the account that has Azure DevOps access, then retry Azure DevOps consent.",
  );
}

export async function loginWithBrowser(
  browser: BrowserLoginChoice = "default",
  opts: { loginHint?: string } = {},
): Promise<AzureUser> {
  if (!desktopClientId()) {
    const cred = getAzureCredential({ interactive: true });
    const token = await cred.getToken(IDENTITY_SCOPE);
    if (!token?.token) return { oid: "anonymous" };
    return setCachedUser(decodeUserFromJwt(token.token))!;
  }

  const client = await createMsalClient();
  const result = await client.acquireTokenInteractive({
    scopes: [IDENTITY_SCOPE],
    openBrowser: (url) => openBrowser(url, browser),
    loginHint: opts.loginHint,
    prompt: "select_account",
    successTemplate: browserCompletionTemplate({
      title: "You're signed in",
      message: "Microsoft sign-in is complete. Return to the app to continue your work.",
    }),
    errorTemplate: browserCompletionTemplate({
      title: "Sign-in did not complete",
      message: "Return to the app and start Microsoft sign-in again.",
      tone: "error",
    }),
  });

  if (!result?.accessToken) return { oid: "anonymous" };
  const user = setCachedUser({
    ...decodeUserFromJwt(result.idToken ?? result.accessToken),
    homeAccountId: result.account?.homeAccountId,
    tenantId: result.account?.tenantId,
    username: result.account?.username,
    avatarDataUrl: await fetchGraphAvatar(result.accessToken),
  })!;
  return user;
}

export async function isAzureAuthAvailable(): Promise<boolean> {
  const user = await getCurrentUser();
  return user.oid !== "anonymous";
}

export async function requireCurrentUser(): Promise<AzureUser> {
  const user = await getCurrentUser();
  if (user.oid === "anonymous") throw new AzureAuthenticationRequiredError();
  return user;
}

export function isAzureAuthenticationRequiredError(err: unknown): boolean {
  return (
    err instanceof AzureAuthenticationRequiredError ||
    (err as { code?: string })?.code === "azure_auth_required" ||
    (err as { statusCode?: number; status?: number })?.statusCode === 401 ||
    (err as { statusCode?: number; status?: number })?.status === 401
  );
}
