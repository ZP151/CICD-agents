import type { ChatWorkflowActionResult, PipelineRunSummary } from "../../api.js";

export function extractPipelineRuns(result: ChatWorkflowActionResult): PipelineRunSummary[] {
  const tool = result.tools.find((item) => item.name === "ado_list_pipeline_runs");
  if (!tool?.stdout) return [];
  try {
    const parsed = JSON.parse(tool.stdout) as { runs?: PipelineRunSummary[] };
    return Array.isArray(parsed.runs) ? parsed.runs : [];
  } catch {
    return [];
  }
}
