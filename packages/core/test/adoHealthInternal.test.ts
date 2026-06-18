import { describe, expect, it, vi } from "vitest";
import { checkAzureDevOpsTools } from "../src/tools/azureDevOps.js";
import { mockJson } from "./adoTestDoubles.js";

describe("internal Azure DevOps health diagnostics", () => {
  it("reports auth mode from internal ADO tool health checks", async () => {
    mockJson({ value: [{ id: "project-1", name: "Agents" }] });

    const health = await checkAzureDevOpsTools({
      organization: "demo-org",
      pat: "pat",
    });

    expect(health).toMatchObject({
      ok: true,
      source: "internal",
      authMode: "pat",
      authStatus: "ok",
      projectCount: 1,
    });
    expect(health.toolCount).toBeGreaterThan(0);
  });

  it("classifies rejected PAT auth during health checks", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(checkAzureDevOpsTools({
      organization: "demo-org",
      pat: "bad-pat",
    })).rejects.toMatchObject({
      diagnostic: {
        status: "pat_invalid_or_missing_scope",
        authMode: "pat",
        retryable: false,
      },
    });
  });
});
