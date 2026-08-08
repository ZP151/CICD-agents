import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ActionVerifier,
  AdoActionTransport,
  DeliveryActionExecutor,
  DeliveryActionPolicy,
  DeliveryActionRuntime,
  SqliteDeliveryActionStore,
  SqliteDeliveryGraphStore,
  type ActionRecord,
  type ArtifactRef,
} from "../src/index.js";
import { jsonResponse } from "./adoTestDoubles.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function authStub(): { mode: "oauth"; header: string } {
  return { mode: "oauth", header: "Bearer test" };
}

function makeTransport(options: { graphStore?: SqliteDeliveryGraphStore } = {}) {
  return new AdoActionTransport({
    resolveProjectLink: async () => ({ organization: "https://org.example", project: "Proj" }),
    auth: async () => authStub(),
    graphStore: options.graphStore,
  });
}

function makeRuntime(transport: AdoActionTransport) {
  const now = () => 1_700_000_000_000;
  return new DeliveryActionRuntime(
    new SqliteDeliveryActionStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "adt-")), "a.db")),
    new DeliveryActionPolicy({ now }),
    new DeliveryActionExecutor(transport),
    new ActionVerifier(transport),
    transport,
    { now },
  );
}

const workItem = (revision: number): ArtifactRef => ({
  kind: "work_item",
  projectLinkId: "pl-1",
  id: 101,
  revision,
});

describe("ado action transport", () => {
  it("executes work_item.comment and verifies the re-read comment and revision", async () => {
    const transport = makeTransport();
    const runtime = makeRuntime(transport);
    let remoteRevision = 3;
    const comments: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/comments") && String(init?.method ?? "") !== "POST") {
        return jsonResponse({ comments: comments.map((text) => ({ text })) });
      }
      if (url.includes("/comments") && String(init?.method ?? "") === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
        comments.push(body.text ?? "");
        remoteRevision += 1;
        return jsonResponse({ id: 99, workItemRevision: remoteRevision });
      }
      if (url.includes("/workitems/101")) {
        return jsonResponse({
          id: 101, rev: remoteRevision,
          fields: { "System.Title": "Fixture" },
          relations: [],
        });
      }
      return jsonResponse({}, 404);
    });

    // Remote is at revision 3; the proposal is based on the current revision.
    const target = workItem(3);
    const proposal = {
      turnId: "t1",
      projectLinkId: "pl-1",
      kind: "work_item.comment",
      target,
      basedOn: [target],
      payload: { text: "verified comment" },
      risk: "low" as const,
      reason: "record outcome",
      expectedResult: [
        { artifact: { ...target, revision: 4 }, condition: "revision_gt" as const, expectedRevision: 3 },
        { artifact: { ...target, revision: 4 }, condition: "comment_contains" as const, expected: "verified comment" },
      ],
      idempotencyKey: "wi-101-v2",
      expiresAt: now() + 60_000,
    };
    const { record } = await runtime.propose(proposal);
    expect(record.status).toBe("awaiting_approval");
    const approved = await runtime.approve(record.id);
    expect(approved.record.status).toBe("verified");
    expect(approved.verification?.evidence.join()).toContain("revision 4 > 3");
    expect(approved.verification?.evidence.join()).toContain("comment present");
    // The comment POST happened exactly once.
    const commentPosts = fetchMock.mock.calls.filter(
      ([, init]) => String(init?.method ?? "") === "POST" && String(init?.body ?? "").includes("verified comment"),
    );
    expect(commentPosts).toHaveLength(1);
  });

  it("creates a pull request, links the work item, and verifies the PR exists with the relation", async () => {
    const transport = makeTransport();
    const runtime = makeRuntime(transport);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/_apis/projects")) {
        return jsonResponse({ value: [{ id: "proj-1", name: "Proj" }] });
      }
      if (url.includes("/pullrequests") && String(init?.method ?? "") === "POST") {
        return jsonResponse({ pullRequestId: 777, status: "active", createdBy: { displayName: "tester" } });
      }
      if (url.includes("/pullrequests/777")) {
        return jsonResponse({
          pullRequestId: 777, title: "Fixture PR", status: "active", isDraft: false,
          sourceRefName: "refs/heads/feature/x", targetRefName: "refs/heads/main",
          workItemRefs: [{ id: "101", url: "https://org.example/Proj/_apis/wit/workItems/101" }],
        });
      }
      if (url.includes("/_apis/git/repositories")) {
        return jsonResponse({ value: [{ id: "repo-1", name: "repo-1" }] });
      }
      if (url.includes("/workitems/101") && String(init?.method ?? "") === "PATCH") {
        return jsonResponse({ id: 101, rev: 2 });
      }
      if (url.includes("/refs")) {
        return jsonResponse({ value: [{ name: "refs/heads/feature/x", objectId: "abc123" }] });
      }
      return jsonResponse({}, 404);
    });

    const target: ArtifactRef = {
      kind: "pull_request",
      projectLinkId: "pl-1",
      repositoryId: "repo-1",
      id: 0,
      sourceCommit: "",
      iterationId: 1,
    };
    const proposal = {
      turnId: "t1",
      projectLinkId: "pl-1",
      kind: "pull_request.create",
      target,
      basedOn: [{
        kind: "branch" as const, projectLinkId: "pl-1", repositoryId: "repo-1",
        name: "feature/x", objectId: "abc123",
      }],
      payload: {
        sourceBranch: "feature/x",
        targetBranch: "main",
        repositoryId: "repo-1",
        title: "Fixture PR",
        description: "fixture",
        workItemId: 101,
      },
      risk: "high" as const,
      reason: "prepare PR for the fixture work item",
      expectedResult: [
        { artifact: { ...target, id: 777, sourceCommit: "abc123" }, condition: "exists" as const },
        { artifact: { ...target, id: 777, sourceCommit: "abc123" }, condition: "field_eq" as const, field: "title", expected: "Fixture PR" },
        { artifact: { ...target, id: 777, sourceCommit: "abc123" }, condition: "relation_present" as const, expected: "101" },
      ],
      idempotencyKey: "pr-fixture-1",
      expiresAt: now() + 60_000,
    };
    const { record } = await runtime.propose(proposal);
    expect(record.status).toBe("awaiting_approval");
    const approved = await runtime.approve(record.id);
    expect(approved.error).toBeUndefined();
    expect(approved.record.status).toBe("verified");
    expect(approved.verification?.evidence.join()).toContain("title=Fixture PR");
    expect(approved.verification?.evidence.join()).toContain("relation 101 present");
  });

  it("records canonical snapshots for every read when a graph store is attached", async () => {
    const graphStore = new SqliteDeliveryGraphStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "adt-g-")), "g.db"));
    const transport = makeTransport({ graphStore });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/workitems/101")) {
        return jsonResponse({ id: 101, rev: 2, fields: { "System.Title": "Fixture" }, relations: [] });
      }
      return jsonResponse({}, 404);
    });

    await transport.readArtifact(workItem(1));
    const snapshot = await graphStore.getSnapshot("pl-1", workItem(2));
    expect(snapshot?.ref).toMatchObject({ id: 101, revision: 2 });
    expect(snapshot?.fields).toMatchObject({ "System.Title": "Fixture" });
    graphStore.close();
  });
});

function now(): number {
  return 1_700_000_000_000;
}
