import { describe, expect, it } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  adoBase,
  adoFetch,
  addAzurePullRequestLabel,
  addAzurePullRequestReviewer,
  API_VERSION_WI,
  bearerAuth,
  createAzurePullRequest,
  getAzurePullRequestById,
  listAzureBuilds,
  listAzureRepositories,
  listAzurePullRequestChanges,
  listAzurePullRequestPolicyEvaluations,
  listAzurePullRequestThreads,
  listAzurePullRequestWorkItems,
  listAzurePullRequests,
  linkAzureWorkItemToPullRequest,
  removeAzurePullRequestLabel,
  removeAzurePullRequestReviewer,
  updateAzurePullRequest,
  type AdoAuth,
} from "../src/ado/index.js";

const LIVE_ADO = process.env.MERGEPILOT_E2E_LIVE_ADO === "1";
const DESTRUCTIVE = process.env.MERGEPILOT_E2E_DESTRUCTIVE === "1";
const RUN_ID = process.env.MERGEPILOT_E2E_RUN_ID || `mp-e2e-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 13)}`;
const ORG = process.env.MERGEPILOT_E2E_ADO_ORG || "tebssg";
const PROJECT = process.env.MERGEPILOT_E2E_ADO_PROJECT || "TeBS-ClaimBot";
const REPOSITORY = process.env.MERGEPILOT_E2E_ADO_REPOSITORY || "ClaimBot_API";
const TARGET_BRANCH = process.env.MERGEPILOT_E2E_ADO_TARGET_BRANCH || "main";
const SOURCE_BRANCH = process.env.MERGEPILOT_E2E_ADO_SOURCE_BRANCH || `mergepilot-e2e/${RUN_ID}`;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const runDestructive = LIVE_ADO && DESTRUCTIVE ? it : it.skip;

