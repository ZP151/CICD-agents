from pathlib import Path

from runtime.core.memory_store import MemoryStore


def test_profile_kv_roundtrip(fixture_repo: Path):
    mem = MemoryStore(fixture_repo)
    try:
        mem.set_profile("primary_language", "python")
        assert mem.get_profile("primary_language") == "python"
        assert mem.get_profile("missing", default="x") == "x"
    finally:
        mem.close()


def test_pr_history(fixture_repo: Path):
    mem = MemoryStore(fixture_repo)
    try:
        mem.record_pr(
            task_id="t1",
            pr_id=42,
            pr_url="https://example/pr/42",
            title="Test PR",
            summary="hi",
            risk_level="medium",
        )
        prs = mem.recent_prs()
        assert len(prs) == 1
        assert prs[0].pr_id == 42
        assert prs[0].risk_level == "medium"
    finally:
        mem.close()


def test_reviewer_mapping(fixture_repo: Path):
    mem = MemoryStore(fixture_repo)
    try:
        mem.set_reviewer("src/api/**", ["alice@example.com", "bob@example.com"])
        mem.set_reviewer("docs/**", ["carol@example.com"])
        assert mem.reviewers_for_paths(["src/api/foo.py"]) == [
            "alice@example.com",
            "bob@example.com",
        ]
        assert mem.reviewers_for_paths(["docs/readme.md"]) == ["carol@example.com"]
        assert mem.reviewers_for_paths(["other/file.py"]) == []
    finally:
        mem.close()


def test_flaky_tests(fixture_repo: Path):
    mem = MemoryStore(fixture_repo)
    try:
        mem.mark_flaky("tests/test_thing.py::test_x", notes="timing-dependent")
        assert mem.is_flaky("tests/test_thing.py::test_x")
        assert "tests/test_thing.py::test_x" in mem.known_flaky_tests()
    finally:
        mem.close()
