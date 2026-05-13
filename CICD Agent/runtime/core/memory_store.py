"""Lightweight per-repo memory store.

Backed by the same SQLite database as the indexer (see schema.sql). No
secrets are stored: tokens, passwords and API keys belong in the OS keyring
and/or env vars.
"""

from __future__ import annotations

import fnmatch
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from runtime.index.database import connect


@dataclass
class PRHistoryEntry:
    id: int
    task_id: str
    pr_id: int | None
    pr_url: str
    title: str
    summary: str
    risk_level: str
    created_at: int


class MemoryStore:
    def __init__(self, repo_path: Path):
        self.repo_path = repo_path.resolve()
        self.conn = connect(self.repo_path)

    def close(self) -> None:
        try:
            self.conn.close()
        except Exception:
            pass

    # --- repo profile (free-form key/value) ---

    def set_profile(self, key: str, value: Any) -> None:
        self.conn.execute(
            "INSERT INTO repo_profile(key, value, updated_at) VALUES(?, ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            (key, json.dumps(value), int(time.time())),
        )

    def get_profile(self, key: str, default: Any = None) -> Any:
        row = self.conn.execute(
            "SELECT value FROM repo_profile WHERE key = ?", (key,)
        ).fetchone()
        if not row:
            return default
        try:
            return json.loads(row["value"])
        except Exception:
            return default

    # --- PR history ---

    def record_pr(
        self,
        *,
        task_id: str,
        pr_id: int | None,
        pr_url: str,
        title: str,
        summary: str,
        risk_level: str = "low",
    ) -> int:
        cur = self.conn.execute(
            "INSERT INTO pr_history(task_id, pr_id, pr_url, title, summary, risk_level, "
            "created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                task_id,
                pr_id,
                pr_url,
                title,
                summary,
                risk_level,
                int(time.time()),
            ),
        )
        return int(cur.lastrowid or 0)

    def recent_prs(self, limit: int = 20) -> list[PRHistoryEntry]:
        rows = self.conn.execute(
            "SELECT id, task_id, pr_id, pr_url, title, summary, risk_level, created_at "
            "FROM pr_history ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [
            PRHistoryEntry(
                id=int(r["id"]),
                task_id=str(r["task_id"]),
                pr_id=int(r["pr_id"]) if r["pr_id"] is not None else None,
                pr_url=str(r["pr_url"]),
                title=str(r["title"]),
                summary=str(r["summary"]),
                risk_level=str(r["risk_level"]),
                created_at=int(r["created_at"]),
            )
            for r in rows
        ]

    # --- reviewer mapping ---

    def set_reviewer(self, path_glob: str, reviewers: list[str]) -> None:
        self.conn.execute(
            "INSERT INTO reviewer_map(path_glob, reviewers) VALUES(?, ?) "
            "ON CONFLICT(path_glob) DO UPDATE SET reviewers=excluded.reviewers",
            (path_glob, ",".join(reviewers)),
        )

    def reviewers_for_paths(self, paths: list[str]) -> list[str]:
        rows = self.conn.execute(
            "SELECT path_glob, reviewers FROM reviewer_map"
        ).fetchall()
        out: set[str] = set()
        for r in rows:
            pat = str(r["path_glob"]).replace("\\", "/")
            for p in paths:
                if fnmatch.fnmatch(p.replace("\\", "/"), pat):
                    for rv in str(r["reviewers"]).split(","):
                        rv = rv.strip()
                        if rv:
                            out.add(rv)
                    break
        return sorted(out)

    # --- conventions ---

    def add_convention(self, scope: str, rule: str) -> int:
        cur = self.conn.execute(
            "INSERT INTO conventions(scope, rule) VALUES (?, ?)", (scope, rule)
        )
        return int(cur.lastrowid or 0)

    def all_conventions(self) -> list[tuple[str, str]]:
        rows = self.conn.execute(
            "SELECT scope, rule FROM conventions ORDER BY id"
        ).fetchall()
        return [(str(r["scope"]), str(r["rule"])) for r in rows]

    # --- flaky tests ---

    def mark_flaky(self, test_id: str, notes: str = "") -> None:
        self.conn.execute(
            "INSERT INTO known_flaky_tests(test_id, last_seen, notes) VALUES(?, ?, ?) "
            "ON CONFLICT(test_id) DO UPDATE SET last_seen=excluded.last_seen, "
            "notes=excluded.notes",
            (test_id, int(time.time()), notes),
        )

    def is_flaky(self, test_id: str) -> bool:
        row = self.conn.execute(
            "SELECT 1 FROM known_flaky_tests WHERE test_id = ?", (test_id,)
        ).fetchone()
        return row is not None

    def known_flaky_tests(self) -> list[str]:
        rows = self.conn.execute(
            "SELECT test_id FROM known_flaky_tests ORDER BY test_id"
        ).fetchall()
        return [str(r["test_id"]) for r in rows]

    # --- ignored paths ---

    def add_ignored_path(self, path_glob: str) -> None:
        self.conn.execute(
            "INSERT OR IGNORE INTO ignored_paths(path_glob) VALUES (?)", (path_glob,)
        )

    def ignored_paths(self) -> list[str]:
        rows = self.conn.execute("SELECT path_glob FROM ignored_paths").fetchall()
        return [str(r["path_glob"]) for r in rows]
