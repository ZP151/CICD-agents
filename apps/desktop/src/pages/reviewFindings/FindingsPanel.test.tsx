import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  ReviewFinding,
  ReviewQueueItem,
} from "../../api.js";
import { FindingsPanel } from "./FindingsPanel.js";

function queueItem(overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem {
  return {
    repository: "ClaimBot_API",
    pullRequestId: 2670,
    lastIterationId: 4,
    findingCount: 2,
    lastRunAt: "2026-07-07T02:16:32.000Z",
    sourceCommit: "0649066f311f9abc",
    decisionQueue: "blocked",
    decisionRiskLevel: "high",
    decisionReason: "Blocking findings require a human.",
    decisionReasonCodes: ["risk_high"],
    contextConfidence: "low",
    autoApprovedAt: "",
    autoApprovalActor: "",
    discardedFindingCount: 0,
    hunkCoverageFiles: 1,
    wholeFileFallbackFiles: 1,
    changedHunkLines: 8,
    manualDisposition: "changes_requested",
    manualDispositionAt: "2026-07-07T02:20:00.000Z",
    manualDispositionActor: "review-lead",
    manualDispositionNote: "Needs a test before merge",
    manualDispositionEvents: [
      {
        disposition: "acknowledged",
        at: "2026-07-07T02:18:00.000Z",
        actor: "review-lead",
        note: "Triage started",
      },
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
    manualDispositionWriteBackThreadId: "thread-9",
    manualDispositionWriteBackUrl: "https://dev.azure.com/demo/thread-9",
    manualDispositionWriteBackEvents: [
      {
        disposition: "changes_requested",
        at: "2026-07-07T02:20:10.000Z",
        ok: false,
        actor: "review-lead",
        note: "Retry later",
        error: "ADO thread permission denied",
        threadId: "thread-9",
        url: "https://dev.azure.com/demo/thread-9",
      },
    ],
    ...overrides,
  };
}

const findings: ReviewFinding[] = [
  {
    file: "BotToSharePoint/Controllers/ClaimController.cs",
    line: 42,
    severity: "blocking",
    category: "bug",
    message: "Exception handling changed without a regression test.",
  },
  {
    file: "BotToSharePoint/Common/CommonFunctions.cs",
    line: 0,
    severity: "warning",
    category: "missing-test",
    message: "Add coverage for SharePoint connection cleanup.",
  },
];

describe("FindingsPanel", () => {
  it("renders findings plus disposition and ADO write-back audit details", () => {
    const html = renderToStaticMarkup(
      <FindingsPanel
        item={queueItem()}
        findings={findings}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain("#2670");
    expect(html).toContain("Review Findings (2)");
    expect(html).toContain("Blocking findings require a human.");
    expect(html).toContain("BotToSharePoint/Controllers/ClaimController.cs");
    expect(html).toContain(":42");
    expect(html).toContain("Exception handling changed without a regression test.");
    expect(html).toContain("Missing test");
    expect(html).toContain("Disposition audit");
    expect(html).toContain("Changes requested by review-lead");
    expect(html).toContain("ADO write-back not posted");
    expect(html).toContain("ADO thread permission denied");
    expect(html).toContain("Write-back attempts");
    expect(html).toContain("Failed");
    expect(html).toContain("Open Azure DevOps thread");
    expect(html).toContain("Open attempt thread");
  });

  it("shows a quiet empty state when no findings are stored", () => {
    const html = renderToStaticMarkup(
      <FindingsPanel
        item={queueItem({ findingCount: 0 })}
        findings={[]}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain("Review Findings (0)");
    expect(html).toContain("No findings stored");
    expect(html).toContain("Run a new review from the Pull Requests page to capture findings.");
  });
});
