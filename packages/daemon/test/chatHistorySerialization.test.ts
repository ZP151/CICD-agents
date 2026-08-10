import { describe, expect, it } from "vitest";
import { chatHistoryEntryFromSession } from "../src/chatHistorySerialization.js";
import type { StoredSession } from "../src/chatHistoryTypes.js";

function pendingApprovalSession(): StoredSession {
  return {
    id: "approval-session",
    createdAt: 1,
    repoPath: "C:\\repo",
    messages: [],
    bubbles: [],
    approvalProposal: {
      tool: "ado_trigger_pipeline",
      args: { pipeline_id: 117, branch: "main" },
      description: "Trigger Azure Pipeline #117 on main.",
    },
  };
}

describe("chatHistoryEntryFromSession", () => {
  it("labels an approval-only session from its pending proposal instead of showing it as empty", () => {
    const entry = chatHistoryEntryFromSession(pendingApprovalSession());

    expect(entry.preview).toBe("");
    expect(entry.title).toBe("Trigger Azure Pipeline #117 on main");
  });
});
