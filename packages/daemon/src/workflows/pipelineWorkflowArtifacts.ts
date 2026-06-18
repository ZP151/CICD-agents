import {
  getAzureBuildLogExcerpt,
  getAzureBuildTimeline,
  listAzurePipelineRuns,
} from "@mergepilot/core";

export interface WorkflowActionArtifact {
  type: "artifact";
  artifactId: string;
  title: string;
  artifactType: "react" | "html" | "markdown" | "mermaid" | "text";
  status: "streaming" | "ready" | "error";
  content?: string;
}

export type PipelineLogExcerpt = Awaited<ReturnType<typeof getAzureBuildLogExcerpt>>;

export function summarizePipelineRuns(
  pipelineId: number,
  runs: Awaited<ReturnType<typeof listAzurePipelineRuns>>,
): string {
  if (runs.length === 0) return `Pipeline #${pipelineId} has no recent runs returned by Azure DevOps.`;
  const latest = runs[0]!;
  const failed = runs.filter((run) => /failed|canceled/i.test(`${run.result} ${run.state}`));
  return [
    `Pipeline #${pipelineId} latest run #${latest.id || "unknown"} ${latest.name || ""}: ${latest.state || "unknown"}${latest.result ? `/${latest.result}` : ""}.`,
    `Recent runs: ${runs.length}. Failed or canceled: ${failed.length}.`,
    ...runs.slice(0, 5).map((run) =>
      `- #${run.id || "unknown"} ${run.name || "run"} ${run.sourceBranch || "unknown branch"}: ${run.state || "unknown"}${run.result ? `/${run.result}` : ""}${run.url ? ` (${run.url})` : ""}`,
    ),
  ].join("\n");
}

export function pipelineFailureArtifacts(
  pipelineId: number,
  runs: Awaited<ReturnType<typeof listAzurePipelineRuns>>,
  timeline?: Awaited<ReturnType<typeof getAzureBuildTimeline>>,
  logExcerpts?: PipelineLogExcerpt[],
  timelineError?: string,
): WorkflowActionArtifact[] {
  const failedRuns = runs.filter((run) => /failed|canceled/i.test(`${run.result} ${run.state}`));
  if (failedRuns.length === 0) return [];
  const latest = failedRuns[0]!;
  const runId = latest.id || "unknown";
  const status = `${latest.state || "unknown"}${latest.result ? `/${latest.result}` : ""}`;
  const artifactId = `pipeline-${pipelineId}-run-${runId}-failed`;
  const failedRecordLines = (timeline?.failedRecords ?? []).slice(0, 8).map((record) => {
    const issue = record.issues.find((item) => /error/i.test(item.type)) ?? record.issues[0];
    const issueText = issue?.message ? ` - ${compactInlineText(issue.message, 180)}` : "";
    return `- ${record.name || record.id || "record"} (${record.type || "unknown"}): ${record.state || "unknown"}${record.result ? `/${record.result}` : ""}${issueText}`;
  });
  const errorIssueLines = (timeline?.errorIssues ?? []).slice(0, 8).map((issue) =>
    `- ${issue.category || issue.type || "error"}: ${compactInlineText(issue.message || "No message returned.", 220)}`,
  );
  const logExcerptLines = (logExcerpts ?? []).slice(0, 3).flatMap((log) => [
    `### Log #${log.logId} lines ${log.startLine}-${log.endLine}${log.truncated ? " (excerpt)" : ""}`,
    "",
    "```text",
    log.excerpt || "(empty log excerpt)",
    "```",
    "",
  ]);
  const lines = [
    `# Pipeline #${pipelineId} failure`,
    "",
    `Latest failed/canceled run: #${runId}${latest.name ? ` ${latest.name}` : ""}`,
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Pipeline | #${pipelineId} |`,
    `| Run | #${runId} |`,
    `| Branch | ${latest.sourceBranch || "unknown"} |`,
    `| Status | ${status} |`,
    `| Created | ${latest.createdDate || "unknown"} |`,
    `| Finished | ${latest.finishedDate || "unknown"} |`,
    `| URL | ${latest.url || "not returned"} |`,
    "",
    "## Recent failed or canceled runs",
    "",
    ...failedRuns.slice(0, 5).map((run) =>
      `- #${run.id || "unknown"} ${run.name || "run"} ${run.sourceBranch || "unknown branch"}: ${run.state || "unknown"}${run.result ? `/${run.result}` : ""}${run.url ? ` (${run.url})` : ""}`,
    ),
    "",
    "## Failed timeline records",
    "",
    ...(failedRecordLines.length > 0
      ? failedRecordLines
      : [timelineError
          ? `- Timeline unavailable: ${compactInlineText(timelineError, 220)}`
          : "- No failed timeline records were returned."]
    ),
    "",
    "## Error issues",
    "",
    ...(errorIssueLines.length > 0
      ? errorIssueLines
      : [timelineError
          ? "- Error issue details were not available because the timeline request failed."
          : "- No timeline error issues were returned."]
    ),
    "",
    "## Log excerpts",
    "",
    ...(logExcerptLines.length > 0
      ? logExcerptLines
      : [timeline?.failedRecords?.some((record) => record.logId)
          ? "- Failed task logs were not available."
          : "- No failed timeline record returned a log ID."]
    ),
    "",
    "## Recovery guidance",
    "",
    "- Treat this as remote CI/CD evidence, not a local validation failure.",
    "- Inspect run logs or task details before proposing code changes.",
    "- If the failure is transient or infra-related, prepare a pipeline rerun approval instead of changing code.",
    "- If the failure matches local tests/builds, run the focused local validation command before committing.",
    "",
    "Candidate next actions:",
    "",
    "- Analyze pipeline failure",
    "- Trigger pipeline rerun",
    "- Run focused local validation",
  ];
  return [{
    type: "artifact",
    artifactId,
    title: `Pipeline #${pipelineId} run #${runId} failure`,
    artifactType: "markdown",
    status: "error",
    content: lines.join("\n"),
  }];
}

function compactInlineText(value: string, maxLength = 96): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
