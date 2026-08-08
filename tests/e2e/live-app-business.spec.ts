import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { evaluateAiInsightAnswer } from "../../packages/core/src/aiInsightQuality";
import { latestClaimBotPipelineRunViaDaemon } from "./lib/adoVerifier";

const DAEMON_URL = "http://127.0.0.1:8787";
const liveAppEnabled = process.env.MERGEPILOT_E2E_LIVE_APP === "1";
const liveAdoEnabled = process.env.MERGEPILOT_E2E_LIVE_ADO === "1";
const destructiveEnabled = process.env.MERGEPILOT_E2E_DESTRUCTIVE === "1";
const claimBotRepoPath =
  process.env.MERGEPILOT_E2E_CLAIMBOT_REPO_PATH ||
  "C:\\Users\\15492\\Develop\\ClaimBot_API";

interface ProjectLinkResponse {
  id: string;
  name: string;
}


function git(cwd: string, args: string[]): string {
  // Explicit stdio keeps git stderr ("Switched to a new branch", CRLF
  // warnings, clone progress) from leaking into the Playwright process's
  // stderr, which the live-E2E wrapper treats as a terminating
  // native-command error and aborts the whole run on.
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function gitOrEmpty(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

async function removePathWithRetry(targetPath: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      rmSync(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

function createTempRepo(): string {
  const repoPath = mkdtempSync(path.join(tmpdir(), "mergepilot-live-stage-"));
  git(repoPath, ["init", "-b", "main"]);
  git(repoPath, ["config", "user.email", "mergepilot-e2e@example.local"]);
  git(repoPath, ["config", "user.name", "MergePilot E2E"]);
  git(repoPath, ["config", "core.autocrlf", "false"]);
  git(repoPath, ["config", "core.eol", "lf"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Live app fixture\n\nInitial content.\n");
  writeFileSync(path.join(repoPath, "notes.txt"), "Initial notes.\n");
  git(repoPath, ["add", "README.md", "notes.txt"]);
  git(repoPath, ["commit", "-m", "Initial commit"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Live app fixture\n\nChanged readme.\n");
  writeFileSync(path.join(repoPath, "notes.txt"), "Changed notes.\n");
  return repoPath;
}

function createSecretDiffTempRepo(): { repoPath: string; secretValue: string } {
  const repoPath = mkdtempSync(path.join(tmpdir(), "mergepilot-live-secret-review-"));
  const secretValue = "mp_live_secret_1234567890abcdef";
  git(repoPath, ["init", "-b", "main"]);
  git(repoPath, ["config", "user.email", "mergepilot-e2e@example.local"]);
  git(repoPath, ["config", "user.name", "MergePilot E2E"]);
  git(repoPath, ["config", "core.autocrlf", "false"]);
  git(repoPath, ["config", "core.eol", "lf"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Secret review fixture\n\nInitial content.\n");
  git(repoPath, ["add", "README.md"]);
  git(repoPath, ["commit", "-m", "Initial commit"]);
  writeFileSync(
    path.join(repoPath, ".env.sample"),
    [
      "AZURE_OPENAI_ENDPOINT=https://example.openai.azure.com/",
      `AZURE_OPENAI_API_KEY=${secretValue}`,
      "AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-4o",
      "",
    ].join("\n"),
  );
  return { repoPath, secretValue };
}

function createStashApplyTempRepo(): string {
  const repoPath = mkdtempSync(path.join(tmpdir(), "mergepilot-live-stash-apply-"));
  git(repoPath, ["init", "-b", "main"]);
  git(repoPath, ["config", "user.email", "mergepilot-e2e@example.local"]);
  git(repoPath, ["config", "user.name", "MergePilot E2E"]);
  git(repoPath, ["config", "core.autocrlf", "false"]);
  git(repoPath, ["config", "core.eol", "lf"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Stash apply fixture\n\nOriginal README.\n");
  git(repoPath, ["add", "README.md"]);
  git(repoPath, ["commit", "-m", "Initial commit"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Stash apply fixture\n\nRestored from stash.\n");
  git(repoPath, ["stash", "push", "-m", "mergepilot apply stash fixture"]);
  expect(git(repoPath, ["status", "--short"])).toBe("");
  expect(git(repoPath, ["stash", "list"])).toContain("mergepilot apply stash fixture");
  return repoPath;
}

function createStashPopTempRepo(): string {
  const repoPath = mkdtempSync(path.join(tmpdir(), "mergepilot-live-stash-pop-"));
  git(repoPath, ["init", "-b", "main"]);
  git(repoPath, ["config", "user.email", "mergepilot-e2e@example.local"]);
  git(repoPath, ["config", "user.name", "MergePilot E2E"]);
  git(repoPath, ["config", "core.autocrlf", "false"]);
  git(repoPath, ["config", "core.eol", "lf"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Stash pop fixture\n\nOriginal README.\n");
  git(repoPath, ["add", "README.md"]);
  git(repoPath, ["commit", "-m", "Initial commit"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Stash pop fixture\n\nRestored and dropped from stash.\n");
  git(repoPath, ["stash", "push", "-m", "mergepilot pop stash fixture"]);
  expect(git(repoPath, ["status", "--short"])).toBe("");
  expect(git(repoPath, ["stash", "list"])).toContain("mergepilot pop stash fixture");
  return repoPath;
}

function createStashPopConflictTempRepo(): string {
  const repoPath = mkdtempSync(path.join(tmpdir(), "mergepilot-live-stash-pop-conflict-"));
  git(repoPath, ["init", "-b", "main"]);
  git(repoPath, ["config", "user.email", "mergepilot-e2e@example.local"]);
  git(repoPath, ["config", "user.name", "MergePilot E2E"]);
  git(repoPath, ["config", "core.autocrlf", "false"]);
  git(repoPath, ["config", "core.eol", "lf"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Stash conflict fixture\n\nshared=base\n");
  git(repoPath, ["add", "README.md"]);
  git(repoPath, ["commit", "-m", "Initial commit"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Stash conflict fixture\n\nshared=stashed\n");
  git(repoPath, ["stash", "push", "-m", "mergepilot pop conflict fixture"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Stash conflict fixture\n\nshared=local\n");
  git(repoPath, ["add", "README.md"]);
  git(repoPath, ["commit", "-m", "docs: local conflicting edit"]);
  expect(git(repoPath, ["status", "--short"])).toBe("");
  expect(git(repoPath, ["stash", "list"])).toContain("mergepilot pop conflict fixture");
  return repoPath;
}

function createCleanTempRepo(): string {
  const repoPath = mkdtempSync(path.join(tmpdir(), "mergepilot-live-clean-"));
  git(repoPath, ["init", "-b", "main"]);
  git(repoPath, ["config", "user.email", "mergepilot-e2e@example.local"]);
  git(repoPath, ["config", "user.name", "MergePilot E2E"]);
  git(repoPath, ["config", "core.autocrlf", "false"]);
  git(repoPath, ["config", "core.eol", "lf"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Clean live app fixture\n\nInitial content.\n");
  git(repoPath, ["add", "README.md"]);
  git(repoPath, ["commit", "-m", "Initial commit"]);
  expect(git(repoPath, ["status", "--short"])).toBe("");
  return repoPath;
}

function createStagedAndUnstagedTempRepo(): string {
  const repoPath = mkdtempSync(path.join(tmpdir(), "mergepilot-live-staged-scope-"));
  git(repoPath, ["init", "-b", "main"]);
  git(repoPath, ["config", "user.email", "mergepilot-e2e@example.local"]);
  git(repoPath, ["config", "user.name", "MergePilot E2E"]);
  git(repoPath, ["config", "core.autocrlf", "false"]);
  git(repoPath, ["config", "core.eol", "lf"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Staged scope fixture\n\nInitial content.\n");
  writeFileSync(path.join(repoPath, "notes.txt"), "Initial notes.\n");
  git(repoPath, ["add", "README.md", "notes.txt"]);
  git(repoPath, ["commit", "-m", "Initial commit"]);

  writeFileSync(path.join(repoPath, "README.md"), "# Staged scope fixture\n\nStaged content.\n");
  writeFileSync(path.join(repoPath, "notes.txt"), "Unstaged notes.\n");
  git(repoPath, ["add", "README.md"]);
  expect(git(repoPath, ["diff", "--cached", "--name-only"])).toBe("README.md");
  expect(git(repoPath, ["diff", "--name-only"])).toBe("notes.txt");
  return repoPath;
}

function createFailingCommitValidationTempRepo(): string {
  const repoPath = mkdtempSync(path.join(tmpdir(), "mergepilot-live-commit-validation-"));
  git(repoPath, ["init", "-b", "main"]);
  git(repoPath, ["config", "user.email", "mergepilot-e2e@example.local"]);
  git(repoPath, ["config", "user.name", "MergePilot E2E"]);
  git(repoPath, ["config", "core.autocrlf", "false"]);
  git(repoPath, ["config", "core.eol", "lf"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Commit validation fixture\n\nInitial content.\n");
  git(repoPath, ["add", "README.md"]);
  git(repoPath, ["commit", "-m", "Initial commit"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Commit validation fixture\n\nBlocked by validation.\n");
  git(repoPath, ["add", "README.md"]);
  const hookPath = path.join(repoPath, ".git", "hooks", "pre-commit");
  writeFileSync(hookPath, "#!/bin/sh\necho \"mergepilot validation failed\" >&2\nexit 1\n");
  chmodSync(hookPath, 0o755);
  expect(git(repoPath, ["status", "--short"])).toBe("M  README.md");
  return repoPath;
}

function createRestoreTempRepo(): string {
  const repoPath = mkdtempSync(path.join(tmpdir(), "mergepilot-live-restore-"));
  git(repoPath, ["init", "-b", "main"]);
  git(repoPath, ["config", "user.email", "mergepilot-e2e@example.local"]);
  git(repoPath, ["config", "user.name", "MergePilot E2E"]);
  git(repoPath, ["config", "core.autocrlf", "false"]);
  git(repoPath, ["config", "core.eol", "lf"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Restore fixture\n\nOriginal README.\n");
  writeFileSync(path.join(repoPath, "notes.txt"), "Original notes.\n");
  git(repoPath, ["add", "README.md", "notes.txt"]);
  git(repoPath, ["commit", "-m", "Initial commit"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Restore fixture\n\nDiscard this README edit.\n");
  writeFileSync(path.join(repoPath, "notes.txt"), "Keep this notes edit.\n");
  expect(git(repoPath, ["diff", "--name-only"])).toBe("README.md\nnotes.txt");
  return repoPath;
}

function createRevertTempRepo(): string {
  const repoPath = mkdtempSync(path.join(tmpdir(), "mergepilot-live-revert-"));
  git(repoPath, ["init", "-b", "main"]);
  git(repoPath, ["config", "user.email", "mergepilot-e2e@example.local"]);
  git(repoPath, ["config", "user.name", "MergePilot E2E"]);
  git(repoPath, ["config", "core.autocrlf", "false"]);
  git(repoPath, ["config", "core.eol", "lf"]);
  git(repoPath, ["config", "core.editor", "true"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Revert fixture\n\nOriginal release note.\n");
  git(repoPath, ["add", "README.md"]);
  git(repoPath, ["commit", "-m", "Initial commit"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Revert fixture\n\nBad release note.\n");
  git(repoPath, ["add", "README.md"]);
  git(repoPath, ["commit", "-m", "docs: bad release note"]);
  expect(git(repoPath, ["rev-list", "--count", "HEAD"])).toBe("2");
  return repoPath;
}

function createCredentialRemoteTempRepo(): TempPushRepo {
  const repo = createTempPushRepo();
  const credentialRemote = "https://mergepilot:supersecrettoken@example.visualstudio.com/Claims/_git/Repo";
  git(repo.repoPath, ["remote", "set-url", "origin", credentialRemote]);
  expect(git(repo.repoPath, ["remote", "get-url", "origin"])).toBe(credentialRemote);
  return repo;
}

interface DirtyBranchSwitchRepo {
  repoPath: string;
  currentBranch: string;
  targetBranch: string;
}

interface TempMergeTargetRepo {
  repoPath: string;
  currentBranch: string;
  targetBranch: string;
  targetHead: string;
}

function createDirtyBranchSwitchRepo(): DirtyBranchSwitchRepo {
  const repoPath = mkdtempSync(path.join(tmpdir(), "mergepilot-live-switch-"));
  const currentBranch = "main";
  const targetBranch = "feature/live-switch-target";

  git(repoPath, ["init", "-b", currentBranch]);
  git(repoPath, ["config", "user.email", "mergepilot-e2e@example.local"]);
  git(repoPath, ["config", "user.name", "MergePilot E2E"]);
  git(repoPath, ["config", "core.autocrlf", "false"]);
  git(repoPath, ["config", "core.eol", "lf"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Dirty branch switch fixture\n\nInitial content.\n");
  git(repoPath, ["add", "README.md"]);
  git(repoPath, ["commit", "-m", "Initial commit"]);

  git(repoPath, ["checkout", "-b", targetBranch]);
  writeFileSync(path.join(repoPath, "branch.txt"), "Target branch content.\n");
  git(repoPath, ["add", "branch.txt"]);
  git(repoPath, ["commit", "-m", "chore: add target branch file"]);

  git(repoPath, ["checkout", currentBranch]);
  writeFileSync(path.join(repoPath, "README.md"), "# Dirty branch switch fixture\n\nLocal uncommitted edit.\n");
  expect(git(repoPath, ["branch", "--show-current"])).toBe(currentBranch);
  expect(git(repoPath, ["diff", "--name-only"])).toBe("README.md");
  return { repoPath, currentBranch, targetBranch };
}

function createFastForwardMergeRepo(): TempMergeTargetRepo {
  const repoPath = mkdtempSync(path.join(tmpdir(), "mergepilot-live-merge-target-"));
  const currentBranch = "feature/live-merge-target";
  const targetBranch = "main";

  git(repoPath, ["init", "-b", targetBranch]);
  git(repoPath, ["config", "user.email", "mergepilot-e2e@example.local"]);
  git(repoPath, ["config", "user.name", "MergePilot E2E"]);
  git(repoPath, ["config", "core.autocrlf", "false"]);
  git(repoPath, ["config", "core.eol", "lf"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Merge target fixture\n\nInitial content.\n");
  git(repoPath, ["add", "README.md"]);
  git(repoPath, ["commit", "-m", "Initial commit"]);

  git(repoPath, ["checkout", "-b", currentBranch]);
  git(repoPath, ["checkout", targetBranch]);
  writeFileSync(path.join(repoPath, "release-notes.md"), "Release readiness note.\n");
  git(repoPath, ["add", "release-notes.md"]);
  git(repoPath, ["commit", "-m", "docs: add release readiness note"]);
  const targetHead = git(repoPath, ["rev-parse", "HEAD"]);

  git(repoPath, ["checkout", currentBranch]);
  expect(git(repoPath, ["rev-parse", "HEAD"])).not.toBe(targetHead);
  expect(git(repoPath, ["status", "--short"])).toBe("");
  return { repoPath, currentBranch, targetBranch, targetHead };
}

function createMergeConflictRepo(): TempMergeTargetRepo {
  const repoPath = mkdtempSync(path.join(tmpdir(), "mergepilot-live-merge-conflict-"));
  const currentBranch = "feature/live-merge-conflict";
  const targetBranch = "main";

  git(repoPath, ["init", "-b", targetBranch]);
  git(repoPath, ["config", "user.email", "mergepilot-e2e@example.local"]);
  git(repoPath, ["config", "user.name", "MergePilot E2E"]);
  git(repoPath, ["config", "core.autocrlf", "false"]);
  git(repoPath, ["config", "core.eol", "lf"]);
  writeFileSync(path.join(repoPath, "app.config"), "mode=base\nshared=base\n");
  git(repoPath, ["add", "app.config"]);
  git(repoPath, ["commit", "-m", "Initial commit"]);

  git(repoPath, ["checkout", "-b", currentBranch]);
  writeFileSync(path.join(repoPath, "app.config"), "mode=base\nshared=feature\n");
  git(repoPath, ["add", "app.config"]);
  git(repoPath, ["commit", "-m", "feat: branch config change"]);

  git(repoPath, ["checkout", targetBranch]);
  writeFileSync(path.join(repoPath, "app.config"), "mode=base\nshared=main\n");
  git(repoPath, ["add", "app.config"]);
  git(repoPath, ["commit", "-m", "feat: main config change"]);
  const targetHead = git(repoPath, ["rev-parse", "HEAD"]);

  git(repoPath, ["checkout", currentBranch]);
  expect(git(repoPath, ["status", "--short"])).toBe("");
  expect(git(repoPath, ["rev-parse", "HEAD"])).not.toBe(targetHead);
  return { repoPath, currentBranch, targetBranch, targetHead };
}

interface TempPushRepo {
  rootPath: string;
  repoPath: string;
  originPath: string;
  branchName: string;
  localHead: string;
}

interface TempBehindRepo {
  rootPath: string;
  repoPath: string;
  originPath: string;
  branchName: string;
  remoteHead: string;
}

interface TempRebaseConflictRepo {
  rootPath: string;
  repoPath: string;
  originPath: string;
  branchName: string;
}

function createTempBehindRepo(): TempBehindRepo {
  const rootPath = mkdtempSync(path.join(tmpdir(), "mergepilot-live-behind-"));
  const originPath = path.join(rootPath, "origin.git");
  const repoPath = path.join(rootPath, "work");
  const otherPath = path.join(rootPath, "other");
  const branchName = "main";
  mkdirSync(repoPath);
  mkdirSync(otherPath);

  git(rootPath, ["init", "--bare", originPath]);
  git(repoPath, ["init", "-b", branchName]);
  git(repoPath, ["config", "user.email", "mergepilot-e2e@example.local"]);
  git(repoPath, ["config", "user.name", "MergePilot E2E"]);
  git(repoPath, ["config", "core.autocrlf", "false"]);
  git(repoPath, ["config", "core.eol", "lf"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Live app pull fixture\n\nInitial content.\n");
  git(repoPath, ["add", "README.md"]);
  git(repoPath, ["commit", "-m", "Initial commit"]);
  git(repoPath, ["remote", "add", "origin", originPath]);
  git(repoPath, ["push", "-u", "origin", branchName]);

  git(rootPath, ["clone", originPath, otherPath]);
  git(otherPath, ["checkout", branchName]);
  git(otherPath, ["config", "user.email", "mergepilot-e2e@example.local"]);
  git(otherPath, ["config", "user.name", "MergePilot E2E"]);
  git(otherPath, ["config", "core.autocrlf", "false"]);
  git(otherPath, ["config", "core.eol", "lf"]);
  writeFileSync(path.join(otherPath, "README.md"), "# Live app pull fixture\n\nRemote update.\n");
  git(otherPath, ["add", "README.md"]);
  git(otherPath, ["commit", "-m", "docs: remote update"]);
  git(otherPath, ["push", "origin", branchName]);

  const remoteHead = git(otherPath, ["rev-parse", "HEAD"]);
  git(repoPath, ["fetch", "origin"]);
  expect(git(repoPath, ["status", "--short", "--branch"])).toContain("[behind 1]");
  return { rootPath, repoPath, originPath, branchName, remoteHead };
}

function createTempRebaseConflictRepo(): TempRebaseConflictRepo {
  const rootPath = mkdtempSync(path.join(tmpdir(), "mergepilot-live-rebase-conflict-"));
  const originPath = path.join(rootPath, "origin.git");
  const repoPath = path.join(rootPath, "work");
  const otherPath = path.join(rootPath, "other");
  const branchName = "main";
  mkdirSync(repoPath);
  mkdirSync(otherPath);

  git(rootPath, ["init", "--bare", originPath]);
  git(repoPath, ["init", "-b", branchName]);
  git(repoPath, ["config", "user.email", "mergepilot-e2e@example.local"]);
  git(repoPath, ["config", "user.name", "MergePilot E2E"]);
  git(repoPath, ["config", "core.autocrlf", "false"]);
  git(repoPath, ["config", "core.eol", "lf"]);
  writeFileSync(path.join(repoPath, "app.config"), "mode=base\nshared=base\n");
  git(repoPath, ["add", "app.config"]);
  git(repoPath, ["commit", "-m", "Initial commit"]);
  git(repoPath, ["remote", "add", "origin", originPath]);
  git(repoPath, ["push", "-u", "origin", branchName]);

  git(rootPath, ["clone", originPath, otherPath]);
  git(otherPath, ["checkout", branchName]);
  git(otherPath, ["config", "user.email", "mergepilot-e2e@example.local"]);
  git(otherPath, ["config", "user.name", "MergePilot E2E"]);
  git(otherPath, ["config", "core.autocrlf", "false"]);
  git(otherPath, ["config", "core.eol", "lf"]);

  writeFileSync(path.join(repoPath, "app.config"), "mode=base\nshared=local\n");
  git(repoPath, ["add", "app.config"]);
  git(repoPath, ["commit", "-m", "feat: local config change"]);

  writeFileSync(path.join(otherPath, "app.config"), "mode=base\nshared=remote\n");
  git(otherPath, ["add", "app.config"]);
  git(otherPath, ["commit", "-m", "feat: remote config change"]);
  git(otherPath, ["push", "origin", branchName]);

  git(repoPath, ["fetch", "origin"]);
  const status = git(repoPath, ["status", "--short", "--branch"]);
  expect(status).toContain("[ahead 1, behind 1]");
  return { rootPath, repoPath, originPath, branchName };
}

function createTempPushRepo(): TempPushRepo {
  const rootPath = mkdtempSync(path.join(tmpdir(), "mergepilot-live-push-"));
  const originPath = path.join(rootPath, "origin.git");
  const repoPath = path.join(rootPath, "work");
  mkdirSync(repoPath);

  git(rootPath, ["init", "--bare", originPath]);
  git(repoPath, ["init", "-b", "main"]);
  git(repoPath, ["config", "user.email", "mergepilot-e2e@example.local"]);
  git(repoPath, ["config", "user.name", "MergePilot E2E"]);
  git(repoPath, ["config", "core.autocrlf", "false"]);
  git(repoPath, ["config", "core.eol", "lf"]);
  writeFileSync(path.join(repoPath, "README.md"), "# Live app push fixture\n\nInitial content.\n");
  git(repoPath, ["add", "README.md"]);
  git(repoPath, ["commit", "-m", "Initial commit"]);
  git(repoPath, ["remote", "add", "origin", originPath]);
  git(repoPath, ["push", "-u", "origin", "main"]);

  const branchName = "feature/live-app-push";
  git(repoPath, ["checkout", "-b", branchName]);
  writeFileSync(path.join(repoPath, "README.md"), "# Live app push fixture\n\nChanged content.\n");
  git(repoPath, ["add", "README.md"]);
  git(repoPath, ["commit", "-m", "chore: prepare push fixture"]);
  expect(git(repoPath, ["status", "--short"])).toBe("");
  const localHead = git(repoPath, ["rev-parse", "HEAD"]);
  return { rootPath, repoPath, originPath, branchName, localHead };
}

async function createTempProjectLink(
  request: APIRequestContext,
  repoPath: string,
  namePrefix: string,
  defaultBranch = "main",
): Promise<ProjectLinkResponse> {
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const createResponse = await request.post(`${DAEMON_URL}/project-links`, {
    data: {
      name: `${namePrefix}-${runId}`,
      repoPath,
      defaultBranch,
      targetBranch: "main",
      // A unique ADO org prevents the desktop from substituting this
      // temporary test link with a leftover non-temporary environment link
      // that shares the same (empty) ADO mapping — e.g. "ClaimBot API E2E" —
      // which would redirect the whole turn at the wrong repository.
      adoOrgUrl: "https://mergepilot-e2e.invalid/",
      adoProject: "",
      adoRepoName: "",
      adoPat: "",
      adoPipelineId: "",
      adoPipelineName: "",
      adoMcpEnabled: false,
      adoMcpCommand: "",
      adoMcpAuthentication: "",
      adoMcpDomains: "repositories,pipelines,work-items",
      projectTemplate: "",
      buildCommand: "",
      testCommand: "",
    },
  });
  expect(createResponse.ok()).toBeTruthy();
  return await createResponse.json() as ProjectLinkResponse;
}

async function createClaimBotPipelineProjectLink(
  request: APIRequestContext,
): Promise<ProjectLinkResponse> {
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const createResponse = await request.post(`${DAEMON_URL}/project-links`, {
    data: {
      // Non-temporary name (no "mp-live-" prefix) so the desktop keeps this
      // link active instead of substituting the leftover "ClaimBot_API link".
      // V2 canonical (GAP-01/02): stable identity only — no defaultBranch,
      // targetBranch, pipeline, or MCP fields.
      name: `e2e-claimbot-pipeline-${runId}`,
      repoPath: claimBotRepoPath,
      adoOrgUrl: "https://tebssg.visualstudio.com/",
      adoProject: "TeBS-ClaimBot",
      adoRepoName: "ClaimBot_API",
      adoPat: "",
    },
  });
  expect(createResponse.ok()).toBeTruthy();
  return await createResponse.json() as ProjectLinkResponse;
}

async function createClaimBotPipelineDiscoveryProjectLink(
  request: APIRequestContext,
): Promise<ProjectLinkResponse> {
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const createResponse = await request.post(`${DAEMON_URL}/project-links`, {
    data: {
      // Non-temporary name (no "mp-live-" prefix) so the desktop keeps this
      // link active instead of substituting the leftover "ClaimBot_API link".
      // V2 canonical (GAP-01/02): stable identity only.
      name: `e2e-claimbot-discover-pipeline-${runId}`,
      repoPath: claimBotRepoPath,
      adoOrgUrl: "https://tebssg.visualstudio.com/",
      adoProject: "TeBS-ClaimBot",
      adoRepoName: "ClaimBot_API",
      adoPat: "",
    },
  });
  expect(createResponse.ok()).toBeTruthy();
  return await createResponse.json() as ProjectLinkResponse;
}

async function selectProjectLinkInBrowser(page: Page, projectLinkId: string, repoPath: string): Promise<void> {
  await page.addInitScript(({ activeProjectLinkId, activeRepoPath }) => {
    localStorage.setItem("mergepilot_active_project_link_id", activeProjectLinkId);
    localStorage.setItem("chat_repo", activeRepoPath);
    sessionStorage.removeItem("dev_agent_chat_draft_v1");
  }, { activeProjectLinkId: projectLinkId, activeRepoPath: repoPath });
}

function liveEnvironmentPanel(page: Page) {
  return page
    .locator(".pointer-events-auto")
    .filter({ hasText: "Context" })
    .filter({ hasText: "Commit or push" })
    .first();
}

async function openLiveChat(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto("/chat?new=1");
  // Real readiness signal: on a cold Vite dev server the route chunk graph
  // (all lazy route modules plus their static imports) compiles on demand,
  // and the shell renders the "Preparing workspace" Suspense fallback until
  // the chat route is interactive. Gate on the actual condition — the input
  // being visible — as the documented first-load compile budget (see the
  // playwright.config.ts note). Warm loads resolve this in ~1s.
  await expect(page.getByPlaceholder(/Ask MergePilot/)).toBeVisible({ timeout: 240_000 });
}

/**
 * The daemon-rendered tool evidence lives in a three-level disclosure tree:
 * the turn transcript toggle ("Worked for …", collapsed once the turn seals),
 * the tool group ("Ran commands", collapsed by default), and the per-command
 * row whose redacted output is removed from the DOM until opened. Expand
 * every level for the requested tool so assertions read the structured
 * evidence — the host of the redacted remote URL, the redacted variable
 * names — instead of depending on the model's prose. The leak assertions
 * then also run against the expanded output, the strongest possible surface.
 */
async function expandCommandOutput(page: Page, toolName: string): Promise<void> {
  const turnToggles = page.getByRole("button", { name: /^(Working|Worked|Cancelled|Stopped) for/ });
  const turnCount = await turnToggles.count();
  for (let i = 0; i < turnCount; i++) {
    const toggle = turnToggles.nth(i);
    if ((await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.click();
      // Subtree mounts in the same React commit as the aria-expanded state;
      // waiting on it also synchronizes the DOM before the caller reads
      // innerText (otherwise innerText can race ahead of the re-render).
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
    }
  }
  const groupToggles = page.getByRole("button", { name: /^Ran commands/ });
  const groupCount = await groupToggles.count();
  for (let i = 0; i < groupCount; i++) {
    const toggle = groupToggles.nth(i);
    if ((await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
    }
  }
  const rows = page.getByRole("button", { name: new RegExp(`^Ran ${toolName}\\b`), exact: false });
  const rowCount = await rows.count();
  // The row exists only if the daemon executed the tool this turn. A review
  // that never ran it must fail the quality checks (which report exactly
  // which evidence is missing) instead of failing this helper first.
  if (rowCount === 0) return;
  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i);
    await expect(row).toBeVisible({ timeout: 15_000 });
    if ((await row.getAttribute("aria-expanded")) !== "true") {
      await row.click();
      await expect(row).toHaveAttribute("aria-expanded", "true");
    }
  }
}

async function pendingActionCardOrTurnEnded(
  page: Page,
  card: Locator,
  chipCountBefore: number,
  timeoutMs: number,
): Promise<boolean> {
  // A pending-action card renders mid-turn when the model proposes a write
  // action. If instead the turn ends without a proposal (the model answered
  // without proposing), the finished message bubble renders its "Worked for
  // Ns" status. Wait for whichever happens first so a decline can be
  // re-prompted without burning the whole wait; a turn still running at the
  // deadline is a real failure and surfaces through the poll timeout.
  await expect
    .poll(
      async () => {
        if (await card.isVisible().catch(() => false)) return "card";
        const chipCount = await page.getByRole("button", { name: /^Worked for \d+s$/ }).count();
        if (chipCount > chipCountBefore) return "ended";
        return "running";
      },
      { timeout: timeoutMs, message: "expected the pending-action card or a finished turn" },
    )
    .toMatch(/card|ended/);
  // The card can render in the same instant the turn ends; report it present
  // whenever it is in the DOM.
  return (await card.isVisible().catch(() => false)) === true;
}

async function openEnvironmentPanel(page: Page): Promise<void> {
  // Since v0.5.24 the Context summary is only rendered while the pinned
  // summary is open (it starts closed). Pin it on demand, mirroring the
  // chat-layout spec, instead of relying on the pre-v0.5.24 default-open
  // behaviour.
  const environment = page.getByText("Context").first();
  if (!(await environment.isVisible().catch(() => false))) {
    await page.getByTitle("Show pinned summary").click();
  }
  await expect(environment).toBeVisible();
}

async function refreshEnvironmentPanelBranch(
  page: Page,
  environmentPanel: ReturnType<typeof liveEnvironmentPanel>,
): Promise<void> {
  // A fresh session has no branch evidence — Project Link V2 does not persist
  // a default branch, and no tool bubble has reported one yet — so the branch
  // menu button reads "not checked" until the refresh_branch workspace action
  // resolves the live branch. Run that refresh before callers assert on
  // branch-labelled buttons.
  await environmentPanel.getByRole("button", { name: /not checked/i }).click();
  await environmentPanel.getByRole("button", { name: "Refresh branch state" }).click();
  await expect(page.locator("main").getByRole("button", { name: /Ran|Worked/i }).first()).toBeVisible({
    timeout: 90_000,
  });
  await expect(environmentPanel.getByRole("button", { name: /not checked/i })).toHaveCount(0);
}

/**
 * The ClaimBot_API pipeline #117 row in the Pipeline workspace. The winner
 * row may come from a saved connection or live discovery (source is not
 * asserted); the stable identity (#117 on the ClaimBot_API repository) is
 * what every pipeline scenario targets.
 */
function claimBotPipelineRow(page: Page) {
  return page
    .getByTestId("pipeline-row-card")
    .filter({ hasText: "#117" })
    .filter({ hasText: "ClaimBot_API" })
    .first();
}

test.describe("Live app business workflows", () => {
  test.skip(!liveAppEnabled, "Set MERGEPILOT_E2E_LIVE_APP=1 to run against the live frontend and daemon.");

  // Vite dev compiles the route chunk graphs on demand (dynamic imports;
  // server.warmup in vite.config.ts covers only static graphs and yields to
  // live requests under load). A cold first navigation measured 24-88s for
  // the document plus 15-32s per module group, so the compile must not land
  // inside any per-test budget. Compile chat and the Pipeline workspace once
  // here against the real readiness signals, then close the page: every
  // test's navigation then hits the warm transform cache (~1s) and per-test
  // timeouts budget turn/ADO work, not first-load compilation.
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    const warmupPage = await browser.newPage();
    try {
      await warmupPage.setViewportSize({ width: 1280, height: 820 });
      await warmupPage.goto("/chat?new=1");
      await expect(warmupPage.getByPlaceholder(/Ask MergePilot/)).toBeVisible({ timeout: 240_000 });
      // HashRouter routes from the fragment only: reach the workspace via
      // its hash route.
      await warmupPage.goto("/#/pipelines");
      await expect(warmupPage.getByRole("heading", { name: "Pipelines" })).toBeVisible({ timeout: 240_000 });
    } finally {
      await warmupPage.close().catch(() => undefined);
    }
  });

  test("stages only the requested file through the real Chat UI", async ({ page, request }) => {
    // Cold first load compiles the entire app module graph on demand in Vite
    // dev (route chunks are dynamic imports; see vite.config server.warmup).
    // The 240s gate below is the documented compile budget, matching the
    // playwright.config.ts note on first-load compilation. Business
    // assertions below keep their own waits.
    test.setTimeout(300_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createTempRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-stage-selected");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);

      await openLiveChat(page);
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Stage only README.md. Do not stage notes.txt. Do not commit or push.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const approvalCard = page.getByTestId("pending-action-card").first();
      // The first proposal window is 150s: the 2026-08-08 run measured the
      // card at 90.4s, which missed the former 90s budget by ~0.4s (the
      // 90s budget failed once). The model's proposal latency drifts with
      // host load, so the window is 150s with the post-conditions asserting
      // the staged scope.
      await expect(approvalCard).toBeVisible({ timeout: 150_000 });
      await expect(approvalCard.getByText(/git add/i).first()).toBeVisible();
      await expect(approvalCard.getByText("README.md").first()).toBeVisible();
      // The LLM-written card description may mention notes.txt; the staged
      // scope that matters is the command preview.
      await expect(approvalCard.locator("code").first()).toContainText("README.md");
      await expect(approvalCard.locator("code").first()).not.toContainText("notes.txt");
      await approvalCard.getByRole("button", { name: "Approve and run" }).click();

      await expect.poll(() => git(repoPath, ["status", "--short"]), { timeout: 30_000 }).toBe(
        "M  README.md\n M notes.txt",
      );
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(repoPath);
    }
  });

  test("restores a pending approval after reload and executes it once", async ({ page, request }) => {
    // Three budgeted turn windows: the first proposal (150s, may end without
    // proposing), one corrective re-prompt naming git_add explicitly (150s),
    // and the restored-approval execution after reload (45s verify).
    test.setTimeout(420_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createTempRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-approval-restore");
      projectLinkId = projectLink.id;

      await openLiveChat(page);
      await page.evaluate(({ activeProjectLinkId, activeRepoPath }) => {
        localStorage.setItem("mergepilot_active_project_link_id", activeProjectLinkId);
        localStorage.setItem("chat_repo", activeRepoPath);
        sessionStorage.removeItem("dev_agent_chat_draft_v1");
      }, { activeProjectLinkId: projectLinkId, activeRepoPath: repoPath });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Stage only README.md. Do not stage notes.txt. Do not commit or push.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const approvalCard = page.getByTestId("pending-action-card").first();
      // The model can answer without proposing the write action (measured:
      // the 2026-08-08 run closed the turn at 86.9s with no proposal, which
      // the 90s card wait could not recover from). Wait for either the card
      // or a finished turn, then re-prompt once naming git_add explicitly
      // (same recovery pattern as the tag test).
      const chipCountBefore = await page.getByRole("button", { name: /^Worked for \d+s$/ }).count();
      const cardShown = await pendingActionCardOrTurnEnded(page, approvalCard, chipCountBefore, 150_000);
      if (!cardShown) {
        await page.getByPlaceholder(/Ask MergePilot/).fill(
          "Stage only README.md. Do not stage notes.txt. Do not commit or push. " +
            "You have not staged anything yet. The git_add tool is available in this environment " +
            "(approval-required write tool); use it to propose staging only README.md and wait for my approval.",
        );
        await page.getByRole("button", { name: "Send" }).click();
        const cardShownAfterRePrompt = await pendingActionCardOrTurnEnded(
          page,
          approvalCard,
          chipCountBefore + 1,
          150_000,
        );
        expect(cardShownAfterRePrompt, "approval card after the corrective re-prompt").toBeTruthy();
      }
      await expect(approvalCard.getByText(/git add/i).first()).toBeVisible();
      await expect(approvalCard.getByText("README.md").first()).toBeVisible();
      // The LLM-written card description may mention notes.txt; the staged
      // scope that matters is the command preview.
      await expect(approvalCard.locator("code").first()).toContainText("README.md");
      await expect(approvalCard.locator("code").first()).not.toContainText("notes.txt");
      expect(git(repoPath, ["diff", "--cached", "--name-only"])).toBe("");

      const draftSessionId = await page.evaluate(() => {
        const raw = sessionStorage.getItem("dev_agent_chat_draft_v1");
        return raw ? (JSON.parse(raw) as { sessionId?: string | null }).sessionId ?? null : null;
      });
      expect(draftSessionId).toEqual(expect.any(String));
      const stateResponse = await request.get(`${DAEMON_URL}/chat/${draftSessionId}/state`);
      expect(stateResponse.ok()).toBeTruthy();
      const state = await stateResponse.json() as { workflowState?: { pendingApproval?: { action?: { tool?: string } } } };
      expect(state.workflowState?.pendingApproval?.action?.tool).toBe("git_add");

      await page.reload({ waitUntil: "domcontentloaded" });
      const restoredApprovalCard = page.getByTestId("pending-action-card").first();
      await expect(restoredApprovalCard).toBeVisible({ timeout: 30_000 });
      await expect(restoredApprovalCard.getByText(/git add/i).first()).toBeVisible();
      await expect(restoredApprovalCard.getByText("README.md").first()).toBeVisible();
      // The LLM-written card description may mention notes.txt; the staged
      // scope that matters is the command preview.
      await expect(restoredApprovalCard.locator("code").first()).toContainText("README.md");
      await expect(restoredApprovalCard.locator("code").first()).not.toContainText("notes.txt");
      expect(git(repoPath, ["diff", "--cached", "--name-only"])).toBe("");

      await restoredApprovalCard.getByRole("button", { name: "Approve and run" }).click();
      await expect.poll(() => git(repoPath, ["status", "--short"]), { timeout: 30_000 }).toBe(
        "M  README.md\n M notes.txt",
      );
      expect(git(repoPath, ["diff", "--cached", "--name-only"])).toBe("README.md");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(repoPath);
    }
  });

  test("does not stage files when the user rejects a real Chat UI approval", async ({ page, request }) => {
    test.setTimeout(120_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createTempRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-reject-stage");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);

      await openLiveChat(page);
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Stage only README.md. Do not stage notes.txt. Do not commit or push.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const approvalCard = page.getByTestId("pending-action-card").first();
      await expect(approvalCard).toBeVisible({ timeout: 90_000 });
      await expect(approvalCard.getByText(/git add/i).first()).toBeVisible();
      await approvalCard.getByRole("button", { name: "Skip action" }).click();

      await expect.poll(() => git(repoPath, ["diff", "--cached", "--name-only"]), { timeout: 30_000 }).toBe("");
      expect(git(repoPath, ["diff", "--name-only"])).toBe("README.md\nnotes.txt");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(repoPath);
    }
  });

  test("uses approval denial feedback as the next real Chat UI instruction", async ({ page, request }) => {
    // Two budgeted turn windows: the first proposal (90s) plus the revision
    // turn, which may close claiming completion without proposing (measured:
    // the 2026-08-08 run closed the revision at 84s with only git_status +
    // git_diff executed and the final narrative claiming "Staged notes.txt
    // successfully" — nothing was staged). One corrective re-prompt names
    // git_add and forbids completion claims before the approval gate asserts.
    test.setTimeout(420_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createTempRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-denial-feedback");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);

      await openLiveChat(page);
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Stage only README.md. Do not stage notes.txt. Do not commit or push.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const firstApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git add/i })
        .filter({ hasText: "README.md" })
        .first();
      await expect(firstApproval).toBeVisible({ timeout: 90_000 });
      // The working-turn prose and the LLM-written card description may
      // mention notes.txt; the staged scope that matters is the command
      // preview.
      await expect(firstApproval.locator("code").first()).toContainText("README.md");
      await expect(firstApproval.locator("code").first()).not.toContainText("notes.txt");

      await firstApproval
        .getByPlaceholder("Tell MergePilot what to do differently...")
        .fill("Actually stage only notes.txt instead. Do not stage README.md. Do not commit or push.");
      await firstApproval.getByRole("button", { name: "Skip action" }).click();

      await expect.poll(() => git(repoPath, ["diff", "--cached", "--name-only"]), { timeout: 30_000 }).toBe("");

      // Skipping closes the Turn; the denial feedback becomes the next
      // Chat instruction the user sends.
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Actually stage only notes.txt instead. Do not stage README.md. Do not commit or push.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const revisedApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git add/i })
        .filter({ hasText: "notes.txt" })
        .first();
      // The revision turn may close without proposing (see the test comment:
      // measured 84s with a completion-claiming final narrative). Wait for
      // either the revised card or a finished turn, then re-prompt once
      // forbidding completion claims (same recovery pattern as the tag test).
      const chipCountBefore = await page.getByRole("button", { name: /^Worked for \d+s$/ }).count();
      const cardShown = await pendingActionCardOrTurnEnded(page, revisedApproval, chipCountBefore, 120_000);
      if (!cardShown) {
        await page.getByPlaceholder(/Ask MergePilot/).fill(
          "Actually stage only notes.txt instead. Do not stage README.md. Do not commit or push. " +
            "You have not staged anything yet — do not claim completion. Use the git_add tool to " +
            "propose staging only notes.txt and wait for my approval.",
        );
        await page.getByRole("button", { name: "Send" }).click();
        const cardShownAfterRePrompt = await pendingActionCardOrTurnEnded(
          page,
          revisedApproval,
          chipCountBefore + 1,
          150_000,
        );
        expect(cardShownAfterRePrompt, "revised approval card after the corrective re-prompt").toBeTruthy();
      }
      // The revised card's description may mention README.md; the staged
      // scope that matters is the command preview.
      await expect(revisedApproval.locator("code").first()).toContainText("notes.txt");
      await expect(revisedApproval.locator("code").first()).not.toContainText("README.md");
      await revisedApproval.getByRole("button", { name: "Approve and run" }).click();

      await expect.poll(() => git(repoPath, ["diff", "--cached", "--name-only"]), { timeout: 30_000 }).toBe(
        "notes.txt",
      );
      expect(git(repoPath, ["diff", "--name-only"])).toBe("README.md");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(repoPath);
    }
  });

  test("stages and commits through consecutive real Chat UI approvals", async ({ page, request }) => {
    test.setTimeout(150_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createTempRepo();
    const commitMessage = "chore: update live app fixture";
    const initialCommitCount = Number(git(repoPath, ["rev-list", "--count", "HEAD"]));
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-stage-commit");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);
      await openLiveChat(page);
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        `Stage all changes and commit them with message "${commitMessage}". Do not push.`,
      );
      await page.getByRole("button", { name: "Send" }).click();

      const stageApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git add/i })
        .first();
      await expect(stageApproval).toBeVisible({ timeout: 90_000 });
      await stageApproval.getByRole("button", { name: "Approve and run" }).click();

      await expect.poll(() => git(repoPath, ["status", "--short"]), { timeout: 30_000 }).toBe(
        "M  README.md\nM  notes.txt",
      );

      // Note: the desktop's canonical dispatch does not render the next
      // approval inside the same Turn after a confirm-action (the daemon
      // streams turn.approval.requested for the commit, the UI never shows
      // it), so this step currently times out against the app and is tracked
      // as an app defect.
      const commitApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git commit/i })
        .first();
      await expect(commitApproval).toBeVisible({ timeout: 90_000 });
      await expect(commitApproval.getByText(commitMessage).first()).toBeVisible();
      await commitApproval.getByRole("button", { name: "Approve and run" }).click();

      await expect.poll(() => Number(git(repoPath, ["rev-list", "--count", "HEAD"])), { timeout: 45_000 }).toBe(
        initialCommitCount + 1,
      );
      expect(git(repoPath, ["log", "-1", "--pretty=%s"])).toBe(commitMessage);
      expect(git(repoPath, ["status", "--short"])).toBe("");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(repoPath);
    }
  });

  test("surfaces commit validation failure and preserves staged changes", async ({ page, request }) => {
    test.setTimeout(150_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createFailingCommitValidationTempRepo();
    const commitMessage = "chore: blocked by validation";
    const initialHead = git(repoPath, ["rev-parse", "HEAD"]);
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-commit-validation");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);
      await openLiveChat(page);
      await openEnvironmentPanel(page);
      await page.getByRole("button", { name: "Commit or push", exact: true }).click();
      await page.getByPlaceholder("Commit message (leave blank to generate)...").fill(commitMessage);
      const includeUnstaged = page.getByLabel("Include unstaged changes");
      if (await includeUnstaged.isChecked()) await includeUnstaged.uncheck();
      await page.getByRole("button", { name: "Prepare commit", exact: true }).click();

      const commitApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git commit/i })
        .first();
      await expect(commitApproval).toBeVisible({ timeout: 90_000 });
      await expect(commitApproval.getByText(commitMessage).first()).toBeVisible();
      await commitApproval.getByRole("button", { name: "Approve and run" }).click();

      // The failure narrative is the surfaced evidence; the old "Stopped
      // after git commit" action line is no longer rendered in the UI.
      await expect(page.getByText(/Commit failed before a new commit was created/i).first()).toBeVisible({ timeout: 90_000 });
      await expect(page.getByText(/Staged changes are still staged: README\.md/i).first()).toBeVisible();
      await expect(page.getByText(/mergepilot validation failed/i).first()).toBeVisible();
      expect(git(repoPath, ["rev-parse", "HEAD"])).toBe(initialHead);
      expect(git(repoPath, ["status", "--short"])).toBe("M  README.md");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(repoPath);
    }
  });

  test("does not create an empty commit when no staged changes exist", async ({ page, request }) => {
    test.setTimeout(120_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createCleanTempRepo();
    const initialHead = git(repoPath, ["rev-parse", "HEAD"]);
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-clean-commit");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);
      await openLiveChat(page);
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Commit staged changes with message \"chore: should not happen\". Do not stage anything. If nothing is staged, explain and stop.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const noStagedChangesMessage = page
        .locator("main p")
        .filter({ hasText: /no files .*staged|no staged changes|nothing staged|nothing to commit|working tree clean|no changes/i })
        .first();
      await expect(noStagedChangesMessage).toBeVisible({ timeout: 90_000 });
      await expect(page.getByText("Approval required")).toHaveCount(0);
      expect(git(repoPath, ["rev-parse", "HEAD"])).toBe(initialHead);
      expect(git(repoPath, ["status", "--short"])).toBe("");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(repoPath);
    }
  });

  test("summarizes only staged changes when asked what will be committed", async ({ page, request }) => {
    test.setTimeout(120_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createStagedAndUnstagedTempRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-staged-scope");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);
      await openLiveChat(page);
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "What will be committed? Read-only only. Do not stage, commit, or push.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      // The model phrases the summary freely (e.g. "Only README.md is staged
      // and would be committed..."); assert the semantics instead of a fixed
      // "Changed files: ..." format, and that notes.txt is not claimed as
      // staged/committed. The git assertions below are the authoritative
      // scope check.
      const stagedSummary = page.locator("p").filter({ hasText: /README\.md/i }).first();
      await expect(stagedSummary).toBeVisible({ timeout: 90_000 });
      await expect(stagedSummary).not.toContainText(/notes\.txt.{0,60}(will be|is) (staged|committed)/i);
      await expect(page.getByText("Approval required")).toHaveCount(0);
      expect(git(repoPath, ["diff", "--cached", "--name-only"])).toBe("README.md");
      expect(git(repoPath, ["diff", "--name-only"])).toBe("notes.txt");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(repoPath);
    }
  });

  test("drafts a commit message without staging or committing", async ({ page, request }) => {
    test.setTimeout(150_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createTempRepo();
    const initialHead = git(repoPath, ["rev-parse", "HEAD"]);
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-draft-commit-message");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);
      await openLiveChat(page);
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Draft a commit message for the current changes. Read-only only. Do not stage, commit, push, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      await expect(page.getByText(/Suggested commit message|commit message/i).first()).toBeVisible({ timeout: 90_000 });
      await expect(page.getByText("Approval required")).toHaveCount(0);
      await expect(page.getByText(/git_add|git_commit/)).toHaveCount(0);
      expect(git(repoPath, ["rev-parse", "HEAD"])).toBe(initialHead);
      expect(git(repoPath, ["diff", "--cached", "--name-only"])).toBe("");
      expect(git(repoPath, ["status", "--short"]).split(/\r?\n/).map((line) => line.trim())).toEqual([
        "M README.md",
        "M notes.txt",
      ]);
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(repoPath);
    }
  });

  test("does not leak credentials when showing the remote push target", async ({ page, request }) => {
    // One budgeted turn window: the remote-inspection turn. Same model, same
    // 12-step planner cap, and the same ~15s per read-only tool round trip
    // measured for the secret-review test (2026-08-07 runs): a 120s window
    // failed twice when the planner chain exceeded it before the composer
    // re-enabled, so the window is budgeted at 240s (full 12-step budget)
    // with 300s total for the fixture setup.
    // The model can also wrongly propose an approval for this read-only
    // request (measured: the 2026-08-08 run rendered a pending-action card
    // at 67.4s, keeping the composer disabled until the card is handled):
    // wait for either signal and decline a stray card so the read-only turn
    // never executes anything.
    test.setTimeout(300_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const remoteRepo = createCredentialRemoteTempRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(
        request,
        remoteRepo.repoPath,
        "mp-live-remote-redaction",
        remoteRepo.branchName,
      );
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, remoteRepo.repoPath);
      await openLiveChat(page);
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Where will this push go? Read-only only. Do not fetch, push, stage, or commit.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      // The read-only turn must end with the composer re-enabled and with no
      // write executed. The model can wrongly propose an approval for this
      // request (a pending-action card keeps the composer disabled), so wait
      // for whichever comes first and decline a stray card — declining only
      // closes the turn, which is exactly what a read-only turn should do.
      const composer = page.getByPlaceholder(/Ask MergePilot/);
      await expect
        .poll(
          async () => {
            if (await composer.isEnabled().catch(() => false)) return "enabled";
            if ((await page.getByTestId("pending-action-card").count()) > 0) return "card";
            return "running";
          },
          { timeout: 240_000, message: "expected the composer to re-enable or a stray approval card" },
        )
        .toMatch(/enabled|card/);
      if (!(await composer.isEnabled().catch(() => false))) {
        await page.getByTestId("pending-action-card").first().getByRole("button", { name: "Skip action" }).click();
        await expect(composer).toBeEnabled({ timeout: 120_000 });
      }
      // The remote inspection must surface the redacted origin URL as daemon
      // evidence. The credential part is redacted server-side to ***REDACTED***
      // before the tool result reaches the UI, but the LLM is free to render
      // the URL with or without the (redacted) userinfo — it normalizes
      // "https://***REDACTED***@host/path" to "https://host/path", and may
      // elide the middle path ("example.visualstudio.com/.../Repo"). Assert
      // the deterministic structured evidence: the git_remote evidence region
      // is rendered by the daemon, and the ADO origin host is surfaced in the
      // answer. The secret never reaches the UI (asserts below).
      await expect(page.getByText(/git_remote/).first()).toBeVisible({ timeout: 30_000 });
      // The redacted origin URL is daemon-rendered evidence in the collapsed
      // "Ran commands" row. Expand it so the host is surfaced from that
      // structured evidence (deterministic) instead of the model's prose
      // (nondeterministic — it passed 3 runs, omitted the host in 2).
      await expandCommandOutput(page, "git_remote");
      await expect(
        page.locator("main").getByText(/example\.visualstudio\.com/i).first(),
      ).toBeVisible({ timeout: 30_000 });
      const body = page.locator("body");
      await expect(body).not.toContainText("supersecrettoken");
      await expect(body).not.toContainText("mergepilot:supersecrettoken");
      await expect(page.getByText("Approval required")).toHaveCount(0);
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(remoteRepo.rootPath);
    }
  });

  test("redacts secret-like values while reviewing current changes", async ({ page, request }) => {
    // Two budgeted turn windows: the review turn plus a bounded corrective
    // re-prompt when the default model ends the first turn without citing the
    // untracked fixture file (same recovery pattern as the tag test). The
    // first window must cover the planner's full 12-step budget: the default
    // model spends ~15s per read-only tool round trip (measured 8 steps in
    // 120s, 2026-08-07 run) and can exhaust the cap before citing the
    // untracked file, so it is budgeted at 240s; the corrective re-prompt
    // window is 150s. 420s total covers both plus fixture setup.
    test.setTimeout(420_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const secretRepo = createSecretDiffTempRepo();
    const initialHead = git(secretRepo.repoPath, ["rev-parse", "HEAD"]);
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(
        request,
        secretRepo.repoPath,
        "mp-live-secret-review",
      );
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, secretRepo.repoPath);
      await openLiveChat(page);
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Review my current changes for risks, especially leaked credentials or secrets. Use the read_text_file tool to inspect files git cannot show, like the untracked .env.sample. Classify each risk by category (for example: security, configuration, correctness). Read-only only. Do not stage, commit, push, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      await expect(page.getByRole("button", { name: "Stop" })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByPlaceholder(/Ask MergePilot/)).toBeEnabled({ timeout: 240_000 });
      // Reveal the redacted read_text_file evidence (the tool output carries
      // the variable names, e.g. AZURE_OPENAI_API_KEY=***REDACTED***) so the
      // quality evaluation reads the daemon-rendered evidence, not only the
      // model's prose.
      await expandCommandOutput(page, "read_text_file");
      let visibleTranscript = await page.locator("main").innerText();
      let quality = evaluateAiInsightAnswer(visibleTranscript, {
        requiredFiles: [".env.sample"],
        // The key name exists only in the fixture file (or its redacted tool
        // output); a review that merely guessed ".env.sample is risky" from
        // git status must not pass.
        requiredEvidence: ["AZURE_OPENAI_API_KEY"],
        requiredCategories: ["security", "config"],
        reviewOnly: true,
      });
      if (!quality.passed) {
        // The model can end the turn without citing the untracked file (git
        // diff / git show cannot show it). Re-prompt once with explicit
        // corrective guidance, then re-evaluate the combined transcript.
        await page.getByPlaceholder(/Ask MergePilot/).fill(
          "Your review missed the untracked file .env.sample. Read it with the read_text_file tool, then name the exact environment variables it contains and classify each risk by category (for example: security, configuration, correctness). Read-only only. Do not stage, commit, push, or create a PR.",
        );
        await page.getByRole("button", { name: "Send" }).click();
        await expect(page.getByRole("button", { name: "Stop" })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByPlaceholder(/Ask MergePilot/)).toBeEnabled({ timeout: 150_000 });
        await expandCommandOutput(page, "read_text_file");
        visibleTranscript = await page.locator("main").innerText();
        quality = evaluateAiInsightAnswer(visibleTranscript, {
          requiredFiles: [".env.sample"],
          requiredEvidence: ["AZURE_OPENAI_API_KEY"],
          requiredCategories: ["security", "config"],
          reviewOnly: true,
        });
      }
      expect(quality, JSON.stringify(quality.checks, null, 2)).toMatchObject({
        passed: true,
      });
      // Deterministic structured evidence: the review must have read the
      // untracked file through the read_text_file tool (rendered in the
      // daemon-produced evidence region as the command label with its path
      // argument), not guessed from the filename. The label is the desktop's
      // conciseArgSummary form ("read_text_file path=.env.sample
      // [max_bytes=…]", verified against the live DOM on 2026-08-07);
      // "read_text_file" alone would also match the user prompt text, which
      // would make the assertion vacuous.
      await expect(
        page.locator("main").getByText(/read_text_file\s+path=\.env\.sample\b/).first(),
      ).toBeVisible({ timeout: 15_000 });
      const body = page.locator("body");
      await expect(body).not.toContainText(secretRepo.secretValue);
      await expect(body).not.toContainText(`AZURE_OPENAI_API_KEY=${secretRepo.secretValue}`);
      await expect(page.getByText("Approval required")).toHaveCount(0);
      await expect(page.getByText(/git_add|git_commit/)).toHaveCount(0);
      expect(git(secretRepo.repoPath, ["rev-parse", "HEAD"])).toBe(initialHead);
      expect(git(secretRepo.repoPath, ["diff", "--cached", "--name-only"])).toBe("");
      expect(git(secretRepo.repoPath, ["status", "--short"])).toBe("?? .env.sample");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(secretRepo.repoPath);
    }
  });

  test("requires approval before switching branches with dirty changes", async ({ page, request }) => {
    test.setTimeout(150_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const switchRepo = createDirtyBranchSwitchRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(
        request,
        switchRepo.repoPath,
        "mp-live-dirty-switch",
        switchRepo.currentBranch,
      );
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, switchRepo.repoPath);
      await openLiveChat(page);
      await openEnvironmentPanel(page);
      const environmentPanel = liveEnvironmentPanel(page);
      await refreshEnvironmentPanelBranch(page, environmentPanel);
      await expect(environmentPanel.getByRole("button", { name: switchRepo.currentBranch, exact: true })).toBeVisible();

      await environmentPanel.getByRole("button", { name: switchRepo.currentBranch, exact: true }).click();
      await environmentPanel.locator("button").filter({ hasText: switchRepo.targetBranch }).click();

      const approvalCard = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git_checkout|git_switch|git checkout|git switch/i })
        .first();
      await expect(approvalCard).toBeVisible({ timeout: 90_000 });
      await expect(approvalCard.getByText("HIGH risk")).toBeVisible();
      await expect(approvalCard.getByText(switchRepo.targetBranch).first()).toBeVisible();
      expect(git(switchRepo.repoPath, ["branch", "--show-current"])).toBe(switchRepo.currentBranch);
      expect(git(switchRepo.repoPath, ["diff", "--name-only"])).toBe("README.md");

      await approvalCard.getByRole("button", { name: "Skip action" }).click();
      await expect.poll(() => git(switchRepo.repoPath, ["branch", "--show-current"]), { timeout: 30_000 }).toBe(
        switchRepo.currentBranch,
      );
      expect(git(switchRepo.repoPath, ["diff", "--name-only"])).toBe("README.md");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(switchRepo.repoPath);
    }
  });

  test("merges the target branch with explicit approval", async ({ page, request }) => {
    test.setTimeout(150_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const mergeRepo = createFastForwardMergeRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(
        request,
        mergeRepo.repoPath,
        "mp-live-merge-target",
        mergeRepo.currentBranch,
      );
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, mergeRepo.repoPath);
      await openLiveChat(page);
      await openEnvironmentPanel(page);
      await refreshEnvironmentPanelBranch(page, liveEnvironmentPanel(page));
      await expect(page.getByRole("button", { name: mergeRepo.currentBranch })).toBeVisible();

      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Merge main into the current branch using fast-forward only. Do not rebase, push, stage, commit, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const mergeApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git merge --ff-only main|git_merge/i })
        .first();
      await expect(mergeApproval).toBeVisible({ timeout: 90_000 });
      await expect(mergeApproval.getByText(/main/i).first()).toBeVisible();
      expect(git(mergeRepo.repoPath, ["rev-parse", "HEAD"])).not.toBe(mergeRepo.targetHead);

      await mergeApproval.getByRole("button", { name: "Approve and run" }).click();

      await expect.poll(() => git(mergeRepo.repoPath, ["rev-parse", "HEAD"]), { timeout: 45_000 }).toBe(
        mergeRepo.targetHead,
      );
      expect(git(mergeRepo.repoPath, ["branch", "--show-current"])).toBe(mergeRepo.currentBranch);
      expect(git(mergeRepo.repoPath, ["status", "--short"])).toBe("");
      expect(readFileSync(path.join(mergeRepo.repoPath, "release-notes.md"), "utf8")).toContain(
        "Release readiness note.",
      );
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(mergeRepo.repoPath);
    }
  });

  test("surfaces merge conflict recovery after approved target merge", async ({ page, request }) => {
    test.setTimeout(180_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const mergeRepo = createMergeConflictRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(
        request,
        mergeRepo.repoPath,
        "mp-live-merge-conflict",
        mergeRepo.currentBranch,
      );
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, mergeRepo.repoPath);
      await openLiveChat(page);
      await openEnvironmentPanel(page);
      await refreshEnvironmentPanelBranch(page, liveEnvironmentPanel(page));
      await expect(page.getByRole("button", { name: mergeRepo.currentBranch })).toBeVisible();

      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Merge main into the current branch and stop. Do not rebase, push, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const mergeApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git merge main|git_merge/i })
        .first();
      await expect(mergeApproval).toBeVisible({ timeout: 90_000 });
      await expect(mergeApproval.getByText(/main/i).first()).toBeVisible();
      expect(git(mergeRepo.repoPath, ["status", "--short"])).toBe("");

      await mergeApproval.getByRole("button", { name: "Approve and run" }).click();

      await expect.poll(() => gitOrEmpty(mergeRepo.repoPath, ["status", "--short"]), { timeout: 45_000 })
        .toContain("UU app.config");
      // The daemon's merge-conflict narrative (gitOperation.ts) is the
      // surfaced chat evidence; the recovery actions render in the env
      // panel's Git recovery notice (WorkspaceGitRecoveryPanel: "Merge
      // needs attention" with Continue/Abort actions).
      await expect(page.getByText(/Git is in merge with unresolved conflicts: app\.config/i).first()).toBeVisible({
        timeout: 90_000,
      });
      const recoveryNotice = page.getByText(/needs attention/i).first();
      await expect(recoveryNotice).toBeVisible({ timeout: 90_000 });
      await expect(recoveryNotice).toContainText("Merge");
      await expect(page.getByRole("button", { name: "Continue the in-progress merge" })).toBeEnabled();
      await expect(page.getByRole("button", { name: "Abort the in-progress merge" })).toBeEnabled();

      git(mergeRepo.repoPath, ["merge", "--abort"]);
      expect(git(mergeRepo.repoPath, ["status", "--short"])).toBe("");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      gitOrEmpty(mergeRepo.repoPath, ["merge", "--abort"]);
      await removePathWithRetry(mergeRepo.repoPath);
    }
  });

  test("creates and switches to a new branch through real Chat UI approval", async ({ page, request }) => {
    test.setTimeout(150_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createCleanTempRepo();
    const branchName = "feature/live-new-branch";
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-create-branch");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);
      await openLiveChat(page);
      await openEnvironmentPanel(page);
      await refreshEnvironmentPanelBranch(page, liveEnvironmentPanel(page));
      await expect(page.getByRole("button", { name: "main" })).toBeVisible();

      await page.getByPlaceholder(/Ask MergePilot/).fill(
        `Create and switch to a new branch named ${branchName}. Do not stage, commit, push, or create a PR.`,
      );
      await page.getByRole("button", { name: "Send" }).click();

      const branchApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git switch -c|git checkout -b|git_create_branch|git_switch/i })
        .first();
      await expect(branchApproval).toBeVisible({ timeout: 90_000 });
      await expect(branchApproval.getByText(branchName).first()).toBeVisible();
      expect(git(repoPath, ["branch", "--show-current"])).toBe("main");

      await branchApproval.getByRole("button", { name: "Approve and run" }).click();

      await expect.poll(() => git(repoPath, ["branch", "--show-current"]), { timeout: 45_000 }).toBe(branchName);
      expect(git(repoPath, ["status", "--short"])).toBe("");
      expect(git(repoPath, ["branch", "--list", branchName])).toContain(branchName);
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(repoPath);
    }
  });

  test("pushes the current branch to a local bare remote through real Chat UI approval", async ({ page, request }) => {
    test.setTimeout(150_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const pushRepo = createTempPushRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(
        request,
        pushRepo.repoPath,
        "mp-live-push-branch",
        pushRepo.branchName,
      );
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, pushRepo.repoPath);
      await openLiveChat(page);
      await openEnvironmentPanel(page);
      await refreshEnvironmentPanelBranch(page, liveEnvironmentPanel(page));
      await expect(page.getByRole("button", { name: pushRepo.branchName })).toBeVisible();
      await expect(page.getByTitle("Context manages the Project Link")).toHaveText(projectLink.name);
      await expect(page.getByLabel("Pinned Summary Project Link")).toHaveCount(0);
      await page.getByRole("button", { name: "Commit or push", exact: true }).click();
      await page.getByRole("button", { name: "Push branch", exact: true }).click();

      const pushApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git push/i })
        .first();
      await expect(pushApproval).toBeVisible({ timeout: 90_000 });
      await expect(pushApproval.getByText(/origin/i).first()).toBeVisible();
      await pushApproval.getByRole("button", { name: "Approve and run" }).click();

      await expect
        .poll(() => gitOrEmpty(pushRepo.rootPath, ["--git-dir", pushRepo.originPath, "rev-parse", pushRepo.branchName]), {
          timeout: 45_000,
        })
        .toBe(pushRepo.localHead);
      expect(git(pushRepo.repoPath, ["status", "--short", "--branch"])).toBe(
        `## ${pushRepo.branchName}...origin/${pushRepo.branchName}`,
      );
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(pushRepo.rootPath);
    }
  });

  test("pulls a behind branch with rebase through real Chat UI approval", async ({ page, request }) => {
    test.setTimeout(150_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const behindRepo = createTempBehindRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(
        request,
        behindRepo.repoPath,
        "mp-live-pull-rebase",
        behindRepo.branchName,
      );
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, behindRepo.repoPath);
      await openLiveChat(page);
      await openEnvironmentPanel(page);
      const environmentPanel = liveEnvironmentPanel(page);
      await refreshEnvironmentPanelBranch(page, environmentPanel);
      await expect(environmentPanel.getByRole("button", { name: behindRepo.branchName, exact: true })).toBeVisible();

      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Pull latest from origin main with rebase. Do not push, stage, commit, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const pullApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git pull --rebase origin main/i })
        .first();
      await expect(pullApproval).toBeVisible({ timeout: 90_000 });
      await pullApproval.getByRole("button", { name: "Approve and run" }).click();

      await expect.poll(() => git(behindRepo.repoPath, ["rev-parse", "HEAD"]), { timeout: 45_000 }).toBe(
        behindRepo.remoteHead,
      );
      expect(git(behindRepo.repoPath, ["status", "--short", "--branch"])).toBe(
        `## ${behindRepo.branchName}...origin/${behindRepo.branchName}`,
      );
      expect(git(behindRepo.repoPath, ["log", "-1", "--pretty=%s"])).toBe("docs: remote update");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(behindRepo.rootPath);
    }
  });

  test("surfaces rebase recovery when pull with rebase hits conflicts", async ({ page, request }) => {
    test.setTimeout(180_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const conflictRepo = createTempRebaseConflictRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(
        request,
        conflictRepo.repoPath,
        "mp-live-rebase-conflict",
        conflictRepo.branchName,
      );
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, conflictRepo.repoPath);
      await openLiveChat(page);
      await openEnvironmentPanel(page);
      const environmentPanel = liveEnvironmentPanel(page);
      await refreshEnvironmentPanelBranch(page, environmentPanel);
      const branchButton = environmentPanel.getByRole("button", { name: conflictRepo.branchName, exact: true });
      await expect(branchButton).toBeVisible();

      // The workspace commit menu's static divergence banner ("Diverged:
      // 1 ahead, 1 behind") and its "Pull with rebase before pushing"
      // shortcut were removed in the Cycle 00 workspace controls refactor
      // (68a673a). Divergence now surfaces through chat evidence (git_status
      // tool output) and the push-readiness summary on approval cards, so
      // initiate the rebase through the real Chat UI the same way the user
      // would.
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Pull latest from origin main with rebase. Do not push, stage, commit, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const pullApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git pull --rebase origin main/i })
        .first();
      await expect(pullApproval).toBeVisible({ timeout: 120_000 });
      await pullApproval.getByRole("button", { name: "Approve and run" }).click();

      await expect.poll(() => gitOrEmpty(conflictRepo.repoPath, ["status", "--short"]), { timeout: 45_000 })
        .toContain("UU app.config");
      // The daemon's rebase-conflict narrative (gitOperation.ts) is the
      // surfaced chat evidence; the recovery actions render in the env
      // panel's Git recovery notice (WorkspaceGitRecoveryPanel: "Rebase
      // needs attention" with Continue/Abort/Skip actions).
      await expect(page.getByText(/Git is in rebase with unresolved conflicts: app\.config/i).first()).toBeVisible({
        timeout: 90_000,
      });
      const recoveryNotice = page.getByText(/needs attention/i).first();
      await expect(recoveryNotice).toBeVisible({ timeout: 90_000 });
      await expect(recoveryNotice).toContainText("Rebase");
      await expect(page.getByRole("button", { name: "Continue the in-progress rebase" })).toBeEnabled();

      git(conflictRepo.repoPath, ["rebase", "--abort"]);
      expect(git(conflictRepo.repoPath, ["status", "--short"])).toBe("");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      gitOrEmpty(conflictRepo.repoPath, ["rebase", "--abort"]);
      await removePathWithRetry(conflictRepo.rootPath);
    }
  });

  test("stashes dirty work through real Chat UI approval", async ({ page, request }) => {
    test.setTimeout(150_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createTempRepo();
    const stashMessage = "mergepilot live stash test";
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-stash");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);
      await openLiveChat(page);
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        `Stash my current work with message "${stashMessage}". Do not commit, push, or create a PR.`,
      );
      await page.getByRole("button", { name: "Send" }).click();

      const stashApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git[_ ]stash/i })
        .first();
      await expect(stashApproval).toBeVisible({ timeout: 90_000 });
      await expect(stashApproval.getByText(stashMessage).first()).toBeVisible();
      await stashApproval.getByRole("button", { name: "Approve and run" }).click();

      await expect.poll(() => git(repoPath, ["status", "--short"]), { timeout: 45_000 }).toBe("");
      expect(git(repoPath, ["stash", "list"])).toContain(stashMessage);
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(repoPath);
    }
  });

  test("applies the latest stash through real Chat UI approval without dropping it", async ({ page, request }) => {
    test.setTimeout(150_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createStashApplyTempRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-stash-apply");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);
      await openLiveChat(page);
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Apply the latest stash without dropping it. Do not stage, commit, push, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const stashApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git stash apply|git_stash/i })
        .first();
      await expect(stashApproval).toBeVisible({ timeout: 90_000 });
      await expect(stashApproval.getByText("git stash apply").first()).toBeVisible();
      await stashApproval.getByRole("button", { name: "Approve and run" }).click();

      await expect.poll(() => readFileSync(path.join(repoPath, "README.md"), "utf8"), { timeout: 45_000 }).toBe(
        "# Stash apply fixture\n\nRestored from stash.\n",
      );
      expect(git(repoPath, ["status", "--short"])).toBe("M README.md");
      expect(git(repoPath, ["stash", "list"])).toContain("mergepilot apply stash fixture");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(repoPath);
    }
  });

  test("pops the latest stash through real Chat UI approval and drops it after success", async ({ page, request }) => {
    test.setTimeout(150_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createStashPopTempRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-stash-pop");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);
      await openLiveChat(page);
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Pop the latest stash and drop it if the restore succeeds. Do not stage, commit, push, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const stashApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git stash pop|git_stash/i })
        .first();
      await expect(stashApproval).toBeVisible({ timeout: 90_000 });
      await expect(stashApproval.getByText("git stash pop").first()).toBeVisible();
      await stashApproval.getByRole("button", { name: "Approve and run" }).click();

      await expect.poll(() => readFileSync(path.join(repoPath, "README.md"), "utf8"), { timeout: 45_000 }).toBe(
        "# Stash pop fixture\n\nRestored and dropped from stash.\n",
      );
      expect(git(repoPath, ["status", "--short"])).toBe("M README.md");
      expect(git(repoPath, ["stash", "list"])).toBe("");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(repoPath);
    }
  });

  test("surfaces stash pop conflict recovery and keeps the stash entry", async ({ page, request }) => {
    test.setTimeout(300_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createStashPopConflictTempRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-stash-pop-conflict");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);
      await openLiveChat(page);
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Pop the latest stash and explain conflict recovery if it fails. Do not stage, commit, push, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const stashApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git stash pop|git_stash/i })
        .first();
      // Measured in cold run A (daemon trace, session chat_1786036732564_2e2a06):
      // this conflict turn streamed its narrative at 21-58s, ran its first
      // read-only tool at ~61s, then generated the next step past the 120s
      // budget (cancelled at 120.4s with no approval card yet). The comparable
      // non-conflict pop turn proposed its approval at 62.5s and finished at
      // 96.3s. 180s covers the slower conflict-planning path with the same
      // event budget the other conflict tests use.
      await expect(stashApproval).toBeVisible({ timeout: 180_000 });
      await expect(stashApproval.getByText("git stash pop").first()).toBeVisible();
      await stashApproval.getByRole("button", { name: "Approve and run" }).click();

      await expect.poll(() => gitOrEmpty(repoPath, ["status", "--short"]), { timeout: 45_000 })
        .toContain("UU README.md");
      // The old "Stopped after <command>" action line is no longer rendered
      // in the desktop (the failure narrative replaced it — see the comment
      // in the commit-validation test). The stash-pop conflict surfaces
      // through the daemon's failure narrative (gitOperation.ts), which is
      // what these asserts gate on.
      await expect(page.getByText(/Git has unresolved index conflicts: README\.md/i).first()).toBeVisible({
        timeout: 120_000,
      });
      await expect(page.getByText(/Git keeps the stash entry/i).first()).toBeVisible();
      expect(git(repoPath, ["stash", "list"])).toContain("mergepilot pop conflict fixture");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      gitOrEmpty(repoPath, ["reset", "--hard"]);
      gitOrEmpty(repoPath, ["stash", "clear"]);
      await removePathWithRetry(repoPath);
    }
  });

  test("restores only the requested file through real Chat UI approval", async ({ page, request }) => {
    test.setTimeout(150_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createRestoreTempRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-restore");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);
      await openLiveChat(page);
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Restore (discard) the working-tree changes in README.md only (git restore README.md). Do not touch notes.txt. Do not push, stage, commit, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const restoreApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git[_ ]restore/i })
        .filter({ hasText: "README.md" })
        .first();
      await expect(restoreApproval).toBeVisible({ timeout: 90_000 });
      // The LLM-written card description may mention notes.txt; the restore
      // scope that matters is the command preview.
      await expect(restoreApproval.locator("code").first()).toContainText("README.md");
      await expect(restoreApproval.locator("code").first()).not.toContainText("notes.txt");
      await restoreApproval.getByRole("button", { name: "Approve and run" }).click();

      await expect.poll(() => git(repoPath, ["diff", "--name-only"]), { timeout: 45_000 }).toBe("notes.txt");
      expect(readFileSync(path.join(repoPath, "README.md"), "utf8")).toBe("# Restore fixture\n\nOriginal README.\n");
      expect(readFileSync(path.join(repoPath, "notes.txt"), "utf8")).toBe("Keep this notes edit.\n");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(repoPath);
    }
  });

  test("reverts the last commit through real Chat UI approval", async ({ page, request }) => {
    test.setTimeout(180_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createRevertTempRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-revert");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);
      await openLiveChat(page);
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Revert the last commit using git revert HEAD. Do not reset, push, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const revertApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git[_ ]revert/i })
        .first();
      await expect(revertApproval).toBeVisible({ timeout: 120_000 });
      await expect(revertApproval.getByText(/HEAD|docs: bad release note/i).first()).toBeVisible();
      await revertApproval.getByRole("button", { name: "Approve and run" }).click();

      await expect.poll(() => git(repoPath, ["rev-list", "--count", "HEAD"]), { timeout: 60_000 }).toBe("3");
      expect(git(repoPath, ["log", "-1", "--pretty=%s"])).toMatch(/^Revert/);
      expect(readFileSync(path.join(repoPath, "README.md"), "utf8")).toBe("# Revert fixture\n\nOriginal release note.\n");
      expect(git(repoPath, ["status", "--short"])).toBe("");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(repoPath);
    }
  });

  test("creates a local release tag through real Chat UI approval without pushing it", async ({ page, request }) => {
    // Two budgeted turn windows: the first request, and — if the model answers
    // without proposing the write action — one corrective re-prompt that names
    // the git_tag tool explicitly. The default model declines to propose when
    // the request text contains push-related negations (verified against the
    // live model); the approved scope is still gated by the card filter, the
    // no-push code-preview check, and the post-conditions below.
    // The first window is 150s because the 2026-08-08 run rendered the card at
    // 87.1s, which the 90s poll missed by ~3s (failed once); the corrective
    // window is 150s with the card asserted at the end.
    test.setTimeout(360_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createCleanTempRepo();
    const tagName = "v0.0.1-live-tag";
    const tagMessage = "MergePilot live tag test";
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-tag");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);
      await openLiveChat(page);
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        `Create an annotated local git tag ${tagName} on the current HEAD commit with message "${tagMessage}".`,
      );
      await page.getByRole("button", { name: "Send" }).click();

      const tagApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git[_ ]tag/i })
        .filter({ hasText: tagName })
        .first();
      const chipCountBefore = await page.getByRole("button", { name: /^Worked for \d+s$/ }).count();
      const cardShown = await pendingActionCardOrTurnEnded(page, tagApproval, chipCountBefore, 150_000);
      if (!cardShown) {
        await page.getByPlaceholder(/Ask MergePilot/).fill(
          `Create an annotated local git tag ${tagName} on the current HEAD commit with message "${tagMessage}". ` +
            `The git_tag tool is available in this environment (approval-required write tool); use it to create the tag.`,
        );
        await page.getByRole("button", { name: "Send" }).click();
        const cardShownAfterRePrompt = await pendingActionCardOrTurnEnded(
          page,
          tagApproval,
          chipCountBefore + 1,
          150_000,
        );
        expect(cardShownAfterRePrompt, "tag approval card after the corrective re-prompt").toBeTruthy();
      }
      await expect(tagApproval.getByText("HIGH risk")).toBeVisible();
      await expect(tagApproval.locator("code").first()).not.toContainText("push");
      await tagApproval.getByRole("button", { name: "Approve and run" }).click();

      await expect.poll(() => git(repoPath, ["tag", "--list", tagName]), { timeout: 45_000 }).toBe(tagName);
      expect(git(repoPath, ["show", "--no-patch", "--format=%s", tagName])).toContain("Initial commit");
      expect(git(repoPath, ["status", "--short"])).toBe("");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(repoPath);
    }
  });

  test("pushes one release tag through real Chat UI approval without pushing branches or other tags", async ({ page, request }) => {
    test.setTimeout(150_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const pushRepo = createTempPushRepo();
    const tagName = "v0.0.2-live-tag-push";
    const otherTagName = "v0.0.2-other-local-tag";
    git(pushRepo.repoPath, ["tag", tagName]);
    git(pushRepo.repoPath, ["tag", otherTagName]);
    expect(gitOrEmpty(pushRepo.rootPath, ["--git-dir", pushRepo.originPath, "rev-parse", `refs/tags/${tagName}`])).toBe("");
    expect(gitOrEmpty(pushRepo.rootPath, ["--git-dir", pushRepo.originPath, "rev-parse", pushRepo.branchName])).toBe("");
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(
        request,
        pushRepo.repoPath,
        "mp-live-push-tag",
        pushRepo.branchName,
      );
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, pushRepo.repoPath);
      await openLiveChat(page);
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        `Push only local git tag ${tagName} to origin. Do not push branch ${pushRepo.branchName}, do not push other tags, and do not create a PR.`,
      );
      await page.getByRole("button", { name: "Send" }).click();

      const tagPushApproval = page
        .getByTestId("pending-action-card")
        .filter({ hasText: /git_push_tag|refs\/tags\//i })
        .filter({ hasText: tagName })
        .first();
      await expect(tagPushApproval).toBeVisible({ timeout: 90_000 });
      await expect(tagPushApproval.getByText("HIGH risk")).toBeVisible();
      await expect(tagPushApproval.getByText(`refs/tags/${tagName}:refs/tags/${tagName}`).first()).toBeVisible();
      await tagPushApproval.getByRole("button", { name: "Approve and run" }).click();

      await expect
        .poll(() => gitOrEmpty(pushRepo.rootPath, ["--git-dir", pushRepo.originPath, "rev-parse", `refs/tags/${tagName}`]), {
          timeout: 45_000,
        })
        .toBe(git(pushRepo.repoPath, ["rev-parse", `refs/tags/${tagName}`]));
      expect(gitOrEmpty(pushRepo.rootPath, ["--git-dir", pushRepo.originPath, "rev-parse", `refs/tags/${otherTagName}`])).toBe("");
      expect(gitOrEmpty(pushRepo.rootPath, ["--git-dir", pushRepo.originPath, "rev-parse", pushRepo.branchName])).toBe("");
      expect(git(pushRepo.repoPath, ["status", "--short"])).toBe("");
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
      }
      await removePathWithRetry(pushRepo.rootPath);
    }
  });

  test("discovers ClaimBot_API pipeline #117 without persisting pipeline fields", async ({ page, request }) => {
    test.skip(
      !liveAdoEnabled,
      "Set MERGEPILOT_E2E_LIVE_ADO=1 to discover the real ClaimBot_API pipeline through the live app.",
    );
    test.setTimeout(180_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const projectLink = await createClaimBotPipelineDiscoveryProjectLink(request);
    let projectLinkId: string | null = projectLink.id;
    const previousRun = await latestClaimBotPipelineRunViaDaemon(request, DAEMON_URL, projectLink.id);

    try {
      await selectProjectLinkInBrowser(page, projectLink.id, claimBotRepoPath);
      await page.goto("/#/pipelines");

      const row = claimBotPipelineRow(page);
      await expect(row).toBeVisible({ timeout: 120_000 });

      // V2 (GAP-01/02): discovery renders the candidate pipeline but never
      // persists legacy pipeline fields on the Project Link. Re-read the
      // link through the daemon and prove both fields stay empty.
      await expect
        .poll(async () => {
          const response = await request.get(`${DAEMON_URL}/project-links/${projectLink.id}`);
          expect(response.ok()).toBeTruthy();
          const saved = await response.json() as { adoPipelineId?: string; adoPipelineName?: string };
          return `${saved.adoPipelineId ?? ""}:${saved.adoPipelineName ?? ""}`;
        }, { timeout: 30_000 })
        .toBe(":");

      // Discovery is a read: no approval proposal, no trigger payload, and
      // no new run on the real pipeline. (Other pipelines of the project —
      // e.g. #108 via another Project Link — legitimately appear as
      // discovered rows; identity is anchored on the #117 ClaimBot_API row.)
      const main = page.locator("main");
      await expect(main.getByText("Approval required")).toHaveCount(0);
      await expect(main.getByText("ado_trigger_pipeline")).toHaveCount(0);
      expect((await latestClaimBotPipelineRunViaDaemon(request, DAEMON_URL, projectLink.id)).id).toBe(previousRun.id);
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
        projectLinkId = null;
      }
    }
  });

  test("inspects ClaimBot_API pipeline #117 read-only with structured run evidence", async ({ page, request }) => {
    test.skip(
      !liveAdoEnabled,
      "Set MERGEPILOT_E2E_LIVE_ADO=1 to inspect the real ClaimBot_API pipeline through the live app.",
    );
    test.setTimeout(180_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const projectLink = await createClaimBotPipelineProjectLink(request);
    let projectLinkId: string | null = projectLink.id;
    const previousRun = await latestClaimBotPipelineRunViaDaemon(request, DAEMON_URL, projectLink.id);

    try {
      await selectProjectLinkInBrowser(page, projectLink.id, claimBotRepoPath);
      await page.goto("/#/pipelines");

      const row = claimBotPipelineRow(page);
      await expect(row).toBeVisible({ timeout: 120_000 });

      // Read-only inspection is a workflow action, not a chat turn: no
      // approval proposal, no LLM. The card renders the structured evidence
      // summary from the daemon's ADO re-read.
      await row.getByRole("button", { name: "Inspect runs" }).click();
      await expect(row.getByText(/Inspection completed\. \d+ recent run/)).toBeVisible({ timeout: 60_000 });

      await row.getByRole("button", { name: "Details" }).click();
      // The detail panel is a native dialog (WorkbenchSidePanel), not an
      // aside; scope it by its "Run evidence" section.
      const panel = page.getByRole("dialog").filter({ hasText: "Run evidence" }).first();
      await expect(panel).toBeVisible();

      // Structured run evidence matches the verifier's latest run: name,
      // tone label, and the deep link target.
      const runName = previousRun.name || `Run ${previousRun.id}`;
      await expect(panel.getByText(runName).first()).toBeVisible();
      await expect(
        panel.getByText(new RegExp(`${previousRun.result}|${previousRun.state}`, "i")).first(),
      ).toBeVisible();
      const openRun = panel.getByRole("link", { name: "Open run" }).first();
      await expect(openRun).toBeVisible();
      await expect(openRun).toHaveAttribute("href", previousRun.url);

      // Read-only contract: no approval, no trigger payload, and no secrets
      // in the evidence panel. (Other pipelines of the project legitimately
      // appear as discovered rows; identity is anchored on this row's panel
      // evidence matching the verifier's #117 run above.)
      await expect(page.locator("main").getByText("Approval required")).toHaveCount(0);
      await expect(page.locator("main").getByText("ado_trigger_pipeline")).toHaveCount(0);
      const panelText = await panel.innerText();
      expect(panelText).not.toMatch(/\b(pat|password|apikey|api[_ -]?key|secret|authorization)\b/i);

      expect((await latestClaimBotPipelineRunViaDaemon(request, DAEMON_URL, projectLink.id)).id).toBe(previousRun.id);
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
        projectLinkId = null;
      }
    }
  });

  test("prepares a ClaimBot_API pipeline #117 rerun approval from inspected failure evidence with default skip", async ({ page, request }) => {
    test.skip(
      !liveAdoEnabled,
      "Set MERGEPILOT_E2E_LIVE_ADO=1 to prepare the real ClaimBot_API pipeline rerun approval through the live app.",
    );
    test.setTimeout(240_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const projectLink = await createClaimBotPipelineProjectLink(request);
    let projectLinkId: string | null = projectLink.id;
    const previousRun = await latestClaimBotPipelineRunViaDaemon(request, DAEMON_URL, projectLink.id);

    try {
      await selectProjectLinkInBrowser(page, projectLink.id, claimBotRepoPath);
      await page.goto("/#/pipelines");

      const row = claimBotPipelineRow(page);
      await expect(row).toBeVisible({ timeout: 120_000 });

      // Evidence first (Cycle 03): inspection lists the recent runs,
      // including the failed one, entirely from the daemon's ADO re-read.
      await row.getByRole("button", { name: "Inspect runs" }).click();
      await expect(row.getByText(/Inspection completed\. \d+ recent run/)).toBeVisible({ timeout: 60_000 });
      const runName = previousRun.name || `Run ${previousRun.id}`;
      await expect(row.getByText(runName).first()).toBeVisible();
      await expect(
        row.getByText(new RegExp(`${previousRun.result}|${previousRun.state}`, "i")).first(),
      ).toBeVisible();

      // The rerun proposal is an explicit workspace action that never runs
      // anything by itself: the row posts the trigger and hands the session
      // over to Chat (MP-006), where the HIGH-risk approval card rehydrates
      // from the handoff.
      await row.getByRole("button", { name: "Trigger pipeline" }).click();
      await expect(row.getByText("Approval required")).toBeVisible({ timeout: 60_000 });
      const openChatApproval = row.getByRole("link", { name: "Open Chat approval" });
      await expect(openChatApproval).toBeVisible();
      await openChatApproval.click();

      const approvalCard = page
        .getByTestId("pending-action-card")
        .filter({ hasText: "ado_trigger_pipeline" })
        .first();
      await expect(approvalCard).toBeVisible({ timeout: 60_000 });
      await expect(approvalCard.getByText("HIGH risk")).toBeVisible();
      await expect(approvalCard.locator("code").first()).toContainText("ado_trigger_pipeline");
      await expect(approvalCard.locator("code").first()).toContainText("pipeline_id=117");

      if (destructiveEnabled) {
        await approvalCard.getByRole("button", { name: "Approve and run" }).click();
        await expect
          .poll(async () => (await latestClaimBotPipelineRunViaDaemon(request, DAEMON_URL, projectLink.id)).id, {
            timeout: 120_000,
            message: `Expected ClaimBot_API pipeline #117 to queue a rerun newer than ${previousRun.id}.`,
          })
          .toBeGreaterThan(previousRun.id);
      } else {
        await approvalCard.getByRole("button", { name: "Skip action" }).click();
        await expect(page.getByText(/Approval declined\. No action was run/)).toBeVisible({
          timeout: 30_000,
        });
        await expect
          .poll(async () => (await latestClaimBotPipelineRunViaDaemon(request, DAEMON_URL, projectLink.id)).id, {
            timeout: 30_000,
            message: "A skipped rerun approval must not queue a pipeline run.",
          })
          .toBe(previousRun.id);
      }
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
        projectLinkId = null;
      }
    }
  });

  test("triggers ClaimBot_API pipeline #117 explicitly from the Pipeline workspace with default skip", async ({ page, request }) => {
    test.skip(
      !liveAdoEnabled,
      "Set MERGEPILOT_E2E_LIVE_ADO=1 to trigger the real ClaimBot_API pipeline through the live app.",
    );
    test.setTimeout(180_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const projectLink = await createClaimBotPipelineProjectLink(request);
    let projectLinkId: string | null = projectLink.id;
    const previousRun = await latestClaimBotPipelineRunViaDaemon(request, DAEMON_URL, projectLink.id);

    try {
      await selectProjectLinkInBrowser(page, projectLink.id, claimBotRepoPath);
      await page.goto("/#/pipelines");

      const row = claimBotPipelineRow(page);
      await expect(row).toBeVisible({ timeout: 120_000 });

      // Explicit trigger: the workspace posts the proposal, stores the
      // approval handoff (MP-006), and asks the user to confirm in Chat.
      // The row itself never runs anything.
      await row.getByRole("button", { name: "Trigger pipeline" }).click();
      await expect(row.getByText("Approval required")).toBeVisible({ timeout: 60_000 });
      const openChatApproval = row.getByRole("link", { name: "Open Chat approval" });
      await expect(openChatApproval).toBeVisible();
      await expect(openChatApproval).toHaveAttribute("href", "#/chat");
      await expect(page.locator("main").getByText("ado_trigger_pipeline")).toHaveCount(0);

      // "Open Chat approval" lands on a live pending card rehydrated from
      // the handoff — no LLM turn is needed for the card itself.
      await openChatApproval.click();
      const approvalCard = page
        .getByTestId("pending-action-card")
        .filter({ hasText: "ado_trigger_pipeline" })
        .first();
      await expect(approvalCard).toBeVisible({ timeout: 60_000 });
      await expect(approvalCard.getByText("HIGH risk")).toBeVisible();
      await expect(approvalCard.locator("code").first()).toContainText("ado_trigger_pipeline");
      await expect(approvalCard.locator("code").first()).toContainText("pipeline_id=117");

      if (destructiveEnabled) {
        await approvalCard.getByRole("button", { name: "Approve and run" }).click();
        await expect.poll(async () => (await latestClaimBotPipelineRunViaDaemon(request, DAEMON_URL, projectLink.id)).id, {
          timeout: 120_000,
          message: `Expected ClaimBot_API pipeline #117 to queue a run newer than ${previousRun.id}.`,
        }).toBeGreaterThan(previousRun.id);
      } else {
        await approvalCard.getByRole("button", { name: "Skip action" }).click();
        await expect(page.getByText(/Approval declined\. No action was run/)).toBeVisible({
          timeout: 30_000,
        });
        await expect
          .poll(async () => (await latestClaimBotPipelineRunViaDaemon(request, DAEMON_URL, projectLink.id)).id, {
            timeout: 30_000,
            message: "A skipped workspace trigger must not queue a pipeline run.",
          })
          .toBe(previousRun.id);
      }
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
        projectLinkId = null;
      }
    }
  });
});