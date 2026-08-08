import { describe, expect, it } from "vitest";
import {
  AdoAuthDiagnosticError,
  adoAuthDiagnosticFromError,
} from "../src/ado/diagnostics.js";
import {
  AzureAuthenticationRequiredError,
  AzureDevOpsConsentDeclinedError,
  isAzureDevOpsConsentDeclinedError,
} from "../src/store/azureAuthTypes.js";
import { ToolError } from "../src/tools/executor.js";

describe("adoAuthDiagnosticFromError", () => {
  it("keeps consent decline distinct from a missing token (MP-001)", () => {
    const declined = adoAuthDiagnosticFromError(new AzureDevOpsConsentDeclinedError(), "oauth");

    expect(declined.status).toBe("user_declined");
    expect(declined.authMode).toBe("oauth");
    expect(declined.retryable).toBe(true);
  });

  it("classifies a raw MSAL user_canceled error as declined", () => {
    const err = Object.assign(new Error("User cancelled the flow."), { errorCode: "user_canceled" });

    expect(isAzureDevOpsConsentDeclinedError(err)).toBe(true);
    expect(adoAuthDiagnosticFromError(err, "oauth").status).toBe("user_declined");
  });

  it("classifies missing/expired token as oauth_unavailable and retryable", () => {
    const diagnostic = adoAuthDiagnosticFromError(new AzureAuthenticationRequiredError());

    expect(diagnostic.status).toBe("oauth_unavailable");
    expect(diagnostic.authMode).toBe("oauth");
    expect(diagnostic.retryable).toBe(true);
  });

  it("classifies a PAT scope failure per mode", () => {
    const err = new ToolError("PAT is missing required scopes for Azure DevOps.");

    expect(adoAuthDiagnosticFromError(err, "pat").status).toBe("pat_invalid_or_missing_scope");
    expect(adoAuthDiagnosticFromError(err, "pat").retryable).toBe(false);
    expect(adoAuthDiagnosticFromError(err, "oauth").status).toBe("oauth_no_org_access");
  });

  it("passes through an already typed diagnostic untouched", () => {
    const typed = new AdoAuthDiagnosticError({
      status: "oauth_no_org_access",
      authMode: "oauth",
      message: "No access to this organisation.",
      retryable: true,
    });

    expect(adoAuthDiagnosticFromError(typed)).toEqual(typed.diagnostic);
  });

  it("falls back to unknown_error without leaking internals", () => {
    const diagnostic = adoAuthDiagnosticFromError(new Error("boom"), "oauth");

    expect(diagnostic.status).toBe("unknown_error");
    expect(diagnostic.retryable).toBe(true);
    expect(diagnostic.message).toBe("boom");
  });
});
