import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  adoBuildWebUrl,
  adoPullRequestWebUrl,
  azureWorkItemUrl,
  deliveryActionBelongsToProjectLink,
  deliveryActionCommentText,
  deliveryActionTargetWorkItemId,
  deliveryActionSummary,
  formatAdoDate,
  groupRelationsForInspector,
  handleDetailKeyDown,
  WorkItemDetailLoading,
  WorkItemDetailSections,
  WorkItemLoadingState,
  type InspectedRelationGroup,
} from "./Work.js";
import type { WorkItemDetail } from "../api/delivery.js";

describe("deliveryActionSummary", () => {
  it("formats work item updates instead of coercing the fields object", () => {
    expect(deliveryActionSummary({
      id: "action-1",
      status: "pending",
      kind: "work_item.update",
      target: {},
      payload: { fields: { "System.State": "In Progress" } },
    })).toBe("Set the work item state to In Progress");
  });

  it("keeps an approved comment readable", () => {
    expect(deliveryActionSummary({
      id: "action-2",
      status: "pending",
      kind: "work_item.comment",
      target: {},
      payload: { text: "Validated the deployment evidence." },
    })).toBe("Add this update: Validated the deployment evidence.");
  });

  it("never leaks an object coercion into an approval summary", () => {
    expect(deliveryActionSummary({
      id: "action-3",
      status: "pending",
      kind: "work_item.comment",
      target: {},
      payload: { text: { value: "not plain text" } },
    })).toBe("Add a work item update");

    expect(deliveryActionSummary({
      id: "action-4",
      status: "pending",
      kind: "work_item.update",
      target: {},
      payload: { fields: { "System.State": { value: "In Progress" } } },
    })).toBe("Update the work item");

    expect(deliveryActionCommentText({ payload: { text: { value: "not plain text" } } })).toBe("");
  });

  it("does not keep a work-item approval visible after Context switches Project Link", () => {
    const action = {
      id: "action-3",
      status: "pending",
      kind: "work_item.update",
      target: { projectLinkId: "project-link-a" },
      payload: {},
    };

    expect(deliveryActionBelongsToProjectLink(action, "project-link-a")).toBe(true);
    expect(deliveryActionBelongsToProjectLink(action, "project-link-b")).toBe(false);
    expect(deliveryActionBelongsToProjectLink(action, "")).toBe(false);
  });

  it("keeps a proposed write traceable to its work item while it awaits approval", () => {
    expect(deliveryActionTargetWorkItemId({ target: { id: 7914 } })).toBe(7914);
    expect(deliveryActionTargetWorkItemId({ target: { id: "not-a-work-item" } })).toBeNull();
  });
});

describe("azureWorkItemUrl", () => {
  it("keeps a work item traceable to its authoritative Azure Boards record", () => {
    expect(azureWorkItemUrl({
      adoOrgUrl: "https://tebssg.visualstudio.com/",
      adoProject: "TeBS ClaimBot",
    }, 7914)).toBe("https://tebssg.visualstudio.com/TeBS%20ClaimBot/_workitems/edit/7914");
  });
});

describe("WorkItemLoadingState", () => {
  it("keeps the worklist structure visible while Azure Boards is loading", () => {
    const html = renderToStaticMarkup(<WorkItemLoadingState />);

    expect(html).toContain("Loading work items");
    expect(html).toContain('role="status"');
    expect(html).toContain("workbench-skeleton-block");
  });
});

describe("WorkItemDetailLoading", () => {
  it("announces the authoritative detail read while it is in flight", () => {
    const html = renderToStaticMarkup(<WorkItemDetailLoading />);

    expect(html).toContain("Loading full work item detail");
    expect(html).toContain('role="status"');
  });
});

