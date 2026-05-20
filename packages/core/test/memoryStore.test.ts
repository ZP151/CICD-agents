import { describe, expect, it, afterEach } from "vitest";
import { MemoryStore } from "../src/memoryStore.js";
import { makeFixtureRepo, type TempEnv } from "./helpers.js";

let env: TempEnv | null = null;
afterEach(() => {
  if (env) {
    env.cleanup();
    env = null;
  }
});

describe("MemoryStore", () => {
  it("stores and retrieves repo profile values", () => {
    env = makeFixtureRepo();
    const mem = new MemoryStore(env.repoPath);
    mem.setProfile("language", "python");
    expect(mem.getProfile<string>("language")).toBe("python");
    expect(mem.getProfile<string>("missing", "fallback")).toBe("fallback");
    mem.close();
  });

  it("records and queries PR history", () => {
    env = makeFixtureRepo();
    const mem = new MemoryStore(env.repoPath);
    mem.recordPr({
      taskId: "task_1",
      prId: 42,
      prUrl: "https://example/pr/42",
      title: "demo",
      summary: "body",
      riskLevel: "low",
    });
    const all = mem.recentPrs(5);
    expect(all.length).toBe(1);
    expect(all[0]!.prId).toBe(42);
    mem.close();
  });

  it("matches reviewers by glob", () => {
    env = makeFixtureRepo();
    const mem = new MemoryStore(env.repoPath);
    mem.setReviewer("src/api/**", ["alice@example.com", "bob@example.com"]);
    mem.setReviewer("**/*.cs", ["carol@example.com"]);
    const owners = mem.reviewersForPaths(["src/api/foo.py", "src/Other.cs"]);
    expect(owners).toContain("alice@example.com");
    expect(owners).toContain("bob@example.com");
    expect(owners).toContain("carol@example.com");
    mem.close();
  });

  it("tracks flaky tests", () => {
    env = makeFixtureRepo();
    const mem = new MemoryStore(env.repoPath);
    mem.markFlaky("tests/test_app.py::test_add", "intermittent");
    expect(mem.isFlaky("tests/test_app.py::test_add")).toBe(true);
    expect(mem.knownFlakyTests().length).toBe(1);
    mem.close();
  });
});
