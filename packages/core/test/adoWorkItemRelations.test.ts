import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyWorkItemRelation,
  parseWorkItemRelationLinks,
  readAzureWorkItemDetail,
  type AzureWorkItemDetail,
} from "../src/ado/workItems.js";
import { jsonResponse } from "./adoTestDoubles.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("classifyWorkItemRelation", () => {
  it("maps hierarchy links to parent/child with the target work item id", () => {
    expect(classifyWorkItemRelation("System.LinkTypes.Hierarchy-Forward", "https://dev.azure.com/o/p/_apis/wit/workItems/42"))
      .toEqual({ kind: "child", id: 42 });
    expect(classifyWorkItemRelation("System.LinkTypes.Hierarchy-Reverse", "https://dev.azure.com/o/p/_apis/wit/workItems/7"))
      .toEqual({ kind: "parent", id: 7 });
    expect(classifyWorkItemRelation("System.LinkTypes.Hierarchy-Forward", "https://dev.azure.com/o/p/_workitems/edit/99"))
      .toEqual({ kind: "child", id: 99 });
  });

  it("maps dependency links in both directions", () => {
    expect(classifyWorkItemRelation("System.LinkTypes.Dependency-Forward", "https://dev.azure.com/o/p/_apis/wit/workItems/5"))
      .toEqual({ kind: "dependency", id: 5 });
    expect(classifyWorkItemRelation("System.LinkTypes.Dependency-Reverse", "https://dev.azure.com/o/p/_apis/wit/workItems/6"))
      .toEqual({ kind: "depended_on_by", id: 6 });
  });

  it("maps related and duplicate links", () => {
    expect(classifyWorkItemRelation("System.LinkTypes.Related", "https://dev.azure.com/o/p/_apis/wit/workItems/8"))
      .toEqual({ kind: "related", id: 8 });
    expect(classifyWorkItemRelation("System.LinkTypes.Duplicate-Forward", "https://dev.azure.com/o/p/_apis/wit/workItems/9"))
      .toEqual({ kind: "duplicate", id: 9 });
    expect(classifyWorkItemRelation("System.LinkTypes.Duplicate-Reverse", "https://dev.azure.com/o/p/_apis/wit/workItems/10"))
      .toEqual({ kind: "duplicate", id: 10 });
  });

  it("decodes pull request artifact links (both separators) with repo id label", () => {
    const encoded = classifyWorkItemRelation(
      "ArtifactLink",
      "vstfs:///Git/PullRequestId/project-guid%2Frepo-guid%2F123",
    );
    expect(encoded).toEqual({ kind: "pull_request", id: 123, label: "repo-guid" });

    const slashed = classifyWorkItemRelation(
      "ArtifactLink",
      "vstfs:///Git/PullRequestId/project-guid/repo-guid/124",
    );
    expect(slashed).toEqual({ kind: "pull_request", id: 124, label: "repo-guid" });
  });

  it("decodes build and branch artifact links", () => {
    expect(classifyWorkItemRelation("ArtifactLink", "vstfs:///Build/Build/5001"))
      .toEqual({ kind: "build", id: 5001 });
    expect(classifyWorkItemRelation("ArtifactLink", "vstfs:///Git/Ref/pid/rid/refs%2Fheads%2Ffeature%2Ffoo"))
      .toEqual({ kind: "branch", label: "feature/foo" });
    expect(classifyWorkItemRelation("ArtifactLink", "vstfs:///Git/Ref/pid/rid/refs/heads/main"))
      .toEqual({ kind: "branch", label: "main" });
  });

  it("labels unknown artifact urls as unknown instead of guessing", () => {
    expect(classifyWorkItemRelation("ArtifactLink", "vstfs:///Something/Else"))
      .toEqual({ kind: "unknown" });
    expect(classifyWorkItemRelation("Some.Custom.LinkType", "https://example.com/whatever"))
      .toEqual({ kind: "unknown" });
    expect(classifyWorkItemRelation("", ""))
      .toEqual({ kind: "unknown" });
  });
});

