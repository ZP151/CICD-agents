/**
 * SQLite persistence for proposed actions, approvals, execution and
 * verification records. One store per local data directory (not per repo):
 * actions are scoped by projectLinkId. The store is the local ledger for the
 * Proposal → Approval → Execution → Re-read → Verification path.
 */
import fs from "node:fs";
import path from "node:path";
import Database, { type Database as DbType } from "better-sqlite3";
import { getSettings } from "../../settings.js";
import type { ArtifactRef } from "../artifactRef.js";
import type { ActionAuditEntry, ActionRecord, ActionStatus } from "./actionTypes.js";

export interface DeliveryActionStore {
  propose(record: ActionRecord): Promise<void>;
  get(id: string): Promise<ActionRecord | undefined>;
  listByProjectLink(projectLinkId: string, options?: { includeTerminal?: boolean }): Promise<ActionRecord[]>;
  updateStatus(record: ActionRecord): Promise<void>;
  /** Marks pending actions targeting the artifact stale when its revision moved. */
  markStaleForTarget(projectLinkId: string, ref: ArtifactRef): Promise<number>;
  /** Actions that may need verification recovery after a restart. */
  listInFlight(): Promise<ActionRecord[]>;
  close(): void;
}

export function deliveryStorePath(): string {
  const settings = getSettings();
  const base = path.join(settings.dataDir, "delivery");
  fs.mkdirSync(base, { recursive: true });
  return path.join(base, "actions.db");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS delivery_actions (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL,
  project_link_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  based_on TEXT NOT NULL,
  payload TEXT NOT NULL,
  risk TEXT NOT NULL,
  reason TEXT NOT NULL,
  expected_result TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  approved_at INTEGER,
  executed_at INTEGER,
  verified_at INTEGER,
  failure TEXT,
  audit TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_actions_idempotency
  ON delivery_actions (project_link_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_delivery_actions_status
  ON delivery_actions (status);
CREATE INDEX IF NOT EXISTS idx_delivery_actions_project
  ON delivery_actions (project_link_id, created_at);
`;

interface DeliveryActionRow {
  id: string;
  turn_id: string;
  project_link_id: string;
  kind: string;
  target: string;
  based_on: string;
  payload: string;
  risk: string;
  reason: string;
  expected_result: string;
  idempotency_key: string;
  expires_at: number;
  status: string;
  created_at: number;
  approved_at: number | null;
  executed_at: number | null;
  verified_at: number | null;
  failure: string | null;
  audit: string;
}

export class SqliteDeliveryActionStore implements DeliveryActionStore {
  private readonly db: DbType;

  constructor(dbPath = deliveryStorePath()) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  async propose(record: ActionRecord): Promise<void> {
    this.db.prepare(`
      INSERT INTO delivery_actions (
        id, turn_id, project_link_id, kind, target, based_on, payload, risk,
        reason, expected_result, idempotency_key, expires_at, status,
        created_at, approved_at, executed_at, verified_at, failure, audit
      ) VALUES (
        @id, @turnId, @projectLinkId, @kind, @target, @basedOn, @payload, @risk,
        @reason, @expectedResult, @idempotencyKey, @expiresAt, @status,
        @createdAt, @approvedAt, @executedAt, @verifiedAt, @failure, @audit
      )
    `).run(toRow(record));
  }

  async get(id: string): Promise<ActionRecord | undefined> {
    const row = this.db.prepare("SELECT * FROM delivery_actions WHERE id = ?").get(id) as
      | DeliveryActionRow
      | undefined;
    return row ? fromRow(row) : undefined;
  }

  async listByProjectLink(
    projectLinkId: string,
    options: { includeTerminal?: boolean } = {},
  ): Promise<ActionRecord[]> {
    const rows = options.includeTerminal
      ? this.db.prepare(
        "SELECT * FROM delivery_actions WHERE project_link_id = ? ORDER BY created_at DESC",
      ).all(projectLinkId)
      : this.db.prepare(
        "SELECT * FROM delivery_actions WHERE project_link_id = ? AND status NOT IN ('verified','rejected','stale','failed','cancelled') ORDER BY created_at DESC",
      ).all(projectLinkId);
    return (rows as DeliveryActionRow[]).map(fromRow);
  }

  async updateStatus(record: ActionRecord): Promise<void> {
    // Payload-bearing columns are rewritten too: retry() may replace the
    // proposal payload/expectedResult before re-approval.
    this.db.prepare(`
      UPDATE delivery_actions SET
        status = @status, target = @target, based_on = @basedOn,
        payload = @payload, risk = @risk, reason = @reason,
        expected_result = @expectedResult, expires_at = @expiresAt,
        approved_at = @approvedAt, executed_at = @executedAt,
        verified_at = @verifiedAt, failure = @failure, audit = @audit
      WHERE id = @id
    `).run(toRow(record));
  }

  async markStaleForTarget(projectLinkId: string, ref: ArtifactRef): Promise<number> {
    const pending = await this.listByProjectLink(projectLinkId);
    let count = 0;
    for (const record of pending) {
      if (sameStableTarget(record.target, ref)) {
        const updated: ActionRecord = {
          ...record,
          status: "stale",
          failure: { kind: "policy", message: "target revision changed after proposal" },
          audit: [...record.audit, { at: Date.now(), event: "stale", detail: "target revision moved" }],
        };
        await this.updateStatus(updated);
        count += 1;
      }
    }
    return count;
  }

  async listInFlight(): Promise<ActionRecord[]> {
    const rows = this.db.prepare(
      "SELECT * FROM delivery_actions WHERE status IN ('approved','executing','verifying')",
    ).all() as DeliveryActionRow[];
    return rows.map(fromRow);
  }

  close(): void {
    this.db.close();
  }
}

function sameStableTarget(left: ArtifactRef, right: ArtifactRef): boolean {
  return stableKey(left) === stableKey(right);
}

function stableKey(ref: ArtifactRef): string {
  switch (ref.kind) {
    case "work_item":
      return `work_item:${ref.projectLinkId}:${ref.id}`;
    case "branch":
      return `branch:${ref.projectLinkId}:${ref.repositoryId}:${ref.name}`;
    case "commit":
      return `commit:${ref.projectLinkId}:${ref.repositoryId}:${ref.commitId}`;
    case "pull_request":
      return `pull_request:${ref.projectLinkId}:${ref.repositoryId}:${ref.id}`;
    case "build":
      return `build:${ref.projectLinkId}:${ref.definitionId}:${ref.buildId}`;
    case "test_result":
      return `test_result:${ref.projectLinkId}:${ref.runId}:${ref.resultId}`;
    case "environment":
      return `environment:${ref.projectLinkId}:${ref.environmentId}`;
    case "deployment":
      return `deployment:${ref.projectLinkId}:${ref.environmentId}:${ref.deploymentId}`;
  }
}

function toRow(record: ActionRecord): Record<string, unknown> {
  return {
    id: record.id,
    turnId: record.turnId,
    projectLinkId: record.projectLinkId,
    kind: record.kind,
    target: JSON.stringify(record.target),
    basedOn: JSON.stringify(record.basedOn),
    payload: JSON.stringify(record.payload),
    risk: record.risk,
    reason: record.reason,
    expectedResult: JSON.stringify(record.expectedResult),
    idempotencyKey: record.idempotencyKey,
    expiresAt: record.expiresAt,
    status: record.status,
    createdAt: record.createdAt,
    approvedAt: record.approvedAt ?? null,
    executedAt: record.executedAt ?? null,
    verifiedAt: record.verifiedAt ?? null,
    failure: record.failure ? JSON.stringify(record.failure) : null,
    audit: JSON.stringify(record.audit),
  };
}

function fromRow(row: DeliveryActionRow): ActionRecord {
  return {
    id: row.id,
    turnId: row.turn_id,
    projectLinkId: row.project_link_id,
    kind: row.kind,
    target: JSON.parse(row.target) as ArtifactRef,
    basedOn: JSON.parse(row.based_on) as ArtifactRef[],
    payload: JSON.parse(row.payload) as unknown,
    risk: row.risk as ActionRecord["risk"],
    reason: row.reason,
    expectedResult: JSON.parse(row.expected_result) as ActionRecord["expectedResult"],
    idempotencyKey: row.idempotency_key,
    expiresAt: row.expires_at,
    status: row.status as ActionStatus,
    createdAt: row.created_at,
    approvedAt: row.approved_at ?? undefined,
    executedAt: row.executed_at ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
    failure: row.failure ? JSON.parse(row.failure) as ActionRecord["failure"] : undefined,
    audit: JSON.parse(row.audit) as ActionAuditEntry[],
  };
}
