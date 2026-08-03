/**
 * Equivalent tool-call suppression (MP-002).
 *
 * One turn must not repeat an equivalent read-only call that already
 * completed successfully: it adds latency and cost without new evidence
 * (RA-005/RA-006). Suppression is explicit — the planner tells the model the
 * call was skipped instead of faking success — and state changes or failed
 * calls always allow a fresh attempt (RA-007/RA-008).
 */

/**
 * Canonical fingerprint: tool + normalized arguments. Array order and object
 * key order do not change the fingerprint; values are preserved so real
 * parameter differences still distinguish calls.
 */
export function toolCallFingerprint(toolName: string, args: Record<string, unknown>): string {
  return `${toolName}|${canonicalize(args)}`;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    // File/path lists are order-insensitive for equivalent calls (RA-005).
    return `[${value.map(canonicalize).sort().join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface DedupVerdict {
  decision: "execute" | "suppress";
  /** The callId of the earlier equivalent completed call, when suppressed. */
  suppressedByCallId?: string;
}

export class CallDedupGate {
  private readonly completed = new Map<string, string>();
  private suppressedCount = 0;
  private stateDirty = false;

  /**
   * RA-006: a call is only suppressed when an equivalent call already
   * COMPLETED successfully in this turn. Failed calls and state changes
   * always execute again (RA-007/RA-008).
   */
  propose(toolName: string, args: Record<string, unknown>): DedupVerdict {
    if (this.stateDirty) return { decision: "execute" };
    const fingerprint = toolCallFingerprint(toolName, args);
    const priorCallId = this.completed.get(fingerprint);
    if (priorCallId === undefined) return { decision: "execute" };
    this.suppressedCount += 1;
    return { decision: "suppress", suppressedByCallId: priorCallId };
  }

  recordCompleted(toolName: string, args: Record<string, unknown>, callId: string): void {
    // RA-008: the first completed read after a state change establishes the
    // new baseline, so dedup resumes for the new state.
    this.stateDirty = false;
    const fingerprint = toolCallFingerprint(toolName, args);
    if (!this.completed.has(fingerprint)) {
      this.completed.set(fingerprint, callId);
    }
  }

  /** A state-changing (write) capability succeeded; repo state may differ now. */
  markStateChanged(): void {
    this.stateDirty = true;
    this.completed.clear();
  }

  get suppressedCalls(): number {
    return this.suppressedCount;
  }
}
