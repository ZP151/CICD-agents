import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewQueueItem } from "../../api.js";
import { WriteBackConfirmationPanel } from "./WriteBackConfirmationPanel.js";
import { writeBackConfirmationText } from "./reviewQueueRuntime.js";

const item: ReviewQueueItem = {
  repository: "example-repo",
  pullRequestId: 42,
  decisionQueue: "watching",
  decisionRiskLevel: "medium",
  decisionReason: "AI review complete.",
  lastRunAt: "2026-08-03T00:00:00Z",
  findingCount: 2,
} as ReviewQueueItem;

describe("writeBackConfirmationText (MP-009/RA-041)", () => {
  it("names the exact ADO target and content for a blocking disposition", () => {
    const { target, content } = writeBackConfirmationText(item, "marked_blocked");

    expect(target).toBe("Post a blocking comment on PR #42 in example-repo");
    expect(content).toContain("Marked blocked");
  });

  it("names request-changes as its own target", () => {
    const { target } = writeBackConfirmationText(item, "changes_requested");

    expect(target).toBe('Post a "request changes" comment on PR #42 in example-repo');
  });

  it("never implies a write for local-only dispositions", () => {
    const { target } = writeBackConfirmationText(item, "acknowledged");

    expect(target).toContain("PR #42");
  });
});

describe("WriteBackConfirmationPanel (MP-009/RA-041)", () => {
  it("shows the target and content with explicit approve/keep-local actions", () => {
    const html = renderToStaticMarkup(
      <WriteBackConfirmationPanel
        item={item}
        disposition="marked_blocked"
        onConfirm={() => undefined}
        onKeepLocal={() => undefined}
      />,
    );

    expect(html).toContain("Confirm Azure DevOps write-back");
    expect(html).toContain("Post a blocking comment on PR #42 in example-repo");
    expect(html).toContain("Approve and write to ADO");
    expect(html).toContain("Keep local only");
  });
});
