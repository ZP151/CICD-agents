import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExecutionTimeline, type ExecutionTimelineItem } from "./ExecutionTimeline.js";

describe("ExecutionTimeline", () => {
  it("renders grouped execution status, command input evidence, and output summaries", () => {
    const items: ExecutionTimelineItem[] = [
      {
        id: "tool-1",
        toolName: "git_add",
        state: "result",
        ok: true,
        input: {
          paths: ["BotToSharePoint/Common/CommonFunctions.cs", "BotToSharePoint/Controllers/ClaimController.cs"],
          flags: ["--verbose"],
          dryRun: true,
        },
        output: { stdout: "staged 2 files", returncode: 0 },
        summary: "staged selected files",
        open: true,
      },
      {
        id: "tool-2",
        toolName: "git_commit",
        state: "running",
        input: { message: "Review claim workflow changes" },
        liveOutput: "creating commit...",
      },
    ];

    const html = renderToStaticMarkup(<ExecutionTimeline items={items} onToggleItem={() => undefined} />);

    expect(html).toContain("Execution");
    expect(html).toContain("running");
    expect(html).toContain("git_add");
    expect(html).toContain("paths=BotToSharePoint/Common/CommonFunctions.cs");
    expect(html).toContain("flags=--verbose");
    expect(html).toContain("git add --dry-run -- BotToSharePoint/Common/CommonFunctions.cs");
    expect(html).toContain("staged selected files");
    expect(html).toContain("git_commit");
    expect(html).toContain("message=Review claim workflow changes");
    expect(html).toContain("streaming output");
  });

  it("marks failed tool output as an error timeline", () => {
    const items: ExecutionTimelineItem[] = [
      {
        id: "tool-1",
        toolName: "ado_create_pr",
        state: "error",
        ok: false,
        output: { stderr: "Azure DevOps token is unavailable", returncode: 1 },
        open: true,
      },
    ];

    const html = renderToStaticMarkup(<ExecutionTimeline items={items} onToggleItem={() => undefined} />);

    expect(html).toContain("error");
    expect(html).toContain("ado_create_pr");
    expect(html).toContain("Azure DevOps token is unavailable");
  });

  it("renders raw command evidence from direct workflow tools", () => {
    const items: ExecutionTimelineItem[] = [
      {
        id: "tool-1",
        toolName: "git_status",
        state: "result",
        ok: true,
        input: { command: "git status --short -b" },
        output: { stdout: "## feature/x\n M src/app.ts", returncode: 0 },
        open: true,
      },
    ];

    const html = renderToStaticMarkup(<ExecutionTimeline items={items} onToggleItem={() => undefined} />);

    expect(html).toContain("git_status");
    expect(html).toContain("git status --short -b");
    expect(html).toContain("## feature/x");
  });

  it("attaches pending approval evidence to the exact tool row", () => {
    const items: ExecutionTimelineItem[] = [
      {
        id: "tool-1",
        toolName: "git_diff",
        state: "result",
        ok: true,
      },
      {
        id: "tool-2",
        toolName: "git_add",
        state: "result",
        ok: true,
        approval: {
          id: "approval-1",
          toolName: "git_add",
          description: "Stage selected files for commit",
          riskLevel: "medium",
        },
      },
    ];

    const html = renderToStaticMarkup(
      <ExecutionTimeline
        items={items}
        onToggleItem={() => undefined}
        renderApproval={(item) => (
          <div data-approval-for={item.id}>
            Approve {item.approval?.toolName}
          </div>
        )}
      />,
    );

    expect(html).toContain("approval");
    expect(html).toContain("Approval pending");
    expect(html).toContain("Stage selected files for commit");
    expect(html).toContain('data-approval-for="tool-2"');
    expect(html).toContain("Approve git_add");
  });
});
