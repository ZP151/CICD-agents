import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewOperationEvent } from "../../reviewOperations.js";
import {
  ReviewActivityRail,
  reviewActivityRailCollapsedClass,
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
  it("keeps the collapsed activity control independent of the worklist layout", () => {
    const collapsedClassName = reviewActivityRailCollapsedClass();

    expect(collapsedClassName).toContain("fixed");
    expect(collapsedClassName).toContain("right-4");
    expect(collapsedClassName).toContain("top-16");
    expect(collapsedClassName).toContain("pointer-events-none");
    expect(collapsedClassName).not.toContain("justify-end");
    expect(collapsedClassName).not.toContain("xl:sticky");
    expect(collapsedClassName).not.toContain("lg:sticky");
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
    expect(html).toContain(">Activity</button>");
    expect(html).toContain("focus-visible:ring-[rgb(var(--app-focus))]/45");
    expect(html).not.toContain("title=\"Show recent review activity\"");
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
    expect(html).toContain('aria-label="Recent activity"');
    expect(html).toContain('aria-label="Recent activity categories"');
    expect(html).toContain("Review completed");
  });
});
