import { RUNTIME_URL } from "./runtime.js";
import { readSseJsonStream } from "./sse.js";

export interface AuthUser {
  authenticated: boolean;
  oid?: string;
  homeAccountId?: string;
  tenantId?: string;
  username?: string;
  upn?: string;
  name?: string;
  avatarDataUrl?: string;
  fromCache?: boolean;
  message?: string;
  azureAuthConfig?: {
    tenantId?: string;
    clientId?: string;
    usesDefaultTenant: boolean;
    usesDefaultClient: boolean;
    azureDevOpsScopes: string[];
  };
}

export interface AuthCachedAccount {
  homeAccountId: string;
  localAccountId?: string;
  tenantId?: string;
  username?: string;
  name?: string;
  avatarDataUrl?: string;
}

export type AuthBrowserChoice = "default" | "edge" | "chrome";

export type AuthLoginEvent =
  | { type: "status"; message: string }
  | { type: "browser"; browser: AuthBrowserChoice; message: string }
  | { type: "output"; line: string }
  | { type: "done"; authenticated: boolean; oid?: string; upn?: string; name?: string; avatarDataUrl?: string }
  | { type: "error"; message: string };

/** Instant cached user: no Azure round trip, safe to call on render cycles. */
export async function fetchAuthStatus(): Promise<AuthUser> {
  try {
    const r = await fetch(`${RUNTIME_URL}/auth/status`);
    if (!r.ok) return { authenticated: false };
    return (await r.json()) as AuthUser;
  } catch {
    return { authenticated: false };
  }
}

/** Live user identity: verifies the credential is still valid and persists result. */
export async function fetchAuthMe(): Promise<AuthUser> {
  try {
    const r = await fetch(`${RUNTIME_URL}/auth/me`);
    if (!r.ok) return { authenticated: false };
    return (await r.json()) as AuthUser;
  } catch {
    return { authenticated: false };
  }
}

export async function fetchAuthAccounts(): Promise<AuthCachedAccount[]> {
  try {
    const r = await fetch(`${RUNTIME_URL}/auth/accounts`);
    if (!r.ok) return [];
    const data = (await r.json()) as { accounts?: AuthCachedAccount[] };
    return data.accounts ?? [];
  } catch {
    return [];
  }
}

export function authLoginStream(
  browser: AuthBrowserChoice,
  onEvent: (event: AuthLoginEvent) => void,
  opts: { loginHint?: string; accountHomeId?: string } = {},
): () => void {
  const controller = new AbortController();

  void fetch(`${RUNTIME_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ browser, loginHint: opts.loginHint, accountHomeId: opts.accountHomeId }),
    signal: controller.signal,
  })
    .then(async (r) => {
      if (!r.ok || !r.body) {
        onEvent({ type: "error", message: `HTTP ${r.status}` });
        return;
      }
      await readSseJsonStream<Record<string, unknown>>(r, ({ event, data }) => {
        onEvent({ type: event, ...data } as AuthLoginEvent);
      });
    })
    .catch((err: unknown) => {
      if ((err as { name?: string }).name !== "AbortError") {
        onEvent({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
    });

  return () => controller.abort();
}

export async function enableAzureDevOpsOAuth(
  browser: AuthBrowserChoice = "default",
  opts: { loginHint?: string; accountHomeId?: string } = {},
): Promise<{ ok: boolean; authMode: "oauth"; tokenAvailable: boolean; message: string; user?: AuthUser }> {
  const r = await fetch(`${RUNTIME_URL}/auth/azure-devops/enable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ browser, loginHint: opts.loginHint, accountHomeId: opts.accountHomeId }),
  });
  const body = await r.json().catch(() => ({})) as {
    ok?: boolean;
    authMode?: "oauth";
    tokenAvailable?: boolean;
    message?: string;
    authMessage?: string;
    user?: AuthUser;
  };
  if (!r.ok || !body.ok) throw new Error(body.authMessage ?? body.message ?? `ADO OAuth HTTP ${r.status}`);
  return {
    ok: true,
    authMode: "oauth",
    tokenAvailable: Boolean(body.tokenAvailable),
    message: body.message ?? "Azure DevOps OAuth is enabled.",
    user: body.user,
  };
}

/** Sign out: clears the daemon's local app identity cache. */
export async function authLogout(): Promise<void> {
  await fetch(`${RUNTIME_URL}/auth/logout`, { method: "POST" });
}

export function isAzureAuthError(err: unknown): boolean {
  if (err instanceof Response) return err.status === 401;
  if (err instanceof Error) return /azure_auth_required|credential|401|403/i.test(err.message);
  return false;
}
