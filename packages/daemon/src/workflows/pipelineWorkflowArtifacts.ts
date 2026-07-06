import {
  getAzureBuildLogExcerpt,
  getAzureBuildTimeline,
  listAzurePipelineRuns,
  redact,
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

export function preferredPipelineFailureRun(
  runs: Awaited<ReturnType<typeof listAzurePipelineRuns>>,
): Awaited<ReturnType<typeof listAzurePipelineRuns>>[number] | undefined {
  return runs.find((run) => run.id && /failed/i.test(`${run.result} ${run.state}`))
    ?? runs.find((run) => run.id && /failed|canceled/i.test(`${run.result} ${run.state}`));
}

export function summarizePipelineRuns(
  pipelineId: number,
  runs: Awaited<ReturnType<typeof listAzurePipelineRuns>>,
  timeline?: Awaited<ReturnType<typeof getAzureBuildTimeline>>,
  logExcerpts?: PipelineLogExcerpt[],
  timelineError?: string,
): string {
  if (runs.length === 0) return `Pipeline #${pipelineId} has no recent runs returned by Azure DevOps.`;
  const latest = runs[0]!;
  const failed = runs.filter((run) => /failed|canceled/i.test(`${run.result} ${run.state}`));
  const evidenceRun = preferredPipelineFailureRun(runs);
  const classification = evidenceRun ? classifyPipelineFailure(timeline, logExcerpts, timelineError) : undefined;
  const lines = [
    `Pipeline #${pipelineId} latest run #${latest.id || "unknown"} ${safeText(latest.name || "")}: ${latest.state || "unknown"}${latest.result ? `/${latest.result}` : ""}.`,
    `Recent runs: ${runs.length}. Failed or canceled: ${failed.length}.`,
    ...runs.slice(0, 5).map((run) =>
      `- #${run.id || "unknown"} ${safeText(run.name || "run")} ${safeText(run.sourceBranch || "unknown branch")}: ${run.state || "unknown"}${run.result ? `/${run.result}` : ""}${run.url ? ` (${safeText(run.url)})` : ""}`,
    ),
  ];
  if (evidenceRun) {
    lines.push("", ...pipelineFailureEvidenceSummary(evidenceRun, timeline, logExcerpts, timelineError));
    if (classification) {
      lines.push(`Failure classification: ${classification.label}. ${classification.summary}`);
    }
  }
  return lines.map(safeText).join("\n");
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
  const latest = preferredPipelineFailureRun(runs) ?? failedRuns[0]!;
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
    safeText(log.excerpt || "(empty log excerpt)"),
    "```",
    "",
  ]);
  const classification = classifyPipelineFailure(timeline, logExcerpts, timelineError);
  const lines = [
    `# Pipeline #${pipelineId} failure`,
    "",
    `Latest failed/canceled run: #${runId}${latest.name ? ` ${latest.name}` : ""}`,
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Pipeline | #${pipelineId} |`,
    `| Run | #${runId} |`,
    `| Branch | ${safeText(latest.sourceBranch || "unknown")} |`,
    `| Status | ${status} |`,
    `| Created | ${latest.createdDate || "unknown"} |`,
    `| Finished | ${latest.finishedDate || "unknown"} |`,
    `| URL | ${safeText(latest.url || "not returned")} |`,
    "",
    "## Recent failed or canceled runs",
    "",
    ...failedRuns.slice(0, 5).map((run) =>
      `- #${run.id || "unknown"} ${safeText(run.name || "run")} ${safeText(run.sourceBranch || "unknown branch")}: ${run.state || "unknown"}${run.result ? `/${run.result}` : ""}${run.url ? ` (${safeText(run.url)})` : ""}`,
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
    "## Failure classification",
    "",
    `- Classification: ${classification.label}`,
    `- Confidence: ${classification.confidence}`,
    `- Rationale: ${classification.summary}`,
    `- Recommended response: ${classification.recommendedResponse}`,
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
    content: safeText(lines.join("\n")),
  }];
}

function safeText(value: string): string {
  return redact(value);
}

function compactInlineText(value: string, maxLength = 96): string {
  const compact = safeText(value).replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function pipelineFailureEvidenceSummary(
  failedRun: Awaited<ReturnType<typeof listAzurePipelineRuns>>[number],
  timeline?: Awaited<ReturnType<typeof getAzureBuildTimeline>>,
  logExcerpts?: PipelineLogExcerpt[],
  timelineError?: string,
): string[] {
  const runId = failedRun.id || "unknown";
  const lines = [
    `Latest failed/canceled run evidence: #${runId} ${safeText(failedRun.name || "run")} ${safeText(failedRun.sourceBranch || "unknown branch")}.`,
  ];
  const recordLines = (timeline?.failedRecords ?? []).slice(0, 3).map((record) => {
    const issue = record.issues.find((item) => /error/i.test(item.type)) ?? record.issues[0];
    const issueText = issue?.message ? ` - ${compactInlineText(issue.message, 180)}` : "";
    return `- ${record.name || record.id || "record"} (${record.type || "unknown"}): ${record.state || "unknown"}${record.result ? `/${record.result}` : ""}${issueText}`;
  });
  if (recordLines.length > 0) {
    lines.push("Failed timeline records:", ...recordLines);
  } else if (timelineError) {
    lines.push(`Failed timeline records: unavailable (${compactInlineText(timelineError, 180)}).`);
  }

  const issueLines = (timeline?.errorIssues ?? []).slice(0, 3).map((issue) =>
    `- ${issue.category || issue.type || "error"}: ${compactInlineText(issue.message || "No message returned.", 180)}`,
  );
  if (issueLines.length > 0) lines.push("Error issues:", ...issueLines);

  const excerptLines = (logExcerpts ?? []).slice(0, 2).flatMap((log) =>
    diagnosticLinesFromExcerpt(log.excerpt).slice(0, 4).map((line) =>
      `- Log #${log.logId}: ${compactInlineText(line, 180)}`,
    ),
  );
  if (excerptLines.length > 0) lines.push("Log evidence:", ...excerptLines);
  return lines;
}

function diagnosticLinesFromExcerpt(excerpt: string): string[] {
  const diagnosticLines = excerpt
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) =>
      line &&
      (/##\[error\]|\b(error|failed|failure|exception|assertionerror|traceback)\b|npm ERR!|\bFAIL\b/i.test(line) ||
        /MSBuild|VSBuild|Publishing\.targets|\.DS_Store/i.test(line)),
    );
  return Array.from(new Set(diagnosticLines));
}

