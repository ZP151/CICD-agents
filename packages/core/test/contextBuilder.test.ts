import { describe, expect, it } from "vitest";
import { parseDiff } from "../src/contextBuilder.js";

const SAMPLE_DIFF = `diff --git a/app.py b/app.py
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
`;

describe("parseDiff", () => {
  it("counts additions, deletions, and statuses", () => {
    const files = parseDiff(SAMPLE_DIFF);
    expect(new Set(files.map((f) => f.path))).toEqual(new Set(["app.py", "new.txt"]));
    const app = files.find((f) => f.path === "app.py")!;
    const newFile = files.find((f) => f.path === "new.txt")!;
    expect(app.status).toBe("modified");
    expect(app.additions).toBe(3);
    expect(newFile.status).toBe("added");
    expect(newFile.additions).toBe(2);
  });

  it("handles empty input", () => {
    expect(parseDiff("")).toEqual([]);
  });
});
