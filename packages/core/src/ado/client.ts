import { authorizationHeader, type AdoAuth } from "./auth.js";
import { AdoAuthDiagnosticError } from "./diagnostics.js";

const ADO_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function adoBase(org: string): string {
  if (org.startsWith("http://") || org.startsWith("https://")) {
    return org.replace(/\/$/, "");
  }
  return `https://dev.azure.com/${org}`;
}

/** ADO returns 302 to a sign-in page when auth fails; do not follow that redirect. */
export async function adoFetch(url: string, auth: AdoAuth, init: RequestInit = {}): Promise<Response> {
  const resp = await fetch(url, {
    ...init,
    redirect: "manual",
    headers: {
      Accept: "application/json",
      ...authorizationHeader(auth),
      ...(init.headers ?? {}),
    },
  });
  if (ADO_REDIRECT_STATUSES.has(resp.status)) {
    throw new AdoAuthDiagnosticError(auth.mode === "oauth"
      ? {
        status: "oauth_no_org_access",
        authMode: "oauth",
        message: "ADO OAuth redirected to sign-in. Sign in again and confirm this account can access the Azure DevOps organization.",
        retryable: true,
      }
      : {
        status: "pat_invalid_or_missing_scope",
        authMode: "pat",
        message: "ADO PAT authentication redirected to sign-in. Check the organization URL, PAT value, and required scopes.",
        retryable: false,
      });
  }
  if (resp.status === 401 || resp.status === 403) {
    throw new AdoAuthDiagnosticError(auth.mode === "oauth"
      ? {
        status: "oauth_no_org_access",
        authMode: "oauth",
        message: `ADO OAuth was rejected with HTTP ${resp.status}. Confirm organization access and Azure DevOps OAuth consent.`,
        retryable: true,
      }
      : {
        status: "pat_invalid_or_missing_scope",
        authMode: "pat",
        message: `ADO PAT was rejected with HTTP ${resp.status}. Check the PAT value and scopes.`,
        retryable: false,
      });
  }
  return resp;
}
