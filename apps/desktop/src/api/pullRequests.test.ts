import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchProjectLinkPullRequests,
  fetchProjectLinkPrInsightArtifactById,
  fetchProjectLinkPrInsightArtifactsWithHistory,
  saveProjectLinkPrInsightArtifact,
} from "./pullRequests.js";

function mockAuthFailure(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: "azure_auth_required",
          message: "Azure credential expired or missing. Please sign in again.",
        }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        },
      )
    ),
  );
}

async function expectReadableAuthError(action: () => Promise<unknown>): Promise<void> {
  await expect(action()).rejects.toThrow("Azure credential expired or missing. Please sign in again.");
  await expect(action()).rejects.not.toThrow("/project-links/");
}

describe("pull request API errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("formats pull request list auth errors without internal route noise", async () => {
    mockAuthFailure();

    await expectReadableAuthError(() => fetchProjectLinkPullRequests("project-link-1"));
  });

  it("formats PR insight artifact list auth errors without internal route noise", async () => {
    mockAuthFailure();

    await expectReadableAuthError(() => fetchProjectLinkPrInsightArtifactsWithHistory("project-link-1"));
  });

  it("formats PR insight artifact lookup auth errors without internal route noise", async () => {
    mockAuthFailure();

    await expectReadableAuthError(() =>
      fetchProjectLinkPrInsightArtifactById("project-link-1", "artifact-1")
    );
  });

  it("formats PR insight artifact save auth errors without internal route noise", async () => {
    mockAuthFailure();

    await expectReadableAuthError(() =>
      saveProjectLinkPrInsightArtifact("project-link-1", {
        repository: "ClaimBot_API",
        pullRequestId: 2670,
        title: "PR insight",
        kind: "insight_preview",
        at: "2026-07-16T03:24:00.000Z",
        summary: "Summary",
        readiness: "needs_attention",
        risks: [],
        tokensIn: 0,
        tokensOut: 0,
      })
    );
  });
});
