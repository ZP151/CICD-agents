import {
  listLocalPrInsightArtifacts,
  type ChatPlannerResult,
  type PrInsightArtifactRecord,
} from "@mergepilot/core";

export interface PrInsightContextBundle {
  prompt?: string;
  notes: string[];
  artifactIds: string[];
}

export function extractPullRequestIdFromMessage(message: string): number | undefined {
  const patterns = [
    /\bPR\s*#?\s*(\d{1,8})\b/i,
    /\bpull\s+request\s*#?\s*(\d{1,8})\b/i,
    /#(\d{1,8})\b/,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match?.[1]) continue;
    const id = Number(match[1]);
    if (Number.isInteger(id) && id >= 0) return id;
  }
  return undefined;
}

export function extractPrInsightArtifactIdFromMessage(message: string): string | undefined {
  const match = message.match(/\bartifact(?:\s+id)?\s+([^\s]+)/i);
  const raw = match?.[1]?.trim();
  if (!raw) return undefined;
  return raw.replace(/[),.;:]+$/g, "");
}

export function formatPrInsightArtifactsForChat(artifacts: PrInsightArtifactRecord[]): string | undefined {
  if (artifacts.length === 0) return undefined;
  const lines = [
    "\n## PR Readiness Context",
    "Use this compact readiness context together with validation artifacts, policy/work item workflow results, and live ADO tools when the user asks if a PR is ready.",
    ...prReadinessContextLines(artifacts),
    "",
    "\n## Saved PR AI Insights",
    "Use these saved AI conclusions as context. Do not rerun analysis unless the user asks for a fresh result.",
  ];
  for (const artifact of artifacts.slice(0, 3)) {
    lines.push(
      `- PR #${artifact.pullRequestId} (${artifact.kind === "review_run" ? "full review" : "preview"}) at ${artifact.at}`,
      `  - Artifact id: ${artifact.id}`,
      `  - Title: ${artifact.title || "(untitled)"}`,
      `  - Summary: ${truncateStr(artifact.summary || "No summary saved.", 500)}`,
    );
    if (artifact.readiness) lines.push(`  - Readiness: ${artifact.readiness}`);
    if (artifact.decisionQueue || artifact.decisionRiskLevel || artifact.contextConfidence) {
      lines.push([
        "  - Decision:",
        artifact.decisionQueue ? `queue=${artifact.decisionQueue}` : "",
        artifact.decisionRiskLevel ? `risk=${artifact.decisionRiskLevel}` : "",
        artifact.contextConfidence ? `confidence=${artifact.contextConfidence}` : "",
      ].filter(Boolean).join(" "));
    }
    if (typeof artifact.findingCount === "number") {
      lines.push(`  - Findings: ${artifact.findingCount}; discarded=${artifact.discardedFindingCount ?? 0}`);
    }
    if (artifact.signals) {
      lines.push(`  - Signals: files=${artifact.signals.fileCount}; threads=${artifact.signals.threadCount}; failedBuilds=${artifact.signals.failedBuildCount}; failedPolicies=${artifact.signals.failedPolicyCount ?? 0}; workItems=${artifact.signals.workItemCount}`);
      lines.push(...prArtifactStructuredSignalLines(artifact).map((line) => `  - ${line}`));
    }
    if (artifact.risks.length > 0) {
      lines.push(`  - Risks: ${artifact.risks.slice(0, 8).join("; ")}`);
    }
    lines.push(`  - Tokens: ${artifact.tokensIn}/${artifact.tokensOut}`);
  }
  return lines.join("\n");
}

