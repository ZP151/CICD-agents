import { describe, expect, it, vi } from "vitest";
import {
  addAzurePullRequestLabel,
  addAzurePullRequestReviewer,
  removeAzurePullRequestLabel,
  removeAzurePullRequestReviewer,
  updateAzurePullRequest,
} from "../src/tools/azureDevOps.js";
import { jsonResponse, mockJson } from "./adoTestDoubles.js";

describe("internal Azure DevOps pull request mutation ports", () => {
  it("updates pull request title and description through a typed patch", async () => {
    const fetchMock = mockJson({
      pullRequestId: 42,
      title: "New title",
      description: "New description",
      status: "active",
    });

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
      .mockResolvedValueOnce(jsonResponse({
        id: "reviewer-1",
        displayName: "Ada Lovelace",
        uniqueName: "ada@example.com",
        vote: 0,
        isRequired: false,
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const added = await addAzurePullRequestReviewer({
      organization: "demo-org",
      project: "Agents",
      repository: "mergepilot",
      pullRequestId: 42,
      reviewerId: "ada@example.com",
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
      expect.objectContaining({ method: "PUT" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/mergepilot/pullRequests/42/reviewers/ada%40example.com?api-version=7.1-preview.1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(added).toMatchObject({ reviewerId: "reviewer-1", displayName: "Ada Lovelace", action: "added" });
    expect(removed).toMatchObject({ reviewerId: "ada@example.com", action: "removed" });
  });

  it("adds and removes pull request labels through typed label endpoints", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        id: "label-1",
        name: "ready-for-review",
        active: true,
      }))
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
