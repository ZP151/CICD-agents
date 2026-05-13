"""Repo indexer.

Walks the repo (respecting .gitignore + profile ignored_globs), parses files
with Tree-sitter, and persists files/symbols/imports/chunks in SQLite. Index
updates are incremental: a file is only re-parsed when its content hash
changes.

If `tree_sitter_languages` is unavailable at runtime (Windows wheel hiccups,
older Python), the indexer falls back to a naive scanner that still records
files and one whole-file chunk per file so the rest of the pipeline keeps
working.
"""

from __future__ import annotations

import fnmatch
import hashlib
import logging
import sqlite3
import time
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from runtime.config.profiles import Profile
from runtime.config.settings import get_settings
from runtime.index.database import connect, transaction

log = logging.getLogger(__name__)


# Tree-sitter language bindings - loaded lazily so missing wheels do not
# break the whole runtime.
_TS_LANGS: dict[str, object] | None = None


def _load_ts_languages() -> dict[str, object]:
    global _TS_LANGS
    if _TS_LANGS is not None:
        return _TS_LANGS
    try:
        from tree_sitter_languages import get_language  # type: ignore

        _TS_LANGS = {
            "python": get_language("python"),
            "typescript": get_language("typescript"),
            "tsx": get_language("tsx"),
            "javascript": get_language("javascript"),
            "c_sharp": get_language("c_sharp"),
        }
    except Exception as exc:  # pragma: no cover - dependency-specific
        log.warning("tree-sitter languages unavailable: %s", exc)
        _TS_LANGS = {}
    return _TS_LANGS


EXT_TO_LANG = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".cs": "c_sharp",
}

DEFAULT_IGNORED = (
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
)


@dataclass
class IndexStats:
    files_seen: int = 0
    files_indexed: int = 0
    files_skipped: int = 0
    files_removed: int = 0
    symbols_added: int = 0
    chunks_added: int = 0


def _sha1_bytes(b: bytes) -> str:
    return hashlib.sha1(b).hexdigest()


def _detect_language(path: Path) -> str | None:
    return EXT_TO_LANG.get(path.suffix.lower())


def _is_test_path(rel: str, lang: str) -> bool:
    rel_l = rel.lower()
    if "/tests/" in rel_l or rel_l.startswith("tests/"):
        return True
    if lang == "python" and (rel_l.endswith("_test.py") or "/test_" in rel_l or rel_l.startswith("test_")):
        return True
    if lang in ("typescript", "tsx", "javascript") and (
        rel_l.endswith(".test.ts") or rel_l.endswith(".test.tsx") or
        rel_l.endswith(".spec.ts") or rel_l.endswith(".spec.tsx") or
        rel_l.endswith(".test.js") or rel_l.endswith(".spec.js")
    ):
        return True
    if lang == "c_sharp" and (".Tests" in rel or "Tests.cs" in rel):
        return True
    return False


def _load_gitignore_patterns(repo: Path) -> list[str]:
    patterns: list[str] = []
    gi = repo / ".gitignore"
    if not gi.exists():
        return patterns
    try:
        for line in gi.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            patterns.append(line)
    except Exception:
        pass
    return patterns


def _matches_any(rel: str, patterns: Iterable[str]) -> bool:
    rel_unix = rel.replace("\\", "/")
    for p in patterns:
        p_unix = p.replace("\\", "/")
        if fnmatch.fnmatch(rel_unix, p_unix):
            return True
        # Treat bare names (e.g. `dist`) as a directory or file segment.
        if "/" not in p_unix and any(
            seg == p_unix.rstrip("/") for seg in rel_unix.split("/")
        ):
            return True
    return False


# --- Tree-sitter symbol extraction --------------------------------------------------

_QUERIES: dict[str, str] = {
    "python": """
        (class_definition name: (identifier) @name) @class
        (function_definition name: (identifier) @name) @function
        (import_statement) @import
        (import_from_statement) @import
    """,
    "typescript": """
        (class_declaration name: (type_identifier) @name) @class
        (function_declaration name: (identifier) @name) @function
        (method_definition name: (property_identifier) @name) @method
        (interface_declaration name: (type_identifier) @name) @interface
        (import_statement) @import
    """,
    "tsx": """
        (class_declaration name: (type_identifier) @name) @class
        (function_declaration name: (identifier) @name) @function
        (method_definition name: (property_identifier) @name) @method
        (interface_declaration name: (type_identifier) @name) @interface
        (import_statement) @import
    """,
    "javascript": """
        (class_declaration name: (identifier) @name) @class
        (function_declaration name: (identifier) @name) @function
        (method_definition name: (property_identifier) @name) @method
        (import_statement) @import
    """,
    "c_sharp": """
        (class_declaration name: (identifier) @name) @class
        (interface_declaration name: (identifier) @name) @interface
        (struct_declaration name: (identifier) @name) @struct
        (method_declaration name: (identifier) @name) @method
        (using_directive) @import
    """,
}


@dataclass
class ParsedSymbol:
    kind: str
    name: str
    qualified: str
    start_line: int
    end_line: int
    signature: str


