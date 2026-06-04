import { TableClient, type TableEntity } from "@azure/data-tables";
import {
  listLocalReviewHistory,
  upsertLocalReviewHistory,
  type ReviewHistoryRecord,
} from "@cicd-agent/core";

export interface ReviewHistoryRow {
  partitionKey: string;
  rowKey: string;
  lastIterationId: number;
  findingCount: number;
  lastRunAt: string;
  lastTokensIn: number;
  lastTokensOut: number;
  sourceCommit?: string;
  decisionQueue?: string;
  decisionRiskLevel?: string;
  decisionReason?: string;
  autoApprovedAt?: string;
  autoApprovalActor?: string;
}

export interface ConventionRow {
  partitionKey: string;
  rowKey: string;
  scope: string;
  text: string;
  severity: string;
}

export interface StateStore {
  getHistory(repo: string, prId: number): Promise<ReviewHistoryRow | null>;
  upsertHistory(row: ReviewHistoryRow): Promise<void>;
  listConventions(repo: string): Promise<string[]>;
  upsertConvention(row: ConventionRow): Promise<void>;
}

const HISTORY_TABLE = "ReviewHistory";
const CONVENTIONS_TABLE = "Conventions";

export class TableStateStore implements StateStore {
  private readonly history: TableClient;
  private readonly conventions: TableClient;

  constructor(connectionString: string) {
    this.history = TableClient.fromConnectionString(connectionString, HISTORY_TABLE);
    this.conventions = TableClient.fromConnectionString(connectionString, CONVENTIONS_TABLE);
  }

  async ensureTables(): Promise<void> {
    await this.history.createTable();
    await this.conventions.createTable();
  }

  async getHistory(repo: string, prId: number): Promise<ReviewHistoryRow | null> {
    try {
      const entity = (await this.history.getEntity(repo, String(prId))) as TableEntity<ReviewHistoryRow>;
      return {
        partitionKey: entity.partitionKey,
        rowKey: entity.rowKey,
        lastIterationId: entity.lastIterationId ?? 0,
        findingCount: entity.findingCount ?? 0,
        lastRunAt: entity.lastRunAt ?? "",
        lastTokensIn: entity.lastTokensIn ?? 0,
        lastTokensOut: entity.lastTokensOut ?? 0,
        sourceCommit: entity.sourceCommit ? String(entity.sourceCommit) : "",
        decisionQueue: entity.decisionQueue ? String(entity.decisionQueue) : "",
        decisionRiskLevel: entity.decisionRiskLevel ? String(entity.decisionRiskLevel) : "",
        decisionReason: entity.decisionReason ? String(entity.decisionReason) : "",
        autoApprovedAt: entity.autoApprovedAt ? String(entity.autoApprovedAt) : "",
        autoApprovalActor: entity.autoApprovalActor ? String(entity.autoApprovalActor) : "",
      };
    } catch (err: unknown) {
      const e = err as { statusCode?: number };
      if (e.statusCode === 404) return null;
      throw err;
    }
  }

  async upsertHistory(row: ReviewHistoryRow): Promise<void> {
    await this.history.upsertEntity({ ...row, partitionKey: row.partitionKey, rowKey: row.rowKey }, "Replace");
  }

  async listConventions(repo: string): Promise<string[]> {
    const out: string[] = [];
    try {
      const iter = this.conventions.listEntities<TableEntity<ConventionRow>>({
        queryOptions: { filter: `PartitionKey eq '${escape(repo)}'` },
      });
      for await (const ent of iter) {
        if (ent.text) out.push(String(ent.text));
      }
    } catch {
      // ignored
    }
    return out;
  }

  async upsertConvention(row: ConventionRow): Promise<void> {
    await this.conventions.upsertEntity({ ...row }, "Replace");
  }
}

function escape(value: string): string {
  return value.replace(/'/g, "''");
}

/** File-backed store at `<dataDir>/review-history.json` (daemon/desktop local mode). */
export class FileStateStore implements StateStore {
  constructor(private readonly dataDir: string) {}

  async getHistory(repo: string, prId: number): Promise<ReviewHistoryRow | null> {
    const items = listLocalReviewHistory({ dataDir: this.dataDir, repository: repo, limit: 10_000 });
    const match = items.find((item) => item.pullRequestId === prId);
    if (!match) return null;
    return {
      partitionKey: match.repository,
      rowKey: String(match.pullRequestId),
      lastIterationId: match.lastIterationId,
      findingCount: match.findingCount,
      lastRunAt: match.lastRunAt,
      lastTokensIn: 0,
      lastTokensOut: 0,
      sourceCommit: match.sourceCommit,
      decisionQueue: match.decisionQueue,
      decisionRiskLevel: match.decisionRiskLevel,
      decisionReason: match.decisionReason,
      autoApprovedAt: match.autoApprovedAt,
      autoApprovalActor: match.autoApprovalActor,
    };
  }

  async upsertHistory(row: ReviewHistoryRow): Promise<void> {
    const record: ReviewHistoryRecord = {
      repository: row.partitionKey,
      pullRequestId: Number(row.rowKey),
      lastIterationId: row.lastIterationId,
      findingCount: row.findingCount,
      lastRunAt: row.lastRunAt,
      sourceCommit: row.sourceCommit ?? "",
      decisionQueue: normalizeQueue(row.decisionQueue),
      decisionRiskLevel: normalizeRisk(row.decisionRiskLevel),
      decisionReason: row.decisionReason ?? "",
      autoApprovedAt: row.autoApprovedAt ?? "",
      autoApprovalActor: row.autoApprovalActor ?? "",
      lastTokensIn: row.lastTokensIn,
      lastTokensOut: row.lastTokensOut,
    };
    upsertLocalReviewHistory(this.dataDir, record);
  }

  async listConventions(_repo: string): Promise<string[]> {
    return [];
  }

  async upsertConvention(row: ConventionRow): Promise<void> {
    void row;
  }
}

function normalizeQueue(value: unknown): ReviewHistoryRecord["decisionQueue"] {
  if (value === "auto_approved" || value === "needs_human_review" || value === "blocked" || value === "watching") {
    return value;
  }
  return "needs_human_review";
}

function normalizeRisk(value: unknown): ReviewHistoryRecord["decisionRiskLevel"] {
  if (value === "low" || value === "medium" || value === "high") return value;
  return "medium";
}

/**
 * In-memory store used by local tests when Table Storage is not configured.
 */
export class InMemoryStateStore implements StateStore {
  private history = new Map<string, ReviewHistoryRow>();
  private conventions = new Map<string, ConventionRow>();

  async getHistory(repo: string, prId: number): Promise<ReviewHistoryRow | null> {
    return this.history.get(`${repo}/${prId}`) ?? null;
  }
  async upsertHistory(row: ReviewHistoryRow): Promise<void> {
    this.history.set(`${row.partitionKey}/${row.rowKey}`, row);
  }
  async listConventions(repo: string): Promise<string[]> {
    const out: string[] = [];
    for (const [key, v] of this.conventions) {
      if (key.startsWith(`${repo}/`)) out.push(v.text);
    }
    return out;
  }
  async upsertConvention(row: ConventionRow): Promise<void> {
    this.conventions.set(`${row.partitionKey}/${row.rowKey}`, row);
  }
}
