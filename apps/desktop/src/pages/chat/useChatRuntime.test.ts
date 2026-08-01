import { describe, expect, it } from "vitest";
import { approvalDenialMessage, localTurnCancellationEvents } from "./useChatRuntime.js";

describe("approvalDenialMessage", () => {
  it("keeps the current denial fallback when feedback is empty", () => {
    expect(approvalDenialMessage()).toBe("no");
    expect(approvalDenialMessage("   ")).toBe("no");
  });

  it("uses trimmed feedback as the next instruction", () => {
    expect(approvalDenialMessage("  stage only the TypeScript files  ")).toBe("stage only the TypeScript files");
  });
});

describe("localTurnCancellationEvents", () => {
  it("seals the execution canvas before publishing a cancellation conclusion", () => {
    expect(localTurnCancellationEvents("turn-7", 12, 1_000, 1_350)).toEqual([
      expect.objectContaining({ type: "turn.execution.completed", turnId: "turn-7", sequence: 13, elapsedMs: 350 }),
      expect.objectContaining({ type: "turn.final.delta", turnId: "turn-7", sequence: 14 }),
      expect.objectContaining({
        type: "turn.final.completed",
        turnId: "turn-7",
        sequence: 15,
        finalText: "This turn was cancelled before the work completed. You can send the next instruction when you're ready.",
      }),
      expect.objectContaining({ type: "turn.cancelled", turnId: "turn-7", sequence: 16, elapsedMs: 350 }),
    ]);
  });
});
