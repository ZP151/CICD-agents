import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceChangesButton } from "./WorkspaceChangesButton.js";

describe("WorkspaceChangesButton", () => {
  it("uses the shared quiet action treatment for repository changes", () => {
    const html = renderToStaticMarkup(
      <WorkspaceChangesButton
        hasRepoPath
        busy={false}
        runAction={() => undefined}
      />,
    );

    expect(html).toContain("Changes");
    expect(html).not.toContain("font-mono");
    expect(html).not.toContain("not checked");
    expect(html).not.toContain("clean");
    expect(html).toContain("focus-visible:ring-[rgb(var(--app-focus))]/45");
  });
});
