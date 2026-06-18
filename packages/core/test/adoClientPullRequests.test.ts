import { describe, expect, it, vi } from "vitest";
import { listAzurePullRequestPolicyEvaluations } from "../src/ado/policy.js";
import { listAzurePullRequestChanges } from "../src/ado/pullRequestChanges.js";
import { listAzurePullRequestThreads } from "../src/ado/pullRequestThreads.js";
import { listAzurePullRequests } from "../src/ado/pullRequests.js";
import { listAzurePullRequestWorkItems } from "../src/ado/workItems.js";
import { jsonResponse } from "./adoTestDoubles.js";

describe("Azure DevOps pull request modules", () => {
  it("lists pull requests through the ADO pull request module", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        value: [
          {
            pullRequestId: 42,
            title: "Improve agent",
            status: "active",
            isDraft: false,
            sourceRefName: "refs/heads/feature/agent",
            targetRefName: "refs/heads/main",
            creationDate: "2026-06-10T10:00:00Z",
            createdBy: { displayName: "Ada" },
            repository: { name: "mergepilot" },
            reviewers: [{ vote: 10 }, { vote: 0 }, { vote: -10 }],
          },
        ],
      }),
    );

    const pullRequests = await listAzurePullRequests({
      organization: "demo-org",
      project: "Agents",
      repository: "mergepilot",
      pat: "pat",
      top: 5,
      status: "active",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/mergepilot/pullrequests?searchCriteria.status=active&%24top=5&api-version=7.1-preview.1",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(pullRequests).toEqual([
      expect.objectContaining({
        id: 42,
        title: "Improve agent",
        sourceBranch: "feature/agent",
        targetBranch: "main",
        reviewerCount: 3,
        voteSummary: { approved: 1, waiting: 1, rejected: 1 },
      }),
    ]);
  });

  it("lists pull request work items through the ADO work-items module", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        value: [{ url: "https://dev.azure.com/demo-org/_apis/wit/workItems/456" }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        value: [{
          id: 456,
          url: "https://dev.azure.com/demo-org/_apis/wit/workItems/456",
          fields: {
            "System.WorkItemType": "Bug",
            "System.Title": "Fix PR insight sync",
            "System.State": "Active",
            "System.AssignedTo": "Ada Lovelace",
            "System.Tags": "review; ado",
          },
        }],
      }));

    const workItems = await listAzurePullRequestWorkItems({
      organization: "demo-org",
      project: "Agents",
      repository: "mergepilot",
      pullRequestId: 42,
      pat: "pat",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/mergepilot/pullrequests/42/workitems?api-version=7.1-preview.1",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://dev.azure.com/demo-org/Agents/_apis/wit/workitems?ids=456&$expand=Relations&api-version=7.1-preview.3",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(workItems).toEqual([{
      id: 456,
      url: "https://dev.azure.com/demo-org/_apis/wit/workItems/456",
      type: "Bug",
      title: "Fix PR insight sync",
      state: "Active",
      assignedTo: "Ada Lovelace",
      tags: ["review", "ado"],
    }]);
  });

  it("lists pull request policy evaluations through the ADO policy module", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        pullRequestId: 42,
        codeReviewId: 420,
        title: "Improve agent",
        sourceRefName: "refs/heads/feature/agent",
        targetRefName: "refs/heads/main",
        repository: { name: "mergepilot", project: { id: "project-guid", name: "Agents" } },
      }))
      .mockResolvedValueOnce(jsonResponse({
        value: [{
          evaluationId: "eval-1",
          status: "approved",
          startedDate: "2026-06-11T00:00:00Z",
          completedDate: "2026-06-11T00:01:00Z",
          configuration: {
            id: 7,
            isBlocking: true,
            settings: { displayName: "Minimum reviewers" },
            type: { displayName: "Reviewer count" },
          },
        }],
      }));

    const policies = await listAzurePullRequestPolicyEvaluations({
      organization: "demo-org",
      project: "Agents",
      repository: "mergepilot",
      pullRequestId: 42,
      pat: "pat",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://dev.azure.com/demo-org/Agents/_apis/policy/evaluations?artifactId=vstfs%3A%2F%2F%2FCodeReview%2FCodeReviewId%2Fproject-guid%2F420&api-version=7.1-preview.1",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(policies).toEqual([{
      id: "eval-1",
      status: "approved",
      startedDate: "2026-06-11T00:00:00Z",
      completedDate: "2026-06-11T00:01:00Z",
      displayName: "Minimum reviewers",
      typeName: "Reviewer count",
      configurationId: 7,
      isBlocking: true,
    }]);
  });

  it("lists pull request threads through the ADO threads module", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        value: [
          {
            id: 2,
            status: 1,
            comments: [
              { id: 20, isDeleted: true, author: { displayName: "Ada", uniqueName: "ada@example.com" }, content: "old" },
              { id: 21, author: { displayName: "Ada", uniqueName: "ada@example.com" }, content: "Please fix", publishedDate: "now" },
            ],
            threadContext: { filePath: "/src/app.ts" },
          },
          {
            id: 1,
            status: 2,
            comments: [{ id: 10, author: { displayName: "Grace", uniqueName: "grace@example.com" }, content: "Other" }],
          },
        ],
      }),
    );

    const threads = await listAzurePullRequestThreads({
      organization: "demo-org",
      project: "Agents",
      repository: "mergepilot",
      pullRequestId: 42,
      pat: "pat",
      status: 1,
      authorEmail: "ada@example.com",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/mergepilot/pullrequests/42/threads?api-version=7.1-preview.1",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(threads).toEqual([{
      id: 2,
      publishedDate: "",
      lastUpdatedDate: "",
      status: 1,
      comments: [{
        id: 21,
        author: { displayName: "Ada", uniqueName: "ada@example.com" },
        content: "Please fix",
        publishedDate: "now",
        lastUpdatedDate: "",
        lastContentUpdatedDate: "",
      }],
      threadContext: { filePath: "/src/app.ts" },
    }]);
  });

  it("lists pull request changed files through the ADO changes module", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        value: [
          { id: 1, sourceRefCommit: { commitId: "old" } },
          {
            id: 3,
            sourceRefCommit: { commitId: "source-commit" },
            targetRefCommit: { commitId: "target-commit" },
            commonRefCommit: { commitId: "common-commit" },
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        changeEntries: [{
          changeId: 10,
          changeType: "edit",
          originalPath: "/src/old.ts",
          item: {
            path: "/src/new.ts",
            gitObjectType: "blob",
            commitId: "source-commit",
          },
        }],
        nextSkip: 1,
      }));

    const changes = await listAzurePullRequestChanges({
      organization: "demo-org",
      project: "Agents",
      repository: "mergepilot",
      pullRequestId: 42,
      pat: "pat",
      top: 50,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/mergepilot/pullrequests/42/iterations?api-version=7.1-preview.1",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/mergepilot/pullrequests/42/iterations/3/changes?api-version=7.1-preview.1&%24top=50",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(changes).toEqual({
      iterationId: 3,
      sourceCommit: "source-commit",
      targetCommit: "target-commit",
      commonCommit: "common-commit",
      fileCount: 1,
      changes: [{
        changeId: 10,
        changeType: "edit",
        path: "/src/new.ts",
        originalPath: "/src/old.ts",
        gitObjectType: "blob",
        commitId: "source-commit",
      }],
      nextSkip: 1,
      nextTop: undefined,
    });
  });
});
