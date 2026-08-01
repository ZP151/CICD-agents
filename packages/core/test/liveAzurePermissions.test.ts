import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const LIVE_AZURE = process.env.MERGEPILOT_E2E_LIVE_AZURE === "1";
const SUBSCRIPTION = process.env.MERGEPILOT_E2E_AZURE_SUBSCRIPTION || "";
const RESOURCE_GROUP = process.env.MERGEPILOT_E2E_AZURE_RESOURCE_GROUP || "";
const STORAGE_ACCOUNT = process.env.MERGEPILOT_E2E_AZURE_STORAGE_ACCOUNT || "";
const STORAGE_TABLE = process.env.MERGEPILOT_E2E_AZURE_STORAGE_TABLE || "";
const KEY_VAULT = process.env.MERGEPILOT_E2E_AZURE_KEY_VAULT || "";
const COSMOS_ACCOUNT = process.env.MERGEPILOT_E2E_AZURE_COSMOS_ACCOUNT || "";
const COSMOS_DATABASE = process.env.MERGEPILOT_E2E_AZURE_COSMOS_DATABASE || "";

const runLive = LIVE_AZURE ? it : it.skip;

interface Probe {
  area: string;
  status: "pass" | "fail" | "skipped";
  detail: string;
  remediation?: string;
}

interface AzResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

describe("live Azure permission probe", () => {
  runLive("reports Storage Table, Cosmos DB, and Key Vault readiness separately", () => {
    const probes = runAzurePermissionProbe();

    expect(probes.map((probe) => probe.area)).toEqual([
      "Azure account",
      "Storage account ARM",
      "Storage Table list",
      "Storage Table entity query",
      "Cosmos account ARM",
      "Cosmos SQL database list",
      "Cosmos SQL role assignments",
      "Key Vault ARM",
      "Key Vault secret list",
    ]);

    for (const probe of probes) {
      expect(probe.detail, `${probe.area} should include a diagnostic detail.`).not.toBe("");
      if (probe.status === "fail") {
        expect(probe.remediation, `${probe.area} failure should include remediation.`).toBeTruthy();
      }
    }

    console.log(JSON.stringify({ subscription: SUBSCRIPTION, resourceGroup: RESOURCE_GROUP, probes }, null, 2));
  }, 120_000);
});

function runAzurePermissionProbe(): Probe[] {
  const probes: Probe[] = [];

  const account = az(["account", "show", "--query", "{user:user.name,subscription:name,id:id,tenant:tenantId}", "-o", "json"]);
  probes.push(probeFromAz("Azure account", account, "Sign in with `az login` and select the expected tenant/subscription."));

  const storageArm = az([
    "storage",
    "account",
    "show",
    "--subscription",
    SUBSCRIPTION,
    "--resource-group",
    RESOURCE_GROUP,
    "--name",
    STORAGE_ACCOUNT,
    "--query",
    "{name:name,location:location,kind:kind}",
    "-o",
    "json",
  ]);
  probes.push(probeFromAz("Storage account ARM", storageArm, `Grant Reader access to ${STORAGE_ACCOUNT} or verify the subscription/resource group.`));

  const tableList = az([
    "storage",
    "table",
    "list",
    "--subscription",
    SUBSCRIPTION,
    "--account-name",
    STORAGE_ACCOUNT,
    "--auth-mode",
    "login",
    "-o",
    "json",
  ]);
  probes.push(probeFromAz("Storage Table list", tableList, `Grant Storage Table Data Reader/Contributor on ${STORAGE_ACCOUNT}.`));

  const tableName = chooseTableName(tableList.stdout);
  if (!tableName) {
    probes.push({
      area: "Storage Table entity query",
      status: "skipped",
      detail: "No table name was available from `az storage table list`.",
    });
  } else {
    const entityQuery = az([
      "storage",
      "entity",
      "query",
      "--subscription",
      SUBSCRIPTION,
      "--account-name",
      STORAGE_ACCOUNT,
      "--auth-mode",
      "login",
      "--table-name",
      tableName,
      "--num-results",
      "1",
      "-o",
      "json",
    ]);
    probes.push(probeFromAz("Storage Table entity query", entityQuery, `Grant Storage Table Data Reader/Contributor on table ${tableName}.`));
  }

  const cosmosArm = az([
    "cosmosdb",
    "show",
    "--subscription",
    SUBSCRIPTION,
    "--resource-group",
    RESOURCE_GROUP,
    "--name",
    COSMOS_ACCOUNT,
    "--query",
    "{name:name,documentEndpoint:documentEndpoint,kind:kind}",
    "-o",
    "json",
  ]);
  probes.push(probeFromAz("Cosmos account ARM", cosmosArm, `Grant Reader access to ${COSMOS_ACCOUNT} or verify the subscription/resource group.`));

  const cosmosDatabases = az([
    "cosmosdb",
    "sql",
    "database",
    "list",
    "--subscription",
    SUBSCRIPTION,
    "--resource-group",
    RESOURCE_GROUP,
    "--account-name",
    COSMOS_ACCOUNT,
    "-o",
    "json",
  ]);
  probes.push(probeFromAz("Cosmos SQL database list", cosmosDatabases, `Grant Cosmos DB account metadata access and verify database ${COSMOS_DATABASE}.`));

  const cosmosRoles = az([
    "cosmosdb",
    "sql",
    "role",
    "assignment",
    "list",
    "--subscription",
    SUBSCRIPTION,
    "--resource-group",
    RESOURCE_GROUP,
    "--account-name",
    COSMOS_ACCOUNT,
    "-o",
    "json",
  ]);
  probes.push(cosmosRoleProbe(cosmosRoles));

  const keyVaultArm = az([
    "keyvault",
    "show",
    "--subscription",
    SUBSCRIPTION,
    "--resource-group",
    RESOURCE_GROUP,
    "--name",
    KEY_VAULT,
    "--query",
    "{name:name,properties:{enableRbacAuthorization:properties.enableRbacAuthorization,vaultUri:properties.vaultUri}}",
    "-o",
    "json",
  ]);
  probes.push(probeFromAz("Key Vault ARM", keyVaultArm, `Grant Reader access to ${KEY_VAULT} or verify the subscription/resource group.`));

  const keyVaultSecrets = az([
    "keyvault",
    "secret",
    "list",
    "--vault-name",
    KEY_VAULT,
    "--maxresults",
    "1",
    "-o",
    "json",
  ]);
  probes.push(probeFromAz("Key Vault secret list", keyVaultSecrets, `Grant Key Vault Secrets User on ${KEY_VAULT}; Secrets Officer is needed only for writes.`));

  return probes;
}

