import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChatCheckpointRollbackPlan } from "../../api.js";
import { CheckpointRollbackPlanSection } from "./CheckpointRollbackPlanSection.js";

const rollbackPlan: ChatCheckpointRollbackPlan = {
  ok: true,
  checkpointId: "git-2026-07-16T00-00-00Z",
  repoPath: "C:\\repos\\ClaimBot_API",
  branch: "feature/demo",
  head: "abc1234",
  supported: true,
  mode: "restore_tracked_to_clean_checkpoint",
  reason: "Restore tracked files to the clean checkpoint before the confirmed action.",
  checkpointFiles: ["README.md"],
  currentStatusLines: [" M README.md"],
  currentTrackedPaths: ["README.md"],
  currentUntrackedPaths: [],
  proposal: {
    tool: "git_apply_checkpoint",
    args: {
      checkpointId: "git-2026-07-16T00-00-00Z",
      mode: "restore_tracked_to_clean_checkpoint",
    },
    description: "Restore README.md to the checkpoint snapshot.",
  },
  warnings: ["Untracked files are not restored by this proposal."],
};

describe("CheckpointRollbackPlanSection", () => {
  it("shows the proposal summary before folded raw proposal details", () => {
    const html = renderToStaticMarkup(
      <CheckpointRollbackPlanSection
        rollbackPlan={rollbackPlan}
        rollbackLoading={false}
        onOpenRollbackPlanInChat={() => undefined}
      />,
    );

    expect(html).toContain("Restore README.md to the checkpoint snapshot.");
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("Raw proposal");
    expect(html).toContain("&quot;tool&quot;: &quot;git_apply_checkpoint&quot;");
  });
});
