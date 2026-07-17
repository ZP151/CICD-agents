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
  it("renders compact approval decision controls without duplicate evidence copy", () => {
    const html = renderToStaticMarkup(
      <PendingActionCard
        bubble={baseApproval}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain("Approval required");
    expect(html).toContain("MEDIUM risk");
    expect(html).toContain("Approve this command?");
    expect(html).not.toContain("Stage selected files for commit");
    expect(html).not.toContain("Continue to commit after staging.");
    expect(html).not.toContain("Review scope");
    expect(html).toContain("Tell MergePilot what to do differently...");
    expect(html).toContain("Yes, run this action");
    expect(html).toContain("No, don&#x27;t run it");
    expect(html).toContain("git add --dry-run --");
    expect(html).toContain("apps/desktop/src/pages/Chat.tsx");
    expect(html).not.toContain("git_add");
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
    expect(executing).not.toContain("Yes, run this action");
    expect(done).toBe("");
    expect(cancelled).toBe("");
  });
});
