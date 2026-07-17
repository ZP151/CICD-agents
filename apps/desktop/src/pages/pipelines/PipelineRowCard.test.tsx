import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PipelineRowCard } from "./PipelineRowCard.js";
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
  it("keys row state by repository and branch scope as well as pipeline id", () => {
    expect(rowKey(baseRow)).not.toBe(
      rowKey({ ...baseRow, repository: "OtherRepo" }),
    );
    expect(rowKey(baseRow)).not.toBe(
      rowKey({ ...baseRow, defaultBranch: "feature/other" }),
    );
  });

  it("keeps missing latest run dates quiet and shows the latest run field fallback", () => {
    const html = renderToStaticMarkup(
      <PipelineRowCard
        row={baseRow}
        state={{ phase: "idle" }}
        onInspect={() => undefined}
        onTrigger={() => undefined}
        onAnalyze={() => undefined}
        onSave={() => undefined}
        onOpenDetails={() => undefined}
      />,
    );

    expect(html).toContain("No run linked yet");
    expect(html).not.toContain("Unknown");
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
      />,
    );

    expect(html).toContain("AI analysis");
    expect(html).toContain("Ready");
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
      />,
    );

    expect(html).toContain("20260705.1");
    expect(html).toContain("Succeeded");
    expect(html).toContain("text-emerald-700");
    expect(html).toContain("ring-emerald-500/30");
  });
});
