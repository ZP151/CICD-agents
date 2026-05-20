import type { Database as DbType } from "better-sqlite3";
import { openRepoDb, type RepoDatabase } from "./db/database.js";
import { getSettings } from "./settings.js";
import { logger } from "./logger.js";
import type { LLMClient } from "./llm.js";

function vecToBlob(v: number[]): Buffer {
  const buf = Buffer.alloc(v.length * 4);
  for (let i = 0; i < v.length; i++) buf.writeFloatLE(v[i]!, i * 4);
  return buf;
}

function blobToVec(blob: Buffer): number[] {
  const out = new Array<number>(blob.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = blob.readFloatLE(i * 4);
  return out;
}

function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface SearchHit {
  chunkId: number;
  score: number;
  filePath: string;
  startLine: number;
  endLine: number;
  text: string;
}

export class VectorIndex {
  private readonly handle: RepoDatabase;
  private readonly db: DbType;
  private readonly hasVec: boolean;

  constructor(repoPath: string) {
    this.handle = openRepoDb(repoPath);
    this.db = this.handle.db;
    this.hasVec = this.handle.hasVec;
  }

  close(): void {
    this.handle.close();
  }

  async embedPending(llm: LLMClient): Promise<number> {
    const settings = getSettings();
    const rows = this.db
      .prepare("SELECT id, text FROM chunks WHERE embedded = 0 ORDER BY id")
      .all() as Array<{ id: number; text: string }>;
    if (rows.length === 0) return 0;
    if (!llm.configured) {
      logger().info({ pending: rows.length }, "LLM not configured; skipping embeddings");
      return 0;
    }
    let count = 0;
    for (let i = 0; i < rows.length; i += settings.indexEmbedBatch) {
      const batch = rows.slice(i, i + settings.indexEmbedBatch);
      const texts = batch.map((r) => r.text.slice(0, 8000));
      const vectors = await llm.embed(texts);
      const stmtUpd = this.db.prepare("UPDATE chunks SET embedded = 1 WHERE id = ?");
      const stmtVec = this.hasVec
        ? this.db.prepare("INSERT OR REPLACE INTO chunk_vec(chunk_id, embedding) VALUES (?, ?)")
        : this.db.prepare(
            "INSERT OR REPLACE INTO chunk_embeddings(chunk_id, embedding) VALUES (?, ?)",
          );
      const tx = this.db.transaction(() => {
        for (let k = 0; k < batch.length; k++) {
          const row = batch[k]!;
          const vec = vectors[k];
          if (!vec) continue;
          stmtVec.run(row.id, vecToBlob(vec));
          stmtUpd.run(row.id);
          count++;
        }
      });
      tx();
    }
    return count;
  }

  async searchText(llm: LLMClient, text: string, k = 10): Promise<SearchHit[]> {
    if (!text.trim() || !llm.configured) return [];
    const [vec] = await llm.embed([text.slice(0, 8000)]);
    if (!vec) return [];
    return this.search(vec, k);
  }

  search(query: number[], k = 10): SearchHit[] {
    if (this.hasVec) {
      try {
        const rows = this.db
          .prepare(
            "SELECT c.id AS chunk_id, c.start_line, c.end_line, c.text, f.path, " +
              "v.distance AS distance FROM chunk_vec v JOIN chunks c ON c.id = v.chunk_id " +
              "JOIN files f ON f.id = c.file_id WHERE v.embedding MATCH ? AND k = ? " +
              "ORDER BY v.distance",
          )
          .all(vecToBlob(query), k) as Array<{
          chunk_id: number;
          start_line: number;
          end_line: number;
          text: string;
          path: string;
          distance: number;
        }>;
        return rows.map((r) => ({
          chunkId: r.chunk_id,
          score: 1 - r.distance,
          filePath: r.path,
          startLine: r.start_line,
          endLine: r.end_line,
          text: r.text,
        }));
      } catch {
        // fall through to brute-force
      }
    }
    const rows = this.db
      .prepare(
        "SELECT e.chunk_id, e.embedding, c.start_line, c.end_line, c.text, f.path " +
          "FROM chunk_embeddings e " +
          "JOIN chunks c ON c.id = e.chunk_id " +
          "JOIN files f ON f.id = c.file_id",
      )
      .all() as Array<{
      chunk_id: number;
      embedding: Buffer;
      start_line: number;
      end_line: number;
      text: string;
      path: string;
    }>;
    const scored = rows.map((r) => ({
      hit: {
        chunkId: r.chunk_id,
        score: cosine(query, blobToVec(r.embedding)),
        filePath: r.path,
        startLine: r.start_line,
        endLine: r.end_line,
        text: r.text,
      },
    }));
    scored.sort((a, b) => b.hit.score - a.hit.score);
    return scored.slice(0, k).map((s) => s.hit);
  }
}
