import { describe, expect, it } from "vitest";
import {
  ADO_OAUTH_RECOVERY_IDLE,
  adoOauthRecoveryAuthorized,
  adoOauthRecoveryDeclined,
  adoOauthRecoveryFailed,
  adoOauthRecoverySettled,
  adoOauthRecoveryStart,
  adoRecoveryAction,
  adoRecoveryActionLabel,
  adoRecoveryMessageForOAuthError,
} from "./adoOauthRecovery.js";
import { AdoDiscoveryError } from "../../api/projectLinks.js";
import { AzureDevOpsOAuthError } from "../../api/auth.js";

describe("adoRecoveryAction", () => {
  it("maps oauth_unavailable to enable_oauth", () => {
    expect(adoRecoveryAction("oauth_unavailable", true, "oauth")).toBe("enable_oauth");
  });

  it("maps expired org access and user decline to reauthorize", () => {
    expect(adoRecoveryAction("oauth_no_org_access", true, "oauth")).toBe("reauthorize");
    expect(adoRecoveryAction("user_declined", true, "oauth")).toBe("reauthorize");
  });

  it("maps PAT scope failure to pat_update", () => {
    expect(adoRecoveryAction("pat_invalid_or_missing_scope", false, "pat")).toBe("pat_update");
  });

  it("maps unknown retryable oauth errors to enable_oauth but nothing else", () => {
    expect(adoRecoveryAction("unknown_error", true, "oauth")).toBe("enable_oauth");
    expect(adoRecoveryAction("unknown_error", false, "oauth")).toBeNull();
    expect(adoRecoveryAction("unknown_error", true, "pat")).toBeNull();
    expect(adoRecoveryAction(undefined, undefined, undefined)).toBeNull();
  });

  it("renders distinct labels for enable and reauthorize", () => {
    expect(adoRecoveryActionLabel("enable_oauth")).toBe("Enable Azure DevOps access");
    expect(adoRecoveryActionLabel("reauthorize")).toBe("Re-authorize");
  });
});

describe("AdoOauthRecoveryState transitions (MP-001)", () => {
  it("starts an OAuth attempt from idle and records the failed discovery kind", () => {
    const state = adoOauthRecoveryStart(ADO_OAUTH_RECOVERY_IDLE, "pipelines");

    expect(state).toEqual({ phase: "authorizing", kind: "pipelines", message: null });
  });

  it("allows retrying after a decline without losing the kind", () => {
    const declined = adoOauthRecoveryDeclined(
      adoOauthRecoveryStart(ADO_OAUTH_RECOVERY_IDLE, "repositories"),
      "Authorization declined. You can retry when you are ready.",
    );

    expect(declined.phase).toBe("declined");
    expect(declined.kind).toBe("repositories");

    const retried = adoOauthRecoveryStart(declined, "repositories");
    expect(retried.phase).toBe("authorizing");
  });

  it("ignores a second start while authorizing (single in-flight attempt)", () => {
    const inFlight = adoOauthRecoveryStart(ADO_OAUTH_RECOVERY_IDLE, "projects");
    const doubleClick = adoOauthRecoveryStart(inFlight, "projects");

    expect(doubleClick).toBe(inFlight);
    expect(doubleClick.phase).toBe("authorizing");
  });

  it("ignores starts while the one-shot discovery retry is running", () => {
    const retrying = adoOauthRecoveryAuthorized(
      adoOauthRecoveryStart(ADO_OAUTH_RECOVERY_IDLE, "pipelines"),
    );

    expect(retrying.phase).toBe("retrying_discovery");
    expect(adoOauthRecoveryStart(retrying, "pipelines")).toBe(retrying);
  });

  it("only transitions authorized/declined/failed from authorizing", () => {
    expect(adoOauthRecoveryAuthorized(ADO_OAUTH_RECOVERY_IDLE).phase).toBe("idle");
    expect(adoOauthRecoveryDeclined(ADO_OAUTH_RECOVERY_IDLE, "x").phase).toBe("idle");
    expect(adoOauthRecoveryFailed(ADO_OAUTH_RECOVERY_IDLE, "x").phase).toBe("idle");
  });

  it("settles back to idle so a fresh attempt is possible", () => {
    expect(adoOauthRecoverySettled()).toBe(ADO_OAUTH_RECOVERY_IDLE);
  });
});

describe("typed error recovery helpers", () => {
  it("turns a declined OAuth error into a user-facing message", () => {
    const err = new AzureDevOpsOAuthError("Azure DevOps authorization was declined.", {
      status: 401,
      authStatus: "user_declined",
      retryable: true,
    });

    expect(adoRecoveryMessageForOAuthError(err)).toBe(
      "Authorization declined. You can retry when you are ready.",
    );
  });

  it("keeps the raw message for other OAuth errors", () => {
    const err = new AzureDevOpsOAuthError("provider hiccup", { status: 503 });

    expect(adoRecoveryMessageForOAuthError(err)).toBe("provider hiccup");
  });

  it("derives the recovery action from a typed discovery error", () => {
    const err = new AdoDiscoveryError("token missing", {
      kind: "auth",
      status: 401,
      authStatus: "oauth_unavailable",
      authMode: "oauth",
      retryable: true,
    });

    expect(err.retryable).toBe(true);
    expect(err.message).toBe("token missing");
  });
});
