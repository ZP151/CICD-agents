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
  decisionReasonCodes?: string[] | string;
  contextConfidence?: string;
  autoApprovedAt?: string;
  autoApprovalActor?: string;
  discardedFindingCount?: number;
  hunkCoverageFiles?: number;
  wholeFileFallbackFiles?: number;
  changedHunkLines?: number;
  manualDisposition?: string;
  manualDispositionAt?: string;
  manualDispositionActor?: string;
  manualDispositionNote?: string;
  manualDispositionEvents?: ReviewHistoryRecord["manualDispositionEvents"] | string;
  manualDispositionWriteBackAttempted?: boolean;
  manualDispositionWriteBackOk?: boolean;
  manualDispositionWriteBackError?: string;
  manualDispositionWriteBackAt?: string;
  manualDispositionWriteBackThreadId?: string;
  manualDispositionWriteBackUrl?: string;
  manualDispositionWriteBackEvents?: ReviewHistoryRecord["manualDispositionWriteBackEvents"] | string;
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
        decisionReasonCodes: parseReasonCodes(entity.decisionReasonCodes),
        contextConfidence: entity.contextConfidence ? String(entity.contextConfidence) : "",
        autoApprovedAt: entity.autoApprovedAt ? String(entity.autoApprovedAt) : "",
        autoApprovalActor: entity.autoApprovalActor ? String(entity.autoApprovalActor) : "",
        discardedFindingCount: Number(entity.discardedFindingCount ?? 0),
        hunkCoverageFiles: Number(entity.hunkCoverageFiles ?? 0),
        wholeFileFallbackFiles: Number(entity.wholeFileFallbackFiles ?? 0),
        changedHunkLines: Number(entity.changedHunkLines ?? 0),
        manualDisposition: entity.manualDisposition ? String(entity.manualDisposition) : "",
        manualDispositionAt: entity.manualDispositionAt ? String(entity.manualDispositionAt) : "",
        manualDispositionActor: entity.manualDispositionActor ? String(entity.manualDispositionActor) : "",
        manualDispositionNote: entity.manualDispositionNote ? String(entity.manualDispositionNote) : "",
        manualDispositionEvents: parseDispositionEvents(entity.manualDispositionEvents),
        manualDispositionWriteBackAttempted: Boolean(entity.manualDispositionWriteBackAttempted ?? false),
        manualDispositionWriteBackOk: Boolean(entity.manualDispositionWriteBackOk ?? false),
        manualDispositionWriteBackError: entity.manualDispositionWriteBackError ? String(entity.manualDispositionWriteBackError) : "",
        manualDispositionWriteBackAt: entity.manualDispositionWriteBackAt ? String(entity.manualDispositionWriteBackAt) : "",
        manualDispositionWriteBackThreadId: entity.manualDispositionWriteBackThreadId ? String(entity.manualDispositionWriteBackThreadId) : "",
        manualDispositionWriteBackUrl: entity.manualDispositionWriteBackUrl ? String(entity.manualDispositionWriteBackUrl) : "",
        manualDispositionWriteBackEvents: parseWriteBackEvents(entity.manualDispositionWriteBackEvents),
      };
    } catch (err: unknown) {
      const e = err as { statusCode?: number };
      if (e.statusCode === 404) return null;
      throw err;
    }
  }

  async upsertHistory(row: ReviewHistoryRow): Promise<void> {
    await this.history.upsertEntity({
      ...row,
      decisionReasonCodes: JSON.stringify(normalizeReasonCodes(row.decisionReasonCodes)),
      manualDispositionEvents: JSON.stringify(normalizeDispositionEvents(row.manualDispositionEvents)),
      manualDispositionWriteBackEvents: JSON.stringify(normalizeWriteBackEvents(row.manualDispositionWriteBackEvents)),
      partitionKey: row.partitionKey,
      rowKey: row.rowKey,
    }, "Replace");
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
      decisionReasonCodes: match.decisionReasonCodes,
      contextConfidence: match.contextConfidence,
      autoApprovedAt: match.autoApprovedAt,
      autoApprovalActor: match.autoApprovalActor,
      discardedFindingCount: match.discardedFindingCount,
      hunkCoverageFiles: match.hunkCoverageFiles,
      wholeFileFallbackFiles: match.wholeFileFallbackFiles,
      changedHunkLines: match.changedHunkLines,
      manualDisposition: match.manualDisposition,
      manualDispositionAt: match.manualDispositionAt,
      manualDispositionActor: match.manualDispositionActor,
      manualDispositionNote: match.manualDispositionNote,
      manualDispositionEvents: match.manualDispositionEvents,
      manualDispositionWriteBackAttempted: match.manualDispositionWriteBackAttempted,
      manualDispositionWriteBackOk: match.manualDispositionWriteBackOk,
      manualDispositionWriteBackError: match.manualDispositionWriteBackError,
      manualDispositionWriteBackAt: match.manualDispositionWriteBackAt,
      manualDispositionWriteBackThreadId: match.manualDispositionWriteBackThreadId,
      manualDispositionWriteBackUrl: match.manualDispositionWriteBackUrl,
      manualDispositionWriteBackEvents: match.manualDispositionWriteBackEvents,
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
      decisionReasonCodes: normalizeReasonCodes(row.decisionReasonCodes),
      contextConfidence: normalizeContextConfidence(row.contextConfidence),
      autoApprovedAt: row.autoApprovedAt ?? "",
      autoApprovalActor: row.autoApprovalActor ?? "",
      lastTokensIn: row.lastTokensIn,
      lastTokensOut: row.lastTokensOut,
      discardedFindingCount: row.discardedFindingCount,
      hunkCoverageFiles: row.hunkCoverageFiles,
      wholeFileFallbackFiles: row.wholeFileFallbackFiles,
      changedHunkLines: row.changedHunkLines,
      manualDisposition: normalizeManualDisposition(row.manualDisposition),
      manualDispositionAt: row.manualDispositionAt ?? "",
      manualDispositionActor: row.manualDispositionActor ?? "",
      manualDispositionNote: row.manualDispositionNote ?? "",
      manualDispositionEvents: normalizeDispositionEvents(row.manualDispositionEvents),
      manualDispositionWriteBackAttempted: row.manualDispositionWriteBackAttempted ?? false,
      manualDispositionWriteBackOk: row.manualDispositionWriteBackOk ?? false,
      manualDispositionWriteBackError: row.manualDispositionWriteBackError ?? "",
      manualDispositionWriteBackAt: row.manualDispositionWriteBackAt ?? "",
      manualDispositionWriteBackThreadId: row.manualDispositionWriteBackThreadId ?? "",
      manualDispositionWriteBackUrl: row.manualDispositionWriteBackUrl ?? "",
      manualDispositionWriteBackEvents: normalizeWriteBackEvents(row.manualDispositionWriteBackEvents),
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

function parseReasonCodes(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return value.split(";").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeReasonCodes(value: unknown): string[] {
  return parseReasonCodes(value);
}

function normalizeContextConfidence(value: unknown): ReviewHistoryRecord["contextConfidence"] {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "";
}

function normalizeManualDisposition(value: unknown): ReviewHistoryRecord["manualDisposition"] {
  if (
    value === "acknowledged" ||
    value === "marked_safe" ||
    value === "marked_blocked" ||
    value === "changes_requested"
  ) {
    return value;
  }
  return "";
}

function parseDispositionEvents(value: unknown): NonNullable<ReviewHistoryRecord["manualDispositionEvents"]> {
  if (Array.isArray(value)) return normalizeDispositionEvents(value);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return normalizeDispositionEvents(parsed);
  } catch {
    return [];
  }
}

function normalizeDispositionEvents(value: unknown): NonNullable<ReviewHistoryRecord["manualDispositionEvents"]> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as {
      disposition?: unknown;
      at?: unknown;
      actor?: unknown;
      note?: unknown;
    };
    const disposition = normalizeManualDisposition(raw.disposition);
    if (!disposition) return [];
    return [{
      disposition,
      at: typeof raw.at === "string" ? raw.at : "",
      actor: typeof raw.actor === "string" ? raw.actor : "",
      note: typeof raw.note === "string" ? raw.note : "",
    }];
  });
}

function parseWriteBackEvents(value: unknown): NonNullable<ReviewHistoryRecord["manualDispositionWriteBackEvents"]> {
  if (Array.isArray(value)) return normalizeWriteBackEvents(value);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return normalizeWriteBackEvents(parsed);
  } catch {
    return [];
  }
}

function normalizeWriteBackEvents(value: unknown): NonNullable<ReviewHistoryRecord["manualDispositionWriteBackEvents"]> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as {
      disposition?: unknown;
      at?: unknown;
      ok?: unknown;
      actor?: unknown;
      note?: unknown;
      error?: unknown;
      threadId?: unknown;
      url?: unknown;
    };
    const disposition = normalizeManualDisposition(raw.disposition);
    if (!disposition) return [];
    return [{
      disposition,
      at: typeof raw.at === "string" ? raw.at : "",
      ok: Boolean(raw.ok),
      actor: typeof raw.actor === "string" ? raw.actor : "",
      note: typeof raw.note === "string" ? raw.note : "",
      error: typeof raw.error === "string" ? raw.error : "",
      threadId: typeof raw.threadId === "string" ? raw.threadId : "",
      url: typeof raw.url === "string" ? raw.url : "",
    }];
  });
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
