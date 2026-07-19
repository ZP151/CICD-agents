import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PrInsightDetailPanel,
  prInsightMetadataGridClass,
  prInsightProvenanceGridClass,
  prInsightSignalGridClass,
} from "./PrInsightDetailPanel.js";
import {
  prInsightComparisonMetricGridClass,
  prInsightRiskDeltaGridClass,
} from "./PrInsightComparisonPanels.js";
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
  it("uses an auto-fit signal grid so PR insight metrics reflow with panel width", () => {
    const className = prInsightSignalGridClass();

    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,8.5rem),1fr)");
    expect(className).not.toContain("sm:grid-cols-4");
    expect(className).not.toContain("lg:grid-cols-6");
  });

  it("uses auto-fit grids for provenance, metadata, and comparison detail blocks", () => {
    const provenanceClassName = prInsightProvenanceGridClass();
    const metadataClassName = prInsightMetadataGridClass();
    const comparisonClassName = prInsightComparisonMetricGridClass();
    const riskDeltaClassName = prInsightRiskDeltaGridClass();

    expect(provenanceClassName).toContain("auto-fit");
    expect(provenanceClassName).toContain("minmax(min(100%,12rem),1fr)");
    expect(provenanceClassName).not.toContain("sm:grid-cols-2");

    expect(metadataClassName).toContain("auto-fit");
    expect(metadataClassName).toContain("minmax(min(100%,13rem),1fr)");
    expect(metadataClassName).not.toContain("sm:grid-cols-2");

    expect(comparisonClassName).toContain("auto-fit");
    expect(comparisonClassName).toContain("minmax(min(100%,9rem),1fr)");
    expect(comparisonClassName).not.toContain("sm:grid-cols-3");

    expect(riskDeltaClassName).toContain("auto-fit");
    expect(riskDeltaClassName).toContain("minmax(min(100%,14rem),1fr)");
    expect(riskDeltaClassName).not.toContain("sm:grid-cols-2");
  });

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

  it("renders signal metrics in the responsive signal grid", () => {
    const html = renderToStaticMarkup(
      <PrInsightDetailPanel
        item={prInsightActivityItem({
          findingCount: 2,
          signals: {
            fileCount: 3,
            threadCount: 4,
            failedBuildCount: 1,
            failedPolicyCount: 0,
            workItemCount: 2,
          },
        })}
        comparison={null}
        refreshComparison={null}
        copiedArtifactId={null}
        onCopyArtifactId={vi.fn()}
        onOpenInChat={vi.fn()}
        onOpenInPullRequests={vi.fn()}
      />,
    );

    expect(html).toContain("Files");
    expect(html).toContain("Threads");
    expect(html).toContain("Failed builds");
    expect(html).toContain("Findings");
    expect(html).toContain("auto-fit");
    expect(html).not.toContain("sm:grid-cols-4");
    expect(html).not.toContain("lg:grid-cols-6");
  });
});
