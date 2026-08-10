import { describe, expect, it } from "vitest";
import { isContextOnlyResult } from "./useWorkspaceActionRuntime.js";

describe("workspace context-only actions", () => {
  it("keeps a branch switch out of the chat transcript unless it needs approval", () => {
    expect(isContextOnlyResult({ type: "checkout_branch", branch: "release" }, undefined)).toBe(true);
    expect(isContextOnlyResult({ type: "checkout_branch", branch: "release" }, {
      id: "approval-1",
      action: {
        tool: "git_switch",
        args: { branch: "release" },
        description: "Switch branches with uncommitted changes",
      },
      riskLevel: "high",
      explanation: "The working tree has uncommitted changes.",
    })).toBe(false);
  });

  it("keeps branch refresh context-only without clearing an existing conversation", () => {
    expect(isContextOnlyResult({ type: "refresh_branch" }, undefined)).toBe(true);
    expect(isContextOnlyResult({ type: "inspect_changes" }, undefined)).toBe(false);
  });
});
