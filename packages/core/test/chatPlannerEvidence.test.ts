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

  it("removes empty final headings and retains a bounded fact for an inspected diff", () => {
    const result = groundFinalResponse([
      "Current branch: main.",
      "Most relevant changed config:",
      "",
      "Suggestions:",
    ].join("\n"), [
      {
        name: "git_diff",
        ok: true,
        output: [
          "diff --git a/config/app.yml b/config/app.yml",
          "index 1111111..2222222 100644",
          "--- a/config/app.yml",
          "+++ b/config/app.yml",
          "@@ -1 +1 @@",
          "-timeout: 20",
          "+timeout: 30",
        ].join("\n"),
      },
    ]);

    expect(result).toBe([
      "Current branch: main.",
      "",
      "Verified facts:",
      "- Reviewed diff: `config/app.yml` (1 added line, 1 removed line).",
    ].join("\n"));
    expect(result).not.toContain("Most relevant changed config:");
    expect(result).not.toContain("Suggestions:");
  });

  it("keeps a verdict but removes raw evidence, source ledgers, and recommendation menus", () => {
    const result = groundFinalResponse([
      "Verdict: The deployment change is high risk because the selected configuration changes an endpoint.",
      "",
      "Evidence: Snippet: Data Source=192.168.1.85; Password=***REDACTED***",
      "Immediate recommendations (read-only guidance):",
      "- Rotate the key.",
      "Sources:",
      "I ran git status and git diff to produce this assessment.",
    ].join("\n"), [
      {
        name: "git_diff",
        ok: true,
        output: [
          "diff --git a/config/app.yml b/config/app.yml",
          "--- a/config/app.yml",
          "+++ b/config/app.yml",
          "-endpoint: old",
          "+endpoint: new",
        ].join("\n"),
      },
    ]);

    expect(result).toContain("Verdict: The deployment change is high risk");
    expect(result).toContain("Reviewed diff: `config/app.yml`");
    expect(result).not.toContain("Data Source");
    expect(result).not.toContain("Immediate recommendations");
    expect(result).not.toContain("I ran git status");
  });

  it("resumes at a verdict that follows a raw evidence section", () => {
    const result = groundFinalResponse([
      "Evidence:",
      "Snippet: endpoint=https://internal.example.test; token=***REDACTED***",
      "",
      "Verdict: The configuration change needs deployment review before release.",
      "",
      "Sources:",
      "I ran git diff to inspect the selected Project Link.",
    ].join("\n"), [
      {
        name: "git_diff",
        ok: true,
        output: [
          "diff --git a/config/app.yml b/config/app.yml",
          "--- a/config/app.yml",
          "+++ b/config/app.yml",
          "-endpoint: old",
          "+endpoint: new",
        ].join("\n"),
      },
    ]);

    expect(result).toContain("Verdict: The configuration change needs deployment review");
    expect(result).toContain("Reviewed diff: `config/app.yml`");
    expect(result).not.toContain("internal.example.test");
    expect(result).not.toContain("I ran git diff");
  });
});
