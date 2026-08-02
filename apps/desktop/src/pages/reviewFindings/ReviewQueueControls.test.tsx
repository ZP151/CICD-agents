import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ReviewQueueControls,
  reviewQueueCompactLaneLabel,
  reviewQueueFooterCountClass,
  reviewQueueLaneGridClass,
} from "./ReviewQueueControls.js";

const counts = {
  auto_approved: 0,
  needs_human_review: 1,
  blocked: 1,
  watching: 0,
};

describe("ReviewQueueControls responsive layout", () => {
  it("renders queue lanes as compact wrapping filter chips", () => {
    const className = reviewQueueLaneGridClass();

    expect(className).toContain("flex");
    expect(className).toContain("flex-wrap");
    expect(className).not.toContain("lg:grid-cols-4");
    expect(className).not.toContain("minmax");
  });

  it("keeps the visible-count summary from squeezing controls on narrow widths", () => {
    const className = reviewQueueFooterCountClass();

    expect(className).toContain("sm:ml-auto");
    expect(className).toContain("sm:w-auto");
    expect(className).toContain("border-transparent");
  });

  it("renders the visible-count summary with responsive footer classes", () => {
    const html = renderToStaticMarkup(
      <ReviewQueueControls
        counts={counts}
        queueFilter="all"
        sortMode="attention"
        staleAgeHours={24}
        staleAgeSaving={false}
        autoApproveEnabled
        autoApproveSaving={false}
        batchRerunning={false}
        batchMode="visible"
        batchProgress={null}
        visiblePageCount={2}
        staleCount={1}
        displayedCount={2}
        totalCount={4}
        onQueueFilterChange={() => undefined}
        onSortModeChange={() => undefined}
        onStaleAgeChange={() => undefined}
        onStaleAgeSave={() => undefined}
        onToggleAutoApprove={() => undefined}
        onRerunVisible={() => undefined}
        onRerunStale={() => undefined}
      />,
    );

    expect(html).toContain("2/4");
    expect(html).toContain("sm:ml-auto");
    expect(html).toContain("title=\"Low-risk PRs approved by the Review Agent with an audit record.\"");
    expect(html).toContain("Auto: On");
    expect(html).toContain('aria-label="Disable auto-approve"');
    expect(html).toContain(">All</span><span");
    expect(html).toContain(">Human</span>");
    expect(html).not.toContain(">Needs human review<span");
    expect(html).toContain("h-7");
    expect(html).toContain("focus-visible:ring-2");
    expect(html).toContain("focus-visible:ring-[rgb(var(--app-focus))]/45");
    expect(html).toContain('aria-label="Review queue controls"');
    expect(html).not.toContain("text-2xl");
    expect(html).not.toContain("lg:grid-cols-4");
    expect(html).not.toContain("rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-1.5");
  });

  it("maps queue lanes to compact button labels", () => {
    expect(reviewQueueCompactLaneLabel("auto_approved")).toBe("Auto");
    expect(reviewQueueCompactLaneLabel("needs_human_review")).toBe("Human");
    expect(reviewQueueCompactLaneLabel("blocked")).toBe("Blocked");
    expect(reviewQueueCompactLaneLabel("watching")).toBe("Watch");
  });
});
