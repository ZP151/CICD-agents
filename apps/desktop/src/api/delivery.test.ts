import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPullRequestPreparation, rejectDeliveryAction } from "./delivery.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("delivery action API", () => {
  it("rejects a pending write without executing it", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "work-action-1",
      status: "rejected",
      kind: "work_item.update",
      target: { id: 123 },
      payload: {},
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(rejectDeliveryAction("work-action-1")).resolves.toMatchObject({ status: "rejected" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/delivery\/actions\/work-action-1\/reject$/),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("fetchPullRequestPreparation", () => {
  it("posts only user preferences and returns the canonical evidence model", async () => {
    const responseBody = {
      projectLinkId: "claimbot",
      repositoryId: "repo-guid",
      generatedAt: 1,
      git: {
        repoPath: "C:/repo",
        sourceBranch: "feature/x",
        targetBranch: "main",
        headSha: "abc",
        dirty: false,
        changedFiles: [],
        diffStat: "",
        commits: [],
        targetAvailability: "available",
      },
      validation: { status: "not_run", summary: "not run" },
      workItem: { status: "missing" },
      policies: { status: "available", targetRef: "refs/heads/main", configurations: [] },
      suggestion: {
        sourceBranch: "feature/x",
        targetBranch: "main",
        title: "Feature x",
        description: "",
        draft: false,
        reviewerFocus: [],
        risks: [],
        missingEvidence: [],
        readiness: "needs_attention",
      },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const result = await fetchPullRequestPreparation({
      projectLinkId: "claimbot",
      targetBranch: "main",
      workItemId: 7913,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/delivery/pull-request-preparation");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      projectLinkId: "claimbot",
      targetBranch: "main",
      workItemId: 7913,
    });
    expect(result.repositoryId).toBe("repo-guid");
  });
});
