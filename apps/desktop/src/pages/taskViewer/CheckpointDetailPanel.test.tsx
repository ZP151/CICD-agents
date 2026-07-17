import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CheckpointDetailPanel } from "./CheckpointDetailPanel.js";
import type { ChatCheckpointActivity } from "../../api.js";

const checkpoint: ChatCheckpointActivity = {
  id: "checkpoint-1",
  sessionId: "chat_1",
  repoPath: "C:\\repos\\ClaimBot_API",
  projectLinkId: "pl-1",
  at: 1_783_300_000,
  toolName: "git_push",
  toolSummary: '{"returncode":0,"stdout":"pushed","stderr":""}',
  toolOk: true,
  checkpointId: "git-2026-07-16T00-00-00Z",
  checkpointPath: "C:\\Users\\15492\\.mergepilot\\checkpoints\\checkpoint.json",
};

describe("CheckpointDetailPanel", () => {
  it("keeps raw tool output collapsed by default", () => {
    const html = renderToStaticMarkup(
      <CheckpointDetailPanel
        checkpoint={checkpoint}
        preview={null}
        rollbackPlan={null}
        previewLoading={false}
        rollbackLoading={false}
        onOpenRollbackPlanInChat={() => undefined}
      />,
    );

    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("Tool Result");
    expect(html).toContain("pushed");
    expect(html).toContain("Raw output");
    expect(html).toContain("&quot;returncode&quot;:0");
  });
});
