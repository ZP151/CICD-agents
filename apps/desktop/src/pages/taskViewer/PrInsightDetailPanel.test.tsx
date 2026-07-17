import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PrInsightDetailPanel } from "./PrInsightDetailPanel.js";
import type { PrInsightActivityItem } from "./prInsightActivity.js";

function prInsightActivityItem(
  overrides: Partial<PrInsightActivityItem> = {},
): PrInsightActivityItem {
  return {
    id: "project-link-1/demo/42/review_run/2026-06-13T00%3A00%3A00.000Z",
    projectLinkId: "project-link-1",
    projectLinkName: "Demo link",
    repoPath: "C:\\repo\\demo",
    repository: "demo",
    pullRequestId: 42,
    title: "Improve PR insight",
    kind: "review_run",
    at: "2026-06-13T00:00:00.000Z",
    summary: "Saved **PR insight** summary.",
    readiness: "blocked",
    decisionQueue: "needs_human_review",
    decisionRiskLevel: "medium",
    contextConfidence: "low",
    risks: ["Failed CI"],
    tokensIn: 100,
    tokensOut: 30,
    ...overrides,
  };
}

describe("PrInsightDetailPanel", () => {
  it("keeps navigation actions in the header and does not duplicate them in provenance", () => {
    const html = renderToStaticMarkup(
      <PrInsightDetailPanel
        item={prInsightActivityItem()}
        comparison={null}
        refreshComparison={null}
        copiedArtifactId={null}
        onCopyArtifactId={vi.fn()}
        onOpenInChat={vi.fn()}
        onOpenInPullRequests={vi.fn()}
      />,
    );

    expect(html.match(/Open in Pull Requests/g)).toHaveLength(1);
    expect(html.match(/Ask in Chat/g)).toHaveLength(1);
    expect(html).toContain("Copy artifact id");
    expect(html).not.toContain(">Pull Requests</button>");
    expect(html).not.toContain(">Chat</button>");
  });
});
