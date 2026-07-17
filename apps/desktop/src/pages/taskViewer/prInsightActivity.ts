import type { PrInsightArtifactRecord } from "../../api.js";
import { prInsightArtifactProjectLinkId } from "../../prInsightArtifacts.js";

export interface PrInsightActivityItem extends PrInsightArtifactRecord {
  projectLinkName: string;
  repoPath: string;
}

export interface PrInsightRefreshComparison {
  previousId: string;
  previousAt: string;
  readinessChanged: boolean;
  previousReadiness?: PrInsightArtifactRecord["readiness"];
  currentReadiness?: PrInsightArtifactRecord["readiness"];
  addedRisks: string[];
  resolvedRisks: string[];
  findingCountDelta: number | null;
  tokenDelta: number;
}

export interface PrInsightBlockerDetailGroup {
  label: string;
  values: string[];
}

export function comparePrInsightRefresh(
  current: PrInsightActivityItem,
  previous: PrInsightActivityItem | null | undefined,
): PrInsightRefreshComparison | null {
  if (!previous) return null;
  if (prInsightArtifactProjectLinkId(current) !== prInsightArtifactProjectLinkId(previous)) return null;
  if (current.repository !== previous.repository) return null;
  if (current.pullRequestId !== previous.pullRequestId) return null;
  if (current.kind !== previous.kind) return null;
  const previousRisks = new Set(previous.risks);
  const currentRisks = new Set(current.risks);
  return {
    previousId: previous.id,
    previousAt: previous.at,
    readinessChanged: previous.readiness !== current.readiness,
    previousReadiness: previous.readiness,
    currentReadiness: current.readiness,
    addedRisks: current.risks.filter((risk) => !previousRisks.has(risk)),
    resolvedRisks: previous.risks.filter((risk) => !currentRisks.has(risk)),
    findingCountDelta:
      typeof current.findingCount === "number" && typeof previous.findingCount === "number"
        ? current.findingCount - previous.findingCount
        : null,
    tokenDelta: current.tokensIn + current.tokensOut - (previous.tokensIn + previous.tokensOut),
  };
}

export function prInsightBlockerDetails(
  item: PrInsightArtifactRecord,
): PrInsightBlockerDetailGroup[] {
  const signals = item.signals;
  if (!signals) return [];
  const details: PrInsightBlockerDetailGroup[] = [];
  if (signals.buildBlockers?.length) {
    details.push({
      label: "Build blockers",
      values: signals.buildBlockers.slice(0, 5).map((build) => {
        const id = build.id ? `#${build.id}` : "build";
        const number =
          build.buildNumber && build.buildNumber !== String(build.id)
            ? ` ${build.buildNumber}`
            : "";
        const definition = build.definitionName ? ` ${build.definitionName}` : "";
        const result = build.result || build.status || "not available";
        return `${id}${number}${definition}: ${result}`;
      }),
    });
  }
  if (signals.policyBlockers?.length) {
    details.push({
      label: "Policy blockers",
      values: signals.policyBlockers
        .slice(0, 5)
        .map(
          (policy) =>
            `${policy.name || policy.typeName || policy.id || "policy"}: ${policy.status}${
              policy.isBlocking ? " (blocking)" : ""
            }`,
        ),
    });
  }
  if (signals.activeThreads?.length) {
    details.push({
      label: "Active threads",
      values: signals.activeThreads
        .slice(0, 5)
        .map(
          (thread) =>
            `#${thread.id}${thread.author ? ` ${thread.author}` : ""}: ${thread.firstComment || "active discussion"}`,
        ),
    });
  }
  if (signals.linkedWorkItems?.length) {
    details.push({
      label: "Linked work items",
      values: signals.linkedWorkItems
        .slice(0, 5)
        .map(
          (workItem) =>
            `#${workItem.id} ${workItem.type}${workItem.state ? ` [${workItem.state}]` : ""}: ${workItem.title || "untitled"}`,
        ),
    });
  }
  return details;
}
