import { afterEach, describe, expect, it, vi } from "vitest";
import { listAzureBranchPolicyConfigurations } from "../src/ado/policy.js";

afterEach(() => vi.restoreAllMocks());

describe("listAzureBranchPolicyConfigurations", () => {
  it("uses the Git-scoped endpoint and returns only active configurations", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      value: [
        {
          id: 17,
          revision: 3,
          isEnabled: true,
          isBlocking: true,
          type: { id: "minimum-reviewers", displayName: "Minimum number of reviewers" },
        },
        {
          id: 18,
          revision: 1,
          isEnabled: true,
          isBlocking: false,
          isDeleted: true,
          type: { id: "deleted", displayName: "Deleted policy" },
        },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const policies = await listAzureBranchPolicyConfigurations({
      organization: "https://dev.azure.com/tebssg",
      project: "TeBS-ClaimBot",
      repositoryId: "repo-guid",
      refName: "main",
      auth: { mode: "pat", pat: "test" },
    });

    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("/_apis/git/policy/configurations?");
    expect(calledUrl).toContain("repositoryId=repo-guid");
    expect(calledUrl).toContain("refName=refs%2Fheads%2Fmain");
    expect(calledUrl).toContain("api-version=7.1");
    expect(policies).toEqual([{
      id: 17,
      revision: 3,
      typeId: "minimum-reviewers",
      displayName: "Minimum number of reviewers",
      isEnabled: true,
      isBlocking: true,
    }]);
  });
});
