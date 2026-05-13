from runtime.core.context_builder import ChangedFile, ContextBundle
from runtime.core.planner import Planner


def test_offline_summary_basic():
    bundle = ContextBundle(
        target_branch="main",
        diff="diff --git a/x.py b/x.py\n",
        changed_files=[
            ChangedFile(path="x.py", status="modified", additions=10, deletions=2),
            ChangedFile(path="y.py", status="added", additions=20, deletions=0),
        ],
    )
    title, summary = Planner.build_summary_offline(bundle)
    assert "2" in title or "x.py" in title
    assert "What" in summary and "Why" in summary
    assert "Risks" in summary


def test_offline_summary_empty():
    bundle = ContextBundle(target_branch="main", diff="")
    title, summary = Planner.build_summary_offline(bundle)
    assert "No changes" in title
    assert "no file changes" in summary.lower()
