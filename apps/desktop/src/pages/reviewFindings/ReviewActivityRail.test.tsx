import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewOperationEvent } from "../../reviewOperations.js";
import {
  ReviewActivityRail,
  reviewActivityRailCollapsedClass,
  reviewActivityRailExpandedClass,
} from "./ReviewActivityRail.js";

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
  it("keeps the activity panel as a right-side drawer at every viewport", () => {
    const collapsedClassName = reviewActivityRailCollapsedClass();
    const expandedClassName = reviewActivityRailExpandedClass();

    expect(collapsedClassName).toContain("fixed");
    expect(collapsedClassName).toContain("right-4");
    expect(collapsedClassName).toContain("top-16");
    expect(collapsedClassName).toContain("pointer-events-none");
    expect(collapsedClassName).not.toContain("justify-end");
    expect(collapsedClassName).not.toContain("xl:sticky");
    expect(collapsedClassName).not.toContain("lg:sticky");
    expect(expandedClassName).toContain("fixed");
    expect(expandedClassName).toContain("w-[min(24rem,calc(100vw-2rem))]");
    expect(expandedClassName).toContain("shadow-2xl");
    expect(expandedClassName).not.toContain("xl:sticky");
    expect(expandedClassName).not.toContain("xl:w-auto");
    expect(expandedClassName).not.toContain("lg:sticky");
    expect(expandedClassName).not.toContain("lg:w-auto");
  });

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
    expect(html).toContain('aria-label="Show activity"');
    expect(html).toContain("Show recent review activity");
    expect(html).toContain(">Activity</button>");
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
    expect(html).toContain("Close");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Close recent activity"');
    expect(html).toContain("Review completed");
  });
});
