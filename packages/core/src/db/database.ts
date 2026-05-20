import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database, { type Database as DbType } from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { getSettings } from "../settings.js";
import { logger } from "../logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

function repoId(repoPath: string): string {
  const norm = path.resolve(repoPath).toLowerCase();
  return crypto.createHash("sha1").update(norm).digest("hex").slice(0, 16);
}

export function dbPathFor(repoPath: string): string {
  const settings = getSettings();
  const base = path.join(settings.dataDir, "repos", repoId(repoPath));
  fs.mkdirSync(base, { recursive: true });
  return path.join(base, "index.db");
}

export interface RepoDatabase {
  readonly db: DbType;
  readonly path: string;
  readonly hasVec: boolean;
  close(): void;
}

let schemaCache: string | null = null;
function getSchema(): string {
  if (schemaCache) return schemaCache;
  schemaCache = fs.readFileSync(SCHEMA_PATH, "utf8");
  return schemaCache;
}

export function openRepoDb(repoPath: string): RepoDatabase {
  const file = dbPathFor(repoPath);
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  let hasVec = false;
  try {
    sqliteVec.load(db);
    hasVec = true;
  } catch (err) {
    logger().debug({ err }, "sqlite-vec not loaded; vector search will use fallback");
  }

  db.exec(getSchema());

  if (hasVec) {
    try {
      db.exec(
        "CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vec USING vec0(" +
          "chunk_id INTEGER PRIMARY KEY, embedding FLOAT[1536])",
      );
    } catch (err) {
      logger().warn({ err }, "failed to create chunk_vec table; falling back");
      hasVec = false;
    }
  }
  if (!hasVec) {
    db.exec(
      "CREATE TABLE IF NOT EXISTS chunk_embeddings (" +
        "chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE, " +
        "embedding BLOB NOT NULL)",
    );
  }

  return {
    db,
    path: file,
    hasVec,
    close: () => db.close(),
  };
}

export function transaction<T>(db: DbType, fn: () => T): T {
  return db.transaction(fn)();
}
