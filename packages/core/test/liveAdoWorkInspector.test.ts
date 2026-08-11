import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bearerAuth,
  queryAzureWorkItems,
  readAzureWorkItemDetail,
  type AdoAuth,
} from "../src/ado/index.js";

/**
 * Read-only acceptance for the Work Inspector read path against real Azure
 * DevOps. Proves the authoritative detail read (fields, typed relation
 * edges, resolved PR/build artifacts, test evidence, full comments) on a
 * real task: the signed-in account's own tasks first, and when the account
 * has no assignments in the project, the most recently changed task
 * instead — the read path is identical either way. Never writes: no
 * comments, no state changes, no fixtures.
 *
 * Gate: MERGEPILOT_E2E_LIVE_ADO=1 (skipped otherwise).
 */
const LIVE_ADO = process.env.MERGEPILOT_E2E_LIVE_ADO === "1";
const ORG = process.env.MERGEPILOT_E2E_ADO_ORG || "tebssg";
const PROJECT = process.env.MERGEPILOT_E2E_ADO_PROJECT || "TeBS-ClaimBot";

const runLive = LIVE_ADO ? it : it.skip;

describe("live Azure DevOps work inspector read", () => {
  runLive("reads a real assigned task detail with typed relations and evidence", async () => {
    const auth = getAdoAuthFromAzureCli();

    const candidates = await queryAzureWorkItems({
      organization: ORG,
      project: PROJECT,
      query:
        "SELECT [System.Id], [System.Title] FROM WorkItems " +
        "WHERE [System.AssignedTo] = @me AND [System.WorkItemType] = 'Task' " +
        "ORDER BY [System.ChangedDate] DESC",
      auth,
      top: 5,
    });
    const pool = candidates.length > 0 ? candidates : await queryAzureWorkItems({
      organization: ORG,
      project: PROJECT,
      query:
        "SELECT [System.Id], [System.Title] FROM WorkItems " +
        "WHERE [System.WorkItemType] = 'Task' " +
        "ORDER BY [System.ChangedDate] DESC",
      auth,
      top: 5,
    });
    expect(pool.length, `Expected at least one task in ${ORG}/${PROJECT} (the signed-in account has no @me assignments there).`).toBeGreaterThan(0);

    const first = pool[0]!;
    const detail = await readAzureWorkItemDetail({
      organization: ORG,
      project: PROJECT,
      workItemId: first.id,
      auth,
    });

    // The feed-shaped identity fields must round-trip from the authoritative read.
    expect(detail.id).toBe(first.id);
    expect(detail.title).toBeTruthy();
    expect(detail.state).toBeTruthy();
    expect(detail.type).toBe("Task");
    expect(Array.isArray(detail.relations)).toBe(true);
    expect(Array.isArray(detail.linkedPullRequests)).toBe(true);
    expect(Array.isArray(detail.linkedBuilds)).toBe(true);
    expect(Array.isArray(detail.testEvidence)).toBe(true);
    expect(Array.isArray(detail.comments)).toBe(true);

    // Every resolved PR edge must carry an id and a status from ADO itself.
    for (const pr of detail.linkedPullRequests) {
      expect(Number.isInteger(pr.id)).toBe(true);
      expect(pr.status).toBeTruthy();
      expect(pr.url).toBeTruthy();
    }
    // Test evidence, when present, must aggregate into the inspector shape.
    for (const evidence of detail.testEvidence) {
      expect(Number.isInteger(evidence.buildId)).toBe(true);
      expect(evidence.totalTests).toBeGreaterThanOrEqual(0);
      expect(evidence.passedTests).toBeGreaterThanOrEqual(0);
      expect(evidence.failedTests).toBeGreaterThanOrEqual(0);
      expect(evidence.passedTests + evidence.failedTests).toBeLessThanOrEqual(evidence.totalTests);
    }

    // The full read also projects the work item the feed renders from.
    expect(detail.description).not.toBeUndefined();
  }, 120_000);

  runLive("maps a missing work item to the typed not-found error", async () => {
    const auth = getAdoAuthFromAzureCli();
    await expect(readAzureWorkItemDetail({ organization: ORG, project: PROJECT, workItemId: 999_999_999, auth }))
      .rejects.toThrow(/work_item_not_found/);
  }, 60_000);
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
