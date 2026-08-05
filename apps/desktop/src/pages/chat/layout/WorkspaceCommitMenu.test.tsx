import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceCommitMenu } from "./WorkspaceCommitMenu.js";

describe("WorkspaceCommitMenu", () => {
  it("uses shared action and form controls without showing divergence or change counts", () => {
    const html = renderToStaticMarkup(
      <WorkspaceCommitMenu
        hasRepoPath
        busy={false}
        branchName="feature/review"
        branchLabel="feature/review"
        activeProjectLink={null}
        open
        onOpenChange={() => undefined}
        runAction={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="Commit message"');
    expect(html).not.toContain("Diverged:");
    expect(html).not.toContain("ahead");
    expect(html).not.toContain("behind");
    expect(html).not.toContain("Pull/rebase first");
    expect(html).toContain('aria-label="Prepare commit and push"');
    expect(html).toContain("focus-visible:ring-[rgb(var(--app-focus))]/45");
    expect(html).not.toContain("title=");
  });
});
