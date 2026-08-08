/**
 * Verified runtime for chat confirmed actions (Phase 2, slice 2b).
 *
 * Chat git writes run the canonical lifecycle — Proposal → Approval →
 * Execution → Re-read → Verification — exactly like delivery_propose_action.
 * The user's approval of the tool call IS the approval of the stored action
 * (forceApproval); the idempotency key is the deterministic approval id; the
 * target, based-on revisions and predicates come from pre-write reads of the
 * local repository (git is the authoritative source), never from model prose;
 * and the ActionRecord is the only execution fact — the tool's own success
 * report is not verification. Duplicate approvals replay the verified record
 * without re-executing; records that executed but failed verification are
 * never re-run; in-flight records resume verification after a restart.
 */
import {
  ActionVerifier,
  actionId,
  AdoActionTransport,
  DeliveryActionPolicy,
  DeliveryActionRuntime,
  GitActionTransport,
  SqliteDeliveryActionStore,
  type ActionRecord,
  type ActionTransport,
  type ApproveResult,
  type ArtifactRef,
  type ArtifactObservation,
  type ChatEvent,
  type ChatVerifiedAction,
  type DeliveryActionStore,
  type ExecutionResult,
  type PendingToolAction,
  type ToolExecutor,
  type VerificationPredicate,
} from "@mergepilot/core";
import { deliveryWritesState } from "./deliveryWritesState.js";
import { streamConfirmedToolExecution } from "./chatToolExecution.js";
import { storedPublicToolResult } from "./chatPublicToolEvidence.js";
import type { ConfirmedActionPersistenceAdapters } from "./chatConfirmedActions.js";
import type { InlineProjectLink } from "./chatHistoryStore.js";

/** The user's approval stays human-sized: one hour, mirroring deliveryTools. */
const APPROVAL_WINDOW_MS = 3_600_000;
/** Local git re-reads are fast; a short window keeps the turn responsive. */
const VERIFIER_OPTIONS = { attempts: 6, intervalMs: 500, timeoutMs: 15_000 };

export interface VerifiedChatActionResult {
  /** Verification outcome, not the tool's self-report: true only when the re-read confirmed the write. */
  ok: boolean;
  toolResult: unknown;
  summary: string;
  record: ActionRecord;
  verified: boolean;
  evidence: string[];
  /** True when the approved write actually ran (as opposed to a replayed record). */
  executed: boolean;
  error?: string;
}

export interface VerifiedChatActionSpec {
  target: ArtifactRef;
  basedOn: ArtifactRef[];
  expectedResult: VerificationPredicate[];
}

/**
 * Pre-write reads of the authoritative local git state, then a
 * tool-appropriate spec. Every predicate references the pre-state so the
 * policy can deny a stale approval and the verifier can confirm the write
 * moved the artifact.
 */
