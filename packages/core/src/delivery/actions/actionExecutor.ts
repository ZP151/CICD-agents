/**
 * Action executor.
 *
 * Runs the STORED action payload against the transport exactly once. The
 * executor refuses records that are stale, expired or already executed; it
 * never regenerates payload from a model. After the write it hands the
 * outcome to the verifier, which re-reads the authoritative artifact.
 */
import type { ActionRecord } from "./actionTypes.js";
import type { ActionTransport, ExecuteOutcome } from "./actionTransport.js";

export interface ExecutionResult {
  ok: boolean;
  outcome: ExecuteOutcome;
  failure?: { kind: "transport" | "policy"; message: string };
}

/** Statuses whose record already went through an execution attempt. */
const ALREADY_RAN: ReadonlySet<ActionRecord["status"]> = new Set([
  "executing", "verifying", "verified",
]);

export class DeliveryActionExecutor {
  constructor(private readonly transport: ActionTransport) {}

  async execute(record: ActionRecord, now = Date.now()): Promise<ExecutionResult> {
    if (record.expiresAt <= now) {
      return {
        ok: false,
        outcome: { ok: false, result: undefined, summary: "action expired before execution" },
        failure: { kind: "policy", message: "action expired before execution" },
      };
    }
    if (ALREADY_RAN.has(record.status)) {
      return {
        ok: false,
        outcome: { ok: false, result: undefined, summary: `duplicate execution refused (${record.status})` },
        failure: { kind: "policy", message: `duplicate execution refused (${record.status})` },
      };
    }
    try {
      const outcome = await this.transport.execute(record);
      return { ok: outcome.ok, outcome };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        outcome: { ok: false, result: undefined, summary: message },
        failure: { kind: "transport", message },
      };
    }
  }
}
