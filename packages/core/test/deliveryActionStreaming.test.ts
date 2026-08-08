import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ActionVerifier,
  DeliveryActionPolicy,
  DeliveryActionRuntime,
  SqliteDeliveryActionStore,
  artifactStableKey,
  type ActionRecord,
  type ActionTransport,
  type ArtifactObservation,
  type ArtifactRef,
  type ExecutionResult,
} from "../src/index.js";

let tempDir: string;
let store: SqliteDeliveryActionStore;
let transport: FakeTransport;
let runtime: DeliveryActionRuntime;
let clock: { value: number };

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-streaming-"));
  store = new SqliteDeliveryActionStore(path.join(tempDir, "actions.db"));
  transport = new FakeTransport();
  clock = { value: 1_700_000_000_000 };
  const now = () => clock.value;
  runtime = new DeliveryActionRuntime(
    store,
    new DeliveryActionPolicy({ now }),
    // approveStreaming never calls the constructor executor; the streaming
    // callback is the execution path.
    { execute: async () => { throw new Error("unused executor"); } } as never,
    new ActionVerifier(transport),
    transport,
    { now, verifierOptions: { attempts: 3, intervalMs: 5, timeoutMs: 500 } },
  );
});

afterEach(() => {
  store.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const workspace = (revision: string): ArtifactRef => ({
  kind: "git_workspace",
  projectLinkId: "pl-1",
  repoPath: "C:/repo",
  revision,
});

function stageProposal(revision = "base-hash") {
  const target = workspace(revision);
  return {
    turnId: "session-1",
    projectLinkId: "pl-1",
    kind: "git_add",
    target,
    basedOn: [target],
    payload: { tool: "git_add", args: { paths: ["notes.txt"] } },
    risk: "medium" as const,
    reason: "stage notes.txt after approval",
    expectedResult: [{
      artifact: target,
      condition: "field_contains" as const,
      field: "staged",
      expected: ["notes.txt"],
    }],
    idempotencyKey: "approval_git_add_abc123def0",
    expiresAt: clock.value + 60_000,
  };
}

class FakeTransport implements ActionTransport {
  private state = new Map<string, ArtifactObservation>();

  async execute(record: ActionRecord): Promise<{ ok: boolean; result: unknown; summary: string }> {
    throw new Error("transport execute must not run on the streaming path");
  }

  async readArtifact(ref: ArtifactRef): Promise<ArtifactObservation | undefined> {
    return this.state.get(artifactStableKey(ref));
  }

  setState(ref: ArtifactRef, fields: Record<string, unknown>): void {
    this.state.set(artifactStableKey(ref), {
      ref,
      revision: fields["sha"] ?? fields["statusHash"],
      fields,
      relations: [],
      correlationIds: [],
    });
  }
}

type ApproveStreamResult = Awaited<ReturnType<DeliveryActionRuntime["approveStreaming"]>>;

/** Drain an approveStreaming generator; returns the events and the result. */
async function drain(
  generator: AsyncGenerator<unknown, ApproveStreamResult, void>,
): Promise<{ events: unknown[]; result: ApproveStreamResult }> {
  const events: unknown[] = [];
  const iterator = generator[Symbol.asyncIterator]();
  while (true) {
    const step = await iterator.next();
    if (step.done) return { events, result: step.value };
    events.push(step.value);
  }
}

function* streamingExecute(
  options: { ok?: boolean; result?: unknown; summary?: string; events?: unknown[] } = {},
): Generator<unknown, ExecutionResult, void> {
  for (const event of options.events ?? [{ type: "tool_start", name: "git_add" }]) {
    yield event;
  }
  return {
    ok: options.ok ?? true,
    outcome: { ok: options.ok ?? true, result: options.result, summary: options.summary ?? "staged" },
  };
}

describe("DeliveryActionRuntime.approveStreaming", () => {
  it("runs the full lifecycle and streams callback events through", async () => {
    const proposal = await runtime.propose(stageProposal());
    expect(proposal.record.status).toBe("awaiting_approval");

    transport.setState(workspace("base-hash"), { staged: ["notes.txt"], statusHash: "after-hash" });

    const { events, result } = await drain(
      runtime.approveStreaming(proposal.record.id, (record) => {
        // The callback sees the approved boundary, mirroring the executor.
        expect(record.status).toBe("approved");
        return streamingExecute({ events: [{ type: "tool_start" }, { type: "tool_end" }] });
      }),
    );

    const record = await store.get(proposal.record.id);
    expect(record?.status).toBe("verified");
    expect(record?.executedAt).toBe(clock.value);
    expect(record?.verifiedAt).toBe(clock.value);
    expect(record?.audit.map((entry) => entry.event)).toEqual(["awaiting_approval", "approved", "executed", "verified"]);
    expect(events.map((event) => (event as { type: string }).type)).toEqual(["tool_start", "tool_end"]);
    expect(result.record.status).toBe("verified");
    expect(result.verification?.status).toBe("verified");
  });

  it("refuses a second approval of the same record without running the callback", async () => {
    const proposal = await runtime.propose(stageProposal());
    transport.setState(workspace("base-hash"), { staged: ["notes.txt"], statusHash: "after-hash" });

    const first = await drain(
      runtime.approveStreaming(proposal.record.id, (record) => streamingExecute()),
    );
    expect(first.result.record.status).toBe("verified");

    let callbackRuns = 0;
    const second = await drain(
      runtime.approveStreaming(proposal.record.id, (record) => {
        callbackRuns += 1;
        return streamingExecute();
      }),
    );
    expect(callbackRuns).toBe(0);
    expect(second.result.record.status).toBe("verified");
    expect(second.result.error?.kind).toBe("policy");
  });

  it("marks an expired proposal failed without executing", async () => {
    const proposal = await runtime.propose(stageProposal());
    clock.value += 120_000;

    let executed = false;
    const { result } = await drain(
      runtime.approveStreaming(proposal.record.id, (record) => {
        executed = true;
        return streamingExecute();
      }),
    );

    const record = await store.get(proposal.record.id);
    expect(record?.status).toBe("failed");
    expect(record?.failure?.kind).toBe("expired");
    expect(executed).toBe(false);
    expect(result.error?.kind).toBe("policy");
  });

  it("marks a failed execution failed with the execution failure", async () => {
    const proposal = await runtime.propose(stageProposal());
    const { result } = await drain(
      runtime.approveStreaming(proposal.record.id, (record) =>
        streamingExecute({ ok: false, result: { error: "git failed" }, summary: "git failed" }),
      ),
    );

    const record = await store.get(proposal.record.id);
    expect(record?.status).toBe("failed");
    expect(record?.failure?.kind).toBe("transport");
    expect(record?.failure?.message).toContain("git failed");
    expect(result.error?.kind).toBe("execution");
  });

  it("marks a write failed when re-read verification contradicts the predicates", async () => {
    const proposal = await runtime.propose(stageProposal());
    // The tool reports success but the authoritative state never shows the
    // staged file: tool success is not verification.
    const { result } = await drain(
      runtime.approveStreaming(proposal.record.id, (record) => streamingExecute()),
    );

    const record = await store.get(proposal.record.id);
    expect(record?.status).toBe("failed");
    expect(record?.failure?.kind).toBe("verification");
    expect(record?.executedAt).toBe(clock.value);
    expect(result.error?.kind).toBe("verification");
  });

  it("denies approval when the based-on revision moved (staleness at decision time)", async () => {
    const proposal = await runtime.propose(stageProposal());
    // The workspace changed between proposal and approval: the status hash no
    // longer matches the proposed baseline.
    transport.setState(workspace("moved-hash"), { staged: [], statusHash: "moved-hash" });

    let executed = false;
    const { result } = await drain(
      runtime.approveStreaming(proposal.record.id, (record) => {
        executed = true;
        return streamingExecute();
      }),
    );

    const record = await store.get(proposal.record.id);
    expect(record?.status).toBe("stale");
    expect(record?.failure?.kind).toBe("policy");
    expect(executed).toBe(false);
    expect(result.error?.kind).toBe("policy");
  });
});
