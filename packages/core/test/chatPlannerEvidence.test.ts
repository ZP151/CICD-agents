import { describe, expect, it } from "vitest";
import { groundFinalResponse } from "../src/chatPlannerEvidence.js";

describe("groundFinalResponse", () => {
  it("adds only omitted public Git facts to a sparse model conclusion", () => {
    const result = groundFinalResponse("Inspection complete.", [
      { name: "git_current_branch", ok: true, output: "main\n" },
      { name: "git_status", ok: true, output: "## main...origin/main\n M app.ts\n?? notes.md\n" },
      { name: "git_log", ok: true, output: "dffeecd Dev 2026-07-05 fix: validation\n" },
    ]);

    expect(result).toContain("Verified facts:");
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

  it("removes a repeated execution-plan preamble when a conclusion follows", () => {
    const result = groundFinalResponse([
      "Evidence needed before read-only checks:",
      "- Confirm the active branch.",
      "- Read the working-tree status.",
      "",
      "Findings (read-only):",
      "The active branch is main and the working tree has uncommitted changes.",
    ].join("\n"), [
      { name: "git_current_branch", ok: true, output: "main\n" },
      { name: "git_status", ok: true, output: "## main\n M app.ts\n" },
    ]);

    expect(result).toBe("Findings (read-only):\nThe active branch is main and the working tree has uncommitted changes.");
    expect(result).not.toContain("Evidence needed");
    expect(result).not.toContain("Confirm the active branch");
  });

  it("removes a completed command replay before a later findings section", () => {
    const result = groundFinalResponse([
      "I collected three read-only evidence items and report the results below.",
      "Evidence collected (read-only commands run):",
      "- git_current_branch — active branch.",
      "- git_status — working-tree state.",
      "",
      "Findings:",
      "The active branch is main and the working tree has uncommitted changes.",
    ].join("\n"), [
      { name: "git_current_branch", ok: true, output: "main\n" },
      { name: "git_status", ok: true, output: "## main\n M app.ts\n" },
    ]);

    expect(result).toBe("Findings:\nThe active branch is main and the working tree has uncommitted changes.");
    expect(result).not.toContain("Evidence collected");
    expect(result).not.toContain("git_current_branch");
  });

  it("turns a collected-evidence result section into findings and drops an unrequested action menu", () => {
    const result = groundFinalResponse([
      "Planned evidence to collect (read-only) before reporting:",
      "- Current branch name (git_current_branch).",
      "- Working-tree status (git_status).",
      "",
      "Collected evidence and result:",
      "- Active branch: main",
      "- Working tree has one modified file.",
      "",
      "Notes:",
      "- All checks were read-only; no files were modified.",
      "- Next steps I can run on request: show full diffs or prepare a commit (requires your approval).",
    ].join("\n"), [
      { name: "git_current_branch", ok: true, output: "main\n" },
      { name: "git_status", ok: true, output: "## main\n M app.ts\n" },
    ]);

    expect(result).toContain("Findings:\n- Active branch: main");
    expect(result).toContain("All checks were read-only");
    expect(result).not.toContain("Planned evidence");
    expect(result).not.toContain("git_current_branch");
    expect(result).not.toContain("Next steps I can run");
  });

  it("removes an execution ledger appended after otherwise valid findings", () => {
    const result = groundFinalResponse([
      "Findings:",
      "- Active branch: main",
      "- Working tree has one modified file.",
      "",
      "Evidence collected before reporting:",
      "- git_current_branch to confirm the active branch.",
      "- git_status to list modified files.",
      "",
      "No files were modified during this inspection.",
    ].join("\n"), [
      { name: "git_current_branch", ok: true, output: "main\n" },
      { name: "git_status", ok: true, output: "## main\n M app.ts\n" },
    ]);

    expect(result).toContain("Findings:\n- Active branch: main");
    expect(result).toContain("No files were modified during this inspection.");
    expect(result).not.toContain("Evidence collected before reporting");
    expect(result).not.toContain("git_current_branch");
  });

  it("removes a prose execution preamble and command syntax before findings", () => {
    const result = groundFinalResponse([
      "I will collect (and did collect) three read-only pieces of evidence before reporting:",
      "- Current branch name.",
      "- Working-tree status in short form.",
      "",
      "Findings (collected without modifying files):",
      "- Active branch: main",
      "- Working-tree (git status --short): one modified file.",
      "",
      "No files were modified during this inspection.",
    ].join("\n"), [
      { name: "git_current_branch", ok: true, output: "main\n" },
      { name: "git_status", ok: true, output: "## main\n M app.ts\n" },
    ]);

    expect(result).toContain("Findings (collected without modifying files):");
    expect(result).toContain("Working-tree: one modified file.");
    expect(result).not.toContain("I will collect");
    expect(result).not.toContain("git status");
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
