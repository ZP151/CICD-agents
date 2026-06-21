import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CommandChipBar,
  deriveCommandChips,
} from "./SuggestionReplyBar.js";

describe("deriveCommandChips", () => {
  it("derives compact default command chips", () => {
    const commands = deriveCommandChips({ hasRepoPath: true });

    expect(commands.map((command) => command.label)).toEqual([
      "Review changes",
      "Explain architecture",
      "Run tests",
    ]);
    expect(commands[0]?.action).toEqual({ kind: "workspace_action", action: "inspect_changes" });
    expect(commands[1]?.action).toEqual({ kind: "workspace_action", action: "inspect_architecture_context" });
    expect(commands[2]?.action).toEqual({ kind: "workspace_action", action: "run_tests" });
  });

  it("adds Azure DevOps command chips only when an ADO link exists", () => {
    const commands = deriveCommandChips({ hasRepoPath: true, hasAdoLink: true });

    expect(commands.map((command) => command.label)).toEqual([
      "Review changes",
      "Explain architecture",
      "Run tests",
      "PR insight",
      "Pipeline",
    ]);
    expect(commands[3]?.action).toEqual({ kind: "workspace_action", action: "inspect_pr_insight" });
    expect(commands[4]?.action).toEqual({ kind: "workspace_action", action: "inspect_pipeline" });
  });

  it("hides command chips while the user is typing", () => {
    expect(deriveCommandChips({ hasRepoPath: true, inputValue: "review" })).toEqual([]);
  });

  it("falls back to composer-fill for repo commands when no repository is active", () => {
    const commands = deriveCommandChips({ hasRepoPath: false });

    expect(commands[0]?.label).toBe("Review changes");
    expect(commands[0]?.action).toEqual({ kind: "fill_composer" });
  });
});

describe("CommandChipBar", () => {
  it("renders disabled command chips without dropping labels", () => {
    const html = renderToStaticMarkup(
      <CommandChipBar
        disabled
        commands={[
          {
            id: "cmd-review",
            label: "Review changes",
            message: "Review my changes",
            action: { kind: "workspace_action", action: "inspect_changes" },
          },
        ]}
        onPick={() => undefined}
      />,
    );

    expect(html).toContain("Review changes");
    expect(html).toContain("disabled");
    expect(html).toContain("Finish the current approval first");
    expect(html).toContain('data-action-kind="workspace_action"');
  });
});
