import { describe, expect, it } from "vitest";
import { groundFinalResponse } from "../src/chatPlannerEvidence.js";

describe("groundFinalResponse", () => {
  it("adds only omitted public Git facts to a sparse model conclusion", () => {
    const result = groundFinalResponse("Inspection complete.", [
      { name: "git_current_branch", ok: true, output: "main\n" },
      { name: "git_status", ok: true, output: "## main...origin/main\n M app.ts\n?? notes.md\n" },
      { name: "git_log", ok: true, output: "dffeecd Dev 2026-07-05 fix: validation\n" },
    ]);

    expect(result).toContain("Evidence collected:");
    expect(result).toContain("Active branch: `main`.");
    expect(result).toContain("Working tree: 1 modified file; 1 untracked file.");
    expect(result).toContain("Most recent commit: `dffeecd Dev 2026-07-05 fix: validation`.");
  });

  it("does not duplicate a branch or working-tree fact already in the model conclusion", () => {
    const result = groundFinalResponse("The active branch is main and there are uncommitted changes.", [
      { name: "git_current_branch", ok: true, output: "main\n" },
      { name: "git_status", ok: true, output: "## main\n M app.ts\n" },
    ]);

    expect(result).toBe("The active branch is main and there are uncommitted changes.");
  });

  it("recognizes a short commit SHA already stated by the model", () => {
    const result = groundFinalResponse("The latest commit is dffeecd and it hardens validation.", [
      { name: "git_log", ok: true, output: "dffeecd Dev 2026-07-05 fix: validation\n" },
    ]);

    expect(result).toBe("The latest commit is dffeecd and it hardens validation.");
  });

  it("never creates evidence from failed or unsupported output", () => {
    expect(groundFinalResponse("The check failed.", [
      { name: "git_status", ok: false, output: "fatal: failed" },
      { name: "custom_tool", ok: true, output: "internal payload" },
    ])).toBe("The check failed.");
  });
});
