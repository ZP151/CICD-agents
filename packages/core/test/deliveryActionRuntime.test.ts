import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  artifactStableKey,
  type ActionRecord,
  type ActionTransport,
  type ArtifactObservation,
  type ArtifactRef,
  DeliveryActionPolicy,
  DeliveryActionExecutor,
  DeliveryActionRuntime,
  ActionVerifier,
  SqliteDeliveryActionStore,
} from "../src/index.js";

let tempDir: string;
let store: SqliteDeliveryActionStore;
let transport: FakeTransport;
let runtime: DeliveryActionRuntime;
let clock: { value: number };

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-actions-"));
  store = new SqliteDeliveryActionStore(path.join(tempDir, "actions.db"));
  transport = new FakeTransport();
  clock = { value: 1_700_000_000_000 };
  const now = () => clock.value;
  runtime = new DeliveryActionRuntime(
    store,
    new DeliveryActionPolicy({ now }),
    new DeliveryActionExecutor(transport),
    new ActionVerifier(transport),
    transport,
    { now },
  );
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

function commentProposal(revision = 1, options: { idempotencyKey?: string; risk?: "low" | "medium" | "high" | "critical" } = {}) {
  const target = workItem(revision);
  return {
    turnId: "turn-1",
    projectLinkId: "pl-1",
    kind: "work_item.comment",
    target,
    basedOn: [target],
    payload: { text: "[MergePilot Fixture] verified comment" },
    risk: options.risk ?? "medium",
    reason: "Record the verified outcome on the work item",
    expectedResult: [{
      artifact: { ...target, revision: revision + 1 },
      condition: "field_eq" as const,
      field: "commentText",
      expected: "[MergePilot Fixture] verified comment",
    }],
    idempotencyKey: options.idempotencyKey ?? "wi-101-comment-a",
    expiresAt: clock.value + 60_000,
  };
}

class FakeTransport implements ActionTransport {
  executeCalls: ActionRecord[] = [];
  remote = new Map<string, ArtifactObservation>();
  failNextExecute = false;

  async execute(record: ActionRecord): Promise<{ ok: boolean; result: unknown; summary: string }> {
    this.executeCalls.push(record);
    if (this.failNextExecute) {
      return { ok: false, result: undefined, summary: "transport rejected the write" };
    }
    const key = artifactStableKey(record.target);
    const current = this.remote.get(key);
    const base = record.target as Extract<ArtifactRef, { kind: "work_item" }>;
    const next: ArtifactObservation = {
      ref: { ...base, revision: base.revision + 1 },
      revision: base.revision + 1,
      fields: {
        ...(current?.fields ?? {}),
        commentText: (record.payload as { text?: string }).text ?? "written",
      },
      relations: [...(current?.relations ?? [])],
      correlationIds: [...(current?.correlationIds ?? [])],
    };
    this.remote.set(key, next);
    return { ok: true, result: next, summary: "comment written" };
  }

  async readArtifact(ref: ArtifactRef): Promise<ArtifactObservation | undefined> {
    return this.remote.get(artifactStableKey(ref));
  }

  seedObservation(ref: ArtifactRef, fields: Record<string, unknown> = {}): void {
    this.remote.set(artifactStableKey(ref), {
      ref,
      revision: revisionOf(ref),
      fields,
      relations: [],
      correlationIds: [],
    });
  }
}

function revisionOf(ref: ArtifactRef): number | string | undefined {
  if (ref.kind === "work_item") return ref.revision;
  if (ref.kind === "pull_request") return ref.sourceCommit;
  return undefined;
}

