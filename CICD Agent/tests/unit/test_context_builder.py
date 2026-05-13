from runtime.core.context_builder import parse_diff

SAMPLE_DIFF = """diff --git a/app.py b/app.py
index abc..def 100644
--- a/app.py
+++ b/app.py
@@ -1,3 +1,6 @@
 def add(a, b):
     return a + b
+
+def multiply(a, b):
+    return a * b
diff --git a/new.txt b/new.txt
new file mode 100644
index 000..123
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,2 @@
+hello
+world
"""


def test_parse_diff_counts_changes():
    files = parse_diff(SAMPLE_DIFF)
    assert {f.path for f in files} == {"app.py", "new.txt"}
    app = next(f for f in files if f.path == "app.py")
    new = next(f for f in files if f.path == "new.txt")
    assert app.status == "modified"
    assert app.additions == 3
    assert new.status == "added"
    assert new.additions == 2


def test_parse_diff_handles_empty():
    assert parse_diff("") == []
