import { describe, expect, it, vi } from "vitest";
import { getAzureDevOpsAuth } from "../src/ado/auth.js";
import { adoBase, adoFetch } from "../src/ado/client.js";
import {
  AdoAuthDiagnosticError,
  adoAuthDiagnosticFromError,
} from "../src/ado/diagnostics.js";
import { ToolError } from "../src/tools/executor.js";
import "./adoTestDoubles.js";

describe("Azure DevOps auth/client modules", () => {
  it("normalizes organization slugs and full organization URLs", () => {
    expect(adoBase("demo-org")).toBe("https://dev.azure.com/demo-org");
    expect(adoBase("https://tebssg.visualstudio.com/")).toBe("https://tebssg.visualstudio.com");
  });

  it("builds PAT auth without requiring OAuth", async () => {
    const auth = await getAzureDevOpsAuth("inline-pat");

    expect(auth).toEqual({
      mode: "pat",
      header: `Basic ${Buffer.from(":inline-pat").toString("base64")}`,
    });
  });

  it("adds JSON and authorization headers to ADO fetches", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await adoFetch("https://example.test/_apis/projects", { mode: "pat", header: "Basic abc" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/_apis/projects",
      expect.objectContaining({
        redirect: "manual",
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Basic abc",
        }),
      }),
    );
  });

  it("turns auth redirects into actionable PAT diagnostics", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 302 }));

    await expect(
      adoFetch("https://example.test/_apis/projects", { mode: "pat", header: "Basic bad" }),
    ).rejects.toMatchObject({
      diagnostic: {
        status: "pat_invalid_or_missing_scope",
        authMode: "pat",
        retryable: false,
      },
    });
  });

  it("maps generic PAT tool failures into ADO diagnostics", () => {
    const diagnostic = adoAuthDiagnosticFromError(
      new ToolError("ADO PAT was rejected with HTTP 401. Check the PAT value and scopes."),
      "pat",
    );

    expect(diagnostic).toEqual({
      status: "pat_invalid_or_missing_scope",
      authMode: "pat",
      message: "ADO PAT was rejected with HTTP 401. Check the PAT value and scopes.",
      retryable: false,
    });
  });

  it("preserves explicit ADO diagnostics", () => {
    const err = new AdoAuthDiagnosticError({
      status: "oauth_no_org_access",
      authMode: "oauth",
      message: "no access",
      retryable: true,
    });

    expect(adoAuthDiagnosticFromError(err)).toEqual(err.diagnostic);
  });
});