export function formatValidationArtifactsForChat(
  bubbles: Array<{ role: string; artifacts?: ChatPlannerResult["artifacts"] }>,
  message: string,
): string | undefined {
  if (!wantsValidationArtifactContext(message)) return undefined;
  const latest = [...bubbles]
    .reverse()
    .flatMap((bubble) => bubble.role === "assistant" ? bubble.artifacts ?? [] : [])
    .find((artifact) =>
      artifact.status === "error" &&
      artifact.artifactType === "markdown" &&
      artifact.artifactId.startsWith("validation-")
    );
  if (!latest) return undefined;

  const lines = [
    "\n## Validation Recovery Guidance",
    "Planner priority: use the Recovery Signals from the latest failed validation before choosing any follow-up action.",
    "- For analyze/fix requests: inspect the listed failing files, failing tests, and diagnostics first with read-only tools before proposing changes.",
    "- For retry/rerun requests: prefer the listed Candidate rerun command or an equivalent focused validation action over a broad full-suite rerun.",
    "- For PR/CI readiness requests: combine this validation failure with saved PR AI insights, policy status, linked work items, builds, and review history before recommending approval or merge readiness.",
    "- Do not repeat the exact failed command with the same arguments unless no focused candidate exists or the user explicitly asks for the full command.",
    "- Keep source edits, staging, commits, pushes, pipeline triggers, and other write actions behind the normal approval_proposal flow.",
    "",
    "\n## Latest Validation Failure Artifact",
    "Use this saved validation artifact as context before suggesting fixes or reruns. Do not rerun validation unless the user explicitly asks for a rerun or chooses a rerun action.",
    `- Artifact id: ${latest.artifactId}`,
    `- Title: ${latest.title}`,
    `- Status: ${latest.status}`,
    "",
    truncateStr(latest.content ?? "No validation artifact content was captured.", 6000),
  ];
  return lines.join("\n");
}

export function formatPipelineFailureArtifactsForChat(
  bubbles: Array<{ role: string; artifacts?: ChatPlannerResult["artifacts"] }>,
  message: string,
): string | undefined {
  const pipelineIntent = /\b(pipeline|ci|build|failure|failed|failing|rerun|re-run|retry|logs?|task|timeline)\b/i;
  if (!pipelineIntent.test(message) && !wantsPrCiReadinessContext(message)) return undefined;
  const latest = [...bubbles]
    .reverse()
    .flatMap((bubble) => bubble.role === "assistant" ? bubble.artifacts ?? [] : [])
    .find((artifact) =>
      artifact.status === "error" &&
      artifact.artifactType === "markdown" &&
      artifact.artifactId.startsWith("pipeline-")
    );
  if (!latest) return undefined;

  const lines = [
    "\n## Azure Pipeline Failure Artifact",
    "Use this saved remote CI/CD artifact before suggesting fixes, local validation, or pipeline reruns. Do not treat it as a local test failure unless the failed task or issue clearly maps to a local command.",
    `- Artifact id: ${latest.artifactId}`,
    `- Title: ${latest.title}`,
    `- Status: ${latest.status}`,
    "",
    truncateStr(latest.content ?? "No pipeline failure artifact content was captured.", 6000),
  ];
  return lines.join("\n");
}

export function buildPrInsightContextBundle(args: {
  dataDir: string;
  message: string;
  projectLinkId?: string;
  repository?: string;
}): PrInsightContextBundle {
  if (!args.projectLinkId || !args.repository?.trim()) return { notes: [], artifactIds: [] };
  if (!wantsPrInsightContext(args.message)) return { notes: [], artifactIds: [] };
  const artifactId = extractPrInsightArtifactIdFromMessage(args.message);
  const pullRequestId = extractPullRequestIdFromMessage(args.message);
  const candidates = listLocalPrInsightArtifacts({
    dataDir: args.dataDir,
    projectLinkId: args.projectLinkId,
    repository: args.repository.trim(),
    pullRequestId,
    limit: artifactId ? 100 : pullRequestId === undefined ? 3 : 2,
  });
  const artifacts = artifactId
    ? candidates.filter((artifact) => artifact.id === artifactId).slice(0, 1)
    : candidates;
  const prompt = formatPrInsightArtifactsForChat(artifacts);
  if (!prompt) return { notes: [], artifactIds: [] };
  return {
    prompt,
    artifactIds: artifacts.map((artifact) => artifact.id),
    notes: artifacts.map((artifact) => (
      `Used saved PR AI insight artifact ${artifact.id} for PR #${artifact.pullRequestId} (${artifact.kind}, ${artifact.at}).`
    )),
  };
}

export function buildPrInsightContextPrompt(args: {
  dataDir: string;
  message: string;
  projectLinkId?: string;
  repository?: string;
}): string | undefined {
  return buildPrInsightContextBundle(args).prompt;
}

