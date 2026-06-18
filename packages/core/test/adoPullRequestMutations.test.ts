import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addAzurePullRequestLabel,
  addAzurePullRequestReviewer,
  createAzurePullRequest,
  removeAzurePullRequestLabel,
  removeAzurePullRequestReviewer,
  updateAzurePullRequest,
} from "../src/ado/pullRequestMutations.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Azure DevOps pull request mutation module", () => {
  it("creates pull requests through the ADO Git API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        pullRequestId: 42,
        status: "active",
        createdBy: { displayName: "Ada Lovelace" },
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );

    const created = await createAzurePullRequest({
      organization: "demo-org",
      project: "Agents",
      repository: "mergepilot",
      sourceBranch: "feature/tool-registry",
      targetBranch: "main",
      title: "Extract ADO registry",
      description: "Move registry adapter",
      draft: true,
      pat: "pat",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/mergepilot/pullrequests?api-version=7.1-preview.1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          sourceRefName: "refs/heads/feature/tool-registry",
          targetRefName: "refs/heads/main",
          title: "Extract ADO registry",
          description: "Move registry adapter",
          isDraft: true,
        }),
      }),
    );
    expect(created).toEqual({
      pull_request_id: 42,
      url: "https://dev.azure.com/demo-org/Agents/_git/mergepilot/pullrequest/42",
      status: "active",
      created_by: "Ada Lovelace",
    });
  });

  it("patches pull request metadata through the ADO Git API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        pullRequestId: 42,
        title: "New title",
        description: "New description",
        status: "active",
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );

    const updated = await updateAzurePullRequest({
      organization: "demo-org",
      project: "Agents",
      repository: "mergepilot",
      pullRequestId: 42,
      title: "New title",
      description: "New description",
      pat: "pat",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/mergepilot/pullrequests/42?api-version=7.1-preview.1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "New title", description: "New description" }),
      }),
    );
    expect(updated).toMatchObject({
      id: 42,
      title: "New title",
      description: "New description",
      status: "active",
    });
  });

  it("adds and removes pull request reviewers through typed reviewer endpoints", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "reviewer-1",
        displayName: "Ada Lovelace",
        uniqueName: "ada@example.com",
        vote: 10,
        isRequired: true,
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const added = await addAzurePullRequestReviewer({
      organization: "demo-org",
      project: "Agents",
      repository: "mergepilot",
      pullRequestId: 42,
      reviewerId: "ada@example.com",
      vote: 10,
      isRequired: true,
      pat: "pat",
    });
    const removed = await removeAzurePullRequestReviewer({
      organization: "demo-org",
      project: "Agents",
      repository: "mergepilot",
      pullRequestId: 42,
      reviewerId: "ada@example.com",
      pat: "pat",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/mergepilot/pullRequests/42/reviewers/ada%40example.com?api-version=7.1-preview.1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ vote: 10, isRequired: true }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/mergepilot/pullRequests/42/reviewers/ada%40example.com?api-version=7.1-preview.1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(added).toMatchObject({ reviewerId: "reviewer-1", vote: 10, isRequired: true, action: "added" });
    expect(removed).toMatchObject({ reviewerId: "ada@example.com", action: "removed" });
  });

  it("adds and removes pull request labels through typed label endpoints", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "label-1",
        name: "ready-for-review",
        active: true,
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const added = await addAzurePullRequestLabel({
      organization: "demo-org",
      project: "Agents",
      repository: "mergepilot",
      pullRequestId: 42,
      label: "ready-for-review",
      pat: "pat",
    });
    const removed = await removeAzurePullRequestLabel({
      organization: "demo-org",
      project: "Agents",
      repository: "mergepilot",
      pullRequestId: 42,
      label: "ready-for-review",
      pat: "pat",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/mergepilot/pullRequests/42/labels?api-version=7.1-preview.1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "ready-for-review" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/mergepilot/pullRequests/42/labels/ready-for-review?api-version=7.1-preview.1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(added).toMatchObject({ id: "label-1", name: "ready-for-review", action: "added" });
    expect(removed).toMatchObject({ name: "ready-for-review", active: false, action: "removed" });
  });
});
