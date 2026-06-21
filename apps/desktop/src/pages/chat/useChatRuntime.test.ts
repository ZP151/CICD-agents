import { describe, expect, it } from "vitest";
import { approvalDenialMessage } from "./useChatRuntime.js";

describe("approvalDenialMessage", () => {
  it("keeps the current denial fallback when feedback is empty", () => {
    expect(approvalDenialMessage()).toBe("no");
    expect(approvalDenialMessage("   ")).toBe("no");
  });

  it("uses trimmed feedback as the next instruction", () => {
    expect(approvalDenialMessage("  stage only the TypeScript files  ")).toBe("stage only the TypeScript files");
  });
});
