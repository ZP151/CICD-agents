import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PipelineRowCard,
  pipelineInspectionSummary,
  pipelineAnalysisPreviewClass,
  pipelineActionRowClass,
  pipelineFieldGridClass,
} from "./PipelineRowCard.js";
import type { PipelineRow } from "./pipelineTypes.js";
import { rowKey } from "./usePipelinesRuntime.js";

const baseRow: PipelineRow = {
  projectLinkId: "pl-1",
  projectLinkName: "ClaimBot_API link",
  source: "discovered",
  repoPath: "C:\\repos\\ClaimBot_API",
  repository: "ClaimBot_API",
  project: "TeBS-ClaimBot",
  orgUrl: "https://tebssg.visualstudio.com/",
  pipelineId: "117",
  pipelineName: "ClaimBot_API",
  defaultBranch: "main",
  targetBranch: "main",
  latestRun: undefined,
  relatedPullRequests: [],
};

describe("PipelineRowCard", () => {
  it("keeps raw tool output out of compact pipeline cards", () => {
    const raw = `Pipeline #117 ${"C:\\very-long-path\\build.log ".repeat(40)}`;
    const summary = pipelineInspectionSummary(raw, 3);

    expect(summary).toBe("Inspection completed. 3 recent runs are available in Details.");
    expect(summary).not.toContain("very-long-path");
  });

  it("keys row state by repository and branch scope as well as pipeline id", () => {
    expect(rowKey(baseRow)).not.toBe(
      rowKey({ ...baseRow, repository: "OtherRepo" }),
    );
    expect(rowKey(baseRow)).not.toBe(
      rowKey({ ...baseRow, defaultBranch: "feature/other" }),
    );
  });

  it("keeps missing latest run dates quiet without repeating no-run fallback text", () => {
    const html = renderToStaticMarkup(
      <PipelineRowCard
        row={baseRow}
        state={{ phase: "idle" }}
        onInspect={() => undefined}
        onTrigger={() => undefined}
        onAnalyze={() => undefined}
        onSave={() => undefined}
        onOpenDetails={() => undefined}
        onSelectCandidate={() => undefined}
        onRefreshPipelines={() => undefined}
      />,
    );

    expect(html).toContain("No recent run");
    expect(html).toContain('data-testid="pipeline-row-card"');
    expect(html).not.toContain("No run linked yet");
    expect(html).not.toContain("Unknown");
    expect(html).toContain("min-w-0 flex-1");
    expect(html).toContain("Pipeline summary");
    expect(html).toContain("ClaimBot_API link · discovered");
    expect(html).toContain("main → main");
    expect(html).toContain("focus-visible:ring-2");
    expect(html).toContain("title=\"Default branch: main; Target branch: main\"");
    expect(html).not.toContain("Latest run");
  });

  it("renders pipeline AI analysis as Markdown with a stable ready state", () => {
    const html = renderToStaticMarkup(
      <PipelineRowCard
        row={baseRow}
        state={{
          phase: "analysis_done",
          result: {
            ok: true,
            action: "inspect_pipeline",
            repoPath: baseRow.repoPath,
            summary: "Pipeline inspected.",
            workflowState: { status: "done", currentStep: "", completedTools: [] },
            tools: [],
          },
          runs: [],
          analysis: "**Status:** Pipeline is healthy.\n\n- No failed runs.",
        }}
        onInspect={() => undefined}
        onTrigger={() => undefined}
        onAnalyze={() => undefined}
        onSave={() => undefined}
        onOpenDetails={() => undefined}
        onSelectCandidate={() => undefined}
        onRefreshPipelines={() => undefined}
      />,
    );

    expect(html).toContain("AI analysis");
    expect(html).toContain("Ready");
    expect(html).toContain("max-h-16");
    expect(html).toContain("<strong>Status:");
    expect(html).toContain("<li class=");
    expect(html).toContain("No failed runs.");
  });

  it("renders inspected run evidence with the full semantic status tone", () => {
    const html = renderToStaticMarkup(
      <PipelineRowCard
        row={baseRow}
        state={{
          phase: "done",
          result: {
            ok: true,
            action: "inspect_pipeline",
            repoPath: baseRow.repoPath,
            summary: "Pipeline inspected.",
            workflowState: { status: "done", currentStep: "", completedTools: [] },
            tools: [],
          },
          runs: [
            {
              id: 4680,
              name: "20260705.1",
              state: "completed",
              result: "succeeded",
              createdDate: "2026-07-05T01:00:00.000Z",
              finishedDate: "2026-07-05T01:02:00.000Z",
              sourceBranch: "refs/heads/main",
              url: "https://tebssg.visualstudio.com/build/4680?definitionId=117",
            },
          ],
        }}
        onInspect={() => undefined}
        onTrigger={() => undefined}
        onAnalyze={() => undefined}
        onSave={() => undefined}
        onOpenDetails={() => undefined}
        onSelectCandidate={() => undefined}
        onRefreshPipelines={() => undefined}
      />,
    );

    expect(html).toContain("20260705.1");
    expect(html).toContain("Succeeded");
    expect(html).toContain("text-[rgb(var(--app-success))]");
    expect(html).toContain("ring-[rgb(var(--app-success-border))]");
  });

  it("hands an approval back to Chat with an explicit recovery action", () => {
    const html = renderToStaticMarkup(
      <PipelineRowCard
        row={baseRow}
        state={{
          phase: "approval",
          result: {
            ok: true,
            action: "trigger_pipeline",
            repoPath: baseRow.repoPath,
            summary: "Pipeline trigger is ready for approval.",
            workflowState: { status: "waiting_for_approval", currentStep: "approve pipeline", completedTools: [] },
            tools: [],
          },
        }}
        onInspect={() => undefined}
        onTrigger={() => undefined}
        onAnalyze={() => undefined}
        onSave={() => undefined}
        onOpenDetails={() => undefined}
        onSelectCandidate={() => undefined}
        onRefreshPipelines={() => undefined}
      />,
    );

    expect(html).toContain("Approval required");
    expect(html).toContain('href="#/chat"');
    expect(html).toContain("Open Chat approval");
    expect(html).not.toContain("Open Chat to review");
  });

  it("lets pipeline action buttons wrap naturally on narrow cards", () => {
    const className = pipelineActionRowClass();

    expect(className).toContain("justify-start");
    expect(className).toContain("sm:justify-end");
    expect(className).toContain("flex-wrap");
    expect(className).not.toContain("justify-end gap-2");
  });

  it("keeps AI analysis preview compact inside pipeline cards", () => {
    const className = pipelineAnalysisPreviewClass();

    expect(className).toContain("max-h-16");
    expect(className).toContain("overflow-hidden");
    expect(className).toContain("[&_li]:truncate");
    expect(className).not.toContain("max-h-36");
  });

  it("uses compact wrapping summary chips so branch and run fields do not form a tall grid", () => {
    const className = pipelineFieldGridClass();

    expect(className).toContain("flex");
    expect(className).toContain("flex-wrap");
    expect(className).toContain("gap-1.5");
    expect(className).not.toContain("grid");
    expect(className).not.toContain("auto-fit");
    expect(className).not.toContain("sm:grid-cols-2");
    expect(className).not.toContain("2xl:grid-cols-4");
  });
});