describe("live Azure DevOps destructive smoke", () => {
  runDestructive("creates and cleans up a tagged draft PR branch", async () => {
    const auth = getAdoAuthFromAzureCli();
    const created: {
      branch?: string;
      pullRequestId?: number;
      pullRequestUrl?: string;
      changedPath?: string;
      label?: string;
      reviewerId?: string;
      workItemId?: number;
      workItemLinked?: boolean;
      cleanup: Array<{ resource: string; status: "cleaned" | "cleanup_failed"; detail: string }>;
    } = { cleanup: [] };
    let testResult: "pass" | "fail" = "pass";

    try {
      const repositoryId = await getRepositoryId(auth);
      const targetObjectId = await getBranchObjectId(auth, repositoryId, TARGET_BRANCH);
      await createBranchRef(auth, repositoryId, SOURCE_BRANCH, targetObjectId);
      created.branch = SOURCE_BRANCH;
      created.changedPath = `/.mergepilot-e2e/${RUN_ID}.md`;
      await addTestCommitToBranch(auth, repositoryId, SOURCE_BRANCH, targetObjectId, created.changedPath);

      const pr = await createAzurePullRequest({
        organization: ORG,
        project: PROJECT,
        repository: REPOSITORY,
        sourceBranch: SOURCE_BRANCH,
        targetBranch: TARGET_BRANCH,
        title: `[${RUN_ID}] MergePilot live destructive smoke`,
        description: [
          "Automated MergePilot live destructive smoke.",
          `Run ID: ${RUN_ID}`,
          "This PR should be abandoned and the source branch deleted by cleanup.",
        ].join("\n"),
        draft: true,
        auth,
      });
      created.pullRequestId = pr.pull_request_id;
      created.pullRequestUrl = pr.url;
      expect(pr.pull_request_id).toBeGreaterThan(0);

      const updatedTitle = `[${RUN_ID}] MergePilot live destructive smoke - metadata updated`;
      const updatedDescription = [
        "Automated MergePilot live destructive smoke.",
        `Run ID: ${RUN_ID}`,
        "Metadata update verified before cleanup.",
      ].join("\n");
      const updated = await updateAzurePullRequest({
        organization: ORG,
        project: PROJECT,
        repository: REPOSITORY,
        pullRequestId: pr.pull_request_id,
        title: updatedTitle,
        description: updatedDescription,
        auth,
      });
      expect(updated).toMatchObject({
        id: pr.pull_request_id,
        title: updatedTitle,
        description: updatedDescription,
        status: "active",
      });

      const testLabel = `mergepilot-e2e-${RUN_ID}`.replace(/[^A-Za-z0-9._-]/g, "-");
      const addedLabel = await addAzurePullRequestLabel({
        organization: ORG,
        project: PROJECT,
        repository: REPOSITORY,
        pullRequestId: pr.pull_request_id,
        label: testLabel,
        auth,
      });
      created.label = testLabel;
      expect(addedLabel).toMatchObject({
        pullRequestId: pr.pull_request_id,
        label: testLabel,
        name: testLabel,
        active: true,
        action: "added",
      });

      const removedLabel = await removeAzurePullRequestLabel({
        organization: ORG,
        project: PROJECT,
        repository: REPOSITORY,
        pullRequestId: pr.pull_request_id,
        label: testLabel,
        auth,
      });
      expect(removedLabel).toMatchObject({
        pullRequestId: pr.pull_request_id,
        label: testLabel,
        active: false,
        action: "removed",
      });
      created.cleanup.push({
        resource: `PR label ${testLabel}`,
        status: "cleaned",
        detail: "added and removed during test body",
      });
      created.label = undefined;

      const reviewerId = process.env.MERGEPILOT_E2E_ADO_REVIEWER_ID?.trim() || await getAuthenticatedAdoReviewerId(auth);
      const reviewer = await addAzurePullRequestReviewer({
        organization: ORG,
        project: PROJECT,
        repository: REPOSITORY,
        pullRequestId: pr.pull_request_id,
        reviewerId,
        isRequired: false,
        auth,
      });
      created.reviewerId = reviewerId;
      expect(reviewer).toMatchObject({
        pullRequestId: pr.pull_request_id,
        action: "added",
      });
      expect(reviewer.reviewerId || reviewer.uniqueName || reviewer.displayName).not.toBe("");

      const removedReviewer = await removeAzurePullRequestReviewer({
        organization: ORG,
        project: PROJECT,
        repository: REPOSITORY,
        pullRequestId: pr.pull_request_id,
        reviewerId,
        auth,
      });
      expect(removedReviewer).toMatchObject({
        pullRequestId: pr.pull_request_id,
        reviewerId,
        action: "removed",
      });
      created.cleanup.push({
        resource: `PR reviewer ${reviewerId}`,
        status: "cleaned",
        detail: "added and removed during test body",
      });
      created.reviewerId = undefined;

      const workItem = await createTestWorkItem(auth);
      created.workItemId = workItem.id;
      expect(workItem.id).toBeGreaterThan(0);

      const linkedWorkItem = await linkAzureWorkItemToPullRequest({
        organization: ORG,
        project: PROJECT,
        repository: REPOSITORY,
        pullRequestId: pr.pull_request_id,
        workItemId: workItem.id,
        auth,
      });
      expect(linkedWorkItem).toMatchObject({
        ok: true,
        work_item_id: workItem.id,
        pull_request_id: pr.pull_request_id,
      });
      created.workItemLinked = true;

      const linkedItems = await listAzurePullRequestWorkItems({
        organization: ORG,
        project: PROJECT,
        repository: REPOSITORY,
        pullRequestId: pr.pull_request_id,
        auth,
      });
      expect(linkedItems.some((item) => item.id === workItem.id)).toBe(true);

      await unlinkWorkItemFromPullRequest(auth, workItem.id, pr.pull_request_id);
      created.cleanup.push({
        resource: `work item link ${workItem.id}->PR ${pr.pull_request_id}`,
        status: "cleaned",
        detail: "linked and unlinked during test body",
      });
      created.workItemLinked = false;

      await deleteWorkItem(auth, workItem.id);
      created.cleanup.push({
        resource: `work item ${workItem.id}`,
        status: "cleaned",
        detail: "deleted during test body",
      });
      created.workItemId = undefined;

      const activePrs = await listAzurePullRequests({
        organization: ORG,
        project: PROJECT,
        repository: REPOSITORY,
        status: "active",
        top: 25,
        auth,
      });
      expect(activePrs.some((candidate) =>
        candidate.id === pr.pull_request_id &&
        candidate.title === updatedTitle,
      )).toBe(true);

      const insightData = await collectCreatedPullRequestInsightData(auth, pr.pull_request_id);
      expect(insightData.pullRequest).toMatchObject({
        id: pr.pull_request_id,
        title: updatedTitle,
        status: "active",
        sourceBranch: SOURCE_BRANCH,
        targetBranch: TARGET_BRANCH,
      });
      expect(insightData.changes.changes.some((change) =>
        change.path === created.changedPath,
      )).toBe(true);
      expect(Array.isArray(insightData.threads)).toBe(true);
      expect(Array.isArray(insightData.workItems)).toBe(true);
      expect(Array.isArray(insightData.policies)).toBe(true);
      expect(Array.isArray(insightData.builds)).toBe(true);
    } catch (err) {
      testResult = "fail";
      throw err;
    } finally {
      if (created.pullRequestId && created.label) {
        try {
          await removeAzurePullRequestLabel({
            organization: ORG,
            project: PROJECT,
            repository: REPOSITORY,
            pullRequestId: created.pullRequestId,
            label: created.label,
            auth,
          });
          created.cleanup.push({
            resource: `PR label ${created.label}`,
            status: "cleaned",
            detail: "removed in cleanup",
          });
        } catch (err) {
          created.cleanup.push({
            resource: `PR label ${created.label}`,
            status: "cleanup_failed",
            detail: errorMessage(err),
          });
        }
      }

      if (created.pullRequestId && created.reviewerId) {
        try {
          await removeAzurePullRequestReviewer({
            organization: ORG,
            project: PROJECT,
            repository: REPOSITORY,
            pullRequestId: created.pullRequestId,
            reviewerId: created.reviewerId,
            auth,
          });
          created.cleanup.push({
            resource: `PR reviewer ${created.reviewerId}`,
            status: "cleaned",
            detail: "removed in cleanup",
          });
        } catch (err) {
          created.cleanup.push({
            resource: `PR reviewer ${created.reviewerId}`,
            status: "cleanup_failed",
            detail: errorMessage(err),
          });
        }
      }

      if (created.workItemId && created.workItemLinked && created.pullRequestId) {
        try {
          await unlinkWorkItemFromPullRequest(auth, created.workItemId, created.pullRequestId);
          created.cleanup.push({
            resource: `work item link ${created.workItemId}->PR ${created.pullRequestId}`,
            status: "cleaned",
            detail: "unlinked in cleanup",
          });
          created.workItemLinked = false;
        } catch (err) {
          created.cleanup.push({
            resource: `work item link ${created.workItemId}->PR ${created.pullRequestId}`,
            status: "cleanup_failed",
            detail: errorMessage(err),
          });
        }
      }

      if (created.workItemId) {
        try {
          await deleteWorkItem(auth, created.workItemId);
          created.cleanup.push({
            resource: `work item ${created.workItemId}`,
            status: "cleaned",
            detail: "deleted in cleanup",
          });
          created.workItemId = undefined;
        } catch (err) {
          created.cleanup.push({
            resource: `work item ${created.workItemId}`,
            status: "cleanup_failed",
            detail: errorMessage(err),
          });
        }
      }

      if (created.pullRequestId) {
        try {
          await updateAzurePullRequest({
            organization: ORG,
            project: PROJECT,
            repository: REPOSITORY,
            pullRequestId: created.pullRequestId,
            status: "abandoned",
            auth,
          });
          created.cleanup.push({
            resource: `PR ${created.pullRequestId}`,
            status: "cleaned",
            detail: "abandoned",
          });
        } catch (err) {
          created.cleanup.push({
            resource: `PR ${created.pullRequestId}`,
            status: "cleanup_failed",
            detail: errorMessage(err),
          });
        }
      }

      if (created.branch) {
        try {
          const repositoryId = await getRepositoryId(auth);
          const objectId = await getBranchObjectId(auth, repositoryId, created.branch);
          await deleteBranchRef(auth, repositoryId, created.branch, objectId);
          created.cleanup.push({
            resource: `branch ${created.branch}`,
            status: "cleaned",
            detail: "deleted",
          });
        } catch (err) {
          created.cleanup.push({
            resource: `branch ${created.branch}`,
            status: "cleanup_failed",
            detail: errorMessage(err),
          });
        }
      }

      const failedCleanup = created.cleanup.filter((entry) => entry.status === "cleanup_failed");
      writeRunArtifact({
        runId: RUN_ID,
        result: failedCleanup.length > 0 ? "cleanup_failed" : testResult,
        organization: ORG,
        project: PROJECT,
        repository: REPOSITORY,
        targetBranch: TARGET_BRANCH,
        sourceBranch: created.branch ?? SOURCE_BRANCH,
        pullRequestId: created.pullRequestId,
        pullRequestUrl: created.pullRequestUrl,
        changedPath: created.changedPath,
        reviewerId: created.reviewerId,
        workItemId: created.workItemId,
        cleanup: created.cleanup,
      });
      expect(failedCleanup, JSON.stringify(created.cleanup)).toEqual([]);
    }
  }, 120_000);
});

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