describe("parseWorkItemRelationLinks", () => {
  it("keeps rel + url on every typed edge and drops empty entries", () => {
    const links = parseWorkItemRelationLinks([
      { rel: "System.LinkTypes.Hierarchy-Reverse", url: "https://dev.azure.com/o/p/_apis/wit/workItems/1" },
      { rel: "ArtifactLink", url: "vstfs:///Build/Build/9" },
      { rel: "", url: "" },
      { rel: "System.LinkTypes.Related", url: "https://dev.azure.com/o/p/_apis/wit/workItems/2" },
    ]);
    expect(links).toHaveLength(3);
    expect(links[0]).toMatchObject({ rel: "System.LinkTypes.Hierarchy-Reverse", kind: "parent", id: 1 });
    expect(links[1]).toMatchObject({ rel: "ArtifactLink", kind: "build", id: 9 });
    expect(links[2]).toMatchObject({ kind: "related", id: 2 });
  });
});

describe("readAzureWorkItemDetail", () => {
  function routeFetch(routes: Array<{ match: RegExp; body: unknown; status?: number }>): void {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      for (const route of routes) {
        if (route.match.test(url)) {
          return jsonResponse(route.body, route.status ?? 200);
        }
      }
      return jsonResponse({ error: "unexpected fetch", url }, 500);
    });
  }

  it("assembles fields, typed relations, linked PRs, builds and test evidence", async () => {
    routeFetch([
      {
        match: /_apis\/wit\/workitems\/101/,
        body: {
          id: 101,
          rev: 4,
          fields: {
            "System.Title": "Inspector fixture",
            "System.State": "In Progress",
            "System.WorkItemType": "Task",
            "System.Description": "<p>Do the thing</p>",
            "Microsoft.VSTS.Common.AcceptanceCriteria": "It works",
            "System.IterationPath": "TeBS\\Sprint 1",
            "System.Tags": "alpha; beta",
            "System.AssignedTo": { displayName: "Ada Lovelace" },
            "System.CreatedDate": "2026-08-01T00:00:00Z",
            "System.ChangedDate": "2026-08-07T00:00:00Z",
          },
          relations: [
            { rel: "System.LinkTypes.Hierarchy-Reverse", url: "https://dev.azure.com/o/p/_apis/wit/workItems/1" },
            { rel: "ArtifactLink", url: "vstfs:///Git/PullRequestId/g%2Fr%2F321" },
            { rel: "ArtifactLink", url: "vstfs:///Build/Build/5001" },
          ],
        },
      },
      { match: /workItems\/101\/comments/, body: { comments: [{ text: "first" }, { text: "second" }] } },
      { match: /_apis\/git\/repositories\/r\/pullrequests\/321/, body: {
        pullRequestId: 321,
        title: "Inspector PR",
        status: "active",
        sourceRefName: "refs/heads/feature/x",
        targetRefName: "refs/heads/main",
      } },
      { match: /_apis\/build\/builds/, body: { value: [{
        id: 5001,
        buildNumber: "20260807.3",
        status: "completed",
        result: "succeeded",
        definition: { name: "CI" },
        url: "https://dev.azure.com/o/p/_apis/build/Build/5001",
      }] } },
      { match: /_apis\/test\/runs/, body: { value: [
        { totalTests: 40, passedTests: 38, failedTests: 2 },
        { totalTests: 10, passedTests: 10, failedTests: 0 },
      ] } },
    ]);

    const detail = await readAzureWorkItemDetail({ organization: "o", project: "p", workItemId: 101, pat: "test-pat" });

    expect(detail).toMatchObject<Partial<AzureWorkItemDetail>>({
      id: 101,
      revision: 4,
      type: "Task",
      title: "Inspector fixture",
      state: "In Progress",
      description: "Do the thing",
      acceptanceCriteria: "It works",
      iterationPath: "TeBS\\Sprint 1",
      tags: ["alpha", "beta"],
      assignedTo: "Ada Lovelace",
      createdDate: "2026-08-01T00:00:00Z",
      changedDate: "2026-08-07T00:00:00Z",
    });
    expect(detail.comments).toEqual(["first", "second"]);
    expect(detail.relations.map((relation) => relation.kind)).toEqual(["parent", "pull_request", "build"]);
    expect(detail.linkedPullRequests).toEqual([
      { id: 321, title: "Inspector PR", status: "active", sourceBranch: "feature/x", targetBranch: "main", url: expect.stringContaining("pullrequest/321") },
    ]);
    expect(detail.linkedBuilds).toEqual([
      { id: 5001, buildNumber: "20260807.3", status: "completed", result: "succeeded", definitionName: "CI", url: "https://dev.azure.com/o/p/_apis/build/Build/5001" },
    ]);
    expect(detail.testEvidence).toEqual([
      { buildId: 5001, runCount: 2, totalTests: 50, passedTests: 48, failedTests: 2 },
    ]);
  });

  it("degrades missing relations and artifacts to empty rows", async () => {
    routeFetch([
      { match: /_apis\/wit\/workitems\/102/, body: { id: 102, rev: 1, fields: { "System.Title": "bare", "System.State": "New" }, relations: [] } },
      { match: /workItems\/102\/comments/, body: { comments: [] } },
    ]);
    const detail = await readAzureWorkItemDetail({ organization: "o", project: "p", workItemId: 102, pat: "test-pat" });
    expect(detail.relations).toEqual([]);
    expect(detail.linkedPullRequests).toEqual([]);
    expect(detail.linkedBuilds).toEqual([]);
    expect(detail.testEvidence).toEqual([]);
    expect(detail.description).toBeUndefined();
    expect(detail.acceptanceCriteria).toBeUndefined();
  });

  it("keeps long content intact (no truncation on the read path)", async () => {
    const longDescription = `<p>${"word ".repeat(3000)}end</p>`;
    const longComment = "c".repeat(20_000);
    routeFetch([
      { match: /_apis\/wit\/workitems\/103/, body: {
        id: 103, rev: 2,
        fields: {
          "System.Title": "long",
          "System.State": "New",
          "System.Description": longDescription,
          "Microsoft.VSTS.Common.AcceptanceCriteria": "ok",
        },
        relations: [],
      } },
      { match: /workItems\/103\/comments/, body: { comments: [{ text: longComment }] } },
    ]);
    const detail = await readAzureWorkItemDetail({ organization: "o", project: "p", workItemId: 103, pat: "test-pat" });
    expect(detail.description).toBe("word ".repeat(3000).trim() + " end");
    expect(detail.comments[0]).toHaveLength(20_000);
  });

  it("turns an ADO 404 into a machine-readable not-found error", async () => {
    routeFetch([{ match: /_apis\/wit\/workitems\/999/, body: { message: "nope" }, status: 404 }]);
    await expect(readAzureWorkItemDetail({ organization: "o", project: "p", workItemId: 999, pat: "test-pat" }))
      .rejects.toThrow(/work_item_not_found/);
  });

  it("skips failing PR resolution instead of failing the whole read", async () => {
    routeFetch([
      { match: /_apis\/wit\/workitems\/104/, body: {
        id: 104, rev: 1, fields: { "System.Title": "pr-less", "System.State": "New" },
        relations: [{ rel: "ArtifactLink", url: "vstfs:///Git/PullRequestId/g%2Fmissing-repo%2F777" }],
      } },
      { match: /workItems\/104\/comments/, body: { comments: [] } },
      { match: /_apis\/git\/repositories\/missing-repo\/pullrequests\/777/, body: {}, status: 404 },
    ]);
    const detail = await readAzureWorkItemDetail({ organization: "o", project: "p", workItemId: 104, pat: "test-pat" });
    expect(detail.linkedPullRequests).toEqual([]);
    expect(detail.relations.map((relation) => relation.kind)).toContain("pull_request");
  });
});
