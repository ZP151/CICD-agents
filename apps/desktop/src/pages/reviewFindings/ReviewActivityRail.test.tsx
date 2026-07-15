import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewOperationEvent } from "../../reviewOperations.js";
import { ReviewActivityRail } from "./ReviewActivityRail.js";

const event: ReviewOperationEvent = {
  id: "event-1",
  kind: "review_run",
  repository: "ClaimBot_API",
  pullRequestId: 84,
  actor: "desktop-user",
  label: "Review completed",
  ok: true,
  details: "One warning remains",
  at: "2026-07-07T02:16:32.000Z",
};

describe("ReviewActivityRail", () => {
  it("renders as a compact collapsed control", () => {
    const html = renderToStaticMarkup(
      <ReviewActivityRail
        events={[event]}
        totalCount={1}
        filter="all"
        open={false}
        onFilterChange={() => undefined}
        onOpenChange={() => undefined}
      />,
    );

    expect(html).toContain("Show activity");
    expect(html).not.toContain("Review completed");
  });

  it("shows recent activity when expanded", () => {
    const html = renderToStaticMarkup(
      <ReviewActivityRail
        events={[event]}
        totalCount={1}
        filter="all"
        open
        onFilterChange={() => undefined}
        onOpenChange={() => undefined}
      />,
    );

    expect(html).toContain("Recent activity");
    expect(html).toContain("Hide");
    expect(html).toContain("Review completed");
  });
});
