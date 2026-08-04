/**
 * Transport boundary for the delivery action runtime.
 *
 * ADO transport remains behind this interface so the runtime is testable and
 * so a generic MCP tool cannot bypass local risk policy. Implementations read
 * the authoritative artifact AFTER a write and return observations the
 * verifier evaluates — HTTP success is never treated as verification.
 */
import type { ArtifactRef } from "../artifactRef.js";
import type { ActionRecord } from "./actionTypes.js";

export interface ArtifactObservation {
  ref: ArtifactRef;
  /** Revision as read back from the authoritative source. */
  revision?: number | string;
  fields: Record<string, unknown>;
  relations: string[];
  /** Correlation markers observed (run names, commit ids, …). */
  correlationIds: string[];
}

export interface ExecuteOutcome {
  ok: boolean;
  result: unknown;
  summary: string;
}

export interface ActionTransport {
  execute(record: ActionRecord): Promise<ExecuteOutcome>;
  readArtifact(ref: ArtifactRef): Promise<ArtifactObservation | undefined>;
}

export interface ActionVerifierOptions {
  attempts?: number;
  intervalMs?: number;
  timeoutMs?: number;
  now?: () => number;
}
