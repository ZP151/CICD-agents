import { describe, expect, it } from "vitest";
import { CallDedupGate, toolCallFingerprint } from "../src/toolCallDedup.js";

describe("toolCallFingerprint (MP-002)", () => {
  it("normalizes argument key order (RA-005)", () => {
    expect(toolCallFingerprint("git_diff", { a: 1, b: 2 })).toBe(
      toolCallFingerprint("git_diff", { b: 2, a: 1 }),
    );
  });

  it("normalizes array element order inside nested args", () => {
    expect(toolCallFingerprint("git_show", { files: ["a", "b"] })).toBe(
      toolCallFingerprint("git_show", { files: ["b", "a"] }),
    );
  });

  it("keeps real value differences distinct", () => {
    expect(toolCallFingerprint("git_show", { ref: "main" })).not.toBe(
      toolCallFingerprint("git_show", { ref: "develop" }),
    );
    expect(toolCallFingerprint("git_diff", {})).not.toBe(
      toolCallFingerprint("git_status", {}),
    );
  });
});

describe("CallDedupGate (MP-002)", () => {
  it("allows first execution and suppresses an equivalent completed read (RA-005/RA-006)", () => {
    const gate = new CallDedupGate();

    expect(gate.propose("git_status", {})).toEqual({ decision: "execute" });
    gate.recordCompleted("git_status", {}, "call-1");
    const verdict = gate.propose("git_status", {});

    expect(verdict).toEqual({ decision: "suppress", suppressedByCallId: "call-1" });
    expect(gate.suppressedCalls).toBe(1);
  });

  it("never fakes success: suppression is explicit with the prior callId", () => {
    const gate = new CallDedupGate();
    gate.recordCompleted("git_diff", { ref: "main" }, "call-7");

    const verdict = gate.propose("git_diff", { ref: "main" });

    expect(verdict.decision).toBe("suppress");
    expect(verdict.suppressedByCallId).toBe("call-7");
  });

  it("re-allows a failed call for retry (RA-007)", () => {
    const gate = new CallDedupGate();

    // First call failed: never recorded as completed, so the retry executes.
    expect(gate.propose("git_log", {})).toEqual({ decision: "execute" });
    expect(gate.propose("git_log", {})).toEqual({ decision: "execute" });
  });

  it("allows equivalent reads again after a state change (RA-008)", () => {
    const gate = new CallDedupGate();

    gate.recordCompleted("git_status", {}, "call-1");
    expect(gate.propose("git_status", {})).toEqual({ decision: "suppress", suppressedByCallId: "call-1" });

    // A state-changing capability succeeded; the repo may differ now.
    gate.markStateChanged();

    expect(gate.propose("git_status", {})).toEqual({ decision: "execute" });
    gate.recordCompleted("git_status", {}, "call-2");
    expect(gate.propose("git_status", {})).toEqual({ decision: "suppress", suppressedByCallId: "call-2" });
  });

  it("does not dedupe different arguments even for the same tool", () => {
    const gate = new CallDedupGate();

    gate.recordCompleted("git_show", { ref: "main" }, "call-1");
    expect(gate.propose("git_show", { ref: "develop" })).toEqual({ decision: "execute" });
  });
});
