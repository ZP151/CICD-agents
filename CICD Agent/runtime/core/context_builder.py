"""Context Builder.

Takes a `git diff` result + the index and produces a token-budgeted bundle
of context the planner can feed to the LLM.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

from runtime.core.llm_client import LLMClient
from runtime.core.repo_indexer import RepoIndexer
from runtime.core.vector_index import SearchHit, VectorIndex

log = logging.getLogger(__name__)


_CONFIG_GLOBS = (
    "pyproject.toml",
    "requirements.txt",
    "package.json",
    "tsconfig.json",
    "appsettings.json",
    "appsettings.Development.json",
    "azure-pipelines.yml",
    ".github/workflows/",
    "Dockerfile",
)


@dataclass
class ChangedFile:
    path: str
    status: str  # added, modified, deleted, renamed
    additions: int = 0
    deletions: int = 0


@dataclass
class ContextChunk:
    path: str
    start_line: int
    end_line: int
    text: str
    importance: float = 0.0
    reason: str = ""


@dataclass
class ContextBundle:
    target_branch: str
    diff: str
    changed_files: list[ChangedFile] = field(default_factory=list)
    related_chunks: list[ContextChunk] = field(default_factory=list)
    related_tests: list[str] = field(default_factory=list)
    relevant_configs: list[str] = field(default_factory=list)
    affected_symbols: list[str] = field(default_factory=list)
    truncated: bool = False

    def to_prompt(self, token_budget: int) -> str:
        """Render to a Markdown prompt under a rough token budget (~4 chars/token)."""
        char_budget = max(2000, token_budget * 4)
        parts: list[str] = []
        parts.append(f"## Target branch\n{self.target_branch}\n")

        parts.append("## Changed files")
        for cf in self.changed_files:
            parts.append(f"- {cf.status}: {cf.path} (+{cf.additions}/-{cf.deletions})")
        parts.append("")

        if self.affected_symbols:
            parts.append("## Affected symbols")
            for s in self.affected_symbols[:80]:
                parts.append(f"- {s}")
            parts.append("")

        if self.related_tests:
            parts.append("## Related tests")
            for t in self.related_tests[:40]:
                parts.append(f"- {t}")
            parts.append("")

        if self.relevant_configs:
            parts.append("## Relevant configs")
            for c in self.relevant_configs[:40]:
                parts.append(f"- {c}")
            parts.append("")

        parts.append("## Diff")
        parts.append("```diff")
        diff_section = self.diff
        # Leave half the budget for context chunks.
        diff_cap = char_budget // 2
        if len(diff_section) > diff_cap:
            diff_section = diff_section[:diff_cap] + "\n... (diff truncated) ...\n"
            self.truncated = True
        parts.append(diff_section)
        parts.append("```")
        parts.append("")

        used = sum(len(p) + 1 for p in parts)
        remaining = max(0, char_budget - used)

        parts.append("## Related code")
        for chunk in self.related_chunks:
            block = (
                f"\n### {chunk.path}:{chunk.start_line}-{chunk.end_line} "
                f"(reason: {chunk.reason})\n```\n{chunk.text}\n```\n"
            )
            if len(block) > remaining:
                parts.append("\n_(remaining context truncated)_")
                self.truncated = True
                break
            parts.append(block)
            remaining -= len(block)

        return "\n".join(parts)


# --- Diff parsing -------------------------------------------------------------------

_DIFF_FILE_HEADER = re.compile(r"^diff --git a/(.+?) b/(.+?)$")
_HUNK_ADD = re.compile(r"^\+(?!\+\+)")
_HUNK_DEL = re.compile(r"^-(?!--)")
_STATUS_NEW = re.compile(r"^new file mode")
_STATUS_DELETED = re.compile(r"^deleted file mode")
_STATUS_RENAMED = re.compile(r"^rename from (.+?)$")


def parse_diff(diff_text: str) -> list[ChangedFile]:
    files: list[ChangedFile] = []
    current: ChangedFile | None = None
    for raw_line in diff_text.splitlines():
        m = _DIFF_FILE_HEADER.match(raw_line)
        if m:
            if current is not None:
                files.append(current)
            current = ChangedFile(path=m.group(2), status="modified")
            continue
        if current is None:
            continue
        if _STATUS_NEW.match(raw_line):
            current.status = "added"
        elif _STATUS_DELETED.match(raw_line):
            current.status = "deleted"
        elif _STATUS_RENAMED.match(raw_line):
            current.status = "renamed"
        elif _HUNK_ADD.match(raw_line):
            current.additions += 1
        elif _HUNK_DEL.match(raw_line):
            current.deletions += 1
    if current is not None:
        files.append(current)
    return files


# --- Builder ----------------------------------------------------------------------


class ContextBuilder:
    def __init__(self, repo_path: Path, indexer: RepoIndexer, vectors: VectorIndex):
        self.repo_path = repo_path.resolve()
        self.indexer = indexer
        self.vectors = vectors

    async def build(
        self,
        diff: str,
        target_branch: str,
        llm: LLMClient,
        token_budget: int = 12000,
    ) -> ContextBundle:
        changed = parse_diff(diff)
        bundle = ContextBundle(
            target_branch=target_branch, diff=diff, changed_files=changed
        )

        # Affected symbols and related tests via the static index.
        affected: list[str] = []
        related_test_set: set[str] = set()
        for cf in changed:
            file_id = self.indexer.find_file_id(cf.path)
            if file_id is None:
                continue
            syms = self.indexer.symbols_in_file(cf.path)
            for s in syms:
                affected.append(f"{cf.path}::{s['kind']} {s['name']}")
            # Heuristic: tests that import this module by file stem.
            stem = Path(cf.path).stem
            for t in self.indexer.files_importing(stem):
                if t.endswith("_test.py") or "test" in t.lower():
                    related_test_set.add(t)
        bundle.affected_symbols = affected

        # Always include known config files that exist.
        configs: list[str] = []
        for glob in _CONFIG_GLOBS:
            candidate = self.repo_path / glob
            if candidate.exists() and candidate.is_file():
                rel = candidate.relative_to(self.repo_path).as_posix()
                configs.append(rel)
        bundle.relevant_configs = configs

        # Vector-similarity related chunks (optional, requires LLM).
        related_chunks: list[ContextChunk] = []
        if llm.configured and changed:
            seed = self._build_seed_text(diff, changed)
            hits = await self.vectors.search_text(llm, seed, k=8)
            related_chunks.extend(_hits_to_chunks(hits, reason="vector"))

        # Always include affected files' own bodies as direct chunks when small.
        for cf in changed[:6]:
            full = self.repo_path / cf.path
            if not full.exists() or not full.is_file():
                continue
            try:
                if full.stat().st_size > 24_000:
                    continue
                text = full.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            related_chunks.append(
                ContextChunk(
                    path=cf.path,
                    start_line=1,
                    end_line=len(text.splitlines()),
                    text=text,
                    reason="changed-file",
                    importance=1.0,
                )
            )

        bundle.related_chunks = _dedupe_chunks(related_chunks)
        bundle.related_tests = sorted(related_test_set)
        return bundle

    def _build_seed_text(self, diff: str, changed: list[ChangedFile]) -> str:
        lines = ["Files changed:"]
        for cf in changed[:20]:
            lines.append(f"- {cf.status} {cf.path}")
        lines.append("Diff snippet:")
        lines.append(diff[:4000])
        return "\n".join(lines)


def _hits_to_chunks(hits: list[SearchHit], *, reason: str) -> list[ContextChunk]:
    return [
        ContextChunk(
            path=h.file_path,
            start_line=h.start_line,
            end_line=h.end_line,
            text=h.text,
            importance=float(h.score),
            reason=reason,
        )
        for h in hits
    ]


def _dedupe_chunks(chunks: list[ContextChunk]) -> list[ContextChunk]:
    seen: set[tuple[str, int, int]] = set()
    out: list[ContextChunk] = []
    for c in sorted(chunks, key=lambda x: x.importance, reverse=True):
        key = (c.path, c.start_line, c.end_line)
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out
