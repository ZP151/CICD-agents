import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bearerAuth, type AdoAuth, type ProjectLink } from "@mergepilot/core";
import { describe, expect, it } from "vitest";
import { preparePullRequest } from "../src/pullRequestPreparation.js";
import { runPullRequestValidation } from "../src/pullRequestValidation.js";

/**
 * Read-only source-live acceptance for Guided PR Preparation.
 *
 * This test never creates or updates Azure DevOps resources. It binds one
 * isolated, already-pushed fixture branch to a real Work Item and the real
 * target policy read, then records a redacted machine-readable artifact.
 * The later ActionRecord E2E owns all remote writes.
 *
 * Required gates:
 *   MERGEPILOT_E2E_LIVE_ADO=1
 *   MERGEPILOT_E2E_ADO_WORK_ITEM_ID=<existing fixture Work Item id>
 */
const LIVE_ADO = process.env.MERGEPILOT_E2E_LIVE_ADO === "1";
const WORK_ITEM_ID = Number(process.env.MERGEPILOT_E2E_ADO_WORK_ITEM_ID ?? "");
const RUN_LIVE = LIVE_ADO && Number.isInteger(WORK_ITEM_ID) && WORK_ITEM_ID > 0 ? it : it.skip;
const ORG = process.env.MERGEPILOT_E2E_ADO_ORG || "tebssg";
const PROJECT = process.env.MERGEPILOT_E2E_ADO_PROJECT || "TeBS-ClaimBot";
const REPOSITORY = process.env.MERGEPILOT_E2E_ADO_REPOSITORY || "ClaimBot_API";
const SOURCE_BRANCH = process.env.MERGEPILOT_E2E_ADO_SOURCE_BRANCH || "mergepilot-e2e/guided-pr-v1";
const TARGET_BRANCH = process.env.MERGEPILOT_E2E_ADO_TARGET_BRANCH || "main";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DEFAULT_FIXTURE_ROOT = path.join(process.env.USERPROFILE || "C:\\Users\\<USER>", "Develop", "ClaimBot_API-mergepilot-e2e-v1");
const FIXTURE_ROOT = path.resolve(process.env.MERGEPILOT_E2E_CLAIMBOT_REPO_PATH || DEFAULT_FIXTURE_ROOT);
const EVIDENCE_PATH = path.resolve(
  process.env.MERGEPILOT_E2E_EVIDENCE_PATH
    || path.join(REPO_ROOT, "output", "source-live", "guided-pr-preparation.json"),
);

