import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Bubble } from "../chat.types.js";
import { PendingActionCard } from "./PendingActionCard.js";

const baseApproval: Bubble = {
  id: "approval-1",
  kind: "pending_confirm",
  pendingTool: "git_add",
  pendingArgs: {
    paths: ["apps/desktop/src/pages/Chat.tsx"],
    dryRun: true,
  },
  pendingDescription: "Stage selected files for commit",
  pendingNextHint: "Continue to commit after staging.",
  pendingWorkflow: {
    kind: "commit",
    phase: "stage",
    branch: "feature/refactor",
    pushAfterCommit: true,
  },
  riskLevel: "medium",
  pendingStatus: "waiting",
};

describe("PendingActionCard", () => {
  it("renders actionable approval evidence and scoped decision controls", () => {
    const html = renderToStaticMarkup(
      <PendingActionCard
        bubble={baseApproval}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain("Approval required");
    expect(html).toContain("git_add");
    expect(html).toContain("MEDIUM risk");
    expect(html).toContain("Stage selected files for commit");
    expect(html).toContain("Continue to commit after staging.");
    expect(html).toContain("Approving runs only the scoped action shown here.");
    expect(html).toContain("Confirm");
    expect(html).toContain("Skip");
    expect(html).toContain("git add --dry-run --");
    expect(html).toContain("apps/desktop/src/pages/Chat.tsx");
  });

  it("renders terminal approval states without decision buttons", () => {
    const executing = renderToStaticMarkup(
      <PendingActionCard
        bubble={{ ...baseApproval, pendingStatus: "executing" }}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    const done = renderToStaticMarkup(
      <PendingActionCard
        bubble={{ ...baseApproval, pendingStatus: "done" }}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    const cancelled = renderToStaticMarkup(
      <PendingActionCard
        bubble={{ ...baseApproval, pendingStatus: "cancelled" }}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(executing).toContain("Executing approved action");
    expect(executing).not.toContain("Confirm");
    expect(done).toContain("Approved action finished");
    expect(done).toContain("done");
    expect(cancelled).toContain("Approval skipped");
    expect(cancelled).toContain("cancelled");
  });
});