function wantsPrInsightContext(message: string): boolean {
  return /\b(pr|pull request|review|insight|finding|risk|approval|approve|blocked|artifact|readiness|ready|policy|policies|work item|workitem|ci|pipeline)\b/i.test(message);
}

function prReadinessContextLines(artifacts: PrInsightArtifactRecord[]): string[] {
  return artifacts.slice(0, 3).map((artifact) => {
    const signals = artifact.signals
      ? `files=${artifact.signals.fileCount}, threads=${artifact.signals.threadCount}, failedBuilds=${artifact.signals.failedBuildCount}, failedPolicies=${artifact.signals.failedPolicyCount ?? 0}, workItems=${artifact.signals.workItemCount}`
      : "signals=not saved";
    const decision = [
      artifact.decisionQueue ? `queue=${artifact.decisionQueue}` : "",
      artifact.decisionRiskLevel ? `risk=${artifact.decisionRiskLevel}` : "",
      artifact.contextConfidence ? `confidence=${artifact.contextConfidence}` : "",
    ].filter(Boolean).join(", ");
    const blockers = [
      ...(artifact.categories?.blocking ?? []),
      ...artifact.risks.slice(0, 3),
    ].slice(0, 4);
    const exactBlockers = prArtifactStructuredSignalLines(artifact)
      .map((line) => line.replace(/^[^:]+:\s*/, ""))
      .slice(0, 4);
    return [
      `- PR #${artifact.pullRequestId}: readiness=${artifact.readiness ?? "not available"}`,
      decision ? `; ${decision}` : "",
      `; ${signals}`,
      blockers.length ? `; blockers/risks=${blockers.join(" | ")}` : "",
      exactBlockers.length ? `; exact=${exactBlockers.join(" | ")}` : "",
      `.`,
    ].join("");
  });
}

function prArtifactStructuredSignalLines(artifact: PrInsightArtifactRecord): string[] {
  const signals = artifact.signals;
  if (!signals) return [];
  const lines: string[] = [];
  if (signals.buildBlockers?.length) {
    lines.push(`Build blockers: ${signals.buildBlockers.slice(0, 5).map((build) => {
      const id = build.id ? `#${build.id}` : "build";
      const number = build.buildNumber && build.buildNumber !== String(build.id) ? ` ${build.buildNumber}` : "";
      const definition = build.definitionName ? ` ${truncateStr(build.definitionName, 48)}` : "";
      const result = build.result || build.status || "not available";
      return `${id}${number}${definition}: ${result}`;
    }).join("; ")}`);
  }
  if (signals.policyBlockers?.length) {
    lines.push(`Policy blockers: ${signals.policyBlockers.slice(0, 5).map((policy) =>
      `${truncateStr(policy.name || policy.typeName || policy.id || "policy", 72)}: ${policy.status}${policy.isBlocking ? " (blocking)" : ""}`
    ).join("; ")}`);
  }
  if (signals.activeThreads?.length) {
    lines.push(`Active threads: ${signals.activeThreads.slice(0, 5).map((thread) =>
      `#${thread.id}${thread.author ? ` ${thread.author}` : ""}: ${truncateStr(thread.firstComment || "active discussion", 96)}`
    ).join("; ")}`);
  }
  if (signals.linkedWorkItems?.length) {
    lines.push(`Linked work items: ${signals.linkedWorkItems.slice(0, 5).map((item) =>
      `#${item.id} ${item.type}${item.state ? ` [${item.state}]` : ""}: ${truncateStr(item.title || "untitled", 96)}`
    ).join("; ")}`);
  }
  return lines;
}

function wantsValidationArtifactContext(message: string): boolean {
  const validationIntent = /\b(validation|test|tests|build|failure|failed|failing|error|rerun|re-run|retry|fix|analyze|analyse)\b/i;
  if (validationIntent.test(message)) return true;
  return wantsPrCiReadinessContext(message);
}

function wantsPrCiReadinessContext(message: string): boolean {
  const readinessSignal = /\b(readiness|ready|approval|approve|blocked|blocker|merge|policy|policies|ci|pipeline|work item|workitem|review queue)\b/i;
  const prSignal = /\b(pr|pull request)\b/i;
  return prSignal.test(message) && readinessSignal.test(message);
}

function truncateStr(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 3)}...`;
}
