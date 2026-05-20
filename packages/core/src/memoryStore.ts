import type { Database as DbType } from "better-sqlite3";
import { openRepoDb, type RepoDatabase } from "./db/database.js";

export interface PRHistoryEntry {
  id: number;
  taskId: string;
  prId: number | null;
  prUrl: string;
  title: string;
  summary: string;
  riskLevel: string;
  createdAt: number;
}

function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\\\\/g, "/");
  const re = escaped.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, ".");
  return new RegExp("^" + re + "$");
}

export class MemoryStore {
  private readonly handle: RepoDatabase;
  private readonly db: DbType;

  constructor(repoPath: string) {
    this.handle = openRepoDb(repoPath);
    this.db = this.handle.db;
  }

  close(): void {
    this.handle.close();
  }

  setProfile(key: string, value: unknown): void {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        "INSERT INTO repo_profile(key, value, updated_at) VALUES(?, ?, ?) " +
          "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
      )
      .run(key, JSON.stringify(value), now);
  }

  getProfile<T = unknown>(key: string, defaultValue: T | null = null): T | null {
    const row = this.db
      .prepare("SELECT value FROM repo_profile WHERE key = ?")
      .get(key) as { value: string } | undefined;
    if (!row) return defaultValue;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return defaultValue;
    }
  }

  recordPr(args: {
    taskId: string;
    prId: number | null;
    prUrl: string;
    title: string;
    summary: string;
    riskLevel?: string;
  }): number {
    const now = Math.floor(Date.now() / 1000);
    const r = this.db
      .prepare(
        "INSERT INTO pr_history(task_id, pr_id, pr_url, title, summary, risk_level, " +
          "created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        args.taskId,
        args.prId,
        args.prUrl,
        args.title,
        args.summary,
        args.riskLevel ?? "low",
        now,
      );
    return Number(r.lastInsertRowid);
  }

  recentPrs(limit = 20): PRHistoryEntry[] {
    const rows = this.db
      .prepare(
        "SELECT id, task_id, pr_id, pr_url, title, summary, risk_level, created_at " +
          "FROM pr_history ORDER BY id DESC LIMIT ?",
      )
      .all(limit) as Array<{
      id: number;
      task_id: string;
      pr_id: number | null;
      pr_url: string;
      title: string;
      summary: string;
      risk_level: string;
      created_at: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      prId: r.pr_id,
      prUrl: r.pr_url,
      title: r.title,
      summary: r.summary,
      riskLevel: r.risk_level,
      createdAt: r.created_at,
    }));
  }

  setReviewer(pathGlob: string, reviewers: string[]): void {
    this.db
      .prepare(
        "INSERT INTO reviewer_map(path_glob, reviewers) VALUES(?, ?) " +
          "ON CONFLICT(path_glob) DO UPDATE SET reviewers=excluded.reviewers",
      )
      .run(pathGlob, reviewers.join(","));
  }

  reviewersForPaths(paths: string[]): string[] {
    const rows = this.db
      .prepare("SELECT path_glob, reviewers FROM reviewer_map")
      .all() as Array<{ path_glob: string; reviewers: string }>;
    const out = new Set<string>();
    for (const r of rows) {
      const re = globToRegex(r.path_glob);
      const matches = paths.some((p) => re.test(p.replace(/\\/g, "/")));
      if (matches) {
        for (const rv of r.reviewers.split(",")) {
          const trimmed = rv.trim();
          if (trimmed) out.add(trimmed);
        }
      }
    }
    return [...out].sort();
  }

  addConvention(scope: string, rule: string): number {
    const r = this.db
      .prepare("INSERT INTO conventions(scope, rule) VALUES (?, ?)")
      .run(scope, rule);
    return Number(r.lastInsertRowid);
  }

  allConventions(): Array<{ scope: string; rule: string }> {
    return this.db
      .prepare("SELECT scope, rule FROM conventions ORDER BY id")
      .all() as Array<{ scope: string; rule: string }>;
  }

  markFlaky(testId: string, notes = ""): void {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        "INSERT INTO known_flaky_tests(test_id, last_seen, notes) VALUES(?, ?, ?) " +
          "ON CONFLICT(test_id) DO UPDATE SET last_seen=excluded.last_seen, notes=excluded.notes",
      )
      .run(testId, now, notes);
  }

  isFlaky(testId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 AS one FROM known_flaky_tests WHERE test_id = ?")
      .get(testId);
    return Boolean(row);
  }

  knownFlakyTests(): string[] {
    const rows = this.db
      .prepare("SELECT test_id FROM known_flaky_tests ORDER BY test_id")
      .all() as Array<{ test_id: string }>;
    return rows.map((r) => r.test_id);
  }

  addIgnoredPath(pathGlob: string): void {
    this.db.prepare("INSERT OR IGNORE INTO ignored_paths(path_glob) VALUES (?)").run(pathGlob);
  }

  ignoredPaths(): string[] {
    const rows = this.db.prepare("SELECT path_glob FROM ignored_paths").all() as Array<{
      path_glob: string;
    }>;
    return rows.map((r) => r.path_glob);
  }
}
