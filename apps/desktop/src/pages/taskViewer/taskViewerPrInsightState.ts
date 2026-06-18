import { comparePrInsightArtifacts, prInsightArtifactProjectLinkId } from "../../prInsightArtifacts.js";
import type { PrInsightArtifactHistoryMeta, PrInsightArtifactRecord } from "../../api.js";
import {
  comparePrInsightRefresh,
  type PrInsightActivityItem,
} from "./prInsightActivity.js";

export function buildPrInsightHistoryMeta(
  prInsightActivity: PrInsightActivityItem[],
  prInsightHistory: PrInsightArtifactHistoryMeta[],
): Map<string, { index: number; total: number; latest: boolean }> {
  if (prInsightHistory.length > 0) {
    const fromBackend = new Map<string, { index: number; total: number; latest: boolean }>();
    for (const item of prInsightHistory) {
      fromBackend.set(item.artifactId, {
        index: item.index,
        total: item.total,
        latest: item.latest,
      });
    }
    return fromBackend;
  }
  const groups = new Map<string, PrInsightActivityItem[]>();
  for (const event of prInsightActivity) {
    const key = `${prInsightArtifactProjectLinkId(event)}/${event.repository}/${event.pullRequestId}/${event.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  const meta = new Map<string, { index: number; total: number; latest: boolean }>();
  for (const events of groups.values()) {
    const sorted = [...events].sort((a, b) => Date.parse(b.at || "0") - Date.parse(a.at || "0"));
    sorted.forEach((event, index) => {
      meta.set(event.id, { index, total: sorted.length, latest: index === 0 });
    });
  }
  return meta;
}

export function buildSelectedPrInsightComparison(
  prInsightActivity: PrInsightActivityItem[],
  selectedPrInsight: PrInsightActivityItem | null,
) {
  if (!selectedPrInsight) return null;
  const selectedProjectLinkId = prInsightArtifactProjectLinkId(selectedPrInsight);
  const siblings = prInsightActivity.filter(
    (event) =>
      prInsightArtifactProjectLinkId(event) === selectedProjectLinkId &&
      event.repository === selectedPrInsight.repository &&
      event.pullRequestId === selectedPrInsight.pullRequestId,
  );
  const preview = siblings.find((event) => event.kind === "insight_preview") ?? null;
  const review = siblings.find((event) => event.kind === "review_run") ?? null;
  return comparePrInsightArtifacts(preview, review);
}

export function buildSelectedPrInsightRefreshComparison(
  prInsightActivity: PrInsightActivityItem[],
  selectedPrInsight: PrInsightActivityItem | null,
) {
  if (!selectedPrInsight) return null;
  const selectedAt = Date.parse(selectedPrInsight.at || "0");
  const selectedProjectLinkId = prInsightArtifactProjectLinkId(selectedPrInsight);
  const previous =
    prInsightActivity
      .filter(
        (event) =>
          event.id !== selectedPrInsight.id &&
          prInsightArtifactProjectLinkId(event) === selectedProjectLinkId &&
          event.repository === selectedPrInsight.repository &&
          event.pullRequestId === selectedPrInsight.pullRequestId &&
          event.kind === selectedPrInsight.kind &&
          Date.parse(event.at || "0") < selectedAt,
      )
      .sort((a, b) => Date.parse(b.at || "0") - Date.parse(a.at || "0"))[0] ?? null;
  return comparePrInsightRefresh(selectedPrInsight, previous);
}

export function filterPrInsightActivity(
  prInsightActivity: PrInsightActivityItem[],
  projectLinkFilter: string,
  kindFilter: PrInsightArtifactRecord["kind"] | "all",
): PrInsightActivityItem[] {
  return prInsightActivity.filter((event) => {
    if (projectLinkFilter !== "all" && prInsightArtifactProjectLinkId(event) !== projectLinkFilter)
      return false;
    if (kindFilter !== "all" && event.kind !== kindFilter) return false;
    return true;
  });
}
