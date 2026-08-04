import { describe, expect, it } from "vitest";
import {
  applyFindingLimit,
  findingKey,
  incrementalReReview,
  type ReviewFinding,
} from "../src/index.js";

function finding(file: string, line: number, severity: ReviewFinding["severity"], message = "risk"): ReviewFinding {
  return { file, line, severity, category: "bug", message };
}

describe("review assessment", () => {
  it("keys findings by file, line, category and message", () => {
    const first = findingKey(finding("src/a.ts", 10, "warning"));
    const second = findingKey(finding("src/a.ts", 10, "warning"));
    const different = findingKey(finding("src/a.ts", 11, "warning"));
    expect(first).toBe(second);
    expect(first).not.toBe(different);
  });

  it("re-evaluates unchanged findings, resolves removed ones, and surfaces new risks", () => {
    const previous = {
      sourceCommit: "abc123",
      findings: [
        finding("src/a.ts", 10, "blocking", "null deref"),
        finding("src/a.ts", 20, "warning", "old line issue"),
        finding("src/b.ts", 5, "warning", "unused import"),
      ],
    };
    const current = {
      sourceCommit: "def456",
      changedFiles: ["src/a.ts", "src/new.ts"],
      findings: [
        finding("src/a.ts", 10, "blocking", "null deref"),
        finding("src/new.ts", 3, "warning", "missing test"),
      ],
    };
    const result = incrementalReReview(previous, current);

    // Still-present finding on the changed file is re-derived by the new pass.
    expect(result.reEvaluated.find((entry) => entry.verdict === "unchanged")?.finding.file).toBe("src/a.ts");
    // Previous finding on a changed file that vanished from the new pass is stale.
    expect(result.reEvaluated.find((entry) => entry.verdict === "stale")?.reason).toContain("src/a.ts");
    // Removed finding on an unchanged file is resolved.
    expect(result.stale.find((entry) => entry.finding.file === "src/b.ts")?.verdict).toBe("resolved");
    // The new pass's fresh finding is a new risk.
    expect(result.newRisks.map((entry) => entry.file)).toEqual(["src/new.ts"]);
    expect(result.changedFiles).toEqual(["src/a.ts", "src/new.ts"]);
  });

  it("keeps at most the configured number of high-value findings", () => {
    const findings = [
      finding("a.ts", 1, "info"),
      finding("b.ts", 1, "warning"),
      finding("c.ts", 1, "blocking"),
      finding("d.ts", 1, "warning"),
    ];
    const { retained, suppressed } = applyFindingLimit(findings, 3);
    expect(retained).toHaveLength(3);
    expect(retained[0]!.severity).toBe("blocking");
    expect(suppressed).toHaveLength(1);
    expect(suppressed[0]!.severity).toBe("info");
  });
});
