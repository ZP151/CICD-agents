import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewQueueItem } from "../../api.js";
import {
  ReviewQueueCard,
  reviewQueueCardActionsClass,
  reviewQueueCardDetailTitle,
  reviewQueueCardFooterClass,
  reviewQueueCardMetricsGridClass,
} from "./ReviewQueueCard.js";

function queueItem(overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem {
  return {
    repository: "ClaimBot_API",
    pullRequestId: 2670,
    lastIterationId: 4,
    findingCount: 3,
    lastRunAt: "2026-07-07T02:16:32.000Z",
    sourceCommit: "0649066f311f9abc",
    decisionQueue: "needs_human_review",
    decisionRiskLevel: "medium",
    decisionReason: "Warnings or policy-sensitive files need human review.",
    decisionReasonCodes: ["risk_medium", "context_whole_file_fallback"],
    contextConfidence: "low",
    autoApprovedAt: "",
    autoApprovalActor: "",
    discardedFindingCount: 1,
    hunkCoverageFiles: 0,
    wholeFileFallbackFiles: 2,
    changedHunkLines: 0,
    manualDisposition: "changes_requested",
    manualDispositionAt: "2026-07-07T02:20:00.000Z",
    manualDispositionActor: "review-lead",
    manualDispositionNote: "Needs a test before merge",
    manualDispositionEvents: [
      {
        disposition: "changes_requested",
        at: "2026-07-07T02:20:00.000Z",
        actor: "review-lead",
        note: "Needs a test before merge",
      },
    ],
    manualDispositionWriteBackAttempted: true,
    manualDispositionWriteBackOk: false,
    manualDispositionWriteBackError: "ADO thread permission denied",
    manualDispositionWriteBackAt: "2026-07-07T02:20:10.000Z",
    manualDispositionWriteBackThreadId: "",
    manualDispositionWriteBackUrl: "",
    manualDispositionWriteBackEvents: [
      {
        disposition: "changes_requested",
        at: "2026-07-07T02:20:10.000Z",
        ok: false,
        actor: "review-lead",
        note: "Retry later",
        error: "ADO thread permission denied",
        threadId: "",
        url: "",
      },
    ],
    ...overrides,
  };
}

describe("ReviewQueueCard", () => {
  it("uses compact wrapping metric chips so narrow queue cards keep data dense", () => {
    const className = reviewQueueCardMetricsGridClass();

    expect(className).toContain("flex-wrap");
    expect(className).toContain("min-w-0");
    expect(className).toContain("flex-1");
    expect(className).toContain("text-[11px]");
    expect(className).toContain("[&>span]:rounded-full");
    expect(className).not.toContain("sm:grid-cols-4");
    expect(className).not.toContain("auto-fit");
  });

  it("keeps queue actions in a compact wrapping action row", () => {
    const footerClass = reviewQueueCardFooterClass();
    const actionsClass = reviewQueueCardActionsClass();

    expect(footerClass).toContain("min-w-0");
    expect(footerClass).toContain("flex-wrap");
    expect(footerClass).toContain("items-center");
    expect(actionsClass).toContain("flex-wrap");
    expect(actionsClass).toContain("justify-start");
    expect(actionsClass).toContain("sm:justify-end");
    expect(actionsClass).not.toContain("justify-end gap-1.5");
  });

  it("renders review audit state and action controls without flattening semantic queue details", () => {
    const html = renderToStaticMarkup(
      <ReviewQueueCard
        item={queueItem()}
        projectLinkId="claimbot-link"
        staleAgeHours={24}
        writeBackRetrying={{}}
        rerunning={{}}
        dispositionSaving={{}}
        onOpenFindings={() => undefined}
        onRerunReview={() => undefined}
        onRetryDispositionWriteBack={() => undefined}
        onApplyDisposition={() => undefined}
      />,
    );

    expect(html).toContain("#2670");
    expect(html).toContain("medium");
    expect(html).toContain("needs human review");
    expect(html).toContain("Warnings or policy-sensitive files need human review.");
    expect(html).toContain("Attention:");
    expect(html).toContain("context whole file fallback");
    expect(html).not.toContain(">Attention:");
    expect(html).toContain("Audit:");
    expect(html).toContain("Changes requested");
    expect(html).toContain("ADO pending");
    expect(html).toContain("findings 3");
    expect(html).toContain("hunks 0f/0l");
    expect(html).toContain("fallback 2f");
    expect(html).toContain("View findings");
    expect(html).toContain("Retry ADO");
    expect(html).toContain("Actions");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Request changes");
  });

  it("keeps queued review progress visible without exposing a closed disposition menu", () => {
    const item = queueItem();
    const html = renderToStaticMarkup(
      <ReviewQueueCard
        item={item}
        projectLinkId="claimbot-link"
        staleAgeHours={24}
        writeBackRetrying={{ "ClaimBot_API/2670": true }}
        rerunning={{ "ClaimBot_API/2670": true }}
        dispositionSaving={{ "ClaimBot_API/2670": true }}
        onOpenFindings={() => undefined}
        onRerunReview={() => undefined}
        onRetryDispositionWriteBack={() => undefined}
        onApplyDisposition={() => undefined}
      />,
    );

    expect(html).toContain("Rerunning...");
    expect(html).toContain("Retrying...");
    expect(html).toContain("Actions");
    expect(html).not.toContain("Saving...");
  });

  it("moves long decision detail into hover title text", () => {
    const title = reviewQueueCardDetailTitle({
      item: queueItem(),
      attentionReasons: ["risk medium", "context whole file fallback"],
      auditLabel: "Changes requested · ADO pending",
      auditThreadId: "123",
    });

    expect(title).toContain("Attention: risk medium · context whole file fallback");
    expect(title).toContain("Audit: Changes requested · ADO pending · thread 123");
  });
});
