import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  derivedEdge,
  factEdge,
  SqliteDeliveryGraphStore,
  type ArtifactRef,
  type ArtifactSnapshot,
} from "../src/index.js";

let tempDir: string;
let store: SqliteDeliveryGraphStore;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-graph-"));
  store = new SqliteDeliveryGraphStore(path.join(tempDir, "graph.db"));
});

afterEach(() => {
  store.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const workItem = (revision: number): ArtifactRef => ({
  kind: "work_item",
  projectLinkId: "pl-1",
  id: 101,
  revision,
});

const commit = (sha: string): ArtifactRef => ({
  kind: "commit",
  projectLinkId: "pl-1",
  repositoryId: "repo-1",
  commitId: sha,
});

const pullRequest = (id: number, sourceCommit: string): ArtifactRef => ({
  kind: "pull_request",
  projectLinkId: "pl-1",
  repositoryId: "repo-1",
  id,
  sourceCommit,
  iterationId: 1,
});

const build = (id: number): ArtifactRef => ({
  kind: "build",
  projectLinkId: "pl-1",
  definitionId: 117,
  buildId: id,
});

function snapshot(ref: ArtifactRef, fields: Record<string, unknown> = {}): ArtifactSnapshot {
  return {
    ref,
    projectLinkId: "pl-1",
    observedAt: 1_700_000_000_000,
    source: "ado",
    fields,
    relations: [],
  };
}

describe("delivery graph store", () => {
  it("upserts snapshots by stable artifact key and lists them per project link", async () => {
    await store.upsertSnapshot(snapshot(workItem(1), { title: "first" }));
    await store.upsertSnapshot(snapshot(workItem(2), { title: "updated" }));
    await store.upsertSnapshot(snapshot(commit("abc123")));

    const current = await store.getSnapshot("pl-1", workItem(2));
    expect(current?.fields).toMatchObject({ title: "updated" });
    const list = await store.listSnapshots("pl-1", ["work_item"]);
    expect(list).toHaveLength(1);
    expect(list[0]!.ref).toMatchObject({ id: 101, revision: 2 });
  });

  it("records fact edges and derived edges without conflating them", async () => {
    await store.upsertEdge(factEdge(workItem(1), pullRequest(42, "abc123"), "implements", 1_700_000_000_000));
    await store.upsertEdge(derivedEdge(commit("abc123"), build(5), "built_by", 1_700_000_000_000, 0.9));

    const edges = await store.listEdges("pl-1");
    expect(edges).toHaveLength(2);
    const implementsEdge = edges.find((edge) => edge.kind === "implements");
    expect(implementsEdge?.source).toBe("ado");
    const builtEdge = edges.find((edge) => edge.kind === "built_by");
    expect(builtEdge?.source).toBe("derived");
    expect(builtEdge?.confidence).toBe(0.9);
  });

  it("traverses from a work item to its PR and build through edges", async () => {
    const pr = pullRequest(42, "abc123");
    await store.upsertEdge(factEdge(workItem(1), pr, "implements", 1_700_000_000_000));
    await store.upsertEdge(factEdge(pr, build(5), "validated_by", 1_700_000_000_000));

    const edges = await store.traverse("pl-1", workItem(1));
    expect(edges.map((edge) => edge.kind)).toEqual(expect.arrayContaining(["implements", "validated_by"]));
    const toKeys = edges.map((edge) => JSON.stringify(edge.to));
    expect(toKeys).toContain(JSON.stringify(pr));
    expect(toKeys).toContain(JSON.stringify(build(5)));
  });

  it("reports stale snapshots by TTL", async () => {
    await store.upsertSnapshot(snapshot(workItem(1)));
    await store.upsertSnapshot({ ...snapshot(build(5)), observedAt: 1_700_000_000_000 });

    const stale = await store.staleSnapshots("pl-1", 10_000, 1_700_000_020_000);
    expect(stale.map((entry) => entry.ref.kind)).toEqual(expect.arrayContaining(["work_item", "build"]));
  });

  it("updates an edge in place when re-observed", async () => {
    await store.upsertEdge(factEdge(workItem(1), pullRequest(42, "abc123"), "implements", 1_700_000_000_000));
    await store.upsertEdge(factEdge(workItem(1), pullRequest(42, "abc123"), "implements", 1_700_000_010_000));

    const edges = await store.listEdges("pl-1", { kinds: ["implements"] });
    expect(edges).toHaveLength(1);
    expect(edges[0]!.observedAt).toBe(1_700_000_010_000);
  });
});
