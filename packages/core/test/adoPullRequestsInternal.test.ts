import { describe, expect, it, vi } from "vitest";
import {
  getAzurePullRequestById,
  listAzurePullRequestChanges,
  listAzurePullRequestPolicyEvaluations,
  listAzurePullRequestThreads,
  listAzurePullRequestWorkItems,
} from "../src/tools/azureDevOps.js";
import { jsonResponse, mockJson } from "./adoTestDoubles.js";

describe("internal Azure DevOps pull request read ports", () => {
  it("gets a pull request by ID with trimmed MCP-style details", async () => {
    const fetchMock = mockJson({
      pullRequestId: 42,
      codeReviewId: 1001,
      title: "Improve agent",
      description: "Detailed body",
      status: "active",
      isDraft: false,
      sourceRefName: "refs/heads/feature/agent",
      targetRefName: "refs/heads/main",
      creationDate: "2026-06-10T10:00:00Z",
      closedDate: "",
      createdBy: { displayName: "Ada" },
      repository: { name: "mergepilot", project: { name: "Agents" } },
      reviewers: [{ vote: 10 }, { vote: 0 }, { vote: -10 }],
      workItemRefs: [{ id: "123", url: "https://ado/_apis/wit/workItems/123" }],
    });

    const pr = await getAzurePullRequestById({
      organization: "demo-org",
      project: "Agents",
      repository: "mergepilot",
      pullRequestId: 42,
      pat: "pat",
      includeWorkItemRefs: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/mergepilot/pullrequests/42?api-version=7.1-preview.1&includeWorkItemRefs=true",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(pr).toMatchObject({
      id: 42,
      codeReviewId: 1001,
      title: "Improve agent",
      description: "Detailed body",
      sourceBranch: "feature/agent",
      targetBranch: "main",
      reviewerCount: 3,
      voteSummary: { approved: 1, waiting: 1, rejected: 1 },
      workItemRefs: [{ id: "123", url: "https://ado/_apis/wit/workItems/123" }],
    });
  });

  it("lists pull request threads with author/status filtering and deleted comments removed", async () => {
    mockJson({
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
    });

    const threads = await listAzurePullRequestThreads({
      organization: "demo-org",
      project: "Agents",
      repository: "mergepilot",
      pullRequestId: 42,
      pat: "pat",
      status: 1,
      authorEmail: "ada@example.com",
    });

    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      id: 2,
      status: 1,
      comments: [{ id: 21, content: "Please fix" }],
      threadContext: { filePath: "/src/app.ts" },
    });
  });

  it("lists pull request changed files from the latest iteration", async () => {
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
        changeEntries: [
          {
            changeId: 10,
            changeType: "edit",
            originalPath: "/src/old.ts",
            item: {
              path: "/src/new.ts",
              gitObjectType: "blob",
              commitId: "source-commit",
            },
          },
        ],
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

  it("lists pull request work item details", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        value: [{ id: "123", url: "https://dev.azure.com/demo-org/_apis/wit/workItems/123" }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        value: [{
          id: 123,
          url: "https://dev.azure.com/demo-org/_apis/wit/workItems/123",
          fields: {
            "System.WorkItemType": "User Story",
            "System.Title": "Harden token validation",
            "System.State": "Active",
            "System.AssignedTo": { displayName: "Ada Lovelace" },
            "System.Tags": "security; auth",
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
      "https://dev.azure.com/demo-org/Agents/_apis/wit/workitems?ids=123&$expand=Relations&api-version=7.1-preview.3",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(workItems).toEqual([{
      id: 123,
      url: "https://dev.azure.com/demo-org/_apis/wit/workItems/123",
      type: "User Story",
      title: "Harden token validation",
      state: "Active",
      assignedTo: "Ada Lovelace",
      tags: ["security", "auth"],
    }]);
  });

  it("lists pull request policy evaluations", async () => {
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
});