export async function buildVerifiedActionSpec(args: {
  repoPath: string;
  projectLinkId: string;
  tool: string;
  toolArgs: Record<string, unknown>;
  transport: GitActionTransport;
}): Promise<VerifiedChatActionSpec> {
  const { projectLinkId, repoPath, tool, toolArgs, transport } = args;
  const workspaceRef = (revision: string): ArtifactRef => ({
    kind: "git_workspace",
    projectLinkId,
    repoPath,
    revision,
  });
  const commitRef = (sha: string): ArtifactRef => ({ kind: "git_commit", projectLinkId, repoPath, sha });

  const [workspace, commit] = await Promise.all([
    transport.readArtifact(workspaceRef("")),
    transport.readArtifact(commitRef("")),
  ]);
  const statusHash = stringField(workspace, "statusHash");
  const headSha = stringField(commit, "sha");
  if (!workspace || statusHash === undefined) {
    throw new Error(
      `verified action ${tool} requires an observable git workspace (${repoPath} is not a git repository or is not readable)`,
    );
  }

  // An abort returns the workspace to its pre-operation state without moving
  // HEAD: the re-read baseline is the workspace status, not the commit sha.
  // The workflow proposals carry the abort under args.action ("abort").
  const aborting = toolArgs["action"] === "abort";

  switch (tool) {
    case "git_add": {
      const stagedPaths = stringArrayArg(toolArgs["paths"]);
      return {
        target: workspaceRef(statusHash),
        basedOn: [workspaceRef(statusHash)],
        expectedResult: stagedPaths.length > 0
          ? [{ artifact: workspaceRef(statusHash), condition: "field_contains", field: "staged", expected: stagedPaths }]
          : [{ artifact: workspaceRef(statusHash), condition: "field_contains", field: "staged" }],
      };
    }
    case "git_rm":
    case "git_restore":
    case "git_checkpoint_apply":
    case "git_stash":
      return {
        target: workspaceRef(statusHash),
        basedOn: [workspaceRef(statusHash)],
        expectedResult: [{
          artifact: workspaceRef(statusHash),
          condition: "field_ne",
          field: "statusHash",
          expected: statusHash,
        }],
      };
    case "git_commit": {
      const message = firstLine(String(toolArgs["message"] ?? ""));
      if (headSha !== undefined) {
        return {
          target: commitRef(headSha),
          basedOn: [commitRef(headSha)],
          expectedResult: [
            { artifact: commitRef(headSha), condition: "field_ne", field: "sha", expected: headSha },
            ...(message
              ? [{ artifact: commitRef(headSha), condition: "field_eq" as const, field: "subject", expected: message }]
              : []),
          ],
        };
      }
      // Unborn HEAD: this is the first commit of the repository. There is no
      // pre-state sha to move from; the re-read must show a commit whose
      // subject is exactly the approved message.
      if (!message) {
        throw new Error(`verified action ${tool} on an unborn HEAD requires a commit message`);
      }
      return {
        target: commitRef(""),
        basedOn: [workspaceRef(statusHash)],
        expectedResult: [{
          artifact: commitRef(""),
          condition: "field_eq",
          field: "subject",
          expected: message,
        }],
      };
    }
    case "git_push": {
      if (headSha === undefined) {
        throw new Error(`verified action ${tool} requires a readable HEAD (${repoPath})`);
      }
      const branch = String(toolArgs["branch"] ?? "");
      const remote = String(toolArgs["remote"] ?? "origin");
      const remoteRef: ArtifactRef = { kind: "git_remote", projectLinkId, repoPath, remote, branch, sha: "" };
      return {
        // Local HEAD is the baseline: the push must land exactly this sha.
        target: remoteRef,
        basedOn: [commitRef(headSha)],
        expectedResult: [{
          artifact: remoteRef,
          condition: "field_eq",
          field: "remoteTip",
          expected: headSha,
        }],
      };
    }
    case "git_pull":
    case "git_cherry_pick":
    case "git_revert":
    case "git_checkout":
    case "git_switch":
    case "git_merge":
    case "git_rebase": {
      if (aborting) {
        return {
          target: workspaceRef(statusHash),
          basedOn: [workspaceRef(statusHash)],
          expectedResult: [{
            artifact: workspaceRef(statusHash),
            condition: "field_ne",
            field: "statusHash",
            expected: statusHash,
          }],
        };
      }
      if (headSha === undefined) {
        throw new Error(`verified action ${tool} requires a readable HEAD (${repoPath})`);
      }
      return {
        target: commitRef(headSha),
        basedOn: [commitRef(headSha)],
        expectedResult: [{
          artifact: commitRef(headSha),
          condition: "field_ne",
          field: "sha",
          expected: headSha,
        }],
      };
    }
    case "git_fetch": {
      const remote = String(toolArgs["remote"] ?? "origin");
      const remoteRefsRef: ArtifactRef = { kind: "git_remote_refs", projectLinkId, repoPath, remote, revision: "" };
      const refs = await transport.readArtifact(remoteRefsRef);
      const refsHash = stringField(refs, "refsHash");
      if (refsHash === undefined) {
        throw new Error(`verified action ${tool} requires readable remote refs (${repoPath}, remote ${remote})`);
      }
      // The baseline carries the pre-read refs hash as its revision: the
      // approve-time staleness check compares the hash, and verification
      // requires the fetch to move the artifact (field_ne refsHash).
      const baseline: ArtifactRef = { ...remoteRefsRef, revision: refsHash };
      return {
        target: baseline,
        basedOn: [baseline],
        expectedResult: [{
          artifact: baseline,
          condition: "field_ne",
          field: "refsHash",
          expected: refsHash,
        }],
      };
    }
    default:
      // Tools without an observable artifact mapping (create_branch, tag,
      // push_tag, …) cannot be verified honestly: verification fails rather
      // than declaring the write complete on the tool's own success. The
      // canonical path for such writes is a tool-specific predicate mapping;
      // until one exists, an unverified write is refused.
      return {
        target: workspaceRef(statusHash),
        basedOn: [workspaceRef(statusHash)],
        expectedResult: [{ artifact: workspaceRef(statusHash), condition: "field_contains", field: "staged" }],
      };
  }
}

