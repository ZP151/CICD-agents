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
});
