import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PipelineDetailPanel } from "./Pipelines.js";
import type { PipelineRow } from "./pipelines/pipelineTypes.js";

const row: PipelineRow = {
  projectLinkId: "pl-1",
  projectLinkName: "ClaimBot_API link",
  source: "saved",
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

describe("PipelineDetailPanel", () => {
  it("renders run evidence statuses with the full semantic tone", () => {
    const html = renderToStaticMarkup(
      <PipelineDetailPanel
        row={row}
        state={{
          phase: "done",
          result: {
            ok: true,
            action: "inspect_pipeline",
            repoPath: row.repoPath,
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
        onClose={() => undefined}
      />,
    );

    expect(html).toContain("Run evidence");
    expect(html).toContain("20260705.1");
    expect(html).toContain("Succeeded");
    expect(html).toContain("text-emerald-700");
    expect(html).toContain("ring-emerald-500/30");
  });
});
