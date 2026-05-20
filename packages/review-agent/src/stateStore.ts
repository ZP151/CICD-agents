import { TableClient, type TableEntity } from "@azure/data-tables";

export interface ReviewHistoryRow {
  partitionKey: string;
  rowKey: string;
  lastIterationId: number;
  findingCount: number;
  lastRunAt: string;
  lastTokensIn: number;
  lastTokensOut: number;
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
