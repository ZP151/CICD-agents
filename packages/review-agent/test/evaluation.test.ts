import { describe, expect, it } from "vitest";
import { evaluate, type EvalSample } from "../src/evaluation.js";

const SAMPLES: EvalSample[] = [
  {
    pr: {
      id: "PR-1",
      description: "null deref",
      expectedCategories: ["bug"],
      expectedSeverities: [],
      expectedMessageContains: ["null"],
    },
    result: {
      summary: "ok",
      findings: [
        { file: "a.ts", line: 1, severity: "warning", category: "bug", message: "potential null deref" },
      ],
      tokensIn: 10,
      tokensOut: 5,
    },
  },
  {
    pr: {
      id: "PR-2",
      description: "missing test",
      expectedCategories: ["missing-test"],
      expectedSeverities: [],
      expectedMessageContains: [],
    },
    result: {
      summary: "ok",
      findings: [{ file: "b.ts", line: 2, severity: "info", category: "style", message: "spacing" }],
      tokensIn: 0,
      tokensOut: 0,
    },
  },
];

describe("evaluate", () => {
  it("computes precision, recall, and f1 against a small labelled set", () => {
    const pr = evaluate(SAMPLES);
    expect(pr.truePositives).toBe(1);
    expect(pr.falseNegatives).toBe(1);
    expect(pr.precision).toBeGreaterThan(0);
    expect(pr.recall).toBeCloseTo(0.5, 5);
  });
});
