import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listLocalPrInsightArtifacts,
  prInsightArtifactsStorePath,
  upsertLocalPrInsightArtifact,
} from "../src/prInsightArtifactsLocal.js";

describe("prInsightArtifactsLocal", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-pr-insight-artifacts-"));

  afterEach(() => {
    const p = prInsightArtifactsStorePath(dataDir);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });

  it("upserts PR insight artifacts and lists newest first", () => {
    upsertLocalPrInsightArtifact(dataDir, {
      profileId: "profile-1",
      repository: "demo-repo",
      pullRequestId: 42,
      title: "Preview",
      kind: "insight_preview",
      at: "2026-06-11T00:00:00.000Z",
      summary: "Preview summary.",
      readiness: "needs_attention",
      risks: ["Missing tests"],
      signals: {
        fileCount: 3,
        threadCount: 2,
        failedBuildCount: 1,
        workItemCount: 1,
      },
      tokensIn: 100,
      tokensOut: 20,
    });
    upsertLocalPrInsightArtifact(dataDir, {
      profileId: "profile-1",
      repository: "demo-repo",
      pullRequestId: 42,
      title: "Full review",
      kind: "review_run",
      at: "2026-06-11T00:10:00.000Z",
      summary: "Full review summary.",
      readiness: "needs_attention",
      decisionQueue: "needs_human_review",
      decisionRiskLevel: "medium",
      contextConfidence: "high",
      risks: ["Missing tests"],
      iterationId: 5,
      sourceCommit: "abc123",
      findingCount: 2,
      discardedFindingCount: 1,
      tokensIn: 1000,
      tokensOut: 300,
    });

    const artifacts = listLocalPrInsightArtifacts({ dataDir, profileId: "profile-1" });
    expect(artifacts.map((artifact) => artifact.kind)).toEqual(["review_run", "insight_preview"]);
    expect(artifacts[0]).toMatchObject({ iterationId: 5, sourceCommit: "abc123" });
  });

  it("preserves refreshed artifacts for the same profile, PR, and kind", () => {
    const base = {
      profileId: "profile-1",
      repository: "demo-repo",
      pullRequestId: 42,
      title: "Preview",
      kind: "insight_preview" as const,
      readiness: "ready" as const,
      risks: [],
      tokensIn: 10,
      tokensOut: 5,
    };
    upsertLocalPrInsightArtifact(dataDir, {
      ...base,
      at: "2026-06-11T00:00:00.000Z",
      summary: "Old summary.",
    });
    upsertLocalPrInsightArtifact(dataDir, {
      ...base,
      at: "2026-06-11T00:01:00.000Z",
      summary: "New summary.",
    });

    const artifacts = listLocalPrInsightArtifacts({ dataDir, profileId: "profile-1" });
    expect(artifacts).toHaveLength(2);
    expect(artifacts.map((artifact) => artifact.summary)).toEqual(["New summary.", "Old summary."]);
  });

  it("replaces an explicitly addressed artifact id for compatibility", () => {
    const base = {
      id: "artifact-1",
      profileId: "profile-1",
      repository: "demo-repo",
      pullRequestId: 42,
      title: "Preview",
      kind: "insight_preview" as const,
      readiness: "ready" as const,
      risks: [],
      tokensIn: 10,
      tokensOut: 5,
    };
    upsertLocalPrInsightArtifact(dataDir, {
      ...base,
      at: "2026-06-11T00:00:00.000Z",
      summary: "Old summary.",
    });
    upsertLocalPrInsightArtifact(dataDir, {
      ...base,
      at: "2026-06-11T00:01:00.000Z",
      summary: "New summary.",
    });

    const artifacts = listLocalPrInsightArtifacts({ dataDir, profileId: "profile-1" });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({ id: "artifact-1", summary: "New summary." });
  });

  it("filters artifacts and returns an empty list for corrupt stores", () => {
    upsertLocalPrInsightArtifact(dataDir, {
      profileId: "profile-1",
      repository: "demo-repo",
      pullRequestId: 42,
      title: "Preview",
      kind: "insight_preview",
      summary: "Preview summary.",
      risks: [],
      tokensIn: 10,
      tokensOut: 5,
    });
    upsertLocalPrInsightArtifact(dataDir, {
      profileId: "profile-2",
      repository: "other-repo",
      pullRequestId: 7,
      title: "Other",
      kind: "insight_preview",
      summary: "Other summary.",
      risks: [],
      tokensIn: 10,
      tokensOut: 5,
    });

    expect(listLocalPrInsightArtifacts({
      dataDir,
      profileId: "profile-1",
      repository: "demo-repo",
      pullRequestId: 42,
      limit: 1,
    })).toHaveLength(1);

    fs.writeFileSync(prInsightArtifactsStorePath(dataDir), "{not-json", "utf8");
    expect(listLocalPrInsightArtifacts({ dataDir })).toEqual([]);
  });
});
