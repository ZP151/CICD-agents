import { afterEach, describe, expect, it, vi } from "vitest";
import { readAzureBranchObjectId } from "../src/ado/refs.js";
import { jsonResponse } from "./adoTestDoubles.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Azure DevOps branch refs", () => {
  it("queries the API-relative heads path and returns the exact canonical ref", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      value: [
        { name: "refs/heads/mergepilot-e2e/guided-pr-v1-old", objectId: "old" },
        { name: "refs/heads/mergepilot-e2e/guided-pr-v1", objectId: "abc123" },
      ],
    }));

    const result = await readAzureBranchObjectId({
      organization: "demo-org",
      project: "ClaimBot",
      repository: "repo-guid",
      branch: "mergepilot-e2e/guided-pr-v1",
      auth: { mode: "oauth", header: "Bearer test" },
    });

    expect(result).toEqual({
      name: "refs/heads/mergepilot-e2e/guided-pr-v1",
      objectId: "abc123",
    });
    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain("filter=heads%2Fmergepilot-e2e%2Fguided-pr-v1");
    expect(requestUrl).not.toContain("filterContains=");
    expect(requestUrl).not.toContain("filter=refs%2Fheads");
  });

  it("accepts an already canonical branch ref without duplicating its namespace", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      value: [{ name: "refs/heads/main", objectId: "def456" }],
    }));

    await expect(readAzureBranchObjectId({
      organization: "demo-org",
      project: "ClaimBot",
      repository: "repo-guid",
      branch: "refs/heads/main",
      auth: { mode: "oauth", header: "Bearer test" },
    })).resolves.toEqual({ name: "refs/heads/main", objectId: "def456" });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("filter=heads%2Fmain");
  });
});
