import { afterEach, describe, expect, it, vi } from "vitest";
import { enableAzureDevOpsOAuth, AzureDevOpsOAuthError } from "./auth.js";
import { discoverAdoProjectLinkOptions, AdoDiscoveryError } from "./projectLinks.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: Response): void {
  vi.stubGlobal("fetch", vi.fn(async () => response));
}

describe("discoverAdoProjectLinkOptions typed failures (MP-001)", () => {
  it("throws AdoDiscoveryError with parsed authStatus on 401 oauth_unavailable", async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          source: "internal",
          error: "Azure DevOps OAuth token is unavailable.",
          authStatus: "oauth_unavailable",
          authMode: "oauth",
          authMessage: "Azure DevOps OAuth token is unavailable.",
          retryable: true,
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      discoverAdoProjectLinkOptions("projects", {
        name: "example link",
        repoPath: "C:\\repo",
        adoOrgUrl: "https://example-org.visualstudio.com/",
      }),
    ).rejects.toMatchObject({
      name: "AdoDiscoveryError",
      kind: "auth",
      status: 401,
      authStatus: "oauth_unavailable",
      authMode: "oauth",
      retryable: true,
    } satisfies Partial<AdoDiscoveryError>);
  });

  it("throws AdoDiscoveryError with parsed authStatus on PAT scope failure", async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          error: "PAT is missing required scopes.",
          authStatus: "pat_invalid_or_missing_scope",
          authMode: "pat",
          authMessage: "PAT is missing required scopes.",
          retryable: false,
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      discoverAdoProjectLinkOptions("repositories", {
        adoOrgUrl: "https://example-org.visualstudio.com/",
        adoProject: "example-project",
        adoPat: "example-pat",
      }),
    ).rejects.toMatchObject({
      name: "AdoDiscoveryError",
      authStatus: "pat_invalid_or_missing_scope",
      authMode: "pat",
      retryable: false,
    } satisfies Partial<AdoDiscoveryError>);
  });

  it("keeps plain HTTP failures as typed http errors without auth claims", async () => {
    stubFetch(new Response("boom", { status: 500 }));

    const err = await discoverAdoProjectLinkOptions("projects", {
      adoOrgUrl: "https://example-org.visualstudio.com/",
    }).catch((caught: unknown) => caught);

    expect(err).toBeInstanceOf(AdoDiscoveryError);
    if (err instanceof AdoDiscoveryError) {
      expect(err.kind).toBe("http");
      expect(err.status).toBe(500);
      expect(err.authStatus).toBeUndefined();
      expect(err.retryable).toBe(true);
    }
  });

  it("preserves the friendly message contract for plain auth bodies", async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          error: "azure_auth_required",
          message: "Azure credential expired or missing. Please sign in again.",
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      discoverAdoProjectLinkOptions("projects", { adoOrgUrl: "https://example-org.visualstudio.com/" }),
    ).rejects.toThrow("Azure credential expired or missing. Please sign in again.");
    await expect(
      discoverAdoProjectLinkOptions("projects", { adoOrgUrl: "https://example-org.visualstudio.com/" }),
    ).rejects.not.toThrow("/project-links/discover");
    await expect(
      discoverAdoProjectLinkOptions("projects", { adoOrgUrl: "https://example-org.visualstudio.com/" }),
    ).rejects.not.toThrow("HTTP 401");
  });
});

describe("enableAzureDevOpsOAuth typed failures (MP-001)", () => {
  it("returns ok on a successful enable", async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          ok: true,
          authMode: "oauth",
          tokenAvailable: true,
          message: "Azure DevOps OAuth consent is available for this signed-in account.",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await enableAzureDevOpsOAuth();

    expect(result.ok).toBe(true);
    expect(result.tokenAvailable).toBe(true);
  });

  it("throws AzureDevOpsOAuthError with user_declined when consent is declined", async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          ok: false,
          authMode: "oauth",
          authStatus: "user_declined",
          authMessage: "Azure DevOps authorization was declined.",
          retryable: true,
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(enableAzureDevOpsOAuth()).rejects.toMatchObject({
      name: "AzureDevOpsOAuthError",
      status: 401,
      authStatus: "user_declined",
      retryable: true,
    } satisfies Partial<AzureDevOpsOAuthError>);
    await expect(enableAzureDevOpsOAuth()).rejects.toThrow("Azure DevOps authorization was declined.");
  });

  it("keeps plain-text failure messages without protocol noise", async () => {
    stubFetch(new Response("Azure DevOps sign-in failed.", { status: 401 }));

    await expect(enableAzureDevOpsOAuth()).rejects.toThrow("Azure DevOps sign-in failed.");
    await expect(enableAzureDevOpsOAuth()).rejects.not.toThrow("ADO OAuth HTTP");
    await expect(enableAzureDevOpsOAuth()).rejects.not.toThrow("HTTP 401");
  });
});