export interface RunVerifiedChatActionArgs {
  sessionId: string;
  repoPath: string;
  projectLinkId: string;
  pending: PendingToolAction;
  actionExecutor: ToolExecutor;
  /** Deterministic approval id; doubles as the record idempotency key. */
  toolCallId: string;
  inlineProjectLink?: InlineProjectLink;
  adapters: ConfirmedActionPersistenceAdapters;
  /** Test injection; production uses the canonical shared store. */
  store?: DeliveryActionStore;
  now?: () => number;
}

export async function* runVerifiedChatAction(
  args: RunVerifiedChatActionArgs,
): AsyncGenerator<ChatEvent, VerifiedChatActionResult> {
  const { adapters, pending, sessionId } = args;
  const store = args.store ?? new SqliteDeliveryActionStore();
  const transport = createVerifiedTransport(args.repoPath, args.inlineProjectLink);
  const spec = await buildVerifiedActionSpec({
    repoPath: args.repoPath,
    projectLinkId: args.projectLinkId,
    tool: pending.tool,
    toolArgs: pending.args,
    transport,
  });
  const runtime = new DeliveryActionRuntime(
    store,
    new DeliveryActionPolicy({ now: args.now }),
    // approveStreaming never invokes the constructor executor; the streaming
    // callback below is the execution path.
    { execute: async () => { throw new Error("unused executor"); } } as never,
    new ActionVerifier(transport),
    transport,
    { now: args.now, writesEnabled: () => deliveryWritesState.enabled, verifierOptions: VERIFIER_OPTIONS },
  );

  const idempotencyKey = args.toolCallId;
  const recordId = actionId(args.projectLinkId, idempotencyKey);
  const existing = await store.get(recordId);

  if (existing?.status === "verified") {
    // The same approval cannot run twice: replay the verified record.
    return {
      ok: true,
      toolResult: undefined,
      summary: `Already verified: ${existing.kind} (evidence in the action record)`,
      record: existing,
      verified: true,
      evidence: verifiedEvidence(existing),
      executed: false,
    };
  }

  if (existing && (existing.status === "executing" || existing.status === "verifying")) {
    // A crashed run resumed: verification re-reads the authoritative state;
    // the write is never re-executed.
    await runtime.resumeVerification();
    const resumed = await store.get(recordId);
    if (resumed) return summarizeApproval({ record: resumed }, resumed);
  }

  if (existing && existing.status === "failed" && !existing.executedAt) {
    // The write never happened (no executedAt): retry with the same
    // idempotency key is safe — it cannot duplicate a remote mutation.
    const retried = await runtime.retry(recordId, {
      payload: pending.args,
      expectedResult: spec.expectedResult,
      expiresAt: expiresAt(args.now),
      reason: pending.description,
    });
    if (retried.verdict.decision === "deny") {
      return {
        ok: false,
        toolResult: undefined,
        summary: `${pending.tool} retry denied: ${retried.verdict.reasons.join("; ")}`,
        record: retried.record,
        verified: false,
        evidence: [],
        executed: false,
        error: retried.verdict.reasons.join("; "),
      };
    }
    const result = yield* runtime.approveStreaming(retried.record.id, (record) =>
      executeApprovedTool(args, record),
    );
    return summarizeApproval(result, result.record);
  }

  if (existing) {
    // Terminal states after a write (stale, rejected, cancelled, or failed
    // with executedAt) are never re-run: the idempotency boundary prevents a
    // second mutation.
    return {
      ok: false,
      toolResult: undefined,
      summary: `Previous action for this approval ended in ${existing.status}; refusing to re-run`,
      record: existing,
      verified: false,
      evidence: [],
      executed: false,
      error: `previous action ended in ${existing.status}`,
    };
  }

  const proposal = await runtime.propose({
    turnId: sessionId,
    projectLinkId: args.projectLinkId,
    kind: pending.tool,
    target: spec.target,
    basedOn: spec.basedOn,
    payload: pending.args,
    risk: "medium",
    reason: pending.description,
    expectedResult: spec.expectedResult,
    idempotencyKey,
    expiresAt: expiresAt(args.now),
    // The user's approval of the tool call IS the approval of the stored
    // action; the record is persisted before the write, then executed and
    // verified through the same approve path.
    forceApproval: true,
  });
  const result = yield* runtime.approveStreaming(proposal.record.id, (record) =>
    executeApprovedTool(args, record),
  );
  return summarizeApproval(result, result.record);
}

/**
 * The approveStreaming callback: streams the confirmed tool execution to the
 * UI and persists the tool bubble, then hands the outcome back so the runtime
 * can re-read and verify. The record it receives carries status "approved" —
 * the boundary between "not yet executed" and "executed".
 */
