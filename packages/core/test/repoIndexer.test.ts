import { describe, expect, it, afterEach } from "vitest";
import { detectLanguage, isTestPath } from "../src/indexer/parsers.js";
import { RepoIndexer } from "../src/indexer/repoIndexer.js";
import { makeFixtureRepo, type TempEnv } from "./helpers.js";

let env: TempEnv | null = null;
afterEach(() => {
  if (env) {
    env.cleanup();
    env = null;
  }
});

describe("indexer helpers", () => {
  it("detectLanguage maps extensions", () => {
    expect(detectLanguage("app.py")).toBe("python");
    expect(detectLanguage("Foo.cs")).toBe("c_sharp");
    expect(detectLanguage("index.ts")).toBe("typescript");
    expect(detectLanguage("README.md")).toBeNull();
  });

  it("isTestPath recognises common patterns", () => {
    expect(isTestPath("test_app.py", "python")).toBe(true);
    expect(isTestPath("app_test.py", "python")).toBe(true);
    expect(isTestPath("App.test.ts", "typescript")).toBe(true);
    expect(isTestPath("App.tsx", "typescript")).toBe(false);
    expect(isTestPath("Foo.Tests.cs", "c_sharp")).toBe(true);
  });
});

describe("RepoIndexer", () => {
  it("indexes a fixture repo with python files", async () => {
    env = makeFixtureRepo();
    const idx = new RepoIndexer(env.repoPath);
    const stats = await idx.update();
    expect(stats.filesSeen).toBeGreaterThan(0);
    expect(stats.filesIndexed).toBeGreaterThan(0);
    expect(idx.symbolsInFile("app.py").length).toBeGreaterThan(0);
    expect(idx.allTestFiles()).toContain("test_app.py");
    idx.close();
  });
});
