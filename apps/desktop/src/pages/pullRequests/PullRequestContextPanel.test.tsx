import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PullRequestContextPanel,
  pullRequestContextOverviewGridClass,
  pullRequestContextSecondaryGridClass,
} from "./PullRequestContextPanel.js";
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
      reviewers: [],
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
  it("uses an auto-fit overview grid so description and work items reflow with card width", () => {
    const className = pullRequestContextOverviewGridClass();

    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,18rem),1fr)");
    expect(className).not.toContain("lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]");
  });

  it("uses an auto-fit secondary grid so thread and build panels reflow with card width", () => {
    const className = pullRequestContextSecondaryGridClass();

    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,18rem),1fr)");
    expect(className).not.toContain("lg:grid-cols-2");
  });

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
