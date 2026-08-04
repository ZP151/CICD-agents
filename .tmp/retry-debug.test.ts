import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  artifactStableKey, type ActionTransport, type ArtifactObservation, type ArtifactRef,
  DeliveryActionPolicy, DeliveryActionExecutor, DeliveryActionRuntime, ActionVerifier, SqliteDeliveryActionStore,
} from "../packages/core/dist/index.js";

const workItem = (revision: number): ArtifactRef => ({ kind: "work_item", projectLinkId: "pl-1", id: 101, revision });
class FakeTransport implements ActionTransport {
  executeCalls: number = 0;
  remote = new Map<string, ArtifactObservation>();
  async execute(record: any) { this.executeCalls++; const base = record.target as any; this.remote.set(artifactStableKey(record.target), { ref: { ...base, revision: base.revision + 1 }, revision: base.revision + 1, fields: { commentText: record.payload?.text }, relations: [], correlationIds: [] }); return { ok: true, result: {}, summary: "written" }; }
  async readArtifact(ref: ArtifactRef) { return this.remote.get(artifactStableKey(ref)); }
  seed(ref: ArtifactRef) { this.remote.set(artifactStableKey(ref), { ref, revision: (ref as any).revision, fields: {}, relations: [], correlationIds: [] }); }
}

describe("retry debug", () => {
  it("retries failed proposal", async () => {
    const store = new SqliteDeliveryActionStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rd-")), "a.db"));
    const t = new FakeTransport();
    const now = () => 1_700_000_000_000;
    const runtime = new DeliveryActionRuntime(store, new DeliveryActionPolicy({ now }), new DeliveryActionExecutor(t), new ActionVerifier(t), t, { now });
    t.seed(workItem(1));
    const target = workItem(1);
    const base = {
      turnId: "t", projectLinkId: "pl-1", kind: "work_item.comment", target, basedOn: [target],
      payload: { text: "hello" }, risk: "medium" as const, reason: "r",
      idempotencyKey: "k1", expiresAt: now() + 60_000,
    };
    const first = await runtime.propose({ ...base, expectedResult: [] });
    console.log("first status:", first.record.status, "failure:", first.record.failure?.message);
    const retried = await runtime.retry(first.record.id, { expectedResult: [{ artifact: { ...target, revision: 2 }, condition: "field_eq" as const, field: "commentText", expected: "hello" }] });
    console.log("retried status:", retried.record.status);
    const approved = await runtime.approve(retried.record.id);
    console.log("approved status:", approved.record.status, "error:", approved.error?.message, "failure:", approved.record.failure?.message);
    console.log("executes:", t.executeCalls);
    expect(approved.record.status).toBe("verified");
    store.close();
  });
});