async function getRepositoryId(auth: AdoAuth): Promise<string> {
  const repos = await listAzureRepositories({
    organization: ORG,
    project: PROJECT,
    auth,
  });
  const repo = repos.find((candidate) => candidate.name === REPOSITORY || candidate.id === REPOSITORY);
  if (!repo?.id) throw new Error(`Repository ${REPOSITORY} was not found in ${PROJECT}.`);
  return repo.id;
}

function quoteCmdArg(arg: string): string {
  return /^[A-Za-z0-9_.:/=-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`;
}

async function getBranchObjectId(auth: AdoAuth, repositoryId: string, branch: string): Promise<string> {
  const filter = encodeURIComponent(`heads/${branch}`);
  const url = `${adoBase(ORG)}/${encodeURIComponent(PROJECT)}/_apis/git/repositories/${encodeURIComponent(repositoryId)}/refs?filter=${filter}&api-version=7.1-preview.1`;
  const resp = await adoFetch(url, auth);
  if (!resp.ok) throw new Error(`get branch ${branch} failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  const body = await resp.json() as { value?: Array<{ name?: string; objectId?: string }> };
  const ref = (body.value ?? []).find((item) => item.name === `refs/heads/${branch}` || item.name?.endsWith(`/${branch}`));
  if (!ref?.objectId) throw new Error(`Branch ${branch} was not found.`);
  return ref.objectId;
}

async function createBranchRef(auth: AdoAuth, repositoryId: string, branch: string, targetObjectId: string): Promise<void> {
  const url = `${adoBase(ORG)}/${encodeURIComponent(PROJECT)}/_apis/git/repositories/${encodeURIComponent(repositoryId)}/refs?api-version=7.1-preview.1`;
  const resp = await adoFetch(url, auth, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([{
      name: `refs/heads/${branch}`,
      oldObjectId: "0000000000000000000000000000000000000000",
      newObjectId: targetObjectId,
    }]),
  });
  if (!resp.ok) throw new Error(`create branch ${branch} failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
}

async function addTestCommitToBranch(
  auth: AdoAuth,
  repositoryId: string,
  branch: string,
  oldObjectId: string,
  changedPath: string,
): Promise<void> {
  const pushUrl = `${adoBase(ORG)}/${encodeURIComponent(PROJECT)}/_apis/git/repositories/${encodeURIComponent(repositoryId)}/pushes?api-version=7.1`;
  const resp = await adoFetch(pushUrl, auth, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      refUpdates: [{
        name: `refs/heads/${branch}`,
        oldObjectId,
      }],
      commits: [{
        comment: `[${RUN_ID}] MergePilot live destructive smoke`,
        changes: [{
          changeType: "add",
          item: { path: changedPath },
          newContent: {
            content: [
              "# MergePilot live destructive smoke",
              "",
              `Run ID: ${RUN_ID}`,
              `Created at: ${new Date().toISOString()}`,
              "",
              "This file is created on an isolated test branch and should disappear when the branch is deleted.",
              "",
            ].join("\n"),
            contentType: "rawtext",
          },
        }],
      }],
    }),
  });
  if (!resp.ok) throw new Error(`push test commit to ${branch} failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
}

async function deleteBranchRef(auth: AdoAuth, repositoryId: string, branch: string, objectId: string): Promise<void> {
  const url = `${adoBase(ORG)}/${encodeURIComponent(PROJECT)}/_apis/git/repositories/${encodeURIComponent(repositoryId)}/refs?api-version=7.1-preview.1`;
  const resp = await adoFetch(url, auth, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([{
      name: `refs/heads/${branch}`,
      oldObjectId: objectId,
      newObjectId: "0000000000000000000000000000000000000000",
    }]),
  });
  if (!resp.ok) throw new Error(`delete branch ${branch} failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
}

async function getAuthenticatedAdoReviewerId(auth: AdoAuth): Promise<string> {
  const url = `${adoBase(ORG)}/_apis/connectionData?api-version=7.1-preview.1`;
  const resp = await adoFetch(url, auth);
  if (!resp.ok) {
    throw new Error(`get authenticated ADO user failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  }
  const body = await resp.json() as {
    authenticatedUser?: {
      id?: string;
      subjectDescriptor?: string;
      properties?: {
        Account?: { $value?: string };
      };
    };
  };
  const id = body.authenticatedUser?.id?.trim();
  if (id) return id;
  const subjectDescriptor = body.authenticatedUser?.subjectDescriptor?.trim();
  if (subjectDescriptor) return subjectDescriptor;
  const account = body.authenticatedUser?.properties?.Account?.$value?.trim();
  if (account) return account;
  throw new Error("Authenticated ADO reviewer identity was not returned by connectionData.");
}

