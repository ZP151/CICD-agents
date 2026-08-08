import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type PipelineConnectionPurpose = "ci" | "pr-validation" | "release" | "deployment" | "other";

export interface PipelineConnection {
  id: string;
  projectLinkId: string;
  pipelineId: string;
  pipelineName: string;
  purpose: PipelineConnectionPurpose;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export type PipelineConnectionInput = Omit<PipelineConnection, "id" | "createdAt" | "updatedAt">;

type PipelineConnectionStore = Record<string, PipelineConnection>;

function pipelineConnectionStorePath(dataDir: string): string {
  return path.join(dataDir, "pipeline-connections.json");
}

function loadPipelineConnectionStore(dataDir: string): PipelineConnectionStore {
  const storePath = pipelineConnectionStorePath(dataDir);
  if (!fs.existsSync(storePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(storePath, "utf8")) as PipelineConnectionStore;
  } catch {
    return {};
  }
}

function savePipelineConnectionStore(dataDir: string, store: PipelineConnectionStore): void {
  const storePath = pipelineConnectionStorePath(dataDir);
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function listPipelineConnections(dataDir: string, projectLinkId?: string): PipelineConnection[] {
  return Object.values(loadPipelineConnectionStore(dataDir))
    .filter((connection) => !projectLinkId || connection.projectLinkId === projectLinkId)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.updatedAt - a.updatedAt);
}

export function getPipelineConnection(dataDir: string, id: string): PipelineConnection | null {
  return loadPipelineConnectionStore(dataDir)[id] ?? null;
}

export function createPipelineConnection(dataDir: string, data: PipelineConnectionInput): PipelineConnection {
  const store = loadPipelineConnectionStore(dataDir);
  const ts = nowSec();
  const id = crypto.randomBytes(8).toString("hex");
  const connection: PipelineConnection = { ...data, id, createdAt: ts, updatedAt: ts };
  const nextStore = data.isDefault ? clearDefaultForProjectLink(store, data.projectLinkId) : store;
  nextStore[id] = connection;
  savePipelineConnectionStore(dataDir, nextStore);
  return connection;
}

export function updatePipelineConnection(
  dataDir: string,
  id: string,
  data: Partial<PipelineConnectionInput>,
): PipelineConnection | null {
  const store = loadPipelineConnectionStore(dataDir);
  const existing = store[id];
  if (!existing) return null;
  const updated: PipelineConnection = { ...existing, ...data, id, updatedAt: nowSec() };
  const nextStore = updated.isDefault ? clearDefaultForProjectLink(store, updated.projectLinkId, id) : store;
  nextStore[id] = updated;
  savePipelineConnectionStore(dataDir, nextStore);
  return updated;
}

export function deletePipelineConnection(dataDir: string, id: string): boolean {
  const store = loadPipelineConnectionStore(dataDir);
  if (!store[id]) return false;
  delete store[id];
  savePipelineConnectionStore(dataDir, store);
  return true;
}

/**
 * GAP-01 migration: copy historical Project Link pipeline fields into
 * PipelineConnection so canonical consumers (which never read the legacy
 * fields) keep working after the fields stop being written. Copy-only: the
 * legacy fields stay readable as a bounded compatibility adapter. Idempotent:
 * a connection with the same (projectLinkId, pipelineId) is never duplicated.
 */
export function migrateLegacyPipelineFieldsToConnections(
  dataDir: string,
  projectLinks: Array<{ id: string; adoPipelineId?: string; adoPipelineName?: string }>,
): PipelineConnection[] {
  const created: PipelineConnection[] = [];
  for (const link of projectLinks) {
    const pipelineId = String(link.adoPipelineId ?? "").trim();
    if (!pipelineId) continue;
    const existing = listPipelineConnections(dataDir, link.id);
    if (existing.some((connection) => connection.pipelineId === pipelineId)) continue;
    const connection = createPipelineConnection(dataDir, {
      projectLinkId: link.id,
      pipelineId,
      pipelineName: String(link.adoPipelineName ?? "").trim() || `Pipeline #${pipelineId}`,
      purpose: "ci",
      isDefault: existing.length === 0,
    });
    created.push(connection);
  }
  return created;
}

function clearDefaultForProjectLink(
  store: PipelineConnectionStore,
  projectLinkId: string,
  exceptId?: string,
): PipelineConnectionStore {
  return Object.fromEntries(
    Object.entries(store).map(([id, connection]) => [
      id,
      connection.projectLinkId === projectLinkId && id !== exceptId
        ? { ...connection, isDefault: false }
        : connection,
    ]),
  );
}
