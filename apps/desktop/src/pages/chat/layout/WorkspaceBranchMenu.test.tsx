import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceBranchMenu } from "./WorkspaceBranchMenu.js";

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
  });
});