describe("groupRelationsForInspector", () => {
  const base = { rel: "System.LinkTypes.Hierarchy-Reverse", url: "https://dev.azure.com/o/p/_apis/wit/workItems/1", kind: "parent", id: 1 };

  it("groups typed edges by label and skips PR/build artifacts that have dedicated sections", () => {
    const groups = groupRelationsForInspector([
      { ...base },
      { rel: "System.LinkTypes.Hierarchy-Forward", url: "https://dev.azure.com/o/p/_apis/wit/workItems/2", kind: "child" },
      { rel: "System.LinkTypes.Dependency-Forward", url: "https://dev.azure.com/o/p/_apis/wit/workItems/3", kind: "dependency" },
      { rel: "ArtifactLink", url: "vstfs:///Git/PullRequestId/g%2Fr%2F321", kind: "pull_request" },
      { rel: "ArtifactLink", url: "vstfs:///Build/Build/5001", kind: "build" },
      { rel: "ArtifactLink", url: "vstfs:///Git/Ref/pid/rid/refs%2Fheads%2Ffeature%2Ffoo", kind: "branch", label: "feature/foo" },
      { rel: "Some.Custom.LinkType", url: "https://example.com/whatever", kind: "unknown" },
    ]);

    expect(groups.map((group) => group.label)).toEqual(["Parent", "Children", "Dependencies", "Branches", "Other links"]);
    expect(groups[0]!.links).toEqual([{ key: expect.stringContaining("workItems/1"), text: "#1", id: 1 }]);
    expect(groups[3]!.links[0]!.text).toBe("feature/foo");
    expect(groups[4]!.links[0]!.text).toBe("https://example.com/whatever");
    expect(groups.some((group) => group.links.some((link) => link.text === "#321"))).toBe(false);
  });

  it("returns no groups when only PR/build artifacts are linked", () => {
    expect(groupRelationsForInspector([
      { rel: "ArtifactLink", url: "vstfs:///Git/PullRequestId/g%2Fr%2F321", kind: "pull_request" },
    ])).toEqual([] as InspectedRelationGroup[]);
  });
});

describe("handleDetailKeyDown", () => {
  it("closes the inspector on Escape and nothing else", () => {
    let closed = 0;
    const event = { key: "Escape", preventDefault: () => { closed += 10; } };
    handleDetailKeyDown(event, () => { closed += 1; });
    expect(closed).toBe(11);

    handleDetailKeyDown({ key: "Enter", preventDefault: () => { closed += 10; } }, () => { closed += 1; });
    expect(closed).toBe(11);
  });
});

describe("ado url conversion", () => {
  it("derives a browsable pull request url from the API url", () => {
    expect(adoPullRequestWebUrl("https://dev.azure.com/o/p/_apis/git/repositories/repo-guid/pullrequests/321"))
      .toBe("https://dev.azure.com/o/p/_git/repo-guid/pullrequest/321");
    expect(adoPullRequestWebUrl("https://dev.azure.com/o/p/_apis/git/repositories/r/pullrequests/1")).toMatch(/\/_git\/r\/pullrequest\/1$/);
    expect(adoPullRequestWebUrl(undefined)).toBeNull();
    expect(adoPullRequestWebUrl("not-a-url")).toBeNull();
  });

  it("derives a browsable build url from the API url", () => {
    expect(adoBuildWebUrl("https://dev.azure.com/o/p/_apis/build/Builds/5001"))
      .toBe("https://dev.azure.com/o/p/_build/results?buildId=5001");
    expect(adoBuildWebUrl("https://dev.azure.com/o/p/_apis/build/Build/5001"))
      .toBe("https://dev.azure.com/o/p/_build/results?buildId=5001");
    expect(adoBuildWebUrl("nope")).toBeNull();
  });
});

describe("formatAdoDate", () => {
  it("renders an ISO date deterministically and keeps junk legible", () => {
    expect(formatAdoDate("2026-08-01T00:00:00Z")).toBe("2026-08-01");
    expect(formatAdoDate(undefined)).toBe("—");
    expect(formatAdoDate("not-a-date")).toBe("not-a-date");
  });
});

