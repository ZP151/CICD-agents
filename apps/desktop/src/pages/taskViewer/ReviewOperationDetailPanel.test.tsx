import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewActivityItem } from "./activityTypes.js";
import { ReviewOperationDetailPanel } from "./ReviewOperationDetailPanel.js";

function operation(details: string): ReviewActivityItem {
  return {
    id: "review-operation-1",
    projectLinkId: "pl-1",
    projectLinkName: "ClaimBot_API link",
    kind: "review_run",
    at: "2026-07-16T14:00:00.000Z",
    repository: "ClaimBot_API",
    pullRequestId: 2670,
    actor: "Zhou Ping",
    label: "Review run completed",
    ok: true,
    details,
  };
}

describe("ReviewOperationDetailPanel", () => {
  it("summarizes and folds JSON-like operation details by default", () => {
    const html = renderToStaticMarkup(
      <ReviewOperationDetailPanel
        operation={operation(
          '{"error":{"fieldErrors":{"sessionId":["Expected string, received null"]},"formErrors":[]}}',
        )}
      />,
    );

    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("Raw detail");
    expect(html).toContain("sessionId: Expected string, received null");
    expect(html).toContain("&quot;fieldErrors&quot;");
  });

  it("keeps short operation details inline", () => {
    const html = renderToStaticMarkup(
      <ReviewOperationDetailPanel operation={operation("Review completed with 3 findings.")} />,
    );

    expect(html).not.toContain("<details");
    expect(html).toContain("Review completed with 3 findings.");
  });
});