async function createTestWorkItem(auth: AdoAuth): Promise<{ id: number }> {
  const url = `${adoBase(ORG)}/${encodeURIComponent(PROJECT)}/_apis/wit/workitems/$Task?api-version=${API_VERSION_WI}`;
  const resp = await adoFetch(url, auth, {
    method: "PATCH",
    headers: { "Content-Type": "application/json-patch+json" },
    body: JSON.stringify([
      { op: "add", path: "/fields/System.Title", value: `[${RUN_ID}] MergePilot live destructive smoke` },
      { op: "add", path: "/fields/System.Description", value: `Temporary work item for ${RUN_ID}. Delete during cleanup.` },
      { op: "add", path: "/fields/System.Tags", value: `mergepilot-e2e;${RUN_ID}` },
    ]),
  });
  if (!resp.ok) throw new Error(`create work item failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  const body = await resp.json() as { id?: number };
  const id = Number(body.id ?? 0);
  if (!id) throw new Error("create work item did not return an id.");
  return { id };
}

async function unlinkWorkItemFromPullRequest(auth: AdoAuth, workItemId: number, pullRequestId: number): Promise<void> {
  const [projectId, repositoryId] = await Promise.all([
    getProjectId(auth),
    getRepositoryId(auth),
  ]);
  const artifactUrl = `vstfs:///Git/PullRequestId/${projectId}%2F${repositoryId}%2F${pullRequestId}`;
  const details = await getWorkItemRelations(auth, workItemId);
  const relationIndex = details.relations.findIndex((relation) =>
    relation.rel === "ArtifactLink" &&
    relation.url === artifactUrl
  );
  if (relationIndex < 0) throw new Error(`work item ${workItemId} did not contain PR relation ${artifactUrl}`);

  const url = `${adoBase(ORG)}/${encodeURIComponent(PROJECT)}/_apis/wit/workitems/${workItemId}?api-version=${API_VERSION_WI}`;
  const resp = await adoFetch(url, auth, {
    method: "PATCH",
    headers: { "Content-Type": "application/json-patch+json" },
    body: JSON.stringify([{ op: "remove", path: `/relations/${relationIndex}` }]),
  });
  if (!resp.ok) throw new Error(`unlink work item ${workItemId} failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
}

async function getProjectId(auth: AdoAuth): Promise<string> {
  const url = `${adoBase(ORG)}/_apis/projects/${encodeURIComponent(PROJECT)}?api-version=7.1-preview.4`;
  const resp = await adoFetch(url, auth);
  if (!resp.ok) throw new Error(`get project ${PROJECT} failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  const body = await resp.json() as { id?: string };
  const id = body.id?.trim();
  if (!id) throw new Error(`Project ${PROJECT} did not return an id.`);
  return id;
}

async function getWorkItemRelations(auth: AdoAuth, workItemId: number): Promise<{
  relations: Array<{ rel?: string; url?: string }>;
}> {
  const url = `${adoBase(ORG)}/${encodeURIComponent(PROJECT)}/_apis/wit/workitems/${workItemId}?$expand=Relations&api-version=${API_VERSION_WI}`;
  const resp = await adoFetch(url, auth);
  if (!resp.ok) throw new Error(`get work item ${workItemId} failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  const body = await resp.json() as { relations?: Array<{ rel?: string; url?: string }> };
  return { relations: body.relations ?? [] };
}

async function deleteWorkItem(auth: AdoAuth, workItemId: number): Promise<void> {
  const url = `${adoBase(ORG)}/${encodeURIComponent(PROJECT)}/_apis/wit/workitems/${workItemId}?api-version=${API_VERSION_WI}`;
  const resp = await adoFetch(url, auth, { method: "DELETE" });
  if (!resp.ok) throw new Error(`delete work item ${workItemId} failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
}

async function collectCreatedPullRequestInsightData(auth: AdoAuth, pullRequestId: number) {
  const pullRequest = await getAzurePullRequestById({
    organization: ORG,
    project: PROJECT,
    repository: REPOSITORY,
    pullRequestId,
    auth,
    includeWorkItemRefs: true,
  });
  const [threads, changes, workItems, policies, builds] = await Promise.all([
    listAzurePullRequestThreads({
      organization: ORG,
      project: PROJECT,
      repository: REPOSITORY,
      pullRequestId,
      auth,
      top: 100,
    }),
    listAzurePullRequestChanges({
      organization: ORG,
      project: PROJECT,
      repository: REPOSITORY,
      pullRequestId,
      auth,
      top: 100,
    }),
    listAzurePullRequestWorkItems({
      organization: ORG,
      project: PROJECT,
      repository: REPOSITORY,
      pullRequestId,
      auth,
    }).catch(() => []),
    listAzurePullRequestPolicyEvaluations({
      organization: ORG,
      project: PROJECT,
      repository: REPOSITORY,
      pullRequestId,
      auth,
    }).catch(() => []),
    listAzureBuilds({
      organization: ORG,
      project: PROJECT,
      auth,
      branchName: pullRequest.sourceBranch,
      repositoryId: REPOSITORY,
      repositoryType: "TfsGit",
      top: 20,
    }).catch(() => []),
  ]);
  return { pullRequest, threads, changes, workItems, policies, builds };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function writeRunArtifact(payload: {
  runId: string;
  result: "pass" | "fail" | "cleanup_failed";
  organization: string;
  project: string;
  repository: string;
  targetBranch: string;
  sourceBranch: string;
  pullRequestId?: number;
  pullRequestUrl?: string;
  changedPath?: string;
  reviewerId?: string;
  workItemId?: number;
  cleanup: Array<{ resource: string; status: "cleaned" | "cleanup_failed"; detail: string }>;
}): void {
  const outputDir = path.join(REPO_ROOT, "output", "live-e2e");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, `${payload.runId}-ado-destructive-pr.json`),
    `${JSON.stringify({
      ...payload,
      recordedAt: new Date().toISOString(),
    }, null, 2)}\n`,
    "utf8",
  );
}
