/**
 * Cycle 00 demo fixture: create a [MergePilot Fixture] Task in
 * TeBS-ClaimBot and print its id. Uses the product ADO client with the local
 * OAuth cache — no token is read or printed.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAzureDevOpsAuth } from "../packages/core/dist/index.js";
import { adoBase, adoFetch } from "../packages/core/dist/ado/client.js";
import { parseAdoJson } from "../packages/core/dist/ado/response.js";

function loadAzureAuthEnv(): void {
  const configPath = path.join(os.homedir(), ".mergepilot", "config.toml");
  const text = fs.readFileSync(configPath, "utf8");
  const section = text.match(/\[azure_auth\]\s*\n([\s\S]*?)(?=\n\[|\s*$)/)?.[1] ?? "";
  const value = (key: string) => section.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m"))?.[1] ?? "";
  const tenantId = value("tenant_id");
  const clientId = value("client_id");
  if (tenantId) process.env.MERGEPILOT_AZURE_TENANT_ID = tenantId;
  if (clientId) process.env.MERGEPILOT_AZURE_CLIENT_ID = clientId;
}

async function main() {
  loadAzureAuthEnv();
  const org = "https://tebssg.visualstudio.com/";
  const project = "TeBS-ClaimBot";
  const auth = await getAzureDevOpsAuth();
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/wit/workitems/$Task` +
    `?api-version=7.1-preview.3`;
  const body = [
    { op: "add", path: "/fields/System.Title", value: "[MergePilot Fixture] Cycle00 demo work item" },
    { op: "add", path: "/fields/System.Description", value: "Fixture work item used to verify the Cycle 00 verified action runtime end to end." },
  ];
  const resp = await adoFetch(url, auth, {
    method: "POST",
    headers: { "Content-Type": "application/json-patch+json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    console.error(`create failed ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
    process.exit(1);
  }
  const created = await parseAdoJson(resp, "create work item");
  const id = created["id"] as number;
  const rev = (created["rev"] ?? 0) as number;
  console.log(JSON.stringify({ workItemId: id, revision: rev }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
