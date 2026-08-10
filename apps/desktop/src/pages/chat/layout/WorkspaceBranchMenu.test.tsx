import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { filterBranchOptions, WorkspaceBranchMenu } from "./WorkspaceBranchMenu.js";

describe("WorkspaceBranchMenu", () => {
  it("exposes remote fetch alongside branch refresh", () => {
    const html = renderToStaticMarkup(
      <WorkspaceBranchMenu
        hasRepoPath
        busy={false}
        branchName="main"
        branchLabel="main"
        branchList={["main", "feature/review"]}
        open
        onOpenChange={() => undefined}
        runAction={() => undefined}
      />,
    );

    expect(html).toContain("Refresh branch state");
    expect(html).toContain("Fetch remotes");
    expect(html).toContain("feature/review");
    expect(html).toContain('aria-label="Search branches"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Branch operations"');
    expect(html).toContain("max-h-52");
    expect(html).toContain('aria-label="New branch name"');
    expect(html).toContain("focus-visible:ring-[rgb(var(--app-focus))]/45");
    expect(html).toContain("!justify-start !gap-2 !px-0 py-2 text-left text-sm");
    expect(html).not.toContain("font-mono");
  });

  it("filters branch lists instead of growing the menu indefinitely", () => {
    expect(filterBranchOptions(["main", "feature/review", "release/1.0"], "REVIEW")).toEqual(["feature/review"]);
    expect(filterBranchOptions(["main", "feature/review"], "")).toEqual(["main", "feature/review"]);
  });
});