describe("live Guided PR source evidence", () => {
  RUN_LIVE("binds local Git, remote branch revisions, Work Item, policy, and validation to one source SHA", async () => {
    expect(existsSync(FIXTURE_ROOT), `Fixture worktree not found: ${FIXTURE_ROOT}`).toBe(true);
    const auth = getAdoAuthFromAzureCli();
    const projectLink = fixtureProjectLink();
    const expectedHeadSha = git(["rev-parse", "HEAD"], FIXTURE_ROOT);
    const validation = await runPullRequestValidation({ projectLink, expectedHeadSha });
    expect(["passed", "unavailable"]).toContain(validation.status);
    expect(validation.sourceSha).toBe(expectedHeadSha);

    const result = await preparePullRequest({
      projectLink,
      preferences: {
        sourceBranch: SOURCE_BRANCH,
        targetBranch: TARGET_BRANCH,
        workItemId: WORK_ITEM_ID,
      },
      validation,
      dependencies: { getAuth: async () => auth },
    });

    expect(result.git.sourceBranch).toBe(SOURCE_BRANCH);
    expect(result.git.headSha).toBe(expectedHeadSha);
    expect(result.git.dirty).toBe(false);
    expect(result.git.remoteSourceSha).toBe(expectedHeadSha);
    expect(result.git.remoteTargetSha).toMatch(/^[0-9a-f]{40}$/i);
    expect(result.git.commits.length).toBeGreaterThan(0);
    expect(result.git.changedFiles.length).toBeGreaterThan(0);
    expect(result.repositoryId).toBeTruthy();
    expect(result.workItem.status).toBe("available");
    expect(result.workItem.item?.id).toBe(WORK_ITEM_ID);
    expect(result.policies.status).toBe("available");
    expect(result.policies.targetRef).toBe(`refs/heads/${TARGET_BRANCH}`);
    expect(result.validation.sourceSha).toBe(expectedHeadSha);
    expect(result.suggestion.sourceBranch).toBe(SOURCE_BRANCH);
    expect(result.suggestion.targetBranch).toBe(TARGET_BRANCH);
    expect(result.suggestion.readiness).not.toBe("blocked");
    expect(result.suggestion.readiness).not.toBe("insufficient_evidence");

    const enabledPolicies = result.policies.configurations.filter((policy) => policy.isEnabled);
    const evidence = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      mergePilotSha: git(["rev-parse", "HEAD"], REPO_ROOT),
      fixture: {
        branch: result.git.sourceBranch,
        localHeadSha: result.git.headSha,
        remoteSourceSha: result.git.remoteSourceSha,
        targetBranch: result.git.targetBranch,
        remoteTargetSha: result.git.remoteTargetSha,
        dirty: result.git.dirty,
        ahead: result.git.ahead,
        behind: result.git.behind,
        commits: result.git.commits,
        changedFiles: result.git.changedFiles,
        diffStat: result.git.diffStat,
      },
      workItem: {
        status: result.workItem.status,
        id: result.workItem.item?.id,
        revision: result.workItem.item?.revision,
        type: result.workItem.item?.type,
        state: result.workItem.item?.state,
        title: result.workItem.item?.title,
      },
      policies: {
        status: result.policies.status,
        targetRef: result.policies.targetRef,
        enabled: enabledPolicies.length,
        blocking: enabledPolicies.filter((policy) => policy.isBlocking).length,
        configurations: enabledPolicies.map((policy) => ({
          id: policy.id,
          revision: policy.revision,
          typeId: policy.typeId,
          displayName: policy.displayName,
          isBlocking: policy.isBlocking,
        })),
      },
      validation: {
        status: result.validation.status,
        sourceSha: result.validation.sourceSha,
        durationMs: result.validation.durationMs,
        summary: redact(result.validation.summary),
        command: redact(result.validation.command),
      },
      suggestion: {
        readiness: result.suggestion.readiness,
        workItemId: result.suggestion.workItemId,
        missingEvidence: result.suggestion.missingEvidence,
        risks: result.suggestion.risks,
      },
    };
    mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
    writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    expect(existsSync(EVIDENCE_PATH)).toBe(true);
  }, 300_000);
});

function fixtureProjectLink(): ProjectLink {
  return {
    id: "claimbot-guided-pr-source-live",
    name: "[MergePilot Fixture] ClaimBot Guided PR",
    repoPath: FIXTURE_ROOT,
    defaultBranch: TARGET_BRANCH,
    targetBranch: TARGET_BRANCH,
    adoOrgUrl: ORG,
    adoProject: PROJECT,
    adoRepoName: REPOSITORY,
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
    createdAt: 1,
    updatedAt: 1,
  };
}

function getAdoAuthFromAzureCli(): AdoAuth {
  const args = [
    "account",
    "get-access-token",
    "--resource",
    "499b84ac-1321-427f-aa17-267ca6975798",
    "--query",
    "accessToken",
    "-o",
    "tsv",
  ];
  const az = resolveAzureCliCommand();
  const token = process.platform === "win32" && az.toLowerCase().endsWith(".cmd")
    ? execSync(`"${az}" ${args.map(quoteCmdArg).join(" ")}`, { encoding: "utf8", shell: "cmd.exe" }).trim()
    : execFileSync(az, args, { encoding: "utf8" }).trim();
  if (!token) throw new Error("Azure CLI did not return an Azure DevOps token.");
  return bearerAuth(token);
}

function resolveAzureCliCommand(): string {
  const candidates = [
    process.env.MERGEPILOT_E2E_AZURE_CLI_PATH,
    process.env.AZURE_CLI_PATH,
    "C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd",
    "C:\\Program Files (x86)\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd",
  ].filter(Boolean) as string[];
  return candidates.find((candidate) => existsSync(candidate)) || "az";
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function quoteCmdArg(arg: string): string {
  return /^[A-Za-z0-9_.:/=-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`;
}

function redact(value: string | undefined): string | undefined {
  if (!value) return value;
  const userProfile = process.env.USERPROFILE || "";
  return value
    .replaceAll(FIXTURE_ROOT, "<CLAIMBOT_FIXTURE>")
    .replaceAll(FIXTURE_ROOT.replaceAll("\\", "/"), "<CLAIMBOT_FIXTURE>")
    .replaceAll(userProfile, "<USERPROFILE>")
    .slice(0, 1_000);
}
