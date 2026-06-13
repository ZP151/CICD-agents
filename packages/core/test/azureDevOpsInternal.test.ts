import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addAzurePullRequestLabel,
  addAzurePullRequestReviewer,
  getAzurePipelineRun,
  getAzureBuildLogExcerpt,
  getAzurePullRequestById,
  checkAzureDevOpsTools,
  listAzurePullRequestChanges,
  listAzureBuildDefinitions,
  listAzureBuilds,
  listAzurePullRequestPolicyEvaluations,
  listAzurePullRequestThreads,
  listAzurePullRequestWorkItems,
  removeAzurePullRequestLabel,
  removeAzurePullRequestReviewer,
  updateAzurePullRequest,
} from "../src/tools/azureDevOps.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockJson(value: unknown): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("internal Azure DevOps MCP-style ports", () => {
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
      repository: { name: "cicd-agent", project: { name: "Agents" } },
      reviewers: [{ vote: 10 }, { vote: 0 }, { vote: -10 }],
      workItemRefs: [{ id: "123", url: "https://ado/_apis/wit/workItems/123" }],
    });

    const pr = await getAzurePullRequestById({
      organization: "demo-org",
      project: "Agents",
      repository: "cicd-agent",
      pullRequestId: 42,
      pat: "pat",
      includeWorkItemRefs: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/cicd-agent/pullrequests/42?api-version=7.1-preview.1&includeWorkItemRefs=true",
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
      repository: "cicd-agent",
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

  it("lists builds with branch normalization and trimmed build data", async () => {
    const fetchMock = mockJson({
      value: [
        {
          id: 77,
          buildNumber: "20260610.1",
          status: "completed",
          result: "succeeded",
          queueTime: "2026-06-10T10:00:00Z",
          startTime: "2026-06-10T10:01:00Z",
          finishTime: "2026-06-10T10:05:00Z",
          sourceBranch: "refs/heads/main",
          sourceVersion: "abcdef",
          definition: { name: "CI" },
          repository: { name: "cicd-agent" },
          requestedFor: { displayName: "Ada" },
          _links: { web: { href: "https://ado/build/77" } },
        },
      ],
    });

    const builds = await listAzureBuilds({
      organization: "demo-org",
      project: "Agents",
      pat: "pat",
      definitions: [12],
      branchName: "main",
      top: 5,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.azure.com/demo-org/Agents/_apis/build/builds?queryOrder=queueTimeDescending&%24top=5&api-version=7.1-preview.7&definitions=12&branchName=refs%2Fheads%2Fmain",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(builds).toEqual([
      {
        id: 77,
        buildNumber: "20260610.1",
        status: "completed",
        result: "succeeded",
        queueTime: "2026-06-10T10:00:00Z",
        startTime: "2026-06-10T10:01:00Z",
        finishTime: "2026-06-10T10:05:00Z",
        sourceBranch: "main",
        sourceVersion: "abcdef",
        definitionName: "CI",
        repository: "cicd-agent",
        requestedFor: "Ada",
        url: "https://ado/build/77",
      },
    ]);
  });

  it("includes repository and yaml metadata in build definition discovery", async () => {
    mockJson({
      value: [{
        id: 12,
        name: "web-app CI",
        path: "\\",
        repository: { name: "web-app", type: "TfsGit" },
        process: { yamlFilename: "azure-pipelines.yml" },
        _links: { web: { href: "https://ado/definition/12" } },
      }],
    });

    const definitions = await listAzureBuildDefinitions({
      organization: "demo-org",
      project: "Agents",
      pat: "pat",
    });

    expect(definitions).toEqual([{
      id: "12",
      name: "web-app CI",
      description: "\\ · repo:web-app · type:TfsGit · yaml:azure-pipelines.yml",
      url: "https://ado/definition/12",
    }]);
  });

  it("sends repository type when build definition discovery is filtered by repository", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        value: [{ id: "repo-1", name: "web-app", defaultBranch: "refs/heads/main" }],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        value: [{
          id: 12,
          name: "web-app CI",
          repository: { name: "web-app", type: "TfsGit" },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } }));

    await listAzureBuildDefinitions({
      organization: "demo-org",
      project: "Agents",
      repositoryId: "web-app",
      pat: "pat",
    });

    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("repositoryId=repo-1");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("repositoryType=TfsGit");
  });

  it("gets a pipeline run by ID", async () => {
    mockJson({
      id: 88,
      name: "Run 88",
      state: "completed",
      result: "succeeded",
      createdDate: "2026-06-10T10:00:00Z",
      finishedDate: "2026-06-10T10:05:00Z",
      resources: { repositories: { self: { refName: "refs/heads/main" } } },
      _links: { web: { href: "https://ado/run/88" } },
    });

    const run = await getAzurePipelineRun({
      organization: "demo-org",
      project: "Agents",
      pipelineId: 12,
      runId: 88,
      pat: "pat",
    });

    expect(run).toMatchObject({
      id: 88,
      name: "Run 88",
      sourceBranch: "main",
      url: "https://ado/run/88",
    });
  });

  it("gets a diagnostic build log excerpt around failure lines", async () => {
    const lines = Array.from({ length: 120 }, (_, index) => `noise line ${index + 1}`);
    lines[70] = "##[error]AssertionError: expected true to be false";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(lines.join("\n"), {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );

    const excerpt = await getAzureBuildLogExcerpt({
      organization: "demo-org",
      project: "Agents",
      buildId: 77,
      logId: 9,
      pat: "pat",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.azure.com/demo-org/Agents/_apis/build/builds/77/logs/9?api-version=7.1-preview.7",
      expect.objectContaining({
        redirect: "manual",
        headers: expect.objectContaining({ Accept: "text/plain" }),
      }),
    );
    expect(excerpt).toMatchObject({
      buildId: 77,
      logId: 9,
      lineCount: 120,
      truncated: true,
    });
    expect(excerpt.startLine).toBeGreaterThan(1);
    expect(excerpt.excerpt).toContain("AssertionError: expected true to be false");
    expect(excerpt.excerpt.split("\n")).not.toContain("noise line 1");
  });

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
      repository: "cicd-agent",
      pullRequestId: 42,
      title: "New title",
      description: "New description",
      pat: "pat",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/cicd-agent/pullrequests/42?api-version=7.1-preview.1",
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
        vote: 0,
        isRequired: false,
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const added = await addAzurePullRequestReviewer({
      organization: "demo-org",
      project: "Agents",
      repository: "cicd-agent",
      pullRequestId: 42,
      reviewerId: "ada@example.com",
      pat: "pat",
    });
    const removed = await removeAzurePullRequestReviewer({
      organization: "demo-org",
      project: "Agents",
      repository: "cicd-agent",
      pullRequestId: 42,
      reviewerId: "ada@example.com",
      pat: "pat",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/cicd-agent/pullRequests/42/reviewers/ada%40example.com?api-version=7.1-preview.1",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/cicd-agent/pullRequests/42/reviewers/ada%40example.com?api-version=7.1-preview.1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(added).toMatchObject({ reviewerId: "reviewer-1", displayName: "Ada Lovelace", action: "added" });
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
      repository: "cicd-agent",
      pullRequestId: 42,
      label: "ready-for-review",
      pat: "pat",
    });
    const removed = await removeAzurePullRequestLabel({
      organization: "demo-org",
      project: "Agents",
      repository: "cicd-agent",
      pullRequestId: 42,
      label: "ready-for-review",
      pat: "pat",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/cicd-agent/pullRequests/42/labels?api-version=7.1-preview.1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "ready-for-review" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/cicd-agent/pullRequests/42/labels/ready-for-review?api-version=7.1-preview.1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(added).toMatchObject({ id: "label-1", name: "ready-for-review", action: "added" });
    expect(removed).toMatchObject({ name: "ready-for-review", active: false, action: "removed" });
  });

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

  it("lists pull request changed files from the latest iteration", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        value: [
          { id: 1, sourceRefCommit: { commitId: "old" } },
          {
            id: 3,
            sourceRefCommit: { commitId: "source-commit" },
            targetRefCommit: { commitId: "target-commit" },
            commonRefCommit: { commitId: "common-commit" },
          },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
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
      }), { status: 200, headers: { "content-type": "application/json" } }));

    const changes = await listAzurePullRequestChanges({
      organization: "demo-org",
      project: "Agents",
      repository: "cicd-agent",
      pullRequestId: 42,
      pat: "pat",
      top: 50,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/cicd-agent/pullrequests/42/iterations?api-version=7.1-preview.1",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/cicd-agent/pullrequests/42/iterations/3/changes?api-version=7.1-preview.1&%24top=50",
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
      .mockResolvedValueOnce(new Response(JSON.stringify({
        value: [{ id: "123", url: "https://dev.azure.com/demo-org/_apis/wit/workItems/123" }],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
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
      }), { status: 200, headers: { "content-type": "application/json" } }));

    const workItems = await listAzurePullRequestWorkItems({
      organization: "demo-org",
      project: "Agents",
      repository: "cicd-agent",
      pullRequestId: 42,
      pat: "pat",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/cicd-agent/pullrequests/42/workitems?api-version=7.1-preview.1",
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
      .mockResolvedValueOnce(new Response(JSON.stringify({
        pullRequestId: 42,
        codeReviewId: 420,
        title: "Improve agent",
        sourceRefName: "refs/heads/feature/agent",
        targetRefName: "refs/heads/main",
        repository: { name: "cicd-agent", project: { id: "project-guid", name: "Agents" } },
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
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
      }), { status: 200, headers: { "content-type": "application/json" } }));

    const policies = await listAzurePullRequestPolicyEvaluations({
      organization: "demo-org",
      project: "Agents",
      repository: "cicd-agent",
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