interface PipelineFailureClassification {
  label: "Likely source/configuration failure" | "Likely infrastructure/transient failure" | "Unknown failure class";
  confidence: "high" | "medium" | "low";
  summary: string;
  recommendedResponse: string;
}

function classifyPipelineFailure(
  timeline?: Awaited<ReturnType<typeof getAzureBuildTimeline>>,
  logExcerpts?: PipelineLogExcerpt[],
  timelineError?: string,
): PipelineFailureClassification {
  const evidence = pipelineFailureEvidenceText(timeline, logExcerpts, timelineError);
  const infraScore = scorePatterns(evidence, INFRA_FAILURE_PATTERNS);
  const sourceScore = scorePatterns(evidence, SOURCE_FAILURE_PATTERNS);

  if (infraScore > 0 && infraScore >= sourceScore + 1) {
    return {
      label: "Likely infrastructure/transient failure",
      confidence: infraScore >= 3 ? "high" : "medium",
      summary: "The strongest evidence points to agent, network, service availability, or transient dependency failure rather than a deterministic source change.",
      recommendedResponse: "Prefer inspecting service health and preparing a rerun approval before proposing code changes.",
    };
  }

  if (sourceScore > 0 && sourceScore >= infraScore) {
    return {
      label: "Likely source/configuration failure",
      confidence: sourceScore >= 3 ? "high" : "medium",
      summary: "The strongest evidence points to build, test, publish, missing-file, or project configuration failure that should be investigated in the repository.",
      recommendedResponse: "Inspect the referenced files/configuration and run focused local validation before committing a fix.",
    };
  }

  return {
    label: "Unknown failure class",
    confidence: "low",
    summary: "The available timeline/log evidence is not specific enough to distinguish code/configuration failure from infrastructure failure.",
    recommendedResponse: "Inspect the full failed task logs before deciding whether to rerun the pipeline or change code.",
  };
}

function pipelineFailureEvidenceText(
  timeline?: Awaited<ReturnType<typeof getAzureBuildTimeline>>,
  logExcerpts?: PipelineLogExcerpt[],
  timelineError?: string,
): string {
  return [
    timelineError ?? "",
    ...(timeline?.failedRecords ?? []).flatMap((record) => [
      record.name,
      record.type,
      record.result,
      ...record.issues.map((issue) => `${issue.category ?? ""} ${issue.type ?? ""} ${issue.message ?? ""}`),
    ]),
    ...(timeline?.errorIssues ?? []).map((issue) => `${issue.category ?? ""} ${issue.type ?? ""} ${issue.message ?? ""}`),
    ...(logExcerpts ?? []).map((log) => log.excerpt),
  ].filter(Boolean).join("\n").toLowerCase();
}

function scorePatterns(evidence: string, patterns: RegExp[]): number {
  return patterns.reduce((score, pattern) => score + (pattern.test(evidence) ? 1 : 0), 0);
}

const INFRA_FAILURE_PATTERNS = [
  /\b(agent|hosted agent|runner|worker)\b.{0,80}\b(lost|offline|unavailable|failed to start|shutdown|terminated)\b/i,
  /\b(connection|network|socket|tls|ssl|dns)\b.{0,80}\b(timeout|timed out|reset|refused|unavailable|failure|failed)\b/i,
  /\b(econnreset|etimedout|enotfound|eai_again|socket hang up|tls handshake|service unavailable|503|504|gateway timeout)\b/i,
  /\b(rate limit|too many requests|throttl|temporar(?:y|ily) unavailable|transient)\b/i,
  /\b(nuget|npm|pip|package feed|artifact feed)\b.{0,80}\b(timeout|unavailable|503|504|temporar(?:y|ily)|network)\b/i,
];

const SOURCE_FAILURE_PATTERNS = [
  /\b(test|tests|unit test|integration test|assertion|expect(?:ed)?|actual)\b.{0,80}\b(fail|failed|failure|error)\b/i,
  /\b(compile|compilation|syntax|typecheck|typescript|eslint|msbuild|vsbuild|build)\b.{0,80}\b(error|failed|failure)\b/i,
  /\b(file not found|could not find file|missing file|no such file|cannot find module|module not found)\b/i,
  /\b(publishing\.targets|\.csproj|web\.config|package\.json|tsconfig|project configuration)\b/i,
  /\b(exception|traceback|stack trace|nullreference|argumentexception)\b/i,
];
