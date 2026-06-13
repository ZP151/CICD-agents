/**
 * Azure user identity resolution for the desktop app.
 *
 * Packaged installs use Microsoft Entra ID browser sign-in so users can
 * authenticate with corporate credentials without the Azure CLI. The token
 * cache is persisted through OS-native secure storage where available.
 */
import {
  DefaultAzureCredential,
  InteractiveBrowserCredential,
  useIdentityPlugin,
  type TokenCredential,
} from "@azure/identity";
import { cachePersistencePlugin } from "@azure/identity-cache-persistence";
import { type Configuration, PublicClientApplication } from "@azure/msal-node";
import {
  DataProtectionScope,
  FilePersistence,
  FilePersistenceWithDataProtection,
  KeychainPersistence,
  LibSecretPersistence,
  PersistenceCachePlugin,
  type IPersistence,
} from "@azure/msal-node-extensions";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import open, { apps } from "open";
import { getSettings } from "../settings.js";

export interface AzureUser {
  /** AAD Object ID — stable, unique per user per tenant */
  oid: string;
  /** MSAL account id used to acquire tokens for the currently selected account */
  homeAccountId?: string;
  /** Tenant associated with the selected MSAL account */
  tenantId?: string;
  /** MSAL username for the selected account */
  username?: string;
  /** User Principal Name (email) if present in token */
  upn?: string;
  /** Display name if present */
  name?: string;
  /** Microsoft Graph profile photo as a data URL, when available */
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

export class AzureAuthenticationRequiredError extends Error {
  readonly statusCode = 401;
  readonly code = "azure_auth_required";

