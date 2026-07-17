import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PullRequestContextPanel } from "./PullRequestContextPanel.js";
import type { ContextState } from "./pullRequestTypes.js";

function loadedContextState(description: string): ContextState {
  return {
    phase: "loaded",
    data: {
      source: "internal",
      pullRequest: {
        id: 2670,
        title: "Update pipeline",
        status: "active",
        isDraft: false,
        sourceBranch: "feature/demo",
        targetBranch: "main",
        createdBy: "Zhou Ping",
        creationDate: "2026-07-07T02:16:32.000Z",
        repository: "ClaimBot_API",
        url: "https://dev.azure.com/example",
        reviewerCount: 1,
        voteSummary: {
          approved: 0,
          waiting: 1,
          rejected: 0,
        },
        codeReviewId: 2670,
        project: "TeBS-ClaimBot",
        description,
        closedDate: "",
        workItemRefs: [],
      },
      threads: [],
      changes: {
        iterationId: 1,
        sourceCommit: "abc1234",
        targetCommit: "def5678",
        commonCommit: "0000000",
        fileCount: 0,
        changes: [],
      },
      builds: [],
    },
  };
}

describe("PullRequestContextPanel", () => {
  it("renders PR descriptions as Markdown instead of plain pre-wrapped text", () => {
    const html = renderToStaticMarkup(
      <PullRequestContextPanel state={loadedContextState("**Scope**\n\n- Update CI")} />,
    );

    expect(html).toContain("<strong>Scope</strong>");
    expect(html).toContain("<li");
    expect(html).toContain("Update CI");
    expect(html).not.toContain("**Scope**");
  });
});
