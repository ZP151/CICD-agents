import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import fastGlob from "fast-glob";
import type { Database as DbType } from "better-sqlite3";
import { openRepoDb, transaction, type RepoDatabase } from "../db/database.js";
import { getSettings } from "../settings.js";
import type { Profile } from "../profiles.js";
import { chunksForFile } from "./chunks.js";
import { detectLanguage, isTestPath, parseFile } from "./parsers.js";
import type { IndexStats, ParsedSymbol } from "./types.js";

const DEFAULT_IGNORED = [
  "**/.git/**",
  "**/node_modules/**",
  "**/__pycache__/**",
  "**/.venv/**",
  "**/.idea/**",
  "**/.vs/**",
  "**/bin/**",
  "**/obj/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
];

function sha1(buf: Buffer): string {
  return crypto.createHash("sha1").update(buf).digest("hex");
}

function loadGitignore(repo: string): string[] {
  const file = path.join(repo, ".gitignore");
  if (!fs.existsSync(file)) return [];
  try {
    return fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    return [];
  }
}

export class RepoIndexer {
  readonly repoPath: string;
  readonly profile: Profile | null;
  private readonly handle: RepoDatabase;
  private readonly db: DbType;
  private readonly maxFileBytes: number;
  private readonly ignored: string[];

  constructor(repoPath: string, profile: Profile | null = null) {
    this.repoPath = path.resolve(repoPath);
    this.profile = profile;
    this.handle = openRepoDb(this.repoPath);
    this.db = this.handle.db;
    const settings = getSettings();
    this.maxFileBytes = settings.indexMaxFileBytes;
    this.ignored = [
      ...DEFAULT_IGNORED,
      ...(profile?.ignored_globs ?? []),
      ...loadGitignore(this.repoPath),
    ];
  }

  close(): void {
    this.handle.close();
  }

  async listRepoFiles(): Promise<string[]> {
    const entries = await fastGlob("**/*", {
      cwd: this.repoPath,
      ignore: this.ignored,
      onlyFiles: true,
      dot: false,
      followSymbolicLinks: false,
      caseSensitiveMatch: false,
    });
    return entries.filter((rel) => detectLanguage(rel) !== null);
  }