  constructor(message = "Azure credential expired or missing. Please sign in again.") {
    super(message);
    this.name = "AzureAuthenticationRequiredError";
  }
}

let cached: AzureUser | null = null;
let pluginRegistered = false;

const IDENTITY_SCOPE = "https://graph.microsoft.com/User.Read";
export const AZURE_DEVOPS_SCOPE = "499b84ac-1321-427f-aa17-267ca6975798/.default";
export const AZURE_DEVOPS_USER_IMPERSONATION_SCOPE = "499b84ac-1321-427f-aa17-267ca6975798/user_impersonation";
const AZURE_DEVOPS_SCOPES = [
  AZURE_DEVOPS_SCOPE,
  AZURE_DEVOPS_USER_IMPERSONATION_SCOPE,
];
const TOKEN_CACHE_NAME = "cicd-agent";
const REDIRECT_URI = "http://localhost";
const MSAL_CACHE_SERVICE = "Microsoft.Developer.IdentityService";
const DESKTOP_APP_NAME = process.env.MERGEPILOT_APP_NAME?.trim() || process.env.CICD_AGENT_APP_NAME?.trim() || "MergePilot";
const DESKTOP_APP_RETURN_URI = process.env.CICD_AGENT_RETURN_URI?.trim() || "";

function browserCompletionTemplate(opts: {
  title: string;
  message: string;
  tone?: "success" | "error";
}): string {
  const appName = DESKTOP_APP_NAME;
  const returnUri = DESKTOP_APP_RETURN_URI;
  const isSuccess = opts.tone !== "error";
  const iconColor = isSuccess ? "#107c41" : "#b42318";
  const iconPath = isSuccess ? "M7.5 12.2 10.7 15.4 17.5 8.6" : "M9 9l6 6m0-6-6 6";
  const autoReturnScript = returnUri
    ? `setTimeout(function(){ window.location.href = ${JSON.stringify(returnUri)}; }, 900);`
    : "";
  const buttonAction = returnUri
    ? `window.location.href = ${JSON.stringify(returnUri)}`
    : "window.close()";
  const helper = returnUri
    ? `If your browser asks for permission, choose Open to return to ${appName}.`
    : `You can close this tab and return to ${appName}.`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${opts.title}</title>
  <style>
    :root { color-scheme: light; font-family: "Segoe UI", Arial, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f8fb; color: #111827; }
    .card { width: min(520px, calc(100vw - 40px)); border: 1px solid #d8dee8; border-radius: 16px; background: white; box-shadow: 0 18px 48px rgba(15, 23, 42, 0.10); padding: 42px 44px; text-align: center; }
    .mark { width: 72px; height: 72px; margin: 0 auto 24px; border-radius: 999px; background: ${isSuccess ? "#eaf7ef" : "#fff0f0"}; display: grid; place-items: center; }
    svg { width: 38px; height: 38px; }
    h1 { margin: 0; font-size: 25px; line-height: 1.25; font-weight: 700; letter-spacing: 0; }
    p { margin: 14px auto 0; max-width: 380px; color: #5b6472; font-size: 14px; line-height: 1.65; }
    button { margin-top: 28px; border: 1px solid #cfd6e3; border-radius: 999px; background: #111827; color: white; font: inherit; font-size: 14px; font-weight: 600; padding: 11px 18px; cursor: pointer; }
    button:hover { background: #1f2937; }
    .helper { margin-top: 18px; font-size: 12px; color: #7a8494; }
  </style>
</head>
<body>
  <main class="card">
    <div class="mark">
      <svg viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="${iconPath}" />
      </svg>
    </div>
    <h1>${opts.title}</h1>
    <p>${opts.message}</p>
    <button onclick="${buttonAction}">Return to ${appName}</button>
    <div class="helper">${helper}</div>
  </main>
  <script>
    ${autoReturnScript}
  </script>
</body>
</html>`;
}
const MSAL_CACHE_ACCOUNT = "MSALCache";
const DEFAULT_DESKTOP_TENANT_ID = "1f432b2e-9e7a-4aa0-ace2-53af62d309f6";
const DEFAULT_DESKTOP_CLIENT_ID = "03da33ef-7161-4b27-ae80-3079313f131d";

export type BrowserLoginChoice = "default" | "edge" | "chrome";

function desktopTenantId(): string | undefined {
  return process.env.CICD_AGENT_AZURE_TENANT_ID
    ?? process.env.AZURE_TENANT_ID
    ?? DEFAULT_DESKTOP_TENANT_ID;
}

function desktopClientId(): string | undefined {
  return process.env.CICD_AGENT_AZURE_CLIENT_ID
    ?? process.env.AZURE_CLIENT_ID
    ?? DEFAULT_DESKTOP_CLIENT_ID;
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
    usesDefaultTenant: !process.env.CICD_AGENT_AZURE_TENANT_ID && !process.env.AZURE_TENANT_ID,
    usesDefaultClient: !process.env.CICD_AGENT_AZURE_CLIENT_ID && !process.env.AZURE_CLIENT_ID,
    azureDevOpsScopes: AZURE_DEVOPS_SCOPES,
  };
}

function registerCachePersistence(): void {
  if (pluginRegistered) return;
  useIdentityPlugin(cachePersistencePlugin);
  pluginRegistered = true;
}

function decodeUserFromJwt(jwt: string): AzureUser {
  const parts = jwt.split(".");
  if (parts.length !== 3) return { oid: "anonymous" };

  const payload = JSON.parse(
    Buffer.from(parts[1]!, "base64url").toString("utf-8"),
  ) as Record<string, unknown>;

  return {
    oid:  (payload["oid"] as string | undefined) ?? (payload["sub"] as string | undefined) ?? "anonymous",
    upn:  (payload["upn"] as string | undefined) ?? (payload["preferred_username"] as string | undefined),
    name: payload["name"] as string | undefined,
  };
}

export function getAzureCredential(opts: {
  interactive?: boolean;
} = {}): TokenCredential {
  const tenantId = desktopTenantId();
  const clientId = desktopClientId();

  if (tenantId || clientId || opts.interactive) {
    registerCachePersistence();
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
      tokenCachePersistenceOptions: {
        enabled: true,
        name: TOKEN_CACHE_NAME,
      },
    });
  }

  return new DefaultAzureCredential();
}

/**
 * Resolve the current user's identity from the active Azure credential.
 * Falls back to { oid: "anonymous" } when no credential is available.
 *
 * Checks two caches in order:
 *  1. @azure/identity persistent cache (default browser path)
 *  2. MSAL node-extensions persistent cache (edge/chrome path)
 * No Graph API call is needed — OID is decoded from the JWT payload.
 */
export async function getCurrentUser(): Promise<AzureUser> {
  if (cached) return cached;

  // 1. @azure/identity path — covers the "default browser" login case.
  try {
    const cred = getAzureCredential({ interactive: false });
    const token = await cred.getToken(IDENTITY_SCOPE);
    if (token?.token) {
      cached = decodeUserFromJwt(token.token);
      return cached;
    }
  } catch {
    // No cached credential via @azure/identity — try MSAL path next.
  }

  // 2. MSAL path — covers the "Edge / Chrome" login case where tokens
  //    are persisted in the MSAL node-extensions encrypted cache.
  if (desktopClientId()) {
    try {
      const user = await trySilentMsalLogin();
      if (user) { cached = user; return cached; }
    } catch {
      // MSAL cache miss or error — fall through.
    }
  }

  cached = { oid: "anonymous" };
  return cached;
}

/**
 * Attempt to acquire a token silently from the MSAL persistent cache.
 * Returns an AzureUser when a valid cached token is found, null otherwise.
 * Exported so callers (e.g. server.ts) can probe the cache before deciding
 * whether to open a browser window.
 */
export async function trySilentMsalLogin(homeAccountId?: string): Promise<AzureUser | null> {
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
}

export async function getCachedAzureAccounts(): Promise<AzureCachedAccount[]> {
  const client = await createMsalClient();
  const accounts = await client.getTokenCache().getAllAccounts();
  return Promise.all(accounts.map(async (account) => {
    let avatarDataUrl: string | undefined;
    try {
      const result = await client.acquireTokenSilent({
        scopes: [IDENTITY_SCOPE],
        account,
      });
      avatarDataUrl = result?.accessToken ? await fetchGraphAvatar(result.accessToken) : undefined;
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
  }));
}

export async function loginWithCachedAccount(homeAccountId: string): Promise<AzureUser | null> {
  const user = await trySilentMsalLogin(homeAccountId);
  if (!user) return null;
  try {
    await getAzureDevOpsToken({ homeAccountId });
  } catch {
    // The caller can trigger interactive ADO consent explicitly when needed.
  }
  cached = user;
  return cached;
}

function selectMsalAccount<T extends { homeAccountId?: string; username?: string }>(
  accounts: T[],
  requestedHomeAccountId?: string,
): T | undefined {
  if (requestedHomeAccountId) {
    const requested = accounts.find((candidate) => candidate.homeAccountId === requestedHomeAccountId);
    if (requested) return requested;
  }
  if (cached?.homeAccountId) {
    const active = accounts.find((candidate) => candidate.homeAccountId === cached?.homeAccountId);
    if (active) return active;
  }
  if (cached?.upn || cached?.username) {
    const activeName = (cached.upn ?? cached.username ?? "").toLowerCase();
    const active = accounts.find((candidate) => candidate.username?.toLowerCase() === activeName);
    if (active) return active;
  }
  return accounts[0];
}

export async function getAzureDevOpsToken(opts: {
  interactive?: boolean;
  browser?: BrowserLoginChoice;
  loginHint?: string;
  homeAccountId?: string;
} = {}): Promise<string> {
  const clientId = desktopClientId();
  if (clientId) {
    if (!cached?.homeAccountId) {
      try {
        const persisted = loadPersistedUser(getSettings().dataDir);
        if (persisted?.homeAccountId) cached = persisted;
      } catch {
        // Best-effort active account hydration.
      }
    }
    const client = await createMsalClient();
    const accounts = await client.getTokenCache().getAllAccounts();
    const account = selectMsalAccount(accounts, opts.homeAccountId);

    if (account) {
      for (const scope of AZURE_DEVOPS_SCOPES) {
        try {
          const result = await client.acquireTokenSilent({
            scopes: [scope],
            account,
          });
          if (result?.accessToken) return result.accessToken;
        } catch {
          // Consent may not have been granted yet; try the next ADO scope or interactive flow.
        }
      }
    }

    if (opts.interactive) {
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

  throw new AzureAuthenticationRequiredError(
    "Azure DevOps OAuth token is unavailable for the signed-in account. Sign in again with the account that has Azure DevOps access, then retry Azure DevOps consent.",
  );
}

export async function loginWithBrowser(
  browser: BrowserLoginChoice = "default",
  opts: { loginHint?: string } = {},
): Promise<AzureUser> {
  // If no client ID is configured the MSAL path is unavailable.
  // Fall back to @azure/identity which picks up the tenant/client from env or
  // uses the well-known Microsoft dev tools client ID as a last resort.
  if (!desktopClientId()) {
    const cred = getAzureCredential({ interactive: true });
    const token = await cred.getToken(IDENTITY_SCOPE);
    if (!token?.token) return { oid: "anonymous" };
    cached = decodeUserFromJwt(token.token);
    return cached;
  }

  // User explicitly selected a browser, so always open it. The browser's own
  // saved credentials / Windows SSO may still complete the Microsoft page fast,
  // but the sign-in action remains visible and predictable.
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
  cached = {
    ...decodeUserFromJwt(result.idToken ?? result.accessToken),
    homeAccountId: result.account?.homeAccountId,
    tenantId: result.account?.tenantId,
    username: result.account?.username,
    avatarDataUrl: await fetchGraphAvatar(result.accessToken),
  };
  await getAzureDevOpsToken({
    interactive: true,
    browser,
    loginHint: opts.loginHint ?? result.account?.username,
    homeAccountId: result.account?.homeAccountId,
  });
  return cached;
}

async function fetchGraphAvatar(accessToken: string): Promise<string | undefined> {
  try {
    const response = await fetch("https://graph.microsoft.com/v1.0/me/photo/$value", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return undefined;
    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** Whether Azure credential is available on this machine. */
export async function isAzureAuthAvailable(): Promise<boolean> {
  const u = await getCurrentUser();
  return u.oid !== "anonymous";
}

export async function requireCurrentUser(): Promise<AzureUser> {
  const user = await getCurrentUser();
  if (user.oid === "anonymous") throw new AzureAuthenticationRequiredError();
  return user;
}

export function isAzureAuthenticationRequiredError(err: unknown): boolean {
  return err instanceof AzureAuthenticationRequiredError
    || (err as { code?: string })?.code === "azure_auth_required"
    || (err as { statusCode?: number; status?: number })?.statusCode === 401
    || (err as { statusCode?: number; status?: number })?.status === 401;
}

export function resetUserCache(): void {
  cached = null;
}

function getAuthority(): string {
  const tenantId = desktopTenantId();
  return `https://login.microsoftonline.com/${tenantId || "organizations"}`;
}

async function createMsalClient(): Promise<PublicClientApplication> {
  const clientId = desktopClientId();
  if (!clientId) {
    throw new Error("Missing Azure application client ID. Set CICD_AGENT_AZURE_CLIENT_ID for browser sign-in.");
  }

  const config: Configuration = {
    auth: {
      clientId,
      authority: getAuthority(),
    },
    cache: {
      cachePlugin: new PersistenceCachePlugin(await createMsalPersistence()),
    },
  };
  return new PublicClientApplication(config);
}

async function createMsalPersistence(): Promise<IPersistence> {
  const cachePath = path.join(localApplicationDataFolder(), ".IdentityService", TOKEN_CACHE_NAME);

  if (process.platform === "win32") {
    return FilePersistenceWithDataProtection.create(cachePath, DataProtectionScope.CurrentUser);
  }

  if (process.platform === "darwin") {
    try {
      const persistence = await KeychainPersistence.create(cachePath, MSAL_CACHE_SERVICE, MSAL_CACHE_ACCOUNT);
      await persistence.load();
      return persistence;
    } catch {
      return FilePersistence.create(cachePath);
    }
  }

  if (process.platform === "linux") {
    try {
      const persistence = await LibSecretPersistence.create(cachePath, MSAL_CACHE_SERVICE, MSAL_CACHE_ACCOUNT);
      await persistence.load();
      return persistence;
    } catch {
      return FilePersistence.create(cachePath);
    }
  }

  return FilePersistence.create(cachePath);
}

function localApplicationDataFolder(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA?.replace(/(\\Roaming)?$/, "\\Local")
      ?? process.env.LOCALAPPDATA
      ?? os.homedir();
  }
  return process.env.HOME ?? os.homedir();
}

async function openBrowser(url: string, browser: BrowserLoginChoice): Promise<void> {
  if (process.platform === "win32") {
    // Spawn the browser executable directly — no shell involved, so the `&`
    // characters in MSAL's auth URL are never misinterpreted as cmd separators.
    const exe = findWindowsBrowserExe(browser);
    if (exe) {
      spawn(exe, [url], { detached: true, stdio: "ignore" }).unref();
      return;
    }
    // Browser exe not found at standard paths — fall back to the `open` package
    // which uses `start` under the hood. Worst case the default browser opens.
    await open(url);
    return;
  }

  // macOS / Linux — `open` handles app names correctly on these platforms.
  if (browser === "chrome") {
    await open(url, { app: { name: apps.chrome } });
    return;
  }
  if (browser === "edge") {
    await open(url, { app: { name: apps.edge } });
    return;
  }
  await open(url);
}

/**
 * Locate the browser executable on Windows using the standard install paths.
 * Returns null if the browser isn't found (caller falls back to the default).
 */
function findWindowsBrowserExe(browser: BrowserLoginChoice): string | null {
  if (browser === "default") return null;

  const pf  = process.env["ProgramFiles"]        ?? "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"]  ?? "C:\\Program Files (x86)";
  const local = process.env["LOCALAPPDATA"]       ?? "";

  const candidates: string[] =
    browser === "edge"
      ? [
          path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
          path.join(pf,   "Microsoft", "Edge", "Application", "msedge.exe"),
        ]
      : [
          path.join(pf,   "Google", "Chrome", "Application", "chrome.exe"),
          path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
          path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
        ];

  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

// ── File-based user cache (~/.cicd-agent/auth-cache.json) ────────────────────

interface PersistedAuth {
  oid: string;
  homeAccountId?: string;
  tenantId?: string;
  username?: string;
  upn?: string;
  name?: string;
  avatarDataUrl?: string;
  cachedAt: number; // unix seconds
}

function authCachePath(dataDir: string): string {
  return path.join(dataDir, "auth-cache.json");
}

/**
 * Write the resolved user identity to disk so subsequent daemon startups can
 * show the user instantly without waiting for a credential round-trip.
 */
export function persistUserCache(user: AzureUser, dataDir: string): void {
  if (user.oid === "anonymous") return;
  try {
    cached = user;
    fs.mkdirSync(dataDir, { recursive: true });
    const data: PersistedAuth = { ...user, cachedAt: Math.floor(Date.now() / 1000) };
    fs.writeFileSync(authCachePath(dataDir), JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // Non-fatal — cache miss is handled gracefully
  }
}

/**
 * Load the previously persisted user from disk.
 * Returns null if not found or stale (>7 days old).
 */
export function loadPersistedUser(dataDir: string): AzureUser | null {
  try {
    const raw = fs.readFileSync(authCachePath(dataDir), "utf-8");
    const data = JSON.parse(raw) as PersistedAuth;
    const age = Math.floor(Date.now() / 1000) - (data.cachedAt ?? 0);
    if (age > 7 * 24 * 3600) return null; // stale after 7 days
    const user = {
      oid: data.oid,
      homeAccountId: data.homeAccountId,
      tenantId: data.tenantId,
      username: data.username,
      upn: data.upn,
      name: data.name,
      avatarDataUrl: data.avatarDataUrl,
    };
    cached = user;
    return user;
  } catch {
    return null;
  }
}

/**
 * Clear the app's persisted user identity cache.
 */
export function clearPersistedUser(dataDir: string): void {
  try {
    const p = authCachePath(dataDir);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    // ignore
  }
  cached = null;
}
