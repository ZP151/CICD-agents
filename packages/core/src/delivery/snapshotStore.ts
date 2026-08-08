/**
 * SQLite snapshot and edge store for the delivery graph.
 *
 * Snapshots are the latest canonical observation per artifact; edges record
 * delivery relationships with their source. Both are scoped by projectLinkId
 * and keyed by stable artifact keys.
 */
import fs from "node:fs";
import path from "node:path";
import Database, { type Database as DbType } from "better-sqlite3";
import { getSettings } from "../settings.js";
import type { ArtifactRef } from "./artifactRef.js";
import { artifactStableKey } from "./artifactRef.js";
import type { DeliveryEdge, DeliveryEdgeKind } from "./deliveryEdges.js";
import { edgeKey } from "./deliveryEdges.js";
import type { ArtifactSnapshot } from "./observations.js";
import { snapshotKey } from "./observations.js";

export interface DeliveryGraphStore {
  upsertSnapshot(snapshot: ArtifactSnapshot): Promise<void>;
  getSnapshot(projectLinkId: string, ref: ArtifactRef): Promise<ArtifactSnapshot | undefined>;
  listSnapshots(projectLinkId: string, kinds?: ArtifactRef["kind"][]): Promise<ArtifactSnapshot[]>;
  upsertEdge(edge: DeliveryEdge): Promise<void>;
  listEdges(
    projectLinkId: string,
    options?: { from?: ArtifactRef; to?: ArtifactRef; kinds?: DeliveryEdgeKind[] },
  ): Promise<DeliveryEdge[]>;
  traverse(projectLinkId: string, seed: ArtifactRef, depth?: number): Promise<DeliveryEdge[]>;
  /** Snapshots older than the TTL for a project link (freshness check). */
  staleSnapshots(projectLinkId: string, ttlMs: number, now?: number): Promise<ArtifactSnapshot[]>;
  close(): void;
}

