import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PinnedSummaryPanel, pinnedSummaryPanelShellClass } from "./PinnedSummaryPanel.js";
import { workspaceProjectLinkActionsGridClass } from "./WorkspaceProjectLinkPanel.js";

describe("PinnedSummaryPanel layout", () => {
  it("keeps the floating panel bounded to the viewport", () => {
    const className = pinnedSummaryPanelShellClass();

    expect(className).toContain("w-[min(20rem,calc(100vw-2rem))]");
    expect(className).toContain("max-w-[calc(100%-24px)]");
    expect(className).not.toContain("w-[300px]");
  });

  it("uses the shared auto-fit grid for compact ADO actions", () => {
    const className = workspaceProjectLinkActionsGridClass();

    expect(className).toContain("min-w-0");
    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,5.75rem),1fr)");
    expect(className).not.toContain("grid-cols-2");
  });

  it("renders the git recovery notice when the workflow is blocked in a rebase", () => {
    const html = renderToStaticMarkup(
      <PinnedSummaryPanel
        repoPath="C:\\repo"
        setRepoPath={() => undefined}
        currentBranch="mp-live-rebase-conflict"
        branchList={[]}
        taskState={null}
        workflowState={{
          status: "blocked",
          workflowKind: "git",
          workflowPhase: "rebase_conflict",
          currentStep: "Git is in rebase with unresolved conflicts: app.config.",
          completedTools: ["git_pull"],
        }}
        busy={false}
        projectLinks={[]}
        activeProjectLinkId={null}
        codePanelOpen={false}
        codePanelWidth={0}
        onAction={() => undefined}
      />,
    );

    expect(html).toContain("Rebase needs attention");
    expect(html).toContain("Continue the in-progress rebase");
    expect(html).toContain("Abort the in-progress rebase");
    expect(html).toContain("Skip the current rebase patch");
  });

  it("renders no recovery notice while the workflow is healthy", () => {
    const html = renderToStaticMarkup(
      <PinnedSummaryPanel
        repoPath="C:\\repo"
        setRepoPath={() => undefined}
        currentBranch="main"
        branchList={[]}
        taskState={null}
        workflowState={null}
        busy={false}
        projectLinks={[]}
        activeProjectLinkId={null}
        codePanelOpen={false}
        codePanelWidth={0}
        onAction={() => undefined}
      />,
    );

    expect(html).not.toContain("needs attention");
    expect(html).not.toContain("Continue the in-progress rebase");
  });
});
