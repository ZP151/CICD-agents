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
  it("renders a scoped approval decision with command, risk, and workflow context", () => {
    const html = renderToStaticMarkup(
      <PendingActionCard
        bubble={baseApproval}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain("Review before running");
    expect(html).toContain("MEDIUM risk");
    expect(html).toContain("Stage selected files for commit");
    expect(html).toContain("git_add");
    expect(html).toContain("commit workflow");
    expect(html).toContain("Nothing runs until you approve.");
    expect(html).toContain("Command to execute");
    expect(html).not.toContain("Continue to commit after staging.");
    expect(html).toContain("Request changes");
    expect(html).toContain("Tell MergePilot what to do differently...");
    expect(html).toContain("Approve and run");
    expect(html).toContain("Skip action");
    expect(html).toContain('data-testid="pending-action-card"');
    expect(html).toContain('data-risk-level="medium"');
    expect(html).toContain('data-approval-style="compact"');
    expect(html).not.toContain("shadow-[0_3px_8px");
    expect(html).toContain("git add --dry-run --");
    expect(html).toContain("apps/desktop/src/pages/Chat.tsx");
    expect(html).toContain("focus-visible:ring-[rgb(var(--app-focus))]/45");
    expect(html).toContain("focus:ring-[rgb(var(--app-focus))]/35");
  });

  it("shows an explicit stage-all command when no paths are scoped", () => {
    const html = renderToStaticMarkup(
      <PendingActionCard
        bubble={{ ...baseApproval, pendingArgs: {} }}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain("git add -A");
  });

  it("shows a concrete pull rebase command with remote and branch arguments", () => {
    const html = renderToStaticMarkup(
      <PendingActionCard
        bubble={{
          ...baseApproval,
          pendingTool: "git_pull",
          pendingArgs: { remote: "origin", branch: "main", rebase: true },
          pendingWorkflow: { kind: "git", phase: "sync_branch", branch: "main" },
        }}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain("git pull --rebase origin main");
    expect(html).not.toContain("git_pull remote=origin branch=main rebase=true");
  });

  it("renders only active approval states", () => {
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
    expect(executing).not.toContain("animate-bounce");
    expect(executing).not.toContain("Approve and run");
    expect(done).toBe("");
    expect(cancelled).toBe("");
  });
});
