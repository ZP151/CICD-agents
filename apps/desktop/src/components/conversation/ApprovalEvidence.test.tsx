import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApprovalEvidence } from "./ApprovalEvidence.js";

describe("ApprovalEvidence", () => {
  it("renders git add paths, flags, and commit workflow boundary", () => {
    const html = renderToStaticMarkup(
      <ApprovalEvidence
        toolName="git_add"
        args={{
          paths: ["BotToSharePoint/Common/CommonFunctions.cs", "BotToSharePoint/Controllers/ClaimController.cs"],
          dryRun: true,
        }}
        nextHint="commit staged changes"
        workflow={{
          kind: "commit",
          phase: "stage",
          branch: "feature/cicd-agent",
          pushAfterCommit: true,
        }}
      />,
    );

    expect(html).toContain("Action scope");
    expect(html).toContain("git add --dry-run --");
    expect(html).toContain("BotToSharePoint/Common/CommonFunctions.cs");
    expect(html).toContain("Flags");
    expect(html).toContain("dryRun");
    expect(html).toContain("Requested endpoint: stage, commit, and push");
    expect(html).toContain("stop after the push");
  });

  it("renders push readiness and prevents hidden PR scope", () => {
    const html = renderToStaticMarkup(
      <ApprovalEvidence
        toolName="git_push"
        args={{ branch: "feature/cicd-agent", setUpstream: true }}
        workflow={{
          kind: "commit",
          phase: "push",
          branch: "feature/cicd-agent",
          pushAfterCommit: true,
        }}
        readiness={{
          kind: "push",
          status: "ahead",
          upstream: "origin/feature/cicd-agent",
          ahead: 1,
          behind: 0,
          summary: "Branch is ahead of origin/feature/cicd-agent by 1 commit.",
        }}
      />,
    );

    expect(html).toContain("git push -u origin feature/cicd-agent");
    expect(html).toContain("Branch is ahead of origin/feature/cicd-agent by 1 commit.");
    expect(html).toContain("This workflow ends after push");
    expect(html).toContain("PR creation");
  });

  it("renders Azure DevOps pull request preflight evidence", () => {
    const html = renderToStaticMarkup(
      <ApprovalEvidence
        toolName="ado_create_pr"
        args={{
          source_branch: "feature/cicd-agent",
          target_branch: "main",
          title: "Update agent workflow",
        }}
        workflow={{ kind: "pr", phase: "create", branch: "feature/cicd-agent" }}
        preflight={{
          kind: "pr",
          status: "ready",
          sourceBranch: "feature/cicd-agent",
          targetBranch: "main",
          repository: "ClaimBot_API",
          project: "TeBS-ClaimBot",
          title: "Update agent workflow",
          summary: "Ready to create a pull request from feature/cicd-agent to main.",
        }}
      />,
    );

    expect(html).toContain("ado_create_pr source=feature/cicd-agent target=main");
    expect(html).toContain("Update agent workflow");
    expect(html).toContain("Ready to create a pull request");
    expect(html).toContain("pull-request workflow");
  });

  it("renders validation command scope evidence", () => {
    const html = renderToStaticMarkup(
      <ApprovalEvidence
        toolName="validation_command"
        args={{
          command: ".\\scripts\\windows\\pnpm-project.ps1 --filter @demo/desktop --filter @demo/core test",
          kind: "test",
        }}
        workflow={{ kind: "ci", phase: "test" }}
        preflight={{
          kind: "validation",
          status: "ready",
          validationKind: "test",
          command: ".\\scripts\\windows\\pnpm-project.ps1 --filter @demo/desktop --filter @demo/core test",
          commandSource: "derived",
          selectedScript: "test",
          packageFilters: ["@demo/desktop", "@demo/core"],
          packageRoots: ["apps/desktop", "packages/core"],
          changedFileCount: 2,
          changedFiles: ["apps/desktop/ui.test.ts", "packages/core/src.test.ts"],
          selectionReason: "derived from 2 changed packages using script test",
          summary: "Validation command selected from derived.",
        }}
      />,
    );

    expect(html).toContain("validation_command");
    expect(html).toContain("Source");
    expect(html).toContain("derived");
    expect(html).toContain("Script");
    expect(html).toContain("test");
    expect(html).toContain("@demo/desktop, @demo/core");
    expect(html).toContain("apps/desktop, packages/core");
    expect(html).toContain("2 files");
    expect(html).toContain("derived from 2 changed packages using script test");
    expect(html).toContain("configured test validation command");
  });
});
