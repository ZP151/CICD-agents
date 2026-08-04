import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PullRequestCard,
  pullRequestActionDetailClass,
  pullRequestActionRowClass,
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
        queueState={{ phase: "idle" }}
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
        onQueueForReview={() => undefined}
        onOpenInsight={() => undefined}
        onOpenSavedInsightInChat={() => undefined}
      />,
    );

    expect(html).toContain("Open insight");
    expect(html).toContain("Run automated review");
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
  });

  it("presents a completed review as state rather than a disabled action button", () => {
    const html = renderToStaticMarkup(
      <PullRequestCard
        pr={pr}
        projectLinkId="pl-1"
        queueState={{
          phase: "done",
          result: {
            ok: true,
            pullRequestId: pr.id,
            repository: pr.repository,
            iterationId: 1,
            decisionQueue: "auto_approved",
            decisionRiskLevel: "low",
            decisionReason: "No blocking findings.",
            findingCount: 0,
            readiness: "ready",
            lastRunAt: "2026-08-02T12:00:00.000Z",
            autoApprovalActor: "MergePilot",
            tokensIn: 0,
            tokensOut: 0,
            summary: "No blocking findings.",
          },
        }}
        previewState={{ phase: "idle" }}
        insightArtifacts={[]}
        contextState={undefined}
        isExpanded={false}
        highlighted={false}
        onToggleContext={() => undefined}
        onPreviewInsight={() => undefined}
        onQueueForReview={() => undefined}
        onOpenInsight={() => undefined}
        onOpenSavedInsightInChat={() => undefined}
      />,
    );

    expect(html).toContain("Auto-approved");
    expect(html).toContain("No blocking findings.");
    expect(html).not.toContain("disabled=\"\"");
    expect(html).not.toContain("Open Review Queue");
  });

  it("provides a direct review-queue handoff only when a human decision is needed", () => {
    const html = renderToStaticMarkup(
      <PullRequestCard
        pr={pr}
        projectLinkId="pl-1"
        queueState={{
          phase: "done",
          result: {
            ok: true,
            pullRequestId: pr.id,
            repository: pr.repository,
            iterationId: 1,
            decisionQueue: "needs_human_review",
            decisionRiskLevel: "medium",
            decisionReason: "Review the security-sensitive change.",
            findingCount: 2,
            readiness: "needs_attention",
            lastRunAt: "2026-08-02T12:00:00.000Z",
            autoApprovalActor: "",
            tokensIn: 0,
            tokensOut: 0,
            summary: "Two findings require a human decision.",
          },
        }}
        previewState={{ phase: "idle" }}
        insightArtifacts={[]}
        contextState={undefined}
        isExpanded={false}
        highlighted={false}
        onToggleContext={() => undefined}
        onPreviewInsight={() => undefined}
        onQueueForReview={() => undefined}
        onOpenInsight={() => undefined}
        onOpenSavedInsightInChat={() => undefined}
      />,
    );

    expect(html).toContain("Needs review");
    expect(html).toContain('href="#/pulls"');
    expect(html).toContain("Open Review Queue");
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

  it("left-aligns PR actions on narrow cards and restores right alignment on wider cards", () => {
    const className = pullRequestActionRowClass();

    expect(className).toContain("justify-start");
    expect(className).toContain("md:justify-end");
    expect(className).not.toContain("justify-end gap-2");
  });

  it("lets PR action detail text use the full row before right-aligning at wider widths", () => {
    expect(pullRequestActionDetailClass("muted")).toContain("w-full");
    expect(pullRequestActionDetailClass("muted")).toContain("text-left");
    expect(pullRequestActionDetailClass("muted")).toContain("md:max-w-xs");
    expect(pullRequestActionDetailClass("muted")).toContain("md:text-right");
    expect(pullRequestActionDetailClass("danger")).toContain("text-[rgb(var(--app-danger))]");
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
