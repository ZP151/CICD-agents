import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetSettingsForTests } from "../src/settings.js";

export interface TempEnv {
  dataDir: string;
  repoPath: string;
  cleanup(): void;
}

function git(cwd: string, ...args: string[]): void {
  const r = spawnSync("git", args, {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr.toString()}`);
  }
}

export function makeFixtureRepo(): TempEnv {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-agent-"));
  const dataDir = path.join(root, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.RUNTIME_DATA_DIR = dataDir;
  process.env.AZURE_OPENAI_ENDPOINT = "";
  process.env.AZURE_OPENAI_API_KEY = "";
  resetSettingsForTests();

  const repo = path.join(root, "demo-repo");
  fs.mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "Test");

  fs.writeFileSync(
    path.join(repo, "app.py"),
    "def add(a, b):\n    return a + b\n\nclass Calculator:\n    def square(self, x):\n        return x * x\n",
  );
  fs.writeFileSync(
    path.join(repo, "test_app.py"),
    "from app import add, Calculator\n\ndef test_add():\n    assert add(2, 3) == 5\n\ndef test_square():\n    assert Calculator().square(4) == 16\n",
  );
  fs.writeFileSync(path.join(repo, "README.md"), "# demo repo\n");
  fs.writeFileSync(path.join(repo, "pyproject.toml"), "[project]\nname = 'demo'\nversion = '0'\n");

  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "initial commit");

  git(repo, "checkout", "-q", "-b", "feature/multiply");
  fs.writeFileSync(
    path.join(repo, "app.py"),
    "def add(a, b):\n    return a + b\n\ndef multiply(a, b):\n    return a * b\n\nclass Calculator:\n    def square(self, x):\n        return x * x\n\n    def cube(self, x):\n        return x * x * x\n",
  );
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "add multiply + cube");

  return {
    dataDir,
    repoPath: repo,
    cleanup: () => {
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        // ignored
      }
    },
  };
}
