"""SQLite connection helpers.

Each repo gets its own database under `<data_dir>/repos/<repo_id>/index.db`.
The schema is shared (see schema.sql).
"""

from __future__ import annotations

import hashlib
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from runtime.config.settings import get_settings

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def _repo_id(repo_path: str | Path) -> str:
    norm = str(Path(repo_path).expanduser().resolve()).lower()
    return hashlib.sha1(norm.encode("utf-8")).hexdigest()[:16]


def db_path_for(repo_path: str | Path) -> Path:
    settings = get_settings()
    base = settings.data_dir / "repos" / _repo_id(repo_path)
    base.mkdir(parents=True, exist_ok=True)
    return base / "index.db"


def _load_sqlite_vec(conn: sqlite3.Connection) -> None:
    # sqlite-vec is optional; load if available, ignore otherwise so plain
    # symbol-only operation still works.
    try:
        import sqlite_vec  # type: ignore

        conn.enable_load_extension(True)
        sqlite_vec.load(conn)
    except Exception:
        pass
    finally:
        try:
            conn.enable_load_extension(False)
        except Exception:
            pass


def connect(repo_path: str | Path) -> sqlite3.Connection:
    """Open (and initialise) the index DB for `repo_path`."""
    path = db_path_for(repo_path)
    conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
    conn.row_factory = sqlite3.Row
    _load_sqlite_vec(conn)
    _ensure_schema(conn)
    _ensure_vec_table(conn)
    return conn


def _ensure_schema(conn: sqlite3.Connection) -> None:
    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    conn.executescript(sql)


def _ensure_vec_table(conn: sqlite3.Connection) -> None:
    # Create the virtual table only if sqlite-vec is loaded; on plain sqlite the
    # statement will fail and we silently skip (vector search becomes a no-op).
    try:
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vec USING vec0("
            "chunk_id INTEGER PRIMARY KEY, embedding FLOAT[1536])"
        )
    except sqlite3.OperationalError:
        pass


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    try:
        conn.execute("BEGIN")
        yield conn
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