function chooseTableName(stdout: string): string | null {
  try {
    const tables = JSON.parse(stdout) as Array<{ name?: string }>;
    return tables.find((table) => table.name === STORAGE_TABLE)?.name ?? tables[0]?.name ?? null;
  } catch {
    return null;
  }
}

function cosmosRoleProbe(result: AzResult): Probe {
  const base = probeFromAz(
    "Cosmos SQL role assignments",
    result,
    `Assign Cosmos DB Built-in Data Contributor, scoped to ${COSMOS_ACCOUNT}/${COSMOS_DATABASE} where possible.`,
  );
  if (base.status !== "pass") return base;
  try {
    const assignments = JSON.parse(result.stdout) as unknown[];
    if (assignments.length === 0) {
      return {
        area: "Cosmos SQL role assignments",
        status: "fail",
        detail: "No Cosmos SQL data-plane role assignments were returned.",
        remediation: `Assign Cosmos DB Built-in Data Contributor, scoped to ${COSMOS_ACCOUNT}/${COSMOS_DATABASE} where possible.`,
      };
    }
  } catch {
    return {
      area: "Cosmos SQL role assignments",
      status: "fail",
      detail: "Cosmos SQL role assignment response was not valid JSON.",
      remediation: "Inspect `az cosmosdb sql role assignment list` output and fix the probe or CLI response.",
    };
  }
  return base;
}

function probeFromAz(area: string, result: AzResult, remediation: string): Probe {
  if (result.code === 0) {
    return { area, status: "pass", detail: summarize(result.stdout) || "Command succeeded." };
  }
  return {
    area,
    status: "fail",
    detail: summarize(result.stderr || result.stdout) || `Azure CLI exited with code ${result.code}.`,
    remediation,
  };
}

function az(args: string[]): AzResult {
  const azCommand = resolveAzureCliCommand();
  const extensionDir = process.env.MERGEPILOT_E2E_AZURE_EXTENSION_DIR || mkdtempSync(path.join(tmpdir(), "mergepilot-azext-"));
  const usePowerShell = process.platform === "win32" && azCommand.toLowerCase().endsWith(".cmd");
  const command = usePowerShell ? "powershell.exe" : azCommand;
  const commandArgs = usePowerShell
    ? [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `& ${quotePowerShellArg(azCommand)} ${args.map(quotePowerShellArg).join(" ")}`,
      ]
    : args;
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    env: {
      ...process.env,
      AZURE_EXTENSION_DIR: extensionDir,
    },
  });
  return {
    code: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function quotePowerShellArg(arg: string): string {
  return /^[A-Za-z0-9_.:/=-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, "''")}'`;
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

function summarize(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}
