import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adoBase,
  adoFetch,
  bearerAuth,
  getAzureBuildLogExcerpt,
  getAzureBuildTimeline,
  getAzurePipelineRun,
  listAzurePipelineRuns,
  triggerAzurePipelineRun,
  type AdoAuth,
} from "../src/ado/index.js";

const LIVE_ADO = process.env.MERGEPILOT_E2E_LIVE_ADO === "1";
const DESTRUCTIVE = process.env.MERGEPILOT_E2E_DESTRUCTIVE === "1";
const RUN_ID = process.env.MERGEPILOT_E2E_RUN_ID || `mp-e2e-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 13)}`;
const ORG = process.env.MERGEPILOT_E2E_ADO_ORG || "tebssg";
const PROJECT = process.env.MERGEPILOT_E2E_ADO_PROJECT || "TeBS-ClaimBot";
const PIPELINE_ID = process.env.MERGEPILOT_E2E_ADO_PIPELINE_ID || "117";
const BRANCH = process.env.MERGEPILOT_E2E_ADO_PIPELINE_BRANCH?.trim();

const runLive = LIVE_ADO ? it : it.skip;
const runDestructive = LIVE_ADO && DESTRUCTIVE ? it : it.skip;

describe("live Azure DevOps pipeline smoke", () => {
  runLive("lists recent pipeline runs", async () => {
    const auth = getAdoAuthFromAzureCli();

    const runs = await listAzurePipelineRuns({
      organization: ORG,
      project: PROJECT,
      pipelineId: PIPELINE_ID,
      top: 3,
      auth,
    });

    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0]?.id).toBeGreaterThan(0);
    expect(runs[0]?.state).not.toBe("");
  }, 60_000);

  runLive("reads timeline and log evidence for the latest failed pipeline run", async () => {
    const auth = getAdoAuthFromAzureCli();
    const runs = await listAzurePipelineRuns({
      organization: ORG,
      project: PROJECT,
      pipelineId: PIPELINE_ID,
      top: 10,
      auth,
    });
    const failedRun = runs.find((run) => /failed|canceled/i.test(`${run.result} ${run.state}`));
    if (!failedRun) return;

    const timeline = await getAzureBuildTimeline({
      organization: ORG,
      project: PROJECT,
      buildId: failedRun.id,
      auth,
    });

    expect(timeline.buildId).toBe(failedRun.id);
    expect(timeline.failedRecords.length + timeline.errorIssues.length).toBeGreaterThan(0);

    const logId = timeline.failedRecords.find((record) => record.logId > 0)?.logId;
    if (!logId) return;
    const excerpt = await getAzureBuildLogExcerpt({
      organization: ORG,
      project: PROJECT,
      buildId: failedRun.id,
      logId,
      auth,
    });
    expect(excerpt.excerpt).not.toBe("");
  }, 60_000);

  runDestructive("queues and reads back a tagged pipeline run", async () => {
    const auth = getAdoAuthFromAzureCli();
    const branch = await resolveRunnablePipelineBranch(auth);

    const queued = await triggerAzurePipelineRun({
      organization: ORG,
      project: PROJECT,
      pipelineId: PIPELINE_ID,
      branch,
      auth,
    });

    expect(queued.run_id, `Expected queued pipeline run for ${RUN_ID}.`).toBeGreaterThan(0);
    expect(queued.url).not.toBe("");

    const fetched = await getAzurePipelineRun({
      organization: ORG,
      project: PROJECT,
      pipelineId: PIPELINE_ID,
      runId: queued.run_id!,
      auth,
    });

    expect(fetched.id).toBe(queued.run_id);
    expect(fetched.state).not.toBe("");
    if (branch) expect(fetched.sourceBranch).toBe(branch);
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

function quoteCmdArg(arg: string): string {
  return /^[A-Za-z0-9_.:/=-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`;
}

async function resolveRunnablePipelineBranch(auth: AdoAuth): Promise<string | undefined> {
  if (BRANCH) return BRANCH;

  const definition = await getBuildDefinition(auth);
  const repositoryId = definition.repository?.id;
  const yamlPath = normalizeItemPath(definition.process?.yamlFilename || "azure-pipelines.yml");
  const defaultBranch = stripHeadRef(definition.repository?.defaultBranch || "");
  if (!repositoryId) return undefined;

  if (defaultBranch && await itemExists(auth, repositoryId, defaultBranch, yamlPath)) {
    return defaultBranch;
  }

  for (const branch of await listBranches(auth, repositoryId)) {
    if (await itemExists(auth, repositoryId, branch, yamlPath)) return branch;
  }

  throw new Error(
    `Pipeline ${PIPELINE_ID} cannot be queued: ${yamlPath} was not found in its repository branches. ` +
    "Set MERGEPILOT_E2E_ADO_PIPELINE_BRANCH to a queueable branch or fix the pipeline definition.",
  );
}

async function getBuildDefinition(auth: AdoAuth): Promise<{
  repository?: { id?: string; defaultBranch?: string };
  process?: { yamlFilename?: string };
}> {
  const params = new URLSearchParams({
    includeAllProperties: "true",
    "api-version": "7.1-preview.7",
  });
  const url =
    `${adoBase(ORG)}/${encodeURIComponent(PROJECT)}/_apis/build/definitions/` +
    `${encodeURIComponent(PIPELINE_ID)}?${params.toString()}`;
  const resp = await adoFetch(url, auth);
  if (!resp.ok) throw new Error(`get build definition ${PIPELINE_ID} failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  return await resp.json() as {
    repository?: { id?: string; defaultBranch?: string };
    process?: { yamlFilename?: string };
  };
}

async function listBranches(auth: AdoAuth, repositoryId: string): Promise<string[]> {
  const url =
    `${adoBase(ORG)}/${encodeURIComponent(PROJECT)}/_apis/git/repositories/` +
    `${encodeURIComponent(repositoryId)}/refs?filter=heads/&api-version=7.1-preview.1`;
  const resp = await adoFetch(url, auth);
  if (!resp.ok) throw new Error(`list branches failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  const body = await resp.json() as { value?: Array<{ name?: string }> };
  return (body.value ?? []).map((ref) => stripHeadRef(ref.name ?? "")).filter(Boolean);
}

async function itemExists(auth: AdoAuth, repositoryId: string, branch: string, path: string): Promise<boolean> {
  const params = new URLSearchParams({
    path,
    "versionDescriptor.version": branch,
    "versionDescriptor.versionType": "branch",
    "api-version": "7.1-preview.1",
  });
  const url =
    `${adoBase(ORG)}/${encodeURIComponent(PROJECT)}/_apis/git/repositories/` +
    `${encodeURIComponent(repositoryId)}/items?${params.toString()}`;
  const resp = await adoFetch(url, auth);
  if (resp.status === 404) return false;
  if (!resp.ok) throw new Error(`check ${path} on ${branch} failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  return true;
}

function normalizeItemPath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function stripHeadRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
}