  async update(): Promise<IndexStats> {
    const stats: IndexStats = {
      filesSeen: 0,
      filesIndexed: 0,
      filesSkipped: 0,
      filesRemoved: 0,
      symbolsAdded: 0,
      chunksAdded: 0,
    };

    const seen = new Set<string>();
    const files = await this.listRepoFiles();

    for (const rel of files) {
      stats.filesSeen++;
      seen.add(rel);
      const full = path.join(this.repoPath, rel);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        stats.filesSkipped++;
        continue;
      }
      if (stat.size > this.maxFileBytes) {
        stats.filesSkipped++;
        continue;
      }
      let buf: Buffer;
      try {
        buf = fs.readFileSync(full);
      } catch {
        stats.filesSkipped++;
        continue;
      }
      const hash = sha1(buf);
      const existing = this.db
        .prepare("SELECT id, content_hash FROM files WHERE path = ?")
        .get(rel) as { id: number; content_hash: string } | undefined;
      if (existing && existing.content_hash === hash) continue;

      const lang = detectLanguage(rel) ?? "text";
      const text = buf.toString("utf8");
      const parsed = parseFile(text, lang);
      const isTest = isTestPath(rel, lang) ? 1 : 0;
      const now = Math.floor(Date.now() / 1000);
      const mtimeNs = BigInt(Math.floor(stat.mtimeMs * 1e6));

      transaction(this.db, () => {
        let fileId: number;
        if (existing) {
          fileId = existing.id;
          this.db.prepare("DELETE FROM symbols WHERE file_id = ?").run(fileId);
          this.db.prepare("DELETE FROM imports WHERE file_id = ?").run(fileId);
          this.db.prepare("DELETE FROM chunks WHERE file_id = ?").run(fileId);
          this.db
            .prepare(
              "UPDATE files SET language = ?, size_bytes = ?, mtime_ns = ?, " +
                "content_hash = ?, is_test = ?, indexed_at = ? WHERE id = ?",
            )
            .run(lang, stat.size, mtimeNs, hash, isTest, now, fileId);
        } else {
          const res = this.db
            .prepare(
              "INSERT INTO files(path, language, size_bytes, mtime_ns, " +
                "content_hash, is_test, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .run(rel, lang, stat.size, mtimeNs, hash, isTest, now);
          fileId = Number(res.lastInsertRowid);
        }
        const symIds: number[] = [];
        const insertSym = this.db.prepare(
          "INSERT INTO symbols(file_id, kind, name, qualified, start_line, end_line, signature) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
        );
        for (const sym of parsed.symbols as ParsedSymbol[]) {
          const r = insertSym.run(
            fileId,
            sym.kind,
            sym.name,
            sym.qualified,
            sym.startLine,
            sym.endLine,
            sym.signature,
          );
          symIds.push(Number(r.lastInsertRowid));
          stats.symbolsAdded++;
        }
        const insertImp = this.db.prepare(
          "INSERT INTO imports(file_id, module) VALUES (?, ?)",
        );
        for (const mod of parsed.imports) {
          insertImp.run(fileId, mod.slice(0, 512));
        }
        const insertChunk = this.db.prepare(
          "INSERT INTO chunks(file_id, symbol_id, start_line, end_line, text, " +
            "token_count, embedded) VALUES (?, ?, ?, ?, ?, ?, 0)",
        );
        for (const c of chunksForFile(text, parsed.symbols)) {
          const symId =
            c.symbolIndex !== null && c.symbolIndex < symIds.length
              ? symIds[c.symbolIndex]!
              : null;
          insertChunk.run(
            fileId,
            symId,
            c.startLine,
            c.endLine,
            c.text,
            Math.max(1, Math.floor(c.text.length / 4)),
          );
          stats.chunksAdded++;
        }
      });
      stats.filesIndexed++;
    }

    const existingPaths = (this.db.prepare("SELECT path FROM files").all() as { path: string }[])
      .map((r) => r.path);
    const gone = existingPaths.filter((p) => !seen.has(p));
    if (gone.length > 0) {
      const placeholders = gone.map(() => "?").join(",");
      this.db.prepare(`DELETE FROM files WHERE path IN (${placeholders})`).run(...gone);
      stats.filesRemoved = gone.length;
    }
    return stats;
  }

  findFileId(rel: string): number | null {
    const row = this.db
      .prepare("SELECT id FROM files WHERE path = ?")
      .get(rel) as { id: number } | undefined;
    return row ? row.id : null;
  }

  symbolsInFile(rel: string): ParsedSymbol[] {
    const file = this.db
      .prepare("SELECT id FROM files WHERE path = ?")
      .get(rel) as { id: number } | undefined;
    if (!file) return [];
    const rows = this.db
      .prepare(
        "SELECT kind, name, qualified, start_line, end_line, signature " +
          "FROM symbols WHERE file_id = ? ORDER BY start_line",
      )
      .all(file.id) as Array<{
      kind: string;
      name: string;
      qualified: string;
      start_line: number;
      end_line: number;
      signature: string;
    }>;
    return rows.map((r) => ({
      kind: r.kind,
      name: r.name,
      qualified: r.qualified,
      startLine: r.start_line,
      endLine: r.end_line,
      signature: r.signature,
    }));
  }

  filesImporting(module: string): string[] {
    const rows = this.db
      .prepare(
        "SELECT DISTINCT f.path FROM imports i JOIN files f ON f.id = i.file_id " +
          "WHERE i.module LIKE ?",
      )
      .all(`%${module}%`) as { path: string }[];
    return rows.map((r) => r.path);
  }

  allTestFiles(): string[] {
    const rows = this.db
      .prepare("SELECT path FROM files WHERE is_test = 1")
      .all() as { path: string }[];
    return rows.map((r) => r.path);
  }

  get rawDb(): DbType {
    return this.db;
  }
}
