import { TableClient, odata, type TableEntity } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";

const REVIEW_HISTORY_TABLE = "ReviewHistory";

export interface ReviewQueueItem {
  repository: string;
  pullRequestId: number;
  lastIterationId: number;
  findingCount: number;
  lastRunAt: string;
  sourceCommit: string;
  decisionQueue: "auto_approved" | "needs_human_review" | "blocked" | "watching";
  decisionRiskLevel: "low" | "medium" | "high";
  decisionReason: string;
  autoApprovedAt: string;
  autoApprovalActor: string;
}

type ReviewHistoryEntity = {
  partitionKey: string;
  rowKey: string;
  lastIterationId?: number;
  findingCount?: number;
  lastRunAt?: string;
  sourceCommit?: string;
  decisionQueue?: string;
  decisionRiskLevel?: string;
  decisionReason?: string;
  autoApprovedAt?: string;
  autoApprovalActor?: string;
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

  const client = new TableClient(tableUrl(storageAccount), REVIEW_HISTORY_TABLE, new DefaultAzureCredential());
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
  return items.sort((a, b) => Date.parse(b.lastRunAt || "0") - Date.parse(a.lastRunAt || "0"));
}

function entityToQueueItem(entity: TableEntity<ReviewHistoryEntity>): ReviewQueueItem {
  return {
    repository: entity.partitionKey,
    pullRequestId: Number(entity.rowKey ?? 0),
    lastIterationId: Number(entity.lastIterationId ?? 0),
    findingCount: Number(entity.findingCount ?? 0),
    lastRunAt: String(entity.lastRunAt ?? ""),
    sourceCommit: String(entity.sourceCommit ?? ""),
    decisionQueue: normalizeQueue(entity.decisionQueue),
    decisionRiskLevel: normalizeRisk(entity.decisionRiskLevel),
    decisionReason: String(entity.decisionReason ?? ""),
    autoApprovedAt: String(entity.autoApprovedAt ?? ""),
    autoApprovalActor: String(entity.autoApprovalActor ?? ""),
  };
}

function normalizeQueue(value: unknown): ReviewQueueItem["decisionQueue"] {
  if (value === "auto_approved" || value === "needs_human_review" || value === "blocked" || value === "watching") {
    return value;
  }
  return "needs_human_review";
}

function normalizeRisk(value: unknown): ReviewQueueItem["decisionRiskLevel"] {
  if (value === "low" || value === "medium" || value === "high") return value;
  return "medium";
}
