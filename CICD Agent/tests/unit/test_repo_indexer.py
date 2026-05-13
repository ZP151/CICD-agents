from pathlib import Path

from runtime.core.repo_indexer import RepoIndexer


def test_indexer_walks_and_records_files(fixture_repo: Path):
    indexer = RepoIndexer(fixture_repo)
    try:
        stats = indexer.update()
        assert stats.files_seen >= 2
        assert stats.files_indexed >= 2

        # app.py should be in the files table.
        assert indexer.find_file_id("app.py") is not None
        # Re-running should be a no-op (incremental hash check).
        stats2 = indexer.update()
        assert stats2.files_indexed == 0
    finally:
        indexer.close()


def test_indexer_detects_test_files(fixture_repo: Path):
    indexer = RepoIndexer(fixture_repo)
    try:
        indexer.update()
        tests = indexer.all_test_files()
        assert "test_app.py" in tests
    finally:
        indexer.close()
