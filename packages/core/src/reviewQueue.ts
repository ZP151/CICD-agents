import { TableClient, odata, type TableEntity } from "@azure/data-tables";
import { entityToQueueItem, type ReviewHistoryEntity } from "./reviewQueueEntity.js";
import type { ReviewQueueItem, ReviewQueuePriority } from "./reviewQueueTypes.js";
import { STORAGE_SCOPE } from "./store/azureAuthConfig.js";
import { getAzureCachedScopeCredential } from "./store/azureAuthCredential.js";

export type {
  ReviewDispositionEvent,
  ReviewQueueItem,
  ReviewQueuePriority,
  ReviewWriteBackEvent,
} from "./reviewQueueTypes.js";

const REVIEW_HISTORY_TABLE = "ReviewHistory";

const queuePriority: Record<ReviewQueueItem["decisionQueue"], number> = {
  blocked: 4000,
  needs_human_review: 3000,
  watching: 2000,
  auto_approved: 1000,
};

const riskPriority: Record<ReviewQueueItem["decisionRiskLevel"], number> = {
  high: 300,
  medium: 200,
  low: 100,
};

function tableUrl(accountName: string): string {
  return `https://${accountName}.table.core.windows.net`;
}

export async function listReviewQueueItems(args: {
  storageAccount: string;
  repository: string;
  limit?: number;
}): Promise<ReviewQueueItem[]> {
  const storageAccount = args.storageAccount.trim();
  const repository = args.repository.trim();
  if (!storageAccount || !repository) return [];

  const client = new TableClient(tableUrl(storageAccount), REVIEW_HISTORY_TABLE, getAzureCachedScopeCredential(STORAGE_SCOPE));
  const items: ReviewQueueItem[] = [];
  try {
    const iter = client.listEntities<TableEntity<ReviewHistoryEntity>>({
      queryOptions: { filter: odata`PartitionKey eq ${repository}` },
    });
    for await (const entity of iter) {
      items.push(entityToQueueItem(entity));
      if (args.limit && items.length >= args.limit) break;
    }
  } catch (err: unknown) {
    if ((err as { statusCode?: number })?.statusCode === 404) return [];
    throw err;
  }
  return items.sort(compareReviewQueueItems);
}

export function reviewQueuePriorityScore(item: ReviewQueueItem): number {
  return getReviewQueuePriority(item).score;
}

export function getReviewQueuePriority(item: ReviewQueueItem): ReviewQueuePriority {
  const reasons: string[] = [];
  if (item.decisionQueue === "blocked") reasons.push("blocked queue");
  if (item.decisionQueue === "needs_human_review") reasons.push("needs human review");
  if (item.decisionRiskLevel === "high") reasons.push("high risk");
  if (item.decisionRiskLevel === "medium") reasons.push("medium risk");
  for (const code of item.decisionReasonCodes) reasons.push(code.replace(/[._]/g, " "));
  if (item.findingCount > 0) reasons.push(`${item.findingCount} finding(s)`);
  if (item.discardedFindingCount > 0) reasons.push(`${item.discardedFindingCount} discarded finding(s)`);
  if (item.wholeFileFallbackFiles > 0) reasons.push(`${item.wholeFileFallbackFiles} whole-file fallback file(s)`);
  if (item.hunkCoverageFiles === 0 && item.wholeFileFallbackFiles > 0) reasons.push("no hunk coverage");

  const score =
    queuePriority[item.decisionQueue] +
    riskPriority[item.decisionRiskLevel] +
    item.findingCount * 10 +
    item.discardedFindingCount * 12 +
    item.wholeFileFallbackFiles * 35 +
    (item.hunkCoverageFiles === 0 && item.wholeFileFallbackFiles > 0 ? 50 : 0);

  return { score, reasons };
}

export function compareReviewQueueItems(a: ReviewQueueItem, b: ReviewQueueItem): number {
  const priorityDelta = reviewQueuePriorityScore(b) - reviewQueuePriorityScore(a);
  if (priorityDelta !== 0) return priorityDelta;
  return Date.parse(b.lastRunAt || "0") - Date.parse(a.lastRunAt || "0");
}