describe("PipelineRowCard typed target failures (MP-010)", () => {
  function renderFailure(failure: NonNullable<import("../../api.js").ChatWorkflowActionResult["failure"]>): string {
    return renderToStaticMarkup(
      <PipelineRowCard
        row={baseRow}
        state={{
          phase: "target_failure",
          result: {
            ok: false,
            action: "inspect_pipeline",
            repoPath: baseRow.repoPath,
            summary: failure.message,
            workflowState: { status: "blocked", currentStep: failure.message, completedTools: [] },
            tools: [],
            failure,
          },
          failure,
        }}
        onInspect={() => undefined}
        onTrigger={() => undefined}
        onAnalyze={() => undefined}
        onSave={() => undefined}
        onOpenDetails={() => undefined}
        onSelectCandidate={() => undefined}
        onRefreshPipelines={() => undefined}
      />,
    );
  }

  it("offers explicit candidate buttons for ambiguous targets and never auto-picks", () => {
    const html = renderFailure({
      kind: "ambiguous_target",
      message: "Multiple pipelines are named CI.",
      candidates: [
        { id: 7, name: "CI" },
        { id: 8, name: "CI" },
      ],
    });

    expect(html).toContain("Multiple pipelines match");
    expect(html).toContain("#7 CI");
    expect(html).toContain("#8 CI");
    expect(html).not.toContain("Pipeline not found");
  });

  it("points authorization failures at the reauthorize path", () => {
    const html = renderFailure({
      kind: "unauthorized",
      message: "Azure DevOps OAuth token is unavailable.",
    });

    expect(html).toContain("Azure DevOps access required");
    expect(html).toContain("Re-authorize in Project Link");
  });

  it("shows connector capability problems separately from missing pipelines", () => {
    const html = renderFailure({
      kind: "capability_missing",
      message: "pipelines domain is not enabled for this connector.",
    });

    expect(html).toContain("Pipeline connector unavailable");
    expect(html).toContain("Open connector settings");
  });

  it("offers a refresh action for a missing pipeline", () => {
    const html = renderFailure({
      kind: "target_not_found",
      message: "No pipeline named MissingPipeline was found.",
    });

    expect(html).toContain("Pipeline not found");
    expect(html).toContain("Refresh pipeline list");
  });
});
