import {
  isAzureAuthenticationRequiredError,
  isAzureDevOpsConsentDeclinedError,
} from "../store/azureAuth.js";
import { ToolError } from "../tools/executor.js";

export type AdoAuthMode = "oauth" | "pat";
export type AdoAuthStatus =
  | "ok"
  | "oauth_unavailable"
  | "oauth_no_org_access"
  | "pat_invalid_or_missing_scope"
  | "user_declined"
  | "unknown_error";

export interface AdoAuthDiagnostic {
  status: AdoAuthStatus;
  authMode?: AdoAuthMode;
  message: string;
  retryable: boolean;
}

export class AdoAuthDiagnosticError extends ToolError {
  readonly diagnostic: AdoAuthDiagnostic;

  constructor(diagnostic: AdoAuthDiagnostic) {
    super(diagnostic.message);
    this.name = "AdoAuthDiagnosticError";
    this.diagnostic = diagnostic;
  }
}

export function adoAuthDiagnosticFromError(err: unknown, authMode?: AdoAuthMode): AdoAuthDiagnostic {
  if (err instanceof AdoAuthDiagnosticError) return err.diagnostic;
  if (isAzureDevOpsConsentDeclinedError(err)) {
    return {
      status: "user_declined",
      authMode: "oauth",
      message: err instanceof Error ? err.message : "Azure DevOps authorization was declined.",
      retryable: true,
    };
  }
  if (isAzureAuthenticationRequiredError(err)) {
    return {
      status: "oauth_unavailable",
      authMode: "oauth",
      message: err instanceof Error ? err.message : "Azure DevOps OAuth token is unavailable. Sign in again and confirm Azure DevOps access.",
      retryable: true,
    };
  }
  if (err instanceof ToolError && /PAT|scope|sign-in|authentication/i.test(err.message)) {
    return {
      status: authMode === "oauth" ? "oauth_no_org_access" : "pat_invalid_or_missing_scope",
      authMode,
      message: err.message,
      retryable: authMode !== "pat",
    };
  }
  return {
    status: "unknown_error",
    authMode,
    message: err instanceof Error ? err.message : String(err),
    retryable: true,
  };
}