async function* executeApprovedTool(
  args: RunVerifiedChatActionArgs,
  record: ActionRecord,
): AsyncGenerator<ChatEvent, ExecutionResult, void> {
  const { actionExecutor, adapters, pending, sessionId, toolCallId } = args;
  const execution = yield* streamConfirmedToolExecution({ actionExecutor, pending, toolCallId });

  const checkpointMetadata = checkpointMetadataFromToolResult(execution.result);
  await adapters.appendBubble(sessionId, {
    role: "tool",
    content: execution.summary,
    timestamp: Math.floor(Date.now() / 1000),
    toolName: pending.tool,
    toolArgs: pending.args,
    toolOk: execution.ok,
    toolSummary: execution.summary,
    toolResult: storedPublicToolResult(pending.tool, execution.ok, execution.summary, execution.output),
    ...checkpointMetadata,
  });
  await adapters.appendMessage(
    sessionId,
    "assistant",
    `[confirmed & executed] ${pending.tool}(${JSON.stringify(pending.args)}): ${execution.summary}`,
  );

  return { ok: execution.ok, outcome: { ok: execution.ok, result: execution.result, summary: execution.summary } };
}

function summarizeApproval(
  result: ApproveResult,
  record: ActionRecord,
): VerifiedChatActionResult {
  const verified = record.status === "verified";
  const evidence = verifiedEvidence(record);
  return {
    ok: verified,
    toolResult: result.execution?.outcome.result,
    summary: verified
      ? `${record.kind} verified against the repository: ${evidence.join("; ") || "re-read confirms the write"}`
      : `${record.kind} ${record.status}: ${record.failure?.message ?? result.error?.message ?? "unknown failure"}`,
    record,
    verified,
    evidence,
    executed: record.executedAt !== undefined,
    error: result.error?.message,
  };
}

/** Verification is the record's audit trail — never model prose. */
function verifiedEvidence(record: ActionRecord): string[] {
  return record.audit
    .filter((entry) => entry.event === "verified")
    .map((entry) => entry.detail ?? "");
}

/** Project the session's ActionRecords into the workflow state (turnId = sessionId). */
export async function verifiedActionsForSession(
  store: DeliveryActionStore,
  sessionId: string,
): Promise<ChatVerifiedAction[]> {
  const records = await store.listByTurnId(sessionId, { includeTerminal: true });
  return records.map((record) => ({
    id: record.id,
    kind: record.kind,
    status: record.status,
    evidence: [
      ...verifiedEvidence(record),
      ...(record.failure ? [record.failure.message] : []),
    ],
    executedAt: record.executedAt,
    verifiedAt: record.verifiedAt,
  }));
}

function createVerifiedTransport(
  repoPath: string,
  inlineProjectLink?: InlineProjectLink,
): GitActionTransport {
  let adoTransport: Pick<ActionTransport, "readArtifact"> | undefined;
  if (inlineProjectLink?.adoOrgUrl && inlineProjectLink.adoProject) {
    const organization = inlineProjectLink.adoOrgUrl.replace(/\/$/, "");
    const project = inlineProjectLink.adoProject;
    adoTransport = new AdoActionTransport({
      resolveProjectLink: async () => ({ organization, project }),
    });
  }
  return new GitActionTransport(repoPath, adoTransport);
}

function expiresAt(now?: () => number): number {
  return (now?.() ?? Date.now()) + APPROVAL_WINDOW_MS;
}

function stringField(observation: ArtifactObservation | undefined, field: string): string | undefined {
  const value = observation?.fields[field];
  return typeof value === "string" ? value : undefined;
}

function stringArrayArg(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0] ?? "";
}

function checkpointMetadataFromToolResult(
  toolResult: unknown,
): { checkpointId: string; checkpointPath: string } | undefined {
  if (typeof toolResult !== "object" || toolResult === null) return undefined;
  const result = toolResult as Record<string, unknown>;
  const metadata = result["execution_metadata"];
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const beforeExecute = (metadata as Record<string, unknown>)["beforeExecute"];
  if (typeof beforeExecute !== "object" || beforeExecute === null) return undefined;
  const checkpointId = (beforeExecute as Record<string, unknown>)["checkpointId"];
  const checkpointPath = (beforeExecute as Record<string, unknown>)["checkpointPath"];
  if (typeof checkpointId !== "string" || !checkpointId) return undefined;
  if (typeof checkpointPath !== "string" || !checkpointPath) return undefined;
  return { checkpointId, checkpointPath };
}
