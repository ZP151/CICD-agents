import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PullRequestCard } from "./PullRequestCard.js";
import type { DisplayPullRequest } from "./pullRequestTypes.js";

const pr: DisplayPullRequest = {
  id: 2670,
  title: "Update CommonFunctions.cs",
  status: "active",
  isDraft: false,
  sourceBranch: "feature/cicd-agent",
  targetBranch: "main",
  createdBy: "Zhou Ping",
  creationDate: "2026-07-07T02:16:32.000Z",
  repository: "ClaimBot_API",
  url: "https://dev.azure.com/example",
  reviewerCount: 1,
  voteSummary: {
    approved: 1,
    waiting: 0,
    rejected: 0,
  },
  sourceProjectLinkId: "pl-1",
  sourceProjectLinkName: "ClaimBot_API link",
};

describe("PullRequestCard", () => {
  it("keeps PR cards list-focused and opens existing insight instead of duplicating actions", () => {
    const html = renderToStaticMarkup(
      <PullRequestCard
        pr={pr}
        projectLinkId="pl-1"
        queueState={{ phase: "idle" }}
        previewState={{
          phase: "done",
          result: {
            source: "llm",
            summary: "**Ready:** only documentation changed.",
            readiness: "ready",
            risks: [],
            signals: {
              fileCount: 1,
              threadCount: 0,
              failedBuildCount: 0,
              workItemCount: 0,
            },
            tokensIn: 100,
            tokensOut: 20,
          },
        }}
        insightArtifacts={[]}
        contextState={undefined}
        isExpanded={false}
        highlighted={false}
        onToggleContext={() => undefined}
        onPreviewInsight={() => undefined}
        onQueueForReview={() => undefined}
        onOpenInsight={() => undefined}
        onOpenSavedInsightInChat={() => undefined}
      />,
    );

    expect(html).toContain("Open insight");
    expect(html).toContain("Run review");
    expect(html).not.toContain("Preview Insight");
    expect(html).toContain("<strong>Ready:");
    expect(html).toContain("only documentation changed.");
  });
});
