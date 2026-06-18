import { getAzureDevOpsToken, isAzureAuthenticationRequiredError } from "../store/azureAuth.js";
import { ToolError } from "../tools/executor.js";
export {
  AdoAuthDiagnosticError,
  adoAuthDiagnosticFromError,
  type AdoAuthDiagnostic,
  type AdoAuthMode,
  type AdoAuthStatus,
} from "./diagnostics.js";
import type { AdoAuthMode } from "./diagnostics.js";

export const PAT_KEYRING_SERVICE = "mergepilot";
export const PAT_KEYRING_USER = "azure-devops-pat";

export type PatProvider = () => Promise<string>;

export interface AdoAuth {
  mode: AdoAuthMode;
  header: string;
}

let patProvider: PatProvider = async () => {
  try {
    const keytarMod = await import("keytar");
    const keytar = keytarMod.default ?? keytarMod;
    const pat = (await keytar.getPassword(PAT_KEYRING_SERVICE, PAT_KEYRING_USER)) ?? "";
    if (!pat) {
      throw new ToolError("Azure DevOps PAT not configured. Run `mergepilot configure-pat`.");
    }
    return pat;
  } catch (err) {
    if (err instanceof ToolError) throw err;
    throw new ToolError(
      `could not read PAT from keyring: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
};

export function setPatProvider(provider: PatProvider): void {
  patProvider = provider;
}

export function patAuth(pat: string): AdoAuth {
  return { mode: "pat", header: `Basic ${Buffer.from(`:${pat}`).toString("base64")}` };
}

export function bearerAuth(token: string): AdoAuth {
  return { mode: "oauth", header: `Bearer ${token}` };
}

export function authorizationHeader(auth: AdoAuth): Record<string, string> {
  return { Authorization: auth.header };
}

export async function resolveAdoContextAuth(ctx: { extra?: Record<string, unknown> }): Promise<AdoAuth> {
  const ctxPat = String(ctx.extra?.["ado_pat"] ?? "").trim();
  if (ctxPat) return patAuth(ctxPat);

  try {
    return bearerAuth(await getAzureDevOpsToken({ interactive: false }));
  } catch (err) {
    if (!isAzureAuthenticationRequiredError(err)) throw err;
  }

  try {
    return patAuth(await patProvider());
  } catch (err) {
    if (err instanceof ToolError) {
      throw new ToolError(
        "Azure DevOps OAuth token is unavailable. Sign in again and confirm Azure DevOps access.",
      );
    }
    throw err;
  }
}

export async function getAzureDevOpsAuth(preferredPat?: string): Promise<AdoAuth> {
  const pat = preferredPat?.trim();
  if (pat) return patAuth(pat);
  return bearerAuth(await getAzureDevOpsToken({ interactive: false }));
}
