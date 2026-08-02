import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CheckpointDetailPanel,
  checkpointApplySummaryGridClass,
  checkpointMetadataGridClass,
} from "./CheckpointDetailPanel.js";
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
  it("uses an auto-fit metadata grid so repository and session reflow with panel width", () => {
    const className = checkpointMetadataGridClass();

    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,16rem),1fr)");
    expect(className).not.toContain("sm:grid-cols-2");
  });

  it("uses an auto-fit apply summary grid so checkpoint apply metadata reflows", () => {
    const className = checkpointApplySummaryGridClass();

    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,14rem),1fr)");
    expect(className).not.toContain("sm:grid-cols-2");
  });

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

  it("keeps successful command stderr out of the visible checkpoint summary", () => {
    const html = renderToStaticMarkup(
      <CheckpointDetailPanel
        checkpoint={{
          ...checkpoint,
          toolSummary:
            '{"returncode":0,"stdout":"","stderr":"To C:\\\\\\\\Users\\\\\\\\15492\\\\\\\\repo.git\\n * [new tag] v0.1 -> v0.1"}',
        }}
        preview={null}
        rollbackPlan={null}
        previewLoading={false}
        rollbackLoading={false}
        onOpenRollbackPlanInChat={() => undefined}
      />,
    );

    expect(html).toContain("Command completed successfully.");
    expect(html).toContain("Command completed successfully.</p><details");
    expect(html).toContain("Raw output");
    expect(html).toContain("To C:");
  });

  it("wraps long checkpoint metadata so narrow activity layouts do not crop it", () => {
    const html = renderToStaticMarkup(
      <CheckpointDetailPanel
        checkpoint={{
          ...checkpoint,
          repoPath:
            "C:\\Users\\15492\\AppData\\Local\\Temp\\mergepilot-live-push-uNqAOB\\work",
          sessionId: "chat_1783360943926_18c699",
        }}
        preview={null}
        rollbackPlan={null}
        previewLoading={false}
        rollbackLoading={false}
        onOpenRollbackPlanInChat={() => undefined}
      />,
    );

    expect(html).toContain("title=\"C:\\Users\\15492\\AppData\\Local\\Temp\\mergepilot-live-push-uNqAOB\\work\"");
    expect(html).toContain("title=\"chat_1783360943926_18c699\"");
    expect(html).toContain("break-all font-mono");
    expect(html).toContain("auto-fit");
    expect(html).toContain("border-b border-[rgb(var(--app-border))]/60");
    expect(html).not.toContain("class=\"min-w-0 rounded-lg");
  });
});