export function deliveryGraphStorePath(): string {
  const settings = getSettings();
  const base = path.join(settings.dataDir, "delivery");
  fs.mkdirSync(base, { recursive: true });
  return path.join(base, "graph.db");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS delivery_snapshots (
  artifact_key TEXT PRIMARY KEY,
  project_link_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  source TEXT NOT NULL,
  fields TEXT NOT NULL,
  relations TEXT NOT NULL,
  evidence_url TEXT
);
CREATE INDEX IF NOT EXISTS idx_snapshots_project ON delivery_snapshots (project_link_id, kind, observed_at);
CREATE TABLE IF NOT EXISTS delivery_edges (
  edge_key TEXT PRIMARY KEY,
  project_link_id TEXT NOT NULL,
  from_key TEXT NOT NULL,
  to_key TEXT NOT NULL,
  from_ref TEXT NOT NULL,
  to_ref TEXT NOT NULL,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  evidence_url TEXT,
  confidence REAL
);
CREATE INDEX IF NOT EXISTS idx_edges_from ON delivery_edges (from_key);
CREATE INDEX IF NOT EXISTS idx_edges_to ON delivery_edges (to_key);
CREATE INDEX IF NOT EXISTS idx_edges_kind ON delivery_edges (kind, observed_at);
`;

interface SnapshotRow {
  artifact_key: string;
  project_link_id: string;
  kind: string;
  ref: string;
  observed_at: number;
  source: string;
  fields: string;
  relations: string;
  evidence_url: string | null;
}

interface EdgeRow {
  edge_key: string;
  project_link_id: string;
  from_key: string;
  to_key: string;
  from_ref: string;
  to_ref: string;
  kind: string;
  source: string;
  observed_at: number;
  evidence_url: string | null;
  confidence: number | null;
}

export class SqliteDeliveryGraphStore implements DeliveryGraphStore {
  private readonly db: DbType;

  constructor(dbPath = deliveryGraphStorePath()) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  async upsertSnapshot(snapshot: ArtifactSnapshot): Promise<void> {
    this.db.prepare(`
      INSERT INTO delivery_snapshots (artifact_key, project_link_id, kind, ref, observed_at, source, fields, relations, evidence_url)
      VALUES (@key, @projectLinkId, @kind, @ref, @observedAt, @source, @fields, @relations, @evidenceUrl)
      ON CONFLICT(artifact_key) DO UPDATE SET
        ref = excluded.ref, observed_at = excluded.observed_at, source = excluded.source,
        fields = excluded.fields, relations = excluded.relations, evidence_url = excluded.evidence_url
    `).run({
      key: snapshotKey(snapshot.ref),
      projectLinkId: snapshot.projectLinkId,
      kind: snapshot.ref.kind,
      ref: JSON.stringify(snapshot.ref),
      observedAt: snapshot.observedAt,
      source: snapshot.source,
      fields: JSON.stringify(snapshot.fields),
      relations: JSON.stringify(snapshot.relations),
      evidenceUrl: snapshot.evidenceUrl ?? null,
    });
  }

  async getSnapshot(projectLinkId: string, ref: ArtifactRef): Promise<ArtifactSnapshot | undefined> {
    const row = this.db.prepare(
      "SELECT * FROM delivery_snapshots WHERE artifact_key = ? AND project_link_id = ?",
    ).get(snapshotKey(ref), projectLinkId) as SnapshotRow | undefined;
    return row ? fromSnapshotRow(row) : undefined;
  }

  async listSnapshots(projectLinkId: string, kinds?: ArtifactRef["kind"][]): Promise<ArtifactSnapshot[]> {
    if (kinds && kinds.length > 0) {
      const placeholders = kinds.map(() => "?").join(",");
      const rows = this.db.prepare(
        `SELECT * FROM delivery_snapshots WHERE project_link_id = ? AND kind IN (${placeholders}) ORDER BY observed_at DESC`,
      ).all(projectLinkId, ...kinds) as SnapshotRow[];
      return rows.map(fromSnapshotRow);
    }
    const rows = this.db.prepare(
      "SELECT * FROM delivery_snapshots WHERE project_link_id = ? ORDER BY observed_at DESC",
    ).all(projectLinkId) as SnapshotRow[];
    return rows.map(fromSnapshotRow);
  }

  async upsertEdge(edge: DeliveryEdge): Promise<void> {
    this.db.prepare(`
      INSERT INTO delivery_edges (edge_key, project_link_id, from_key, to_key, from_ref, to_ref, kind, source, observed_at, evidence_url, confidence)
      VALUES (@key, @projectLinkId, @fromKey, @toKey, @fromRef, @toRef, @kind, @source, @observedAt, @evidenceUrl, @confidence)
      ON CONFLICT(edge_key) DO UPDATE SET
        from_ref = excluded.from_ref, to_ref = excluded.to_ref,
        source = excluded.source, observed_at = excluded.observed_at,
        evidence_url = excluded.evidence_url, confidence = excluded.confidence
    `).run({
      key: edgeKey(edge.from, edge.to, edge.kind),
      projectLinkId: edge.from.projectLinkId,
      fromKey: snapshotKey(edge.from),
      toKey: snapshotKey(edge.to),
      fromRef: JSON.stringify(edge.from),
      toRef: JSON.stringify(edge.to),
      kind: edge.kind,
      source: edge.source,
      observedAt: edge.observedAt,
      evidenceUrl: edge.evidenceUrl ?? null,
      confidence: edge.confidence ?? null,
    });
  }

  async listEdges(
    projectLinkId: string,
    options: { from?: ArtifactRef; to?: ArtifactRef; kinds?: DeliveryEdgeKind[] } = {},
  ): Promise<DeliveryEdge[]> {
    const clauses = ["project_link_id = ?"];
    const params: unknown[] = [projectLinkId];
    if (options.from) {
      clauses.push("from_key = ?");
      params.push(snapshotKey(options.from));
    }
    if (options.to) {
      clauses.push("to_key = ?");
      params.push(snapshotKey(options.to));
    }
    if (options.kinds && options.kinds.length > 0) {
      clauses.push(`kind IN (${options.kinds.map(() => "?").join(",")})`);
      params.push(...options.kinds);
    }
    const rows = this.db.prepare(
      `SELECT * FROM delivery_edges WHERE ${clauses.join(" AND ")} ORDER BY observed_at DESC`,
    ).all(...params) as EdgeRow[];
    return rows.map(fromEdgeRow);
  }

  async traverse(projectLinkId: string, seed: ArtifactRef, depth = 3): Promise<DeliveryEdge[]> {
    const seen = new Set<string>();
    const frontier = [seed];
    const edges: DeliveryEdge[] = [];
    for (let level = 0; level < depth && frontier.length > 0; level += 1) {
      const next: ArtifactRef[] = [];
      for (const node of frontier) {
        const key = snapshotKey(node);
        if (seen.has(key)) continue;
        seen.add(key);
        const out = await this.listEdges(projectLinkId, { from: node });
        edges.push(...out);
        for (const edge of out) {
          const toKey = snapshotKey(edge.to);
          if (!seen.has(toKey)) next.push(edge.to);
        }
      }
      frontier.length = 0;
      frontier.push(...next);
    }
    return edges;
  }

  async staleSnapshots(projectLinkId: string, ttlMs: number, now = Date.now()): Promise<ArtifactSnapshot[]> {
    const rows = this.db.prepare(
      "SELECT * FROM delivery_snapshots WHERE project_link_id = ? AND observed_at < ?",
    ).all(projectLinkId, now - ttlMs) as SnapshotRow[];
    return rows.map(fromSnapshotRow);
  }

  close(): void {
    this.db.close();
  }
}

function fromSnapshotRow(row: SnapshotRow): ArtifactSnapshot {
  return {
    ref: JSON.parse(row.ref) as ArtifactRef,
    projectLinkId: row.project_link_id,
    observedAt: row.observed_at,
    source: row.source as ArtifactSnapshot["source"],
    fields: JSON.parse(row.fields) as Record<string, unknown>,
    relations: JSON.parse(row.relations) as string[],
    evidenceUrl: row.evidence_url ?? undefined,
  };
}

function fromEdgeRow(row: EdgeRow): DeliveryEdge {
  return {
    from: JSON.parse(row.from_ref) as ArtifactRef,
    to: JSON.parse(row.to_ref) as ArtifactRef,
    kind: row.kind as DeliveryEdgeKind,
    source: row.source as DeliveryEdge["source"],
    observedAt: row.observed_at,
    evidenceUrl: row.evidence_url ?? undefined,
    confidence: row.confidence ?? undefined,
  };
}
