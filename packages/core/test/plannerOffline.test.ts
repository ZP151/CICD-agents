import { describe, expect, it } from "vitest";
import { Planner } from "../src/planner.js";
import type { ContextBundle } from "../src/contextBuilder.js";

describe("Planner.buildOfflineSummary", () => {
  it("summarises a non-empty diff", () => {
    const bundle: ContextBundle = {
      targetBranch: "main",
      diff: "diff --git a/app.py b/app.py\n",
      changedFiles: [
        { path: "app.py", status: "modified", additions: 4, deletions: 1 },
        { path: "tests/test_app.py", status: "added", additions: 10, deletions: 0 },
      ],
      relatedChunks: [],
      relatedTests: ["tests/test_app.py"],
      relevantConfigs: ["pyproject.toml"],
      affectedSymbols: ["app.py::function multiply"],
      truncated: false,
    };
    const { title, summary } = Planner.buildOfflineSummary(bundle);
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(summary).toContain("## What");
    expect(summary).toContain("function multiply");
  });

  it("handles an empty changeset", () => {
    const bundle: ContextBundle = {
      targetBranch: "main",
      diff: "",
      changedFiles: [],
      relatedChunks: [],
      relatedTests: [],
      relevantConfigs: [],
      affectedSymbols: [],
      truncated: false,
    };
    const result = Planner.buildOfflineSummary(bundle);
    expect(result.title.toLowerCase()).toContain("no changes");
  });
});