@dataclass
class ParsedFile:
    symbols: list[ParsedSymbol]
    imports: list[str]


def _parse_with_tree_sitter(content: bytes, lang: str) -> ParsedFile | None:
    langs = _load_ts_languages()
    language = langs.get(lang)
    if language is None:
        return None
    try:
        from tree_sitter import Parser  # type: ignore
    except Exception:
        return None

    parser = Parser()
    try:
        parser.set_language(language)  # type: ignore[attr-defined]
    except Exception:
        # tree-sitter 0.22+: use `language=` kwarg constructor
        try:
            parser = Parser(language=language)  # type: ignore[call-arg]
        except Exception:
            return None

    tree = parser.parse(content)
    query_src = _QUERIES.get(lang)
    if not query_src:
        return ParsedFile([], [])

    try:
        query = language.query(query_src)  # type: ignore[attr-defined]
    except Exception:
        return ParsedFile([], [])

    captures = query.captures(tree.root_node)
    symbols: list[ParsedSymbol] = []
    imports: list[str] = []

    # Group captures by parent node so we can pair @class/@function with their @name.
    pending: dict[int, dict[str, object]] = {}
    for node, cap_name in captures:
        if cap_name in ("class", "function", "method", "interface", "struct"):
            pending[node.id] = {
                "kind": cap_name,
                "node": node,
                "name": None,
            }
        elif cap_name == "name":
            # Find nearest enclosing pending node.
            cur = node.parent
            while cur is not None:
                if cur.id in pending:
                    pending[cur.id]["name"] = node.text.decode("utf-8", errors="replace")
                    break
                cur = cur.parent
        elif cap_name == "import":
            try:
                imports.append(node.text.decode("utf-8", errors="replace").strip())
            except Exception:
                pass

    for entry in pending.values():
        name = entry.get("name") or "<anonymous>"
        node = entry["node"]  # type: ignore[index]
        start_line = node.start_point[0] + 1  # type: ignore[union-attr]
        end_line = node.end_point[0] + 1  # type: ignore[union-attr]
        first_line = content.splitlines()[start_line - 1] if start_line - 1 < len(content.splitlines()) else b""
        signature = first_line.decode("utf-8", errors="replace").strip()
        symbols.append(
            ParsedSymbol(
                kind=str(entry["kind"]),
                name=str(name),
                qualified=str(name),
                start_line=start_line,
                end_line=end_line,
                signature=signature,
            )
        )

    return ParsedFile(symbols=symbols, imports=imports)


# --- Chunking --------------------------------------------------------------

CHUNK_MAX_LINES = 200


def _chunks_for_file(content: str, symbols: list[ParsedSymbol]) -> list[tuple[int | None, int, int, str]]:
    """Yield (symbol_index, start_line, end_line, text) tuples.

    Strategy: one chunk per symbol; whatever is left becomes a tail chunk.
    Symbols larger than CHUNK_MAX_LINES get sliced.
    """
    lines = content.splitlines()
    if not lines:
        return []

    chunks: list[tuple[int | None, int, int, str]] = []
    used = [False] * len(lines)

    for idx, sym in enumerate(symbols):
        start = max(1, sym.start_line)
        end = min(len(lines), sym.end_line)
        # Slice big symbols.
        cursor = start
        while cursor <= end:
            slice_end = min(cursor + CHUNK_MAX_LINES - 1, end)
            text = "\n".join(lines[cursor - 1 : slice_end])
            chunks.append((idx, cursor, slice_end, text))
            for i in range(cursor - 1, slice_end):
                used[i] = True
            cursor = slice_end + 1

    # Tail: contiguous unused regions become orphan chunks (module-level code).
    i = 0
    while i < len(lines):
        if used[i]:
            i += 1
            continue
        j = i
        while j < len(lines) and not used[j] and (j - i) < CHUNK_MAX_LINES:
            j += 1
        text = "\n".join(lines[i:j])
        if text.strip():
            chunks.append((None, i + 1, j, text))
        i = j

    return chunks


# --- Indexer ---------------------------------------------------------------


