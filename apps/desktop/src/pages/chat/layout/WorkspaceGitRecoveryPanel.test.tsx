import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  WorkspaceGitRecoveryPanel,
  workspaceGitRecoveryActionsGridClass,
} from "./WorkspaceGitRecoveryPanel.js";

describe("WorkspaceGitRecoveryPanel", () => {
  it("does not force recovery actions into fixed two or three column grids", () => {
    const className = workspaceGitRecoveryActionsGridClass();

    expect(className).toContain("min-w-0");
    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,5.75rem),1fr)");
    expect(className).not.toContain("grid-cols-2");
    expect(className).not.toContain("grid-cols-3");
  });

  it("keeps recovery context visible without a long native hover tooltip", () => {
    const html = renderToStaticMarkup(
      <WorkspaceGitRecoveryPanel
        busy={false}
        gitRecovery={{
          label: "Remote branch",
          actions: [{ type: "continue_rebase", label: "Continue", title: "Continue the in-progress rebase." }],
        }}
        runAction={() => undefined}
      />,
    );

    expect(html).toContain("Remote branch needs attention");
    expect(html).toContain('aria-label="Continue the in-progress rebase."');
    expect(html).toContain("focus-visible:ring-[rgb(var(--app-focus))]/45");
    expect(html).not.toContain("title=");
  });
});
