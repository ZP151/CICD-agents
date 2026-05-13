"""Vector index built on top of the chunks table.

Uses `sqlite-vec` when the extension can be loaded; otherwise falls back to a
pure-Python cosine-similarity search over a parallel `chunk_embeddings` table
(blob-encoded float32 arrays).

The public API is the same regardless of backend:
- `embed_pending(client)` embeds chunks with `embedded=0` in batches.
- `search(query_vec, k)` returns the top-k chunk ids + scores.
- `search_text(text, k)` is a convenience that embeds the query first.
"""

from __future__ import annotations

import array
import logging
import math
import sqlite3
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from runtime.config.settings import get_settings
from runtime.core.llm_client import LLMClient
from runtime.index.database import connect

log = logging.getLogger(__name__)


def _vec_to_blob(vec: list[float]) -> bytes:
    return array.array("f", vec).tobytes()


def _blob_to_vec(blob: bytes) -> list[float]:
    arr = array.array("f")
    arr.frombytes(blob)
    return list(arr)


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


def _has_vec_extension(conn: sqlite3.Connection) -> bool:
    try:
        conn.execute("SELECT 1 FROM chunk_vec LIMIT 1")
        return True
    except sqlite3.OperationalError:
        return False


@dataclass
class SearchHit:
    chunk_id: int
    score: float
    file_path: str
    start_line: int
    end_line: int
    text: str


class VectorIndex:
    def __init__(self, repo_path: Path):
        self.repo_path = repo_path
        self.conn = connect(repo_path)
        self._uses_vec_ext = _has_vec_extension(self.conn)
        if not self._uses_vec_ext:
            self.conn.execute(
                "CREATE TABLE IF NOT EXISTS chunk_embeddings ("
                "chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE, "
                "embedding BLOB NOT NULL)"
            )

    def close(self) -> None:
        try:
            self.conn.close()
        except Exception:
            pass

    async def embed_pending(self, llm: LLMClient) -> int:
        """Embed any chunks with `embedded=0`. Returns count embedded."""
        settings = get_settings()
        batch_size = settings.index_embed_batch
        rows = self.conn.execute(
            "SELECT id, text FROM chunks WHERE embedded = 0 ORDER BY id"
        ).fetchall()
        if not rows:
            return 0
        if not llm.configured:
            log.info("LLM not configured; skipping embedding for %d chunks", len(rows))
            return 0

        embedded_count = 0
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            texts = [r["text"][:8000] for r in batch]
            vectors = await llm.embed(texts)
            for row, vec in zip(batch, vectors):
                self._store_vector(int(row["id"]), vec)
                embedded_count += 1
        return embedded_count

    def _store_vector(self, chunk_id: int, vec: list[float]) -> None:
        blob = _vec_to_blob(vec)
        if self._uses_vec_ext:
            self.conn.execute(
                "INSERT OR REPLACE INTO chunk_vec(chunk_id, embedding) VALUES (?, ?)",
                (chunk_id, blob),
            )
        else:
            self.conn.execute(
                "INSERT OR REPLACE INTO chunk_embeddings(chunk_id, embedding) VALUES (?, ?)",
                (chunk_id, blob),
            )
        self.conn.execute("UPDATE chunks SET embedded = 1 WHERE id = ?", (chunk_id,))

    async def search_text(self, llm: LLMClient, text: str, k: int = 10) -> list[SearchHit]:
        if not text.strip() or not llm.configured:
            return []
        vec = (await llm.embed([text[:8000]]))[0]
        return self.search(vec, k=k)

    def search(self, query: list[float], k: int = 10) -> list[SearchHit]:
        if self._uses_vec_ext:
            return self._search_with_vec_ext(query, k)
        return self._search_brute_force(query, k)

    def _search_with_vec_ext(self, query: list[float], k: int) -> list[SearchHit]:
        try:
            rows = self.conn.execute(
                "SELECT c.id AS chunk_id, c.start_line, c.end_line, c.text, "
                "f.path AS path, v.distance AS distance "
                "FROM chunk_vec v "
                "JOIN chunks c ON c.id = v.chunk_id "
                "JOIN files f ON f.id = c.file_id "
                "WHERE v.embedding MATCH ? AND k = ? "
                "ORDER BY v.distance",
                (_vec_to_blob(query), k),
            ).fetchall()
        except sqlite3.OperationalError:
            return self._search_brute_force(query, k)
        return [
            SearchHit(
                chunk_id=int(r["chunk_id"]),
                score=1.0 - float(r["distance"]),
                file_path=str(r["path"]),
                start_line=int(r["start_line"]),
                end_line=int(r["end_line"]),
                text=str(r["text"]),
            )
            for r in rows
        ]

    def _search_brute_force(self, query: list[float], k: int) -> list[SearchHit]:
        rows = self.conn.execute(
            "SELECT e.chunk_id, e.embedding, c.start_line, c.end_line, c.text, f.path "
            "FROM chunk_embeddings e "
            "JOIN chunks c ON c.id = e.chunk_id "
            "JOIN files f ON f.id = c.file_id"
        ).fetchall()
        scored: list[tuple[float, sqlite3.Row]] = []
        for r in rows:
            vec = _blob_to_vec(r["embedding"])
            scored.append((_cosine(query, vec), r))
        scored.sort(key=lambda x: x[0], reverse=True)
        out: list[SearchHit] = []
        for score, r in scored[:k]:
            out.append(
                SearchHit(
                    chunk_id=int(r["chunk_id"]),
                    score=score,
                    file_path=str(r["path"]),
                    start_line=int(r["start_line"]),
                    end_line=int(r["end_line"]),
                    text=str(r["text"]),
                )
            )
        return out

    def search_paths(
        self,
        query_text: str,
        candidate_paths: Iterable[str],
        llm: LLMClient,
        k: int = 5,
    ) -> list[SearchHit]:
        """Synchronous helper used by tests; returns empty when LLM unavailable."""
        if not llm.configured:
            return []
        # We deliberately avoid hitting the LLM here to keep this sync.
        return []
