import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PullRequestCard,
  pullRequestActionsClass,
  pullRequestInsightPreviewClass,
  pullRequestInsightPreviewText,
  pullRequestMetaGridClass,
} from "./PullRequestCard.js";
import type { DisplayPullRequest } from "./pullRequestTypes.js";

const pr: DisplayPullRequest = {
  id: 2670,
  title: "Update CommonFunctions.cs",
  status: "active",
  isDraft: false,
  sourceBranch: "feature/cicd-agent",
  targetBranch: "main",
  createdBy: "Zhou Ping",
  creationDate: "2026-07-07T02:16:32.000Z",
  repository: "ClaimBot_API",
  url: "https://dev.azure.com/example",
  reviewerCount: 1,
      reviewers: [],
  voteSummary: {
    approved: 1,
    waiting: 0,
    rejected: 0,
  },
  sourceProjectLinkId: "pl-1",
  sourceProjectLinkName: "ClaimBot_API link",
};

describe("PullRequestCard", () => {
  it("keeps PR cards list-focused and opens existing insight instead of duplicating actions", () => {
    const html = renderToStaticMarkup(
      <PullRequestCard
        pr={pr}
        projectLinkId="pl-1"
        previewState={{
          phase: "done",
          result: {
            source: "llm",
            summary: "### PR Insight Summary\n\n- **Ready:** only documentation changed.\n- Run tests before merge.",
            readiness: "ready",
            risks: [],
            signals: {
              fileCount: 1,
              threadCount: 0,
              failedBuildCount: 0,
              workItemCount: 0,
            },
            tokensIn: 100,
            tokensOut: 20,
          },
        }}
        insightArtifacts={[]}
        contextState={undefined}
        isExpanded={false}
        highlighted={false}
        onToggleContext={() => undefined}
        onPreviewInsight={() => undefined}
        onOpenInsight={() => undefined}
        onOpenSavedInsightInChat={() => undefined}
      />,
    );

    expect(html).toContain("Open insight");
    expect(html).not.toContain("Run automated review");
    expect(html).toContain("focus-visible:ring-2");
    expect(html).not.toContain("Preview Insight");
    expect(html).toContain("Author:");
    expect(html).toContain("Created:");
    expect(html).toContain("Reviewers:");
    expect(html).toContain('title="Author: Zhou Ping; Created:');
    expect(html).toContain("Latest insight");
    expect(html).not.toContain('title="### PR Insight Summary');
    expect(html).toContain("rounded-lg bg-[rgb(var(--app-surface-raised))]");
    expect(html).toContain("max-w-[72ch]");
    expect(html).toContain("truncate");
    expect(html).toContain("Ready: only documentation changed.");
    expect(html).not.toContain("<strong>Ready:");
    expect(html).not.toContain("<li>");
    expect(html).toContain("only documentation changed.");
    expect(html).toContain("break-words text-sm font-semibold leading-5");
    expect(html).toContain('title="Source branch: feature/cicd-agent; target branch: main"');
  });
});

describe("pullRequestActionsClass", () => {
  it("uses a compact wrapping PR metadata line so cards stay list-focused", () => {
    const className = pullRequestMetaGridClass();

    expect(className).toContain("flex");
    expect(className).toContain("flex-wrap");
    expect(className).toContain("gap-x-3");
    expect(className).toContain("mt-3");
    expect(className).not.toContain("sm:grid-cols-3");
    expect(className).not.toContain("grid-cols-[repeat");
  });

  it("allows PR action buttons to wrap instead of squeezing the title", () => {
    const className = pullRequestActionsClass();

    expect(className).toContain("w-full");
    expect(className).toContain("md:flex-1");
    expect(className).toContain("md:min-w-[220px]");
    expect(className).toContain("max-w-full");
    expect(className).toContain("items-start");
    expect(className).toContain("md:items-end");
    expect(className).not.toContain("shrink-0");
  });

  it("clips Markdown insight previews even when Markdown renders nested block content", () => {
    const className = pullRequestInsightPreviewClass();

    expect(className).toContain("truncate");
    expect(className).not.toContain("-webkit-line-clamp:2");
    expect(className).not.toContain("mask-image");
  });

  it("extracts a short plain-text insight preview from Markdown", () => {
    const preview = pullRequestInsightPreviewText(
      "### PR Insight Summary for #2670\n\n- **Title:** Update `CommonFunctions.cs` and `ClaimController.cs`\n- **Risk Signals:** active threads",
    );

    expect(preview).toBe("Title: Update CommonFunctions.cs and ClaimController.cs");
  });

  it("does not use generic insight headings as card preview text", () => {
    expect(pullRequestInsightPreviewText("PR Insight Summary for #2670")).toBe(
      "Open the latest insight details.",
    );
  });
});
