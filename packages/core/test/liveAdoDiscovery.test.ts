import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bearerAuth,
  listAzureBuildDefinitions,
  listAzureProjects,
  listAzureRepositories,
  type AdoAuth,
} from "../src/ado/index.js";

const LIVE_ADO = process.env.MERGEPILOT_E2E_LIVE_ADO === "1";
const ORG = process.env.MERGEPILOT_E2E_ADO_ORG || "tebssg";
const PROJECT = process.env.MERGEPILOT_E2E_ADO_PROJECT || "TeBS-ClaimBot";
const REPOSITORY = process.env.MERGEPILOT_E2E_ADO_REPOSITORY || "ClaimBot_API";
const PIPELINE_ID = process.env.MERGEPILOT_E2E_ADO_PIPELINE_ID || "117";
const PIPELINE_NAME = process.env.MERGEPILOT_E2E_ADO_PIPELINE_NAME || "ClaimBot_API";

const runLive = LIVE_ADO ? it : it.skip;

describe("live Azure DevOps discovery smoke", () => {
  runLive("discovers the ClaimBot_API project, repository, and pipeline with the current account", async () => {
    const auth = getAdoAuthFromAzureCli();

    const projects = await listAzureProjects({ organization: ORG, auth, top: 100 });
    const project = projects.find((item) => item.name === PROJECT);
    expect(project, `Expected project ${PROJECT} in ${ORG}. Projects: ${projects.map((item) => item.name).join(", ")}`).toBeTruthy();

    const repositories = await listAzureRepositories({ organization: ORG, project: PROJECT, auth, top: 100 });
    const repository = repositories.find((item) => item.name === REPOSITORY);
    expect(
      repository,
      `Expected repository ${REPOSITORY} in ${PROJECT}. Repositories: ${repositories.map((item) => item.name).join(", ")}`,
    ).toBeTruthy();
    expect(repository?.description).toMatch(/main/i);

    const pipelines = await listAzureBuildDefinitions({
      organization: ORG,
      project: PROJECT,
      repositoryId: REPOSITORY,
      auth,
      top: 100,
    });
    const pipeline = pipelines.find((item) => item.id === PIPELINE_ID || item.name === PIPELINE_NAME);
    expect(
      pipeline,
      `Expected pipeline ${PIPELINE_ID}/${PIPELINE_NAME}. Pipelines: ${pipelines.map((item) => `${item.id}:${item.name}`).join(", ")}`,
    ).toBeTruthy();
    expect(pipeline?.id).toBe(PIPELINE_ID);
    expect(pipeline?.name).toBe(PIPELINE_NAME);
    expect(
      pipelines.length,
      `Expected repository-filtered pipeline discovery for ${REPOSITORY} to return at least one pipeline.`,
    ).toBeGreaterThan(0);
  }, 90_000);
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
