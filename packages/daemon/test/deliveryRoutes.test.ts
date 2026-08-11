import { describe, expect, it, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import {
  registerDeliveryRoutes,
  type DeliveryWritesState,
  WORK_ITEMS_QUERY,
} from "../src/routes/delivery.routes.js";
import type { ProjectLinkStoreAdapter } from "../src/projectLinkStore.js";

function makeWrites(enabled = true): DeliveryWritesState & { state: { enabled: boolean } } {
  const state = { enabled };
  return {
    state,
    isEnabled: () => state.enabled,
    setEnabled: (next) => {
      state.enabled = next;
    },
  };
}

async function buildApp(writes: DeliveryWritesState, projectLink: unknown = null) {
  const app = Fastify();
  const projectLinkStore = {
    getProjectLink: vi.fn(async () => projectLink),
  } as unknown as ProjectLinkStoreAdapter;
  registerDeliveryRoutes(app, { projectLinkStore, writes });
  await app.ready();
  return app;
}

describe("delivery routes", () => {
  let writes: ReturnType<typeof makeWrites>;

  beforeEach(() => {
    writes = makeWrites();
  });

  it("limits Work to tasks assigned to the signed-in user, not test fixtures", () => {
    expect(WORK_ITEMS_QUERY).toContain("[System.AssignedTo] = @me");
    expect(WORK_ITEMS_QUERY).not.toContain("MergePilot Fixture");
  });

  it("exposes the global writes kill switch", async () => {
    const app = await buildApp(writes);
    const initial = await app.inject({ method: "GET", url: "/delivery/writes-enabled" });
    expect(initial.json()).toEqual({ enabled: true });

    const updated = await app.inject({
      method: "PUT",
      url: "/delivery/writes-enabled",
      payload: { enabled: false },
    });
    expect(updated.json()).toEqual({ enabled: false });

    const after = await app.inject({ method: "GET", url: "/delivery/writes-enabled" });
    expect(after.json()).toEqual({ enabled: false });
    await app.close();
  });

  it("requires projectLinkId for the action list", async () => {
    const app = await buildApp(writes);
    const response = await app.inject({ method: "GET", url: "/delivery/actions" });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("validates the guided pull request preparation request", async () => {
    const app = await buildApp(writes);
    const response = await app.inject({
      method: "POST",
      url: "/delivery/pull-request-preparation",
      payload: { projectLinkId: "", workItemId: -1 },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 404 when guided pull request preparation cannot resolve the Project Link", async () => {
    const app = await buildApp(writes);
    const response = await app.inject({
      method: "POST",
      url: "/delivery/pull-request-preparation",
      payload: { projectLinkId: "missing" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "project_link_not_found" });
    await app.close();
  });

  it("reports an incomplete Azure DevOps mapping as a recoverable Work setup error", async () => {
    const app = await buildApp(writes, {
      id: "incomplete-link",
      adoOrgUrl: "",
      adoProject: "",
      adoPat: "",
    });

    const response = await app.inject({ method: "GET", url: "/delivery/work-items?projectLinkId=incomplete-link" });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: "project_link_ado_mapping_incomplete",
      message: expect.stringContaining("Azure DevOps organization and project"),
    });
    await app.close();
  });

  it("returns 404 for an unknown action", async () => {
    const app = await buildApp(writes);
    const response = await app.inject({ method: "GET", url: "/delivery/actions/act-unknown" });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("rejects a proposal whose project link cannot be resolved", async () => {
    const app = await buildApp(writes);
    const response = await app.inject({
      method: "POST",
      url: "/delivery/actions",
      payload: {
        turnId: "turn-1",
        projectLinkId: "pl-unknown",
        kind: "work_item.comment",
        target: { kind: "work_item", projectLinkId: "pl-unknown", id: 1, revision: 1 },
        payload: { text: "hello" },
        risk: "low",
        reason: "fixture",
        idempotencyKey: "k-1",
        expiresAt: Date.now() + 60_000,
      },
    });
    expect(response.statusCode).toBe(500);
    expect(String(response.json().error)).toContain("not found");
    await app.close();
  });

  it("validates the proposal schema", async () => {
    const app = await buildApp(writes);
    const response = await app.inject({
      method: "POST",
      url: "/delivery/actions",
      payload: { turnId: "turn-1" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  // ── Work Inspector detail (GET /delivery/work-items/:id) ──────────────────

  const PAT_LINK = {
    id: "ado-link",
    adoOrgUrl: "https://dev.azure.com/tebssg",
    adoProject: "TeBS-ClaimBot",
    adoPat: "test-pat",
  };

  function mockAdoDetailFetch(): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/_apis/wit/workitems/123")) {
        return new Response(JSON.stringify({
          id: 123,
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
          },
          relations: [
            { rel: "System.LinkTypes.Hierarchy-Reverse", url: "https://dev.azure.com/tebssg/TeBS-ClaimBot/_apis/wit/workItems/1" },
            { rel: "ArtifactLink", url: "vstfs:///Git/PullRequestId/g%2Fr%2F321" },
            { rel: "ArtifactLink", url: "vstfs:///Build/Build/5001" },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/workItems/123/comments")) {
        return new Response(JSON.stringify({ comments: [{ text: "first" }, { text: "second" }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/pullrequests/321")) {
        return new Response(JSON.stringify({
          pullRequestId: 321,
          title: "Inspector PR",
          status: "active",
          sourceRefName: "refs/heads/feature/x",
          targetRefName: "refs/heads/main",
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/_apis/build/builds")) {
        return new Response(JSON.stringify({ value: [{
          id: 5001,
          buildNumber: "20260807.3",
          status: "completed",
          result: "succeeded",
          definition: { name: "CI" },
          url: "https://dev.azure.com/tebssg/TeBS-ClaimBot/_apis/build/Build/5001",
        }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/_apis/test/runs")) {
        return new Response(JSON.stringify({ value: [
          { totalTests: 40, passedTests: 38, failedTests: 2 },
        ] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "unexpected fetch", url }), { status: 500, headers: { "content-type": "application/json" } });
    });
  }

  it("requires projectLinkId for the work item detail", async () => {
    const app = await buildApp(writes, PAT_LINK);
    const response = await app.inject({ method: "GET", url: "/delivery/work-items/123" });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects a non-integer work item id for the detail", async () => {
    const app = await buildApp(writes, PAT_LINK);
    const response = await app.inject({ method: "GET", url: "/delivery/work-items/abc?projectLinkId=ado-link" });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 404 when the project link is unknown for the detail", async () => {
    const app = await buildApp(writes);
    const response = await app.inject({ method: "GET", url: "/delivery/work-items/123?projectLinkId=nope" });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("reports an incomplete ADO mapping for the detail", async () => {
    const app = await buildApp(writes, { id: "incomplete-link", adoOrgUrl: "", adoProject: "", adoPat: "" });
    const response = await app.inject({ method: "GET", url: "/delivery/work-items/123?projectLinkId=incomplete-link" });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe("project_link_ado_mapping_incomplete");
    await app.close();
  });

  it("serves a full work item detail with typed relations, PRs, builds and test evidence", async () => {
    mockAdoDetailFetch();
    const app = await buildApp(writes, PAT_LINK);
    const response = await app.inject({ method: "GET", url: "/delivery/work-items/123?projectLinkId=ado-link" });
    expect(response.statusCode, response.body).toBe(200);
    const workItem = response.json().workItem;
    expect(workItem).toMatchObject({
      id: 123,
      revision: 4,
      title: "Inspector fixture",
      state: "In Progress",
      description: "Do the thing",
      acceptanceCriteria: "It works",
      iterationPath: "TeBS\\Sprint 1",
      tags: ["alpha", "beta"],
      assignedTo: "Ada Lovelace",
    });
    expect(workItem.relations.map((relation: { kind: string }) => relation.kind)).toEqual(["parent", "pull_request", "build"]);
    expect(workItem.linkedPullRequests).toHaveLength(1);
    expect(workItem.linkedPullRequests[0]).toMatchObject({ id: 321, title: "Inspector PR", status: "active" });
    expect(workItem.linkedBuilds).toHaveLength(1);
    expect(workItem.linkedBuilds[0]).toMatchObject({ id: 5001, buildNumber: "20260807.3", definitionName: "CI" });
    expect(workItem.testEvidence).toEqual([{ buildId: 5001, runCount: 1, totalTests: 40, passedTests: 38, failedTests: 2 }]);
    expect(workItem.comments).toEqual(["first", "second"]);
    await app.close();
  });

  it("maps an ADO 404 to a typed work_item_not_found detail error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/_apis/wit/workitems/999")) {
        return new Response(JSON.stringify({ message: "nope" }), { status: 404, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "unexpected", url }), { status: 500 });
    });
    const app = await buildApp(writes, PAT_LINK);
    const response = await app.inject({ method: "GET", url: "/delivery/work-items/999?projectLinkId=ado-link" });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("work_item_not_found");
    await app.close();
  });

  it("serves a bare detail (no relations, no comments) as empty rows", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/_apis/wit/workitems/124")) {
        return new Response(JSON.stringify({ id: 124, rev: 1, fields: { "System.Title": "bare", "System.State": "New" }, relations: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/workItems/124/comments")) {
        return new Response(JSON.stringify({ comments: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "unexpected", url }), { status: 500 });
    });
    const app = await buildApp(writes, PAT_LINK);
    const response = await app.inject({ method: "GET", url: "/delivery/work-items/124?projectLinkId=ado-link" });
    expect(response.statusCode).toBe(200);
    expect(response.json().workItem).toMatchObject({
      id: 124,
      relations: [],
      linkedPullRequests: [],
      linkedBuilds: [],
      testEvidence: [],
      comments: [],
    });
    expect(response.json().workItem.description).toBeUndefined();
    await app.close();
  });
});
