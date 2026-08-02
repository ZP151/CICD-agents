import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceChangesButton } from "./WorkspaceChangesButton.js";

describe("WorkspaceChangesButton", () => {
  it("uses the shared quiet action treatment for repository changes", () => {
    const html = renderToStaticMarkup(
      <WorkspaceChangesButton
        hasRepoPath
        busy={false}
        statusText={null}
        gitKnown
        hasChanges
        added={4}
        removed={2}
        runAction={() => undefined}
      />,
    );

    expect(html).toContain("Changes");
    expect(html).toContain("+4");
    expect(html).toContain("-2");
    expect(html).toContain("focus-visible:ring-[rgb(var(--app-focus))]/45");
  });
});
