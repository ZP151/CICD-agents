import { describe, expect, it } from "vitest";
import type { LLMClient } from "../src/llm.js";
import type { CloudContextBundle } from "../src/review/cloudContext.js";
import { runReviewPlanner } from "../src/review/reviewPlanner.js";

const bundle: CloudContextBundle = {
  prId: 2670,
  iterationId: 4,
  files: [{ path: "src/app.ts", changeType: "edit", content: "export const changed = true;" }],
  relatedSnippets: [],
  pullRequest: {
    title: "Update app flow",
    description: "",
    status: "active",
    isDraft: false,
    sourceBranch: "feature/review",
    targetBranch: "main",
    createdBy: "Developer",
    workItemIds: [],
    reviewerCount: 0,
    voteSummary: { approved: 0, waiting: 0, rejected: 0 },
    threadCount: 0,
    activeThreadCount: 0,
    failedBuildCount: 0,
    latestBuildResult: "",
    latestBuildStatus: "",
  },
};

describe("runReviewPlanner fallback", () => {
  it("does not expose parser internals when the model response is not structured", async () => {
    const llm = {
      configured: true,
      usage: { promptTokens: 12, completionTokens: 4, embedTokens: 0 },
      chat: async () => ({ content: "I could not produce the requested JSON.", toolCalls: [], finishReason: "stop" }),
    } as unknown as LLMClient;

    const result = await runReviewPlanner({ llm, bundle, conventions: [] });

    expect(result.summary).toBe("The review response could not be structured. Refresh insight to retry; no conclusions were inferred.");
    expect(result.summary).not.toContain("model did not return");
    expect(result.findings).toEqual([]);
  });
});
