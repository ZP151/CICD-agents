import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { evaluateAiInsightAnswer } from "../../packages/core/src/aiInsightQuality";

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

interface AdoBuildSummary {
  id: number;
  buildNumber?: string;
  status?: string;
  result?: string;
  queueTime?: string;
  sourceBranch?: string;
  sourceVersion?: string;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
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

function azureCliPath(): string {
  const configured = process.env.MERGEPILOT_E2E_AZ_CLI_PATH;
  if (configured) return configured;
  const windowsDefault = "C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd";
  if (existsSync(windowsDefault)) return windowsDefault;
  return "az";
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function runAzureCli(args: string[]): string {
  const command = ["&", psQuote(azureCliPath()), ...args.map(psQuote)].join(" ");
  return execFileSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    command,
  ], { encoding: "utf8" });
}

function latestClaimBotPipelineRun(): AdoBuildSummary {
  const raw = runAzureCli([
    "devops",
    "invoke",
    "--area",
    "build",
    "--resource",
    "builds",
    "--route-parameters",
    "project=TeBS-ClaimBot",
    "--query-parameters",
    "definitions=117",
    "top=1",
    "queryOrder=queueTimeDescending",
    "--org",
    "https://tebssg.visualstudio.com/",
    "-o",
    "json",
  ]);
  const parsed = JSON.parse(raw) as { value?: AdoBuildSummary[] };
  const latest = parsed.value?.[0];
  if (!latest?.id) throw new Error("Could not read latest ClaimBot_API pipeline #117 run.");
  return latest;
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
      adoOrgUrl: "",
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
      name: `mp-live-claimbot-pipeline-${runId}`,
      repoPath: claimBotRepoPath,
      defaultBranch: "main",
      targetBranch: "main",
      adoOrgUrl: "https://tebssg.visualstudio.com/",
      adoProject: "TeBS-ClaimBot",
      adoRepoName: "ClaimBot_API",
      adoPat: "",
      adoPipelineId: "117",
      adoPipelineName: "ClaimBot_API",
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

async function createClaimBotPipelineDiscoveryProjectLink(
  request: APIRequestContext,
): Promise<ProjectLinkResponse> {
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const createResponse = await request.post(`${DAEMON_URL}/project-links`, {
    data: {
      name: `mp-live-claimbot-discover-pipeline-${runId}`,
      repoPath: claimBotRepoPath,
      defaultBranch: "main",
      targetBranch: "main",
      adoOrgUrl: "https://tebssg.visualstudio.com/",
      adoProject: "TeBS-ClaimBot",
      adoRepoName: "ClaimBot_API",
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
    .filter({ hasText: "Environment" })
    .filter({ hasText: "Commit or push" })
    .first();
}

test.describe("Live app business workflows", () => {
  test.skip(!liveAppEnabled, "Set MERGEPILOT_E2E_LIVE_APP=1 to run against the live frontend and daemon.");

  test("stages only the requested file through the real Chat UI", async ({ page, request }) => {
    test.setTimeout(120_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createTempRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-stage-selected");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);

      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Stage only README.md. Do not stage notes.txt. Do not commit or push.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const approvalCard = page.getByText("Approval required").first().locator("xpath=ancestor::section[1]");
      await expect(approvalCard).toBeVisible({ timeout: 90_000 });
      await expect(approvalCard.getByText(/git add/i).first()).toBeVisible();
      await expect(approvalCard.getByText("README.md").first()).toBeVisible();
      await expect(approvalCard.getByText("notes.txt")).toHaveCount(0);
      await page.getByRole("button", { name: "Yes, run this action" }).first().click();

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
    test.setTimeout(150_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createTempRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-approval-restore");
      projectLinkId = projectLink.id;

      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
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

      const approvalCard = page.getByText("Approval required").first().locator("xpath=ancestor::section[1]");
      await expect(approvalCard).toBeVisible({ timeout: 90_000 });
      await expect(approvalCard.getByText(/git add/i).first()).toBeVisible();
      await expect(approvalCard.getByText("README.md").first()).toBeVisible();
      await expect(approvalCard.getByText("notes.txt")).toHaveCount(0);
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
      const restoredApprovalCard = page.getByText("Approval required").first().locator("xpath=ancestor::section[1]");
      await expect(restoredApprovalCard).toBeVisible({ timeout: 30_000 });
      await expect(restoredApprovalCard.getByText(/git add/i).first()).toBeVisible();
      await expect(restoredApprovalCard.getByText("README.md").first()).toBeVisible();
      await expect(restoredApprovalCard.getByText("notes.txt")).toHaveCount(0);
      expect(git(repoPath, ["diff", "--cached", "--name-only"])).toBe("");

      await restoredApprovalCard.getByRole("button", { name: "Yes, run this action" }).click();
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

      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Stage only README.md. Do not stage notes.txt. Do not commit or push.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const approvalCard = page.getByText("Approval required").first().locator("xpath=ancestor::section[1]");
      await expect(approvalCard).toBeVisible({ timeout: 90_000 });
      await expect(approvalCard.getByText(/git add/i).first()).toBeVisible();
      await approvalCard.getByRole("button", { name: "No, don't run it" }).click();

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
    test.setTimeout(180_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createTempRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-denial-feedback");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);

      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Stage only README.md. Do not stage notes.txt. Do not commit or push.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const firstApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git add/i })
        .filter({ hasText: "README.md" })
        .first();
      await expect(firstApproval).toBeVisible({ timeout: 90_000 });
      await expect(firstApproval.getByText("notes.txt")).toHaveCount(0);

      await firstApproval
        .getByPlaceholder("Tell MergePilot what to do differently...")
        .fill("Actually stage only notes.txt instead. Do not stage README.md. Do not commit or push.");
      await firstApproval.getByRole("button", { name: "No, don't run it" }).click();

      await expect.poll(() => git(repoPath, ["diff", "--cached", "--name-only"]), { timeout: 30_000 }).toBe("");

      const revisedApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git add/i })
        .filter({ hasText: "notes.txt" })
        .first();
      await expect(revisedApproval).toBeVisible({ timeout: 120_000 });
      await expect(revisedApproval.getByText("README.md")).toHaveCount(0);
      await revisedApproval.getByRole("button", { name: "Yes, run this action" }).click();

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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        `Stage all changes and commit them with message "${commitMessage}". Do not push.`,
      );
      await page.getByRole("button", { name: "Send" }).click();

      const stageApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git add/i })
        .first();
      await expect(stageApproval).toBeVisible({ timeout: 90_000 });
      await stageApproval.getByRole("button", { name: "Yes, run this action" }).click();

      await expect.poll(() => git(repoPath, ["status", "--short"]), { timeout: 30_000 }).toBe(
        "M  README.md\nM  notes.txt",
      );

      const commitApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git commit/i })
        .first();
      await expect(commitApproval).toBeVisible({ timeout: 90_000 });
      await expect(commitApproval.getByText(commitMessage).first()).toBeVisible();
      await commitApproval.getByRole("button", { name: "Yes, run this action" }).click();

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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await expect(page.getByText("Environment")).toBeVisible();
      await page.getByRole("button", { name: "Commit or push", exact: true }).click();
      await page.getByPlaceholder("Commit message (leave blank to generate)...").fill(commitMessage);
      const includeUnstaged = page.getByLabel("Include unstaged changes");
      if (await includeUnstaged.isChecked()) await includeUnstaged.uncheck();
      await page.getByRole("button", { name: "Prepare commit", exact: true }).click();

      const commitApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git commit/i })
        .first();
      await expect(commitApproval).toBeVisible({ timeout: 90_000 });
      await expect(commitApproval.getByText(commitMessage).first()).toBeVisible();
      await commitApproval.getByRole("button", { name: "Yes, run this action" }).click();

      await expect(page.getByText("Stopped after git commit").first()).toBeVisible({ timeout: 90_000 });
      await expect(page.getByText(/Commit failed before a new commit was created/i).first()).toBeVisible();
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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "What will be committed? Read-only only. Do not stage, commit, or push.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const stagedSummary = page.locator("p").filter({ hasText: /Changed files: README\.md/i }).first();
      await expect(stagedSummary).toBeVisible({ timeout: 90_000 });
      await expect(stagedSummary).not.toContainText("notes.txt");
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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
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
    test.setTimeout(120_000);

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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Where will this push go? Read-only only. Do not fetch, push, stage, or commit.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      await expect(page.getByText(/Remote target: origin\/(?:main|feature\/live-app-push)/i).first()).toBeVisible({
        timeout: 90_000,
      });
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
    test.setTimeout(150_000);

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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Review my current changes for risks, especially leaked credentials or secrets. Read-only only. Do not stage, commit, push, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      await expect(page.getByRole("button", { name: "Stop" })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByPlaceholder(/Ask MergePilot/)).toBeEnabled({ timeout: 120_000 });
      const body = page.locator("body");
      await expect(body).not.toContainText(secretRepo.secretValue);
      await expect(body).not.toContainText(`AZURE_OPENAI_API_KEY=${secretRepo.secretValue}`);
      await expect(page.getByText("Approval required")).toHaveCount(0);
      await expect(page.getByText(/git_add|git_commit/)).toHaveCount(0);
      const visibleTranscript = await page.locator("main").innerText();
      const quality = evaluateAiInsightAnswer(visibleTranscript, {
        requiredFiles: [".env.sample"],
        requiredCategories: ["security", "config"],
        reviewOnly: true,
      });
      expect(quality, JSON.stringify(quality.checks, null, 2)).toMatchObject({
        passed: true,
      });
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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await expect(page.getByText("Environment")).toBeVisible();
      const environmentPanel = liveEnvironmentPanel(page);
      await expect(environmentPanel.getByRole("button", { name: switchRepo.currentBranch, exact: true })).toBeVisible();

      await environmentPanel.getByRole("button", { name: switchRepo.currentBranch, exact: true }).click();
      await environmentPanel.getByRole("button", { name: "Refresh branch state" }).click();
      await expect(page.locator("main").getByRole("button", { name: /Ran|Worked/i }).first()).toBeVisible({ timeout: 90_000 });

      await environmentPanel.getByRole("button", { name: switchRepo.currentBranch, exact: true }).click();
      await environmentPanel.locator("button").filter({ hasText: switchRepo.targetBranch }).click();

      const approvalCard = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git_checkout|git_switch|git checkout|git switch/i })
        .first();
      await expect(approvalCard).toBeVisible({ timeout: 90_000 });
      await expect(approvalCard.getByText("HIGH risk")).toBeVisible();
      await expect(approvalCard.getByText(switchRepo.targetBranch).first()).toBeVisible();
      expect(git(switchRepo.repoPath, ["branch", "--show-current"])).toBe(switchRepo.currentBranch);
      expect(git(switchRepo.repoPath, ["diff", "--name-only"])).toBe("README.md");

      await approvalCard.getByRole("button", { name: "No, don't run it" }).click();
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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await expect(page.getByText("Environment")).toBeVisible();
      await expect(page.getByRole("button", { name: mergeRepo.currentBranch })).toBeVisible();

      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Merge main into the current branch using fast-forward only. Do not rebase, push, stage, commit, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const mergeApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git merge --ff-only main|git_merge/i })
        .first();
      await expect(mergeApproval).toBeVisible({ timeout: 90_000 });
      await expect(mergeApproval.getByText(/main/i).first()).toBeVisible();
      expect(git(mergeRepo.repoPath, ["rev-parse", "HEAD"])).not.toBe(mergeRepo.targetHead);

      await mergeApproval.getByRole("button", { name: "Yes, run this action" }).click();

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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await expect(page.getByText("Environment")).toBeVisible();
      await expect(page.getByRole("button", { name: mergeRepo.currentBranch })).toBeVisible();

      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Merge main into the current branch. Do not rebase, push, stage, commit, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const mergeApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git merge main|git_merge/i })
        .first();
      await expect(mergeApproval).toBeVisible({ timeout: 90_000 });
      await expect(mergeApproval.getByText(/main/i).first()).toBeVisible();
      expect(git(mergeRepo.repoPath, ["status", "--short"])).toBe("");

      await mergeApproval.getByRole("button", { name: "Yes, run this action" }).click();

      await expect.poll(() => gitOrEmpty(mergeRepo.repoPath, ["status", "--short"]), { timeout: 45_000 })
        .toContain("UU app.config");
      await expect(page.getByText(/Stopped after (git_merge|git merge main)/i).first()).toBeVisible({
        timeout: 90_000,
      });
      await expect(page.getByText(/Git is in merge with unresolved conflicts: app\.config/i)).toBeVisible();
      await expect(page.getByRole("button", { name: "Continue merge" })).toBeEnabled();
      await expect(page.getByRole("button", { name: "Abort merge" })).toBeEnabled();

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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await expect(page.getByText("Environment")).toBeVisible();
      await expect(page.getByRole("button", { name: "main" })).toBeVisible();

      await page.getByPlaceholder(/Ask MergePilot/).fill(
        `Create and switch to a new branch named ${branchName}. Do not stage, commit, push, or create a PR.`,
      );
      await page.getByRole("button", { name: "Send" }).click();

      const branchApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git switch -c|git checkout -b|git_create_branch|git_switch/i })
        .first();
      await expect(branchApproval).toBeVisible({ timeout: 90_000 });
      await expect(branchApproval.getByText(branchName).first()).toBeVisible();
      expect(git(repoPath, ["branch", "--show-current"])).toBe("main");

      await branchApproval.getByRole("button", { name: "Yes, run this action" }).click();

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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await expect(page.getByText("Environment")).toBeVisible();
      await expect(page.getByRole("button", { name: pushRepo.branchName })).toBeVisible();
      await expect(page.getByLabel("Composer Project Link")).toHaveValue(projectLinkId);
      await expect(page.getByLabel("Pinned Summary Project Link")).toHaveValue(projectLinkId);
      await page.getByRole("button", { name: "Commit or push", exact: true }).click();
      await page.getByRole("button", { name: "Push branch", exact: true }).click();

      const pushApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git push/i })
        .first();
      await expect(pushApproval).toBeVisible({ timeout: 90_000 });
      await expect(pushApproval.getByText(/origin/i).first()).toBeVisible();
      await pushApproval.getByRole("button", { name: "Yes, run this action" }).click();

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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await expect(page.getByText("Environment")).toBeVisible();
      const environmentPanel = liveEnvironmentPanel(page);
      await expect(environmentPanel.getByRole("button", { name: behindRepo.branchName, exact: true })).toBeVisible();

      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Pull latest from origin main with rebase. Do not push, stage, commit, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const pullApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git pull --rebase origin main/i })
        .first();
      await expect(pullApproval).toBeVisible({ timeout: 90_000 });
      await pullApproval.getByRole("button", { name: "Yes, run this action" }).click();

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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await expect(page.getByText("Environment")).toBeVisible();
      const environmentPanel = liveEnvironmentPanel(page);
      const branchButton = environmentPanel.getByRole("button", { name: conflictRepo.branchName, exact: true });
      await expect(branchButton).toBeVisible();

      await branchButton.click();
      await page.getByRole("button", { name: "Refresh branch state" }).click();
      await expect(page.locator("main").getByRole("button", { name: /Ran|Worked/i }).first()).toBeVisible({ timeout: 90_000 });

      await page.getByRole("button", { name: "Commit or push", exact: true }).click();
      await expect(page.getByText("Diverged: 1 ahead, 1 behind")).toBeVisible();
      await page.getByRole("button", { name: "Pull with rebase before pushing", exact: true }).click();

      const pullApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git pull --rebase origin main/i })
        .first();
      await expect(pullApproval).toBeVisible({ timeout: 90_000 });
      await pullApproval.getByRole("button", { name: "Yes, run this action" }).click();

      await expect.poll(() => gitOrEmpty(conflictRepo.repoPath, ["status", "--short"]), { timeout: 45_000 })
        .toContain("UU app.config");
      await expect(page.getByText("Stopped after git pull --rebase origin main").first()).toBeVisible({
        timeout: 90_000,
      });
      await expect(page.getByText(/Git is in rebase with unresolved conflicts: app\.config/i)).toBeVisible();
      await expect(page.getByRole("button", { name: "Continue rebase" })).toBeEnabled();

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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        `Stash my current work with message "${stashMessage}". Do not commit, push, or create a PR.`,
      );
      await page.getByRole("button", { name: "Send" }).click();

      const stashApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git[_ ]stash/i })
        .first();
      await expect(stashApproval).toBeVisible({ timeout: 90_000 });
      await expect(stashApproval.getByText(stashMessage).first()).toBeVisible();
      await stashApproval.getByRole("button", { name: "Yes, run this action" }).click();

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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Apply the latest stash without dropping it. Do not stage, commit, push, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const stashApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git stash apply|git_stash/i })
        .first();
      await expect(stashApproval).toBeVisible({ timeout: 90_000 });
      await expect(stashApproval.getByText("git stash apply").first()).toBeVisible();
      await stashApproval.getByRole("button", { name: "Yes, run this action" }).click();

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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Pop the latest stash and drop it if the restore succeeds. Do not stage, commit, push, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const stashApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git stash pop|git_stash/i })
        .first();
      await expect(stashApproval).toBeVisible({ timeout: 90_000 });
      await expect(stashApproval.getByText("git stash pop").first()).toBeVisible();
      await stashApproval.getByRole("button", { name: "Yes, run this action" }).click();

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
    test.setTimeout(180_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const repoPath = createStashPopConflictTempRepo();
    let projectLinkId: string | null = null;

    try {
      const projectLink = await createTempProjectLink(request, repoPath, "mp-live-stash-pop-conflict");
      projectLinkId = projectLink.id;

      await selectProjectLinkInBrowser(page, projectLinkId, repoPath);
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Pop the latest stash and explain conflict recovery if it fails. Do not stage, commit, push, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const stashApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git stash pop|git_stash/i })
        .first();
      await expect(stashApproval).toBeVisible({ timeout: 90_000 });
      await expect(stashApproval.getByText("git stash pop").first()).toBeVisible();
      await stashApproval.getByRole("button", { name: "Yes, run this action" }).click();

      await expect.poll(() => gitOrEmpty(repoPath, ["status", "--short"]), { timeout: 45_000 })
        .toContain("UU README.md");
      await expect(page.getByText("Stopped after git stash pop").first()).toBeVisible({ timeout: 90_000 });
      await expect(page.getByText(/Git has unresolved index conflicts: README\.md/i).first()).toBeVisible();
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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Discard changes in README.md only. Do not touch notes.txt. Do not stage, commit, push, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const restoreApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git[_ ]restore/i })
        .filter({ hasText: "README.md" })
        .first();
      await expect(restoreApproval).toBeVisible({ timeout: 90_000 });
      await expect(restoreApproval.getByText("notes.txt")).toHaveCount(0);
      await restoreApproval.getByRole("button", { name: "Yes, run this action" }).click();

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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Revert the last commit using git revert HEAD. Do not reset, push, or create a PR.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      const revertApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git[_ ]revert/i })
        .first();
      await expect(revertApproval).toBeVisible({ timeout: 120_000 });
      await expect(revertApproval.getByText(/HEAD|docs: bad release note/i).first()).toBeVisible();
      await revertApproval.getByRole("button", { name: "Yes, run this action" }).click();

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
    test.setTimeout(150_000);

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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        `Create local git tag ${tagName} on HEAD with message "${tagMessage}". Do not push tags, do not push the branch, and do not create a PR.`,
      );
      await page.getByRole("button", { name: "Send" }).click();

      const tagApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git[_ ]tag/i })
        .filter({ hasText: tagName })
        .first();
      await expect(tagApproval).toBeVisible({ timeout: 90_000 });
      await expect(tagApproval.getByText("HIGH risk")).toBeVisible();
      await expect(tagApproval.getByText(/push/i)).toHaveCount(0);
      await tagApproval.getByRole("button", { name: "Yes, run this action" }).click();

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
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await page.getByPlaceholder(/Ask MergePilot/).fill(
        `Push only local git tag ${tagName} to origin. Do not push branch ${pushRepo.branchName}, do not push other tags, and do not create a PR.`,
      );
      await page.getByRole("button", { name: "Send" }).click();

      const tagPushApproval = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: /git_push_tag|refs\/tags\//i })
        .filter({ hasText: tagName })
        .first();
      await expect(tagPushApproval).toBeVisible({ timeout: 90_000 });
      await expect(tagPushApproval.getByText("HIGH risk")).toBeVisible();
      await expect(tagPushApproval.getByText(`refs/tags/${tagName}:refs/tags/${tagName}`).first()).toBeVisible();
      await tagPushApproval.getByRole("button", { name: "Yes, run this action" }).click();

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

  test("discovers and saves ClaimBot_API pipeline #117 when the Project Link has no pipeline ID", async ({ page, request }) => {
    test.skip(
      !liveAdoEnabled,
      "Set MERGEPILOT_E2E_LIVE_ADO=1 to discover the real ClaimBot_API pipeline through the live app.",
    );
    test.setTimeout(180_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const previousRun = latestClaimBotPipelineRun();
    const projectLink = await createClaimBotPipelineDiscoveryProjectLink(request);
    let projectLinkId: string | null = projectLink.id;

    try {
      await selectProjectLinkInBrowser(page, projectLink.id, claimBotRepoPath);
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await expect(page.getByText("Environment")).toBeVisible();
      await expect(page.getByText("ClaimBot_API")).toBeVisible();

      await page.getByRole("button", { name: "Open Pipelines workspace" }).click();
      await expect(page.getByText("No Azure Pipeline is configured on this Project Link yet.")).toBeVisible({
        timeout: 120_000,
      });
      await expect(page.getByText(/#117 ClaimBot_API/).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Use #117 ClaimBot_API" })).toBeVisible();

      await page.getByRole("button", { name: "Use #117 ClaimBot_API" }).click();

      await expect
        .poll(async () => {
          const response = await request.get(`${DAEMON_URL}/project-links/${projectLink.id}`);
          expect(response.ok()).toBeTruthy();
          const saved = await response.json() as { adoPipelineId?: string; adoPipelineName?: string };
          return `${saved.adoPipelineId ?? ""}:${saved.adoPipelineName ?? ""}`;
        }, { timeout: 30_000 })
        .toBe("117:ClaimBot_API");
      await expect(page.getByRole("button", { name: "Use #117 ClaimBot_API" })).toHaveCount(0);
      await expect(page.getByText("Pipeline ID is required")).toHaveCount(0);
      await expect(page.getByText("Approval required")).toHaveCount(0);
      await expect(page.getByText("ado_trigger_pipeline")).toHaveCount(0);
      expect(latestClaimBotPipelineRun().id).toBe(previousRun.id);
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
        projectLinkId = null;
      }
    }
  });

  test("inspects ClaimBot_API pipeline #117 failure evidence through normal Chat input", async ({ page, request }) => {
    test.skip(
      !liveAdoEnabled,
      "Set MERGEPILOT_E2E_LIVE_ADO=1 to inspect the real ClaimBot_API pipeline through the live app.",
    );
    test.setTimeout(180_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const projectLink = await createClaimBotPipelineProjectLink(request);
    let projectLinkId: string | null = projectLink.id;

    try {
      await selectProjectLinkInBrowser(page, projectLink.id, claimBotRepoPath);
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await expect(page.getByText("Environment")).toBeVisible();
      await expect(page.getByText("ClaimBot_API")).toBeVisible();

      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Inspect pipeline 117 and summarize recent failed run evidence. Read-only only. Do not queue, trigger, or rerun anything.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      await expect(page.getByText(/Pipeline #117/i).first()).toBeVisible({ timeout: 120_000 });
      await expect(page.getByText(/Latest failed\/canceled run evidence/i).first()).toBeVisible({ timeout: 120_000 });
      await expect(page.getByText(/#4665|20260705\.1/i).first()).toBeVisible();
      await expect(page.getByText(/Copying file|MSBuild|Publishing\.targets|msbuild\.exe/i).first()).toBeVisible();
      await expect(page.getByText("Approval required")).toHaveCount(0);
      await expect(page.getByText("ado_trigger_pipeline")).toHaveCount(0);
      await expect(page.getByText("Pipeline #108")).toHaveCount(0);
      const visibleTranscript = await page.locator("main").innerText();
      const quality = evaluateAiInsightAnswer(visibleTranscript, {
        requiredFiles: [],
        requiredEvidence: ["Pipeline #117", "#4665", "MSBuild"],
        requiredCategories: ["deployment"],
        reviewOnly: true,
      });
      expect(quality, JSON.stringify(quality.checks, null, 2)).toMatchObject({
        passed: true,
      });
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
        projectLinkId = null;
      }
    }
  });

  test("prepares ClaimBot_API pipeline #117 rerun approval from failure evidence suggestions", async ({ page, request }) => {
    test.skip(
      !liveAdoEnabled,
      "Set MERGEPILOT_E2E_LIVE_ADO=1 to inspect the real ClaimBot_API pipeline through the live app.",
    );
    test.setTimeout(180_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const projectLink = await createClaimBotPipelineProjectLink(request);
    let projectLinkId: string | null = projectLink.id;
    const previousRun = latestClaimBotPipelineRun();

    try {
      await selectProjectLinkInBrowser(page, projectLink.id, claimBotRepoPath);
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await expect(page.getByText("Environment")).toBeVisible();
      await expect(page.getByText("ClaimBot_API")).toBeVisible();

      await page.getByPlaceholder(/Ask MergePilot/).fill(
        "Inspect pipeline 117 and summarize recent failed run evidence. Read-only only. Do not queue, trigger, or rerun anything.",
      );
      await page.getByRole("button", { name: "Send" }).click();

      await expect(page.getByText(/Latest failed\/canceled run evidence/i).first()).toBeVisible({ timeout: 120_000 });
      await expect(page.getByText(/Copying file|MSBuild|Publishing\.targets|msbuild\.exe/i).first()).toBeVisible();
      await expect(page.getByText("Approval required")).toHaveCount(0);

      await page.getByRole("button", { name: "Rerun pipeline" }).click();
      const approvalCard = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: "ado_trigger_pipeline" })
        .first();
      await expect(approvalCard).toBeVisible({ timeout: 120_000 });
      await expect(approvalCard.getByText(/Pipeline #117|pipeline_id.+117/i).first()).toBeVisible();
      await expect(approvalCard.getByText("Pipeline #108")).toHaveCount(0);

      if (destructiveEnabled) {
        await approvalCard.getByRole("button", { name: "Yes, run this action" }).click();
        await expect.poll(() => latestClaimBotPipelineRun().id, {
          timeout: 120_000,
          message: `Expected ClaimBot_API pipeline #117 to queue a rerun newer than ${previousRun.id}.`,
        }).toBeGreaterThan(previousRun.id);
      } else {
        await approvalCard.getByRole("button", { name: "No, don't run it" }).click();
        await expect
          .poll(() => latestClaimBotPipelineRun().id, {
            timeout: 30_000,
            message: "Read-only rerun approval test must not queue a pipeline run when destructive mode is disabled.",
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

  test("prepares ClaimBot_API pipeline #117 approval through the real Chat UI", async ({ page, request }) => {
    test.skip(
      !liveAdoEnabled,
      "Set MERGEPILOT_E2E_LIVE_ADO=1 to inspect the real ClaimBot_API pipeline through the live app.",
    );
    test.setTimeout(180_000);

    const health = await request.get(`${DAEMON_URL}/healthz`);
    expect(health.ok()).toBeTruthy();

    const projectLink = await createClaimBotPipelineProjectLink(request);
    let projectLinkId: string | null = projectLink.id;

    try {
      await selectProjectLinkInBrowser(page, projectLink.id, claimBotRepoPath);
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.goto("/chat?new=1");
      await expect(page.getByText("Environment")).toBeVisible();
      await expect(page.getByText("ClaimBot_API")).toBeVisible();

      await page.getByRole("button", { name: "Open Pipelines workspace" }).click();
      await expect(page.getByText(/Pipeline #117/i).first()).toBeVisible({ timeout: 120_000 });
      await expect(page.getByText("Pipeline #108")).toHaveCount(0);

      await page.getByRole("button", { name: "Progress ›" }).click();
      await page.getByRole("button", { name: "Trigger pipeline" }).click();

      const approvalCard = page
        .locator("section")
        .filter({ hasText: "Approval required" })
        .filter({ hasText: "ado_trigger_pipeline" })
        .first();
      await expect(approvalCard).toBeVisible({ timeout: 120_000 });
      await expect(approvalCard.getByText(/Pipeline #117|pipeline_id.+117/i).first()).toBeVisible();
      await expect(approvalCard.getByText("Pipeline #108")).toHaveCount(0);

      if (destructiveEnabled) {
        const previousRun = latestClaimBotPipelineRun();
        await approvalCard.getByRole("button", { name: "Yes, run this action" }).click();
        await expect.poll(() => latestClaimBotPipelineRun().id, {
          timeout: 120_000,
          message: `Expected ClaimBot_API pipeline #117 to queue a run newer than ${previousRun.id}.`,
        }).toBeGreaterThan(previousRun.id);
      } else {
        await approvalCard.getByRole("button", { name: "No, don't run it" }).click();
        await expect(page.getByText(/cancelled|canceled|No, don't run it|no/i).first()).toBeVisible({
          timeout: 30_000,
        });
      }
    } finally {
      if (projectLinkId) {
        await request.delete(`${DAEMON_URL}/project-links/${projectLinkId}`).catch(() => undefined);
        projectLinkId = null;
      }
    }
  });
});
