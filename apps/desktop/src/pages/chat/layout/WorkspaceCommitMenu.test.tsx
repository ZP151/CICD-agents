import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceCommitMenu } from "./WorkspaceCommitMenu.js";

describe("WorkspaceCommitMenu", () => {
  it("uses shared action and form controls while keeping a diverged branch safe", () => {
    const html = renderToStaticMarkup(
      <WorkspaceCommitMenu
        hasRepoPath
        busy={false}
        branchName="feature/review"
        branchLabel="feature/review"
        hasChanges
        added={4}
        removed={2}
        gitStatus={{ branch: "feature/review", ahead: 1, behind: 2, staged: [], modified: [], untracked: [], deleted: [] }}
        activeProjectLink={null}
        open
        onOpenChange={() => undefined}
        runAction={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="Commit message"');
    expect(html).toContain("Diverged: 1 ahead, 2 behind");
    expect(html).toContain("Pull/rebase first");
    expect(html).toContain('aria-label="Prepare commit and push"');
    expect(html).toContain("focus-visible:ring-[rgb(var(--app-focus))]/45");
    expect(html).not.toContain("title=");
  });
});
