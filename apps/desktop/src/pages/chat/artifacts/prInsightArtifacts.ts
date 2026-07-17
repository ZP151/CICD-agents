import type { PrInsightArtifactRecord } from "../../../api.js";
import type { SavedPrInsightSource } from "../chat.types.js";

export function prInsightArtifactTitle(source: SavedPrInsightSource): string {
  return `PR #${source.pullRequestId} ${source.kind.replace(/_/g, " ")} insight`;
}

function prInsightArtifactSignalDetails(record: PrInsightArtifactRecord): string[] {
  const signals = record.signals;
  if (!signals) return [];
  const details: string[] = [];
  if (signals.buildBlockers?.length) {
    details.push(
      "### Build blockers",
      "",
      ...signals.buildBlockers.slice(0, 10).map((build) => {
        const id = build.id ? `#${build.id}` : "build";
        const buildNumber = build.buildNumber && build.buildNumber !== String(build.id) ? ` ${build.buildNumber}` : "";
        const definition = build.definitionName ? ` ${build.definitionName}` : "";
        const result = build.result || build.status || "Not available";
        return `- ${id}${buildNumber}${definition}: ${result}${build.url ? ` (${build.url})` : ""}`;
      }),
      "",
    );
  }
  if (signals.policyBlockers?.length) {
    details.push(
      "### Policy blockers",
      "",
      ...signals.policyBlockers.slice(0, 10).map((policy) =>
        `- ${policy.name || policy.typeName || policy.id || "policy"}: ${policy.status}${policy.isBlocking ? " (blocking)" : ""}`
      ),
      "",
    );
  }
  if (signals.activeThreads?.length) {
    details.push(
      "### Active threads",
      "",
      ...signals.activeThreads.slice(0, 10).map((thread) =>
        `- #${thread.id}${thread.author ? ` ${thread.author}` : ""}: ${thread.firstComment || "active discussion"}`
      ),
      "",
    );
  }
  if (signals.linkedWorkItems?.length) {
    details.push(
      "### Linked work items",
      "",
      ...signals.linkedWorkItems.slice(0, 10).map((workItem) =>
        `- #${workItem.id} ${workItem.type}${workItem.state ? ` [${workItem.state}]` : ""}: ${workItem.title || "untitled"}${workItem.url ? ` (${workItem.url})` : ""}`
      ),
      "",
    );
  }
  return details;
}

export function prInsightArtifactRecordToMarkdown(record: PrInsightArtifactRecord): string {
  const lines = [
    `## ${record.title || `PR #${record.pullRequestId} insight`}`,
    "",
    record.summary || "No summary saved.",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Repository | ${record.repository} |`,
    `| Pull request | #${record.pullRequestId} |`,
    `| Kind | ${record.kind.replace(/_/g, " ")} |`,
    `| Saved | ${record.at} |`,
    `| Readiness | ${record.readiness ?? "Not available"} |`,
    `| Decision queue | ${record.decisionQueue ?? "Not available"} |`,
    `| Risk | ${record.decisionRiskLevel ?? "Not available"} |`,
    `| Confidence | ${record.contextConfidence || "Not available"} |`,
  ];

  if (record.signals) {
    lines.push(
      "",
      "### Signals",
      "",
      `- Files: ${record.signals.fileCount}`,
      `- Threads: ${record.signals.threadCount}`,
      `- Failed builds: ${record.signals.failedBuildCount}`,
      `- Failed policies: ${record.signals.failedPolicyCount ?? 0}`,
      `- Work items: ${record.signals.workItemCount}`,
    );
    lines.push("", ...prInsightArtifactSignalDetails(record).filter((line, index, arr) => !(line === "" && arr[index - 1] === "")));
  }

  if (record.risks.length > 0) {
    lines.push("", "### Risks", "", ...record.risks.map((risk) => `- ${risk}`));
  }

  lines.push("", `Tokens: ${record.tokensIn}/${record.tokensOut}`);
  return lines.join("\n");
}