describe("WorkItemDetailSections", () => {
  const detail: WorkItemDetail = {
    id: 123,
    revision: 4,
    type: "Task",
    title: "Inspector fixture",
    state: "In Progress",
    description: "<p>Do the thing</p>",
    acceptanceCriteria: "It works",
    iterationPath: "TeBS\\Sprint 1",
    tags: ["alpha", "beta"],
    assignedTo: "Ada Lovelace",
    createdDate: "2026-08-01T00:00:00Z",
    changedDate: "2026-08-07T00:00:00Z",
    relations: [
      { rel: "System.LinkTypes.Hierarchy-Reverse", url: "https://dev.azure.com/o/p/_apis/wit/workItems/1", kind: "parent", id: 1 },
      { rel: "ArtifactLink", url: "vstfs:///Git/PullRequestId/g%2Fr%2F321", kind: "pull_request", id: 321, label: "r" },
    ],
    linkedPullRequests: [
      { id: 321, title: "Inspector PR", status: "active", sourceBranch: "feature/x", targetBranch: "main", url: "https://dev.azure.com/o/p/_apis/git/repositories/r/pullrequests/321" },
    ],
    linkedBuilds: [
      { id: 5001, buildNumber: "20260807.3", status: "completed", result: "succeeded", definitionName: "CI", url: "https://dev.azure.com/o/p/_apis/build/Builds/5001" },
    ],
    testEvidence: [
      { buildId: 5001, runCount: 1, totalTests: 40, passedTests: 38, failedTests: 2 },
    ],
    comments: ["first", "second", "third", "fourth"],
  };

  it("renders every inspector section with the authoritative read", () => {
    const html = renderToStaticMarkup(<WorkItemDetailSections detail={detail} projectLink={{ adoOrgUrl: "https://dev.azure.com/o", adoProject: "p" }} />);

    expect(html).toContain("Do the thing");
    expect(html).toContain("Acceptance criteria");
    expect(html).toContain("It works");
    expect(html).toContain("Details");
    expect(html).toContain("TeBS\\Sprint 1");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("alpha, beta");
    expect(html).toContain("2026-08-01");
    expect(html).toContain("Dependencies &amp; links");
    expect(html).toContain("Parent");
    expect(html).toContain("_workitems/edit/1");
    expect(html).toContain("Linked pull requests");
    expect(html).toContain("Inspector PR (#321 · active · feature/x → main)");
    expect(html).toContain("_git/r/pullrequest/321");
    expect(html).toContain("20260807.3 · completed / succeeded · CI");
    expect(html).toContain("_build/results?buildId=5001");
    expect(html).toContain("Test evidence");
    expect(html).toContain("Build 5001: 1 run, 38/40 passed, 2 failed");
    expect(html).toContain("All comments");
    expect(html).toContain("fourth");
  });

  it("keeps the full comment thread instead of truncating to the feed's last three", () => {
    const html = renderToStaticMarkup(<WorkItemDetailSections detail={detail} projectLink={null} />);
    expect(html.match(/• /g)?.length).toBe(4);
  });

  it("renders empty states for missing fields instead of hiding the sections", () => {
    const bare: WorkItemDetail = {
      id: 124,
      revision: 1,
      type: "Task",
      title: "bare",
      state: "New",
      tags: [],
      relations: [],
      linkedPullRequests: [],
      linkedBuilds: [],
      testEvidence: [],
      comments: [],
    };
    const html = renderToStaticMarkup(<WorkItemDetailSections detail={bare} projectLink={null} />);

    expect(html).toContain("No description is available");
    expect(html).toContain("No acceptance criteria are available.");
    expect(html).toContain("No comments on this work item.");
    expect(html).not.toContain("Dependencies & links");
    expect(html).not.toContain("Linked pull requests");
    expect(html).not.toContain("Builds");
    expect(html).not.toContain("Test evidence");
  });
});
