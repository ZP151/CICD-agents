import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { upsertLocalPrInsightArtifact } from "@mergepilot/core";
import {
  buildPrInsightContextBundle,
  buildPrInsightContextPrompt,
  extractPrInsightArtifactIdFromMessage,
  extractPullRequestIdFromMessage,
  formatPrInsightArtifactsForChat,
} from "../src/chatSession.js";

describe("chat session PR insight context", () => {
  it("extracts PR ids and formats saved PR insights for chat context", () => {
    expect(extractPullRequestIdFromMessage("what did PR #42 conclude?")).toBe(42);
    expect(extractPullRequestIdFromMessage("summarize pull request 99")).toBe(99);
    expect(extractPullRequestIdFromMessage("hello world")).toBeUndefined();
    expect(extractPrInsightArtifactIdFromMessage("open artifact profile-1/demo/42/review_run/run-old.")).toBe("profile-1/demo/42/review_run/run-old");

    const prompt = formatPrInsightArtifactsForChat([{
      id: "profile-1/demo/42/review_run",
      projectLinkId: "profile-1",
      repository: "demo",
      pullRequestId: 42,
      title: "Improve pipeline",
      kind: "review_run",
      at: "2026-06-11T00:10:00.000Z",
      summary: "Full review summary.",
      readiness: "needs_attention",
      decisionQueue: "needs_human_review",
      decisionRiskLevel: "medium",
      contextConfidence: "high",
      risks: ["Missing tests"],
      categories: {
        blocking: ["Required policy failed"],
        warnings: [],
        info: [],
      },
      signals: {
        fileCount: 4,
        threadCount: 1,
        failedBuildCount: 1,
        workItemCount: 0,
        failedPolicyCount: 1,
        buildBlockers: [{
          id: 77,
          buildNumber: "20260610.1",
          definitionName: "CI",
          status: "completed",
          result: "failed",
          url: "https://ado/build/77",
        }],
        policyBlockers: [{
          id: "policy-1",
          name: "Minimum reviewers",
          typeName: "Reviewer policy",
          status: "failed",
          isBlocking: true,
        }],
        activeThreads: [{
          id: 5,
          status: 1,
          author: "Ada",
          firstComment: "Needs tests",
        }],
      },
      findingCount: 2,
      discardedFindingCount: 1,
      tokensIn: 1000,
      tokensOut: 300,
    }]);

    expect(prompt).toContain("## Saved PR AI Insights");
    expect(prompt).toContain("## PR Readiness Context");
    expect(prompt).toContain("readiness=needs_attention");
    expect(prompt).toContain("failedBuilds=1");
    expect(prompt).toContain("failedPolicies=1");
    expect(prompt).toContain("workItems=0");
    expect(prompt).toContain("Build blockers: #77 20260610.1 CI: failed");
    expect(prompt).toContain("Policy blockers: Minimum reviewers: failed (blocking)");
    expect(prompt).toContain("Active threads: #5 Ada: Needs tests");
    expect(prompt).toContain("Required policy failed");
    expect(prompt).toContain("Do not rerun analysis unless the user asks for a fresh result");
    expect(prompt).toContain("Artifact id: profile-1/demo/42/review_run");
    expect(prompt).toContain("PR #42");
    expect(prompt).toContain("Full review summary.");
    expect(prompt).toContain("queue=needs_human_review");
    expect(prompt).toContain("Missing tests");
  });

  it("builds chat PR insight context from persisted artifacts", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-pr-insight-data-"));
    upsertLocalPrInsightArtifact(dataDir, {
      projectLinkId: "profile-1",
      repository: "demo",
      pullRequestId: 42,
      title: "Improve pipeline",
      kind: "review_run",
      at: "2026-06-11T00:10:00.000Z",
      summary: "Saved review summary.",
      readiness: "needs_attention",
      decisionQueue: "needs_human_review",
      decisionRiskLevel: "medium",
      contextConfidence: "high",
      risks: ["Missing tests"],
      findingCount: 2,
      discardedFindingCount: 1,
      tokensIn: 1000,
      tokensOut: 300,
    });
    upsertLocalPrInsightArtifact(dataDir, {
      projectLinkId: "profile-1",
      repository: "demo",
      pullRequestId: 7,
      title: "Other PR",
      kind: "insight_preview",
      at: "2026-06-11T00:00:00.000Z",
      summary: "Other summary.",
      readiness: "ready",
      risks: [],
      tokensIn: 50,
      tokensOut: 10,
    });

    const prompt = buildPrInsightContextPrompt({
      dataDir,
      projectLinkId: "profile-1",
      repository: "demo",
      message: "What did PR #42 need before approval?",
    });

    expect(prompt).toContain("Saved review summary.");
    expect(prompt).toContain("PR #42");
    expect(prompt).not.toContain("Other summary.");
    expect(buildPrInsightContextPrompt({
      dataDir,
      projectLinkId: "profile-1",
      repository: "demo",
      message: "Hello there",
    })).toBeUndefined();
  });

  it("builds PR readiness context from readiness and policy wording", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-pr-readiness-data-"));
    upsertLocalPrInsightArtifact(dataDir, {
      projectLinkId: "profile-1",
      repository: "demo",
      pullRequestId: 42,
      title: "Improve pipeline",
      kind: "review_run",
      at: "2026-06-11T00:10:00.000Z",
      summary: "Saved readiness summary.",
      readiness: "blocked",
      decisionQueue: "blocked",
      decisionRiskLevel: "high",
      contextConfidence: "high",
      risks: ["Failed CI"],
      signals: {
        fileCount: 2,
        threadCount: 0,
        failedBuildCount: 1,
        workItemCount: 1,
        failedPolicyCount: 1,
        policyBlockers: [{
          id: "policy-1",
          name: "Minimum reviewers",
          typeName: "Reviewer policy",
          status: "failed",
          isBlocking: true,
        }],
      },
      tokensIn: 1000,
      tokensOut: 300,
    });

    const prompt = buildPrInsightContextPrompt({
      dataDir,
      projectLinkId: "profile-1",
      repository: "demo",
      message: "Is this ready for approval or blocked by policy?",
    });

    expect(prompt).toContain("## PR Readiness Context");
    expect(prompt).toContain("readiness=blocked");
    expect(prompt).toContain("queue=blocked");
    expect(prompt).toContain("failedBuilds=1");
    expect(prompt).toContain("failedPolicies=1");
    expect(prompt).toContain("Minimum reviewers: failed (blocking)");
    expect(prompt).toContain("Failed CI");
  });

  it("returns precise saved PR insight artifact notes for chat metadata", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-pr-insight-notes-"));
    const saved = upsertLocalPrInsightArtifact(dataDir, {
      projectLinkId: "profile-1",
      repository: "demo",
      pullRequestId: 42,
      title: "Improve pipeline",
      kind: "review_run",
      at: "2026-06-11T00:10:00.000Z",
      summary: "Saved review summary.",
      readiness: "needs_attention",
      risks: ["Missing tests"],
      tokensIn: 1000,
      tokensOut: 300,
    });

    const bundle = buildPrInsightContextBundle({
      dataDir,
      projectLinkId: "profile-1",
      repository: "demo",
      message: "What changed in PR #42?",
    });

    expect(bundle.prompt).toContain(saved.id);
    expect(bundle.artifactIds).toEqual([saved.id]);
    expect(bundle.notes).toEqual([
      `Used saved PR AI insight artifact ${saved.id} for PR #42 (review_run, 2026-06-11T00:10:00.000Z).`,
    ]);
  });

  it("prefers an explicit saved PR insight artifact id over the latest PR artifact", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-pr-insight-artifact-id-"));
    upsertLocalPrInsightArtifact(dataDir, {
      id: "profile-1/demo/42/review_run/old-run",
      projectLinkId: "profile-1",
      repository: "demo",
      pullRequestId: 42,
      title: "Improve pipeline",
      kind: "review_run",
      at: "2026-06-11T00:00:00.000Z",
      summary: "Old saved review summary.",
      readiness: "needs_attention",
      risks: ["Old risk"],
      tokensIn: 100,
      tokensOut: 20,
    });
    upsertLocalPrInsightArtifact(dataDir, {
      id: "profile-1/demo/42/review_run/new-run",
      projectLinkId: "profile-1",
      repository: "demo",
      pullRequestId: 42,
      title: "Improve pipeline",
      kind: "review_run",
      at: "2026-06-11T00:10:00.000Z",
      summary: "New saved review summary.",
      readiness: "ready",
      risks: ["New risk"],
      tokensIn: 200,
      tokensOut: 30,
    });

    const bundle = buildPrInsightContextBundle({
      dataDir,
      projectLinkId: "profile-1",
      repository: "demo",
      message: "Explain artifact profile-1/demo/42/review_run/old-run for PR #42.",
    });

    expect(bundle.prompt).toContain("Old saved review summary.");
    expect(bundle.prompt).not.toContain("New saved review summary.");
    expect(bundle.artifactIds).toEqual(["profile-1/demo/42/review_run/old-run"]);
  });
});
