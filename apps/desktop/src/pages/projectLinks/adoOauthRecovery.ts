import type { AdoDiscoveryAuthStatus, AdoDiscoveryKind } from "../../api.js";
import { AdoDiscoveryError } from "../../api/projectLinks.js";
import { AzureDevOpsOAuthError } from "../../api/auth.js";

/**
 * Typed OAuth recovery for Azure DevOps discovery (MP-001).
 *
 * The form never opens a browser from a typing event; the user must click
 * "Enable Azure DevOps access" / "Re-authorize". Only one OAuth attempt may be
 * in flight, and after success the original discovery kind is retried exactly
 * once.
 */

export type AdoRecoveryAction = "enable_oauth" | "reauthorize" | "pat_update";

export function adoRecoveryAction(
  authStatus: AdoDiscoveryAuthStatus | undefined,
  retryable: boolean | undefined,
  authMode: "oauth" | "pat" | undefined,
): AdoRecoveryAction | null {
  if (authStatus === "oauth_unavailable") return "enable_oauth";
  if (authStatus === "oauth_no_org_access") return "reauthorize";
  if (authStatus === "user_declined") return "reauthorize";
  if (authStatus === "pat_invalid_or_missing_scope") return "pat_update";
  if (authStatus === "unknown_error" && retryable && authMode === "oauth") return "enable_oauth";
  return null;
}

export function adoRecoveryActionLabel(action: AdoRecoveryAction): string {
  if (action === "reauthorize") return "Re-authorize";
  if (action === "pat_update") return "Update PAT in Project Link";
  return "Enable Azure DevOps access";
}

export type AdoOauthRecoveryPhase =
  | "idle"
  | "authorizing"
  | "retrying_discovery"
  | "declined"
  | "failed";

export interface AdoOauthRecoveryState {
  phase: AdoOauthRecoveryPhase;
  kind: AdoDiscoveryKind | null;
  message: string | null;
}

export const ADO_OAUTH_RECOVERY_IDLE: AdoOauthRecoveryState = {
  phase: "idle",
  kind: null,
  message: null,
};

export function adoOauthRecoveryStart(
  state: AdoOauthRecoveryState,
  kind: AdoDiscoveryKind,
): AdoOauthRecoveryState {
  // Single in-flight attempt (RA-004): double clicks while the browser is
  // open, or while the one-shot discovery retry is running, are ignored.
  if (state.phase === "authorizing" || state.phase === "retrying_discovery") return state;
  return { phase: "authorizing", kind, message: null };
}

export function adoOauthRecoveryAuthorized(state: AdoOauthRecoveryState): AdoOauthRecoveryState {
  if (state.phase !== "authorizing") return state;
  return { phase: "retrying_discovery", kind: state.kind, message: null };
}

export function adoOauthRecoveryDeclined(
  state: AdoOauthRecoveryState,
  message: string,
): AdoOauthRecoveryState {
  if (state.phase !== "authorizing") return state;
  return { phase: "declined", kind: state.kind, message };
}

export function adoOauthRecoveryFailed(
  state: AdoOauthRecoveryState,
  message: string,
): AdoOauthRecoveryState {
  if (state.phase !== "authorizing") return state;
  return { phase: "failed", kind: state.kind, message };
}

/** The one-shot discovery retry (or the discovery that caused the failure) settled. */
export function adoOauthRecoverySettled(): AdoOauthRecoveryState {
  return ADO_OAUTH_RECOVERY_IDLE;
}

export function adoRecoveryMessageForOAuthError(err: AzureDevOpsOAuthError): string {
  if (err.authStatus === "user_declined") {
    return "Authorization declined. You can retry when you are ready.";
  }
  return err.message;
}

export function adoRecoveryActionForDiscoveryError(
  err: unknown,
): { action: AdoRecoveryAction | null; message: string } {
  if (err instanceof AdoDiscoveryError) {
    return {
      action: adoRecoveryAction(err.authStatus, err.retryable, err.authMode),
      message: err.message,
    };
  }
  return { action: null, message: err instanceof Error ? err.message : String(err) };
}
