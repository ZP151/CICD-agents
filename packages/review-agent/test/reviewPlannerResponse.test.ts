import { describe, expect, it } from "vitest";
import {
  parseReviewResponse,
  postProcessReviewFindings,
} from "@mergepilot/core";
import { BUNDLE } from "./reviewPlannerTestDoubles.js";

describe("review planner response processing", () => {
  it("parses PR-Agent-style review metadata from model JSON", () => {
    const parsed = parseReviewResponse(`\`\`\`json
{
  "summary": "Looks mostly safe.",
  "metadata": {
    "estimatedEffort": 3,
    "testsRequired": true,
    "securityConcern": true,
    "canBeSplit": false,
    "keyIssues": ["Auth path changed", "Tests missing"]
  },
  "findings": [
    {
      "file": "src/auth.ts",
      "line": 12,
      "severity": "warning",
      "category": "security",
      "message": "Check token expiry handling."
    }
  ]
}
\`\`\``);

    expect(parsed).toEqual({
      summary: "Looks mostly safe.",
      metadata: {
        estimatedEffort: 3,
        testsRequired: true,
        securityConcern: true,
        canBeSplit: false,
        keyIssues: ["Auth path changed", "Tests missing"],
      },
      findings: [{
        file: "src/auth.ts",
        line: 12,
        severity: "warning",
        category: "security",
        message: "Check token expiry handling.",
      }],
    });
  });

  it("normalizes and filters model findings against changed files", () => {
    const processed = postProcessReviewFindings([
      {
        file: "/src/app.ts",
        line: 2,
        severity: "warning",
        category: "bug",
        message: "Check the return value.",
      },
      {
        file: "src/app.ts",
        line: 2,
        severity: "warning",
        category: "bug",
        message: "Check the return value.",
      },
      {
        file: "src/missing.ts",
        line: 1,
        severity: "warning",
        category: "bug",
        message: "This file is not part of the PR.",
      },
      {
        file: "src/app.ts",
        line: 99,
        severity: "blocking",
        category: "security",
        message: "Line does not exist.",
      },
      {
        file: "src/app.ts",
        line: 1,
        severity: "info",
        category: "style",
        message: "   ",
      },
    ], BUNDLE);

    expect(processed.findings).toEqual([{
      file: "src/app.ts",
      line: 2,
      severity: "warning",
      category: "bug",
      message: "Check the return value.",
    }]);
    expect(processed.discardedFindings.map((finding) => finding.reason)).toEqual([
      "duplicate",
      "unknown_file",
      "invalid_line",
      "empty_message",
    ]);
  });

  it("rejects findings outside changed hunks when hunk metadata exists", () => {
    const processed = postProcessReviewFindings([
      {
        file: "src/app.ts",
        line: 1,
        severity: "warning",
        category: "bug",
        message: "This is outside the changed hunk.",
      },
      {
        file: "src/app.ts",
        line: 2,
        severity: "warning",
        category: "bug",
        message: "This is inside the changed hunk.",
      },
    ], {
      ...BUNDLE,
      files: [{
        path: "src/app.ts",
        changeType: "edit",
        content: "export function add(a: number, b: number) {\n  return a - b;\n}\n",
        hunks: [{
          changeType: "edit",
          originalStart: 2,
          originalLineCount: 1,
          modifiedStart: 2,
          modifiedLineCount: 1,
          originalLines: ["  return a + b;"],
          modifiedLines: ["  return a - b;"],
        }],
      }],
    });

    expect(processed.findings).toEqual([{
      file: "src/app.ts",
      line: 2,
      severity: "warning",
      category: "bug",
      message: "This is inside the changed hunk.",
    }]);
    expect(processed.discardedFindings).toMatchObject([{
      file: "src/app.ts",
      line: 1,
      reason: "outside_changed_hunk",
    }]);
  });
});