class RepoIndexer:
    def __init__(self, repo_path: Path, profile: Profile | None = None):
        self.repo_path = repo_path.resolve()
        self.profile = profile
        self.conn = connect(self.repo_path)
        settings = get_settings()
        self.max_file_bytes = settings.index_max_file_bytes
        self.ignored = list(DEFAULT_IGNORED) + (
            list(profile.ignored_globs) if profile else []
        )
        self.ignored.extend(_load_gitignore_patterns(self.repo_path))

    def close(self) -> None:
        try:
            self.conn.close()
        except Exception:
            pass

    def iter_repo_files(self) -> Iterable[Path]:
        for path in self.repo_path.rglob("*"):
            if not path.is_file():
                continue
            try:
                rel = path.relative_to(self.repo_path).as_posix()
            except ValueError:
                continue
            if _matches_any(rel, self.ignored):
                continue
            if _detect_language(path) is None:
                continue
            yield path

    def update(self) -> IndexStats:
        """Incrementally update the index. Returns stats."""
        stats = IndexStats()
        seen_paths: set[str] = set()
        for path in self.iter_repo_files():
            stats.files_seen += 1
            rel = path.relative_to(self.repo_path).as_posix()
            seen_paths.add(rel)
            try:
                st = path.stat()
                if st.st_size > self.max_file_bytes:
                    stats.files_skipped += 1
                    continue
                content_bytes = path.read_bytes()
            except OSError:
                stats.files_skipped += 1
                continue

            content_hash = _sha1_bytes(content_bytes)
            existing = self.conn.execute(
                "SELECT id, content_hash FROM files WHERE path = ?",
                (rel,),
            ).fetchone()

            if existing and existing["content_hash"] == content_hash:
                continue

            lang = _detect_language(path) or "text"
            text = content_bytes.decode("utf-8", errors="replace")

            parsed = _parse_with_tree_sitter(content_bytes, lang)
            if parsed is None:
                parsed = ParsedFile(symbols=[], imports=[])

            is_test = 1 if _is_test_path(rel, lang) else 0
            now = int(time.time())

            with transaction(self.conn):
                if existing:
                    file_id = int(existing["id"])
                    self.conn.execute(
                        "DELETE FROM symbols WHERE file_id = ?", (file_id,)
                    )
                    self.conn.execute(
                        "DELETE FROM imports WHERE file_id = ?", (file_id,)
                    )
                    self.conn.execute(
                        "DELETE FROM chunks WHERE file_id = ?", (file_id,)
                    )
                    self.conn.execute(
                        "UPDATE files SET language=?, size_bytes=?, mtime_ns=?, "
                        "content_hash=?, is_test=?, indexed_at=? WHERE id=?",
                        (
                            lang,
                            st.st_size,
                            st.st_mtime_ns,
                            content_hash,
                            is_test,
                            now,
                            file_id,
                        ),
                    )
                else:
                    cur = self.conn.execute(
                        "INSERT INTO files(path, language, size_bytes, mtime_ns, "
                        "content_hash, is_test, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (
                            rel,
                            lang,
                            st.st_size,
                            st.st_mtime_ns,
                            content_hash,
                            is_test,
                            now,
                        ),
                    )
                    file_id = int(cur.lastrowid or 0)

                symbol_ids: list[int] = []
                for sym in parsed.symbols:
                    cur = self.conn.execute(
                        "INSERT INTO symbols(file_id, kind, name, qualified, "
                        "start_line, end_line, signature) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (
                            file_id,
                            sym.kind,
                            sym.name,
                            sym.qualified,
                            sym.start_line,
                            sym.end_line,
                            sym.signature,
                        ),
                    )
                    symbol_ids.append(int(cur.lastrowid or 0))
                    stats.symbols_added += 1

                for mod in parsed.imports:
                    self.conn.execute(
                        "INSERT INTO imports(file_id, module) VALUES (?, ?)",
                        (file_id, mod[:512]),
                    )

                for sym_idx, start_line, end_line, chunk_text in _chunks_for_file(text, parsed.symbols):
                    sym_id = symbol_ids[sym_idx] if sym_idx is not None and sym_idx < len(symbol_ids) else None
                    self.conn.execute(
                        "INSERT INTO chunks(file_id, symbol_id, start_line, end_line, "
                        "text, token_count, embedded) VALUES (?, ?, ?, ?, ?, ?, 0)",
                        (
                            file_id,
                            sym_id,
                            start_line,
                            end_line,
                            chunk_text,
                            max(1, len(chunk_text) // 4),
                        ),
                    )
                    stats.chunks_added += 1

            stats.files_indexed += 1

        # Drop files that disappeared.
        existing_paths = {
            r["path"] for r in self.conn.execute("SELECT path FROM files").fetchall()
        }
        gone = existing_paths - seen_paths
        if gone:
            placeholders = ",".join("?" for _ in gone)
            self.conn.execute(
                f"DELETE FROM files WHERE path IN ({placeholders})",
                list(gone),
            )
            stats.files_removed = len(gone)

        return stats

    # --- Read APIs used by ContextBuilder ---

    def find_file_id(self, rel_path: str) -> int | None:
        row = self.conn.execute(
            "SELECT id FROM files WHERE path = ?", (rel_path,)
        ).fetchone()
        return int(row["id"]) if row else None

    def symbols_in_file(self, rel_path: str) -> list[sqlite3.Row]:
        row = self.conn.execute(
            "SELECT id FROM files WHERE path = ?", (rel_path,)
        ).fetchone()
        if not row:
            return []
        return list(
            self.conn.execute(
                "SELECT * FROM symbols WHERE file_id = ? ORDER BY start_line",
                (row["id"],),
            ).fetchall()
        )

    def files_importing(self, module: str) -> list[str]:
        rows = self.conn.execute(
            "SELECT DISTINCT f.path FROM imports i JOIN files f ON f.id = i.file_id "
            "WHERE i.module LIKE ?",
            (f"%{module}%",),
        ).fetchall()
        return [r["path"] for r in rows]

    def all_test_files(self) -> list[str]:
        rows = self.conn.execute(
            "SELECT path FROM files WHERE is_test = 1"
        ).fetchall()
        return [r["path"] for r in rows]