describe("delivery action runtime", () => {
  it("persists a proposed action awaiting approval and never writes remotely at propose time", async () => {
    transport.seedObservation(workItem(1));
    const result = await runtime.propose(commentProposal());
    expect(result.record.status).toBe("awaiting_approval");
    expect(transport.executeCalls).toHaveLength(0);

    const stored = await store.get(result.record.id);
    expect(stored).toMatchObject({
      kind: "work_item.comment",
      status: "awaiting_approval",
      idempotencyKey: "wi-101-comment-a",
      projectLinkId: "pl-1",
    });
  });

  it("approval executes the exact persisted payload and verifies the remote re-read", async () => {
    transport.seedObservation(workItem(1));
    const { record } = await runtime.propose(commentProposal());
    const result = await runtime.approve(record.id);

    expect(result.error).toBeUndefined();
    expect(result.record.status).toBe("verified");
    expect(transport.executeCalls).toHaveLength(1);
    expect(transport.executeCalls[0]!.payload).toEqual({
      text: "[MergePilot Fixture] verified comment",
    });
    expect(result.verification?.status).toBe("verified");
    expect(result.record.audit.map((entry) => entry.event)).toEqual([
      "awaiting_approval", "approved", "executed", "verified",
    ]);
  });

  it("a changed target revision yields stale and prevents execution", async () => {
    transport.seedObservation(workItem(1));
    const { record } = await runtime.propose(commentProposal());
    // Someone else updated the work item between proposal and approval.
    transport.seedObservation(workItem(3));

    const result = await runtime.approve(record.id);
    expect(result.error?.kind).toBe("policy");
    expect(result.record.status).toBe("stale");
    expect(transport.executeCalls).toHaveLength(0);
  });

  it("a duplicate approval does not duplicate the remote mutation", async () => {
    transport.seedObservation(workItem(1));
    const { record } = await runtime.propose(commentProposal());
    await runtime.approve(record.id);
    const second = await runtime.approve(record.id);

    expect(second.error?.kind).toBe("policy");
    expect(transport.executeCalls).toHaveLength(1);
  });

  it("a duplicate idempotency key refuses the second proposal", async () => {
    transport.seedObservation(workItem(1));
    const first = await runtime.propose(commentProposal());
    expect(first.record.status).toBe("awaiting_approval");

    const duplicate = await runtime.propose(commentProposal());
    expect(duplicate.verdict.decision).toBe("deny");
    expect(duplicate.verdict.reasons.join()).toContain("already proposed");
    // The existing record stays authoritative; no second record is created.
    const all = await store.listByProjectLink("pl-1", { includeTerminal: true });
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(first.record.id);
  });

  it("the global read-only kill switch denies every proposal", async () => {
    runtime = new DeliveryActionRuntime(
      store,
      new DeliveryActionPolicy({ now: () => clock.value }),
      new DeliveryActionExecutor(transport),
      new ActionVerifier(transport),
      transport,
      { now: () => clock.value, writesEnabled: () => false },
    );
    transport.seedObservation(workItem(1));

    const result = await runtime.propose(commentProposal());
    expect(result.record.status).toBe("failed");
    expect(result.record.failure?.message).toContain("kill switch");
    expect(transport.executeCalls).toHaveLength(0);
  });

  it("an expired action fails at approval and never executes", async () => {
    transport.seedObservation(workItem(1));
    const { record } = await runtime.propose(commentProposal());
    clock.value += 61_000;

    const result = await runtime.approve(record.id);
    expect(result.error?.kind).toBe("policy");
    expect(result.record.status).toBe("failed");
    expect(result.record.failure?.kind).toBe("expired");
    expect(transport.executeCalls).toHaveLength(0);
  });

  it("resume verification after restart verifies without re-executing the write", async () => {
    runtime = new DeliveryActionRuntime(
      store,
      new DeliveryActionPolicy({ now: () => clock.value }),
      new DeliveryActionExecutor(transport),
      new ActionVerifier(transport),
      transport,
      { now: () => clock.value, verifierOptions: { attempts: 2, intervalMs: 2 } },
    );
    transport.seedObservation(workItem(1));
    const { record } = await runtime.propose(commentProposal());
    // Simulate a crash after the write landed: remote already shows the result
    // (revision bumped and the comment visible) but no executedAt was kept.
    transport.seedObservation(workItem(2), { commentText: "[MergePilot Fixture] verified comment" });
    await store.updateStatus({
      ...record,
      status: "executing",
      approvedAt: clock.value,
      audit: [...record.audit, { at: clock.value, event: "approved" }],
    });

    const summary = await runtime.resumeVerification();
    expect(summary.recordsConsidered).toBe(1);
    expect(summary.verified).toEqual([record.id]);
    expect(summary.failed).toEqual([]);
    expect(transport.executeCalls).toHaveLength(0);
  });

  it("resume verification after an interrupted execution fails with re-propose guidance", async () => {
    runtime = new DeliveryActionRuntime(
      store,
      new DeliveryActionPolicy({ now: () => clock.value }),
      new DeliveryActionExecutor(transport),
      new ActionVerifier(transport),
      transport,
      { now: () => clock.value, verifierOptions: { attempts: 2, intervalMs: 2 } },
    );
    transport.seedObservation(workItem(1));
    const { record } = await runtime.propose(commentProposal());
    await store.updateStatus({
      ...record,
      status: "executing",
      approvedAt: clock.value,
      audit: [...record.audit, { at: clock.value, event: "approved" }],
    });

    const summary = await runtime.resumeVerification();
    expect(summary.verified).toEqual([]);
    expect(summary.failed).toEqual([record.id]);
    const recovered = await store.get(record.id);
    expect(recovered?.failure?.kind).toBe("interrupted");
    expect(recovered?.failure?.message).toContain("re-propose");
    expect(transport.executeCalls).toHaveLength(0);
  });

  it("a verification timeout fails the action with verification evidence", async () => {
    runtime = new DeliveryActionRuntime(
      store,
      new DeliveryActionPolicy({ now: () => clock.value }),
      new DeliveryActionExecutor(transport),
      new ActionVerifier(transport),
      transport,
      { now: () => clock.value, verifierOptions: { attempts: 2, intervalMs: 2 } },
    );
    transport.seedObservation(workItem(1));
    // Predicate expects a comment that the transport never writes (read-only
    // remote: execute succeeds but remote state does not change).
    const writeWithoutEffect = {
      ...commentProposal(),
      expectedResult: [{
        artifact: { ...workItem(1), revision: 2 },
        condition: "field_eq" as const,
        field: "commentText",
        expected: "never-appearing",
      }],
    };
    const { record } = await runtime.propose(writeWithoutEffect);
    const result = await runtime.approve(record.id);
    // executeCalls happened once; verification then timed out.
    expect(result.verification?.status).toBe("timeout");
    expect(result.record.status).toBe("failed");
    expect(result.record.failure?.kind).toBe("verification");
    expect(transport.executeCalls).toHaveLength(1);
  });

  it("a transport failure marks the action failed and records the error", async () => {
    transport.seedObservation(workItem(1));
    transport.failNextExecute = true;
    const { record } = await runtime.propose(commentProposal());
    const result = await runtime.approve(record.id);

    expect(result.error?.kind).toBe("execution");
    expect(result.record.status).toBe("failed");
    expect(result.record.failure?.kind).toBe("transport");
  });

  it("markStaleForTarget stales pending actions when the target revision moves", async () => {
    transport.seedObservation(workItem(1));
    await runtime.propose(commentProposal());

    const count = await runtime.markStaleForTarget("pl-1", workItem(4));
    expect(count).toBe(1);
    const pending = await store.listByProjectLink("pl-1");
    expect(pending).toHaveLength(0);
  });

  it("rejects an awaiting approval on user feedback", async () => {
    transport.seedObservation(workItem(1));
    const { record } = await runtime.propose(commentProposal());
    const rejected = await runtime.reject(record.id, "scope changed");

    expect(rejected?.status).toBe("rejected");
    expect(rejected?.audit.at(-1)).toMatchObject({ event: "rejected", detail: "scope changed" });
    expect(transport.executeCalls).toHaveLength(0);
  });
});
