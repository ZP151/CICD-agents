import { describe, expect, it } from "vitest";
import {
  bundleToCompressedReviewPrompt,
  bundleToReviewPrompt,
  parseReviewResponse,
  postProcessReviewFindings,
  REVIEW_SYSTEM_PROMPT,
  runReviewPlanner,
  scoreReviewFilePriority,
  summarizeContextCoverage,
} from "../src/reviewPlanner.js";
import type { CloudContextBundle } from "../src/cloudContext.js";
import type { LLMClient } from "@cicd-agent/core";

const BUNDLE: CloudContextBundle = {
  prId: 7,
  iterationId: 1,
  files: [
    {
      path: "src/app.ts",
      changeType: "edit",
      content: "export function add(a: number, b: number) {\n  return a + b;\n}\n",
    },
  ],
  relatedSnippets: [],
};

describe("review prompt", () => {
  it("includes file headers and numbered lines", () => {
    const prompt = bundleToReviewPrompt(BUNDLE, ["camelCase only"]);
    expect(prompt).toContain("PR 7");
    expect(prompt).toContain("src/app.ts (edit)");
    expect(prompt).toContain("1: export function add");
    expect(prompt).toContain("camelCase only");
  });

  it("includes Azure DevOps PR readiness signals when present", () => {
    const prompt = bundleToReviewPrompt({
      ...BUNDLE,
      pullRequest: {
        title: "Harden token validation",
        description: "",
        status: "active",
        isDraft: true,
        sourceBranch: "refs/heads/auth-hardening",
        targetBranch: "refs/heads/main",
        createdBy: "Ada Lovelace",
        workItemIds: ["123", "456"],
        reviewerCount: 3,
        voteSummary: { approved: 1, waiting: 1, rejected: 1 },
        threadCount: 4,
        activeThreadCount: 2,
        failedBuildCount: 1,
        latestBuildResult: "failed",
        latestBuildStatus: "completed",
      },
    }, []);

    expect(prompt).toContain("Azure DevOps PR signals");
    expect(prompt).toContain("Harden token validation");
    expect(prompt).toContain("active (draft)");
    expect(prompt).toContain("Work items: 123, 456");
    expect(prompt).toContain("Threads: 4; active=2");
    expect(prompt).toContain("failed/canceled=1");
  });

  it("renders changed hunks when diff blocks are available", () => {
    const prompt = bundleToReviewPrompt({
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
    }, []);

    expect(prompt).toContain("Changed hunks:");
    expect(prompt).toContain("@@ -2,1 +2,1 @@");
    expect(prompt).toContain("-2:   return a + b;");
    expect(prompt).toContain("+2:   return a - b;");
  });

  it("includes the strict JSON schema instruction", () => {
    expect(REVIEW_SYSTEM_PROMPT).toContain("\"findings\"");
    expect(REVIEW_SYSTEM_PROMPT).toContain("\"severity\"");
    expect(REVIEW_SYSTEM_PROMPT).toContain("\"metadata\"");
    expect(REVIEW_SYSTEM_PROMPT).toContain("\"estimatedEffort\"");
  });

  it("compresses large PR prompts without slicing through file blocks", () => {
    const bundle: CloudContextBundle = {
      prId: 9,
      iterationId: 2,
      files: [
        { path: "src/huge.ts", changeType: "edit", content: "x".repeat(1200) },
        { path: "src/small.ts", changeType: "add", content: "export const ok = true;\n" },
        { path: "src/removed.ts", changeType: "delete", content: "" },
      ],
      relatedSnippets: [],
    };

    const compressed = bundleToCompressedReviewPrompt(bundle, [], 900);

    expect(compressed.compressed).toBe(true);
    expect(compressed.includedFiles).toContain("src/small.ts");
    expect(compressed.omittedFiles).toContain("src/huge.ts");
    expect(compressed.prompt).toContain("Compression note");
    expect(compressed.prompt).toContain("Additional modified files");
    expect(compressed.prompt).toContain("src/huge.ts");
    expect(compressed.prompt).not.toContain("... (truncated)");
  });

  it("prioritizes security-sensitive review files over low-signal large files", () => {
    const authFile = { path: "src/auth/tokenService.ts", changeType: "edit", content: "export const token = '';\n" };
    const docsFile = { path: "docs/generated-api.md", changeType: "edit", content: "x".repeat(12_500) };

    expect(scoreReviewFilePriority(authFile)).toBeGreaterThan(scoreReviewFilePriority(docsFile));

    const compressed = bundleToCompressedReviewPrompt({
      prId: 10,
      iterationId: 1,
      files: [docsFile, authFile],
      relatedSnippets: [],
    }, [], 850);

    expect(compressed.compressed).toBe(true);
    expect(compressed.includedFiles).toContain("src/auth/tokenService.ts");
    expect(compressed.omittedFiles).toContain("docs/generated-api.md");
  });

  it("prioritizes files with changed hunks over whole-file-only low-signal content", () => {
    const hunkFile = {
      path: "src/service.ts",
      changeType: "edit",
      content: "export function run() {\n  return 'new';\n}\n",
      hunks: [{
        changeType: "edit",
        originalStart: 2,
        originalLineCount: 1,
        modifiedStart: 2,
        modifiedLineCount: 1,
        originalLines: ["  return 'old';"],
        modifiedLines: ["  return 'new';"],
      }],
    };
    const largeFile = {
      path: "src/generatedSnapshot.ts",
      changeType: "edit",
      content: "x".repeat(12_500),
    };

    expect(scoreReviewFilePriority(hunkFile)).toBeGreaterThan(scoreReviewFilePriority(largeFile));

    const compressed = bundleToCompressedReviewPrompt({
      prId: 12,
      iterationId: 1,
      files: [largeFile, hunkFile],
      relatedSnippets: [],
    }, [], 850);

    expect(compressed.compressed).toBe(true);
    expect(compressed.includedFiles).toContain("src/service.ts");
    expect(compressed.omittedFiles).toContain("src/generatedSnapshot.ts");
    expect(compressed.prompt).toContain("Changed hunks:");
    expect(compressed.prompt).toContain("+2:   return 'new';");
  });

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

  it("returns compression summary from the LLM review path without exposing the prompt", async () => {
    const llm = {
      configured: true,
      usage: { promptTokens: 11, completionTokens: 7, embedTokens: 0 },
      chat: async () => ({
        content: JSON.stringify({
          summary: "Reviewed compressed context.",
          metadata: {
            estimatedEffort: 2,
            testsRequired: false,
            securityConcern: false,
            canBeSplit: false,
            keyIssues: [],
          },
          findings: [],
        }),
        toolCalls: [],
        finishReason: "stop",
      }),
    } as unknown as LLMClient;

    const result = await runReviewPlanner({
      llm,
      conventions: [],
      charBudget: 900,
      bundle: {
        prId: 11,
        iterationId: 1,
        files: [
          { path: "src/auth/tokenService.ts", changeType: "edit", content: "export const ok = true;\n" },
          { path: "docs/generated-api.md", changeType: "edit", content: "x".repeat(12_500) },
        ],
        relatedSnippets: [],
      },
    });

    expect(result.summary).toBe("Reviewed compressed context.");
    expect(result.compression).toEqual({
      compressed: true,
      includedFiles: ["src/auth/tokenService.ts"],
      omittedFiles: ["docs/generated-api.md"],
    });
    expect(result.coverage).toEqual({
      totalFiles: 2,
      filesWithHunks: 0,
      wholeFileOnlyFiles: 2,
      hunkCount: 0,
      changedHunkLines: 0,
    });
    expect("prompt" in result.compression).toBe(false);
  });

  it("summarizes hunk coverage without exposing source content", () => {
    const coverage = summarizeContextCoverage({
      prId: 13,
      iterationId: 1,
      files: [
        {
          path: "src/app.ts",
          changeType: "edit",
          content: "hidden",
          hunks: [
            {
              changeType: "edit",
              originalStart: 2,
              originalLineCount: 1,
              modifiedStart: 2,
              modifiedLineCount: 2,
              originalLines: ["  return old;"],
              modifiedLines: ["  const next = true;", "  return next;"],
            },
          ],
        },
        {
          path: "src/whole.ts",
          changeType: "add",
          content: "hidden",
        },
      ],
      relatedSnippets: [],
    });

    expect(coverage).toEqual({
      totalFiles: 2,
      filesWithHunks: 1,
      wholeFileOnlyFiles: 1,
      hunkCount: 1,
      changedHunkLines: 2,
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
