import { describe, expect, it } from "vitest";
import {
  CHAT_CONTROL_JSON_MARKER,
  parseControlResponse,
  plannerResultFromControl,
} from "../src/chatPlannerControl.js";

describe("plannerResultFromControl — model self-report is not execution fact", () => {
  it("drops control actions_taken claims entirely", () => {
    const result = plannerResultFromControl(
      {
        response: "Staged notes.txt successfully.",
        risk_level: "high",
        actions_taken: ["git_add", "git_commit", "git_push"],
        actionsTaken: ["git_add"],
        suggestions: ["commit next"],
      },
      { fallbackText: "", finalizationMode: "control_marker", toolCallsMade: [], usedLlm: true },
    );
    expect(result.actionsTaken).toEqual([]);
  });

  it("keeps display fields (response, riskLevel, suggestions) flowing", () => {
    const result = plannerResultFromControl(
      {
        response: "Read-only analysis.",
        risk_level: "medium",
        actions_taken: ["git_status"],
        suggestions: ["approve the inspection"],
      },
      { fallbackText: "", finalizationMode: "control_marker", toolCallsMade: [], usedLlm: true },
    );
    expect(result.response).toBe("Read-only analysis.");
    expect(result.riskLevel).toBe("medium");
    expect(result.suggestions).toEqual(["approve the inspection"]);
  });

  it("keeps approval proposals (proposals are not facts) intact", () => {
    const result = plannerResultFromControl(
      {
        response: "Ready to stage.",
        risk_level: "high",
        actions_taken: ["git_status"],
        approval_proposal: {
          tool: "git_add",
          args: {},
          description: "Stage all changes",
          nextHint: "commit",
        },
      },
      { fallbackText: "", finalizationMode: "control_marker", toolCallsMade: [], usedLlm: true },
    );
    expect(result.approvalProposal?.tool).toBe("git_add");
  });
});

describe("parseControlResponse", () => {
  it("extracts visible text and raw control (raw data preserved for internal use)", () => {
    const text = `I reviewed the changes.\n${CHAT_CONTROL_JSON_MARKER}{"response":"I reviewed the changes.","actions_taken":["git_status"]}`;
    const parsed = parseControlResponse(text);
    expect(parsed.visibleText).toBe("I reviewed the changes.");
    expect(parsed.control?.["actions_taken"]).toEqual(["git_status"]);
    expect(parsed.mode).toBe("control_marker");
  });
});
