import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAzureDevOpsAuth, readAzureWorkItem } from "../packages/core/dist/index.js";

function loadAzureAuthEnv(): void {
  const config = fs.readFileSync(path.join(os.homedir(), ".mergepilot", "config.toml"), "utf8");
  const section = config.match(/\[azure_auth\]\s*\n([\s\S]*?)(?=\n\[|\s*$)/)?.[1] ?? "";
  const value = (key: string) => section.match(new RegExp(`^\s*${key}\s*=\s*"([^"]*)"`, "m"))?.[1] ?? "";
  if (value("tenant_id")) process.env.MERGEPILOT_AZURE_TENANT_ID = value("tenant_id");
  if (value("client_id")) process.env.MERGEPILOT_AZURE_CLIENT_ID = value("client_id");
}

async function main() {
  loadAzureAuthEnv();
  const auth = await getAzureDevOpsAuth();
  const wi = await readAzureWorkItem({ organization: "https://tebssg.visualstudio.com/", project: "TeBS-ClaimBot", workItemId: 7912, auth });
  console.log(JSON.stringify({ id: wi.id, revision: wi.revision, title: wi.title, state: wi.state, comments: wi.comments, commentCount: wi.comments.length }, null, 1));
}
main().catch((err) => { console.error(err); process.exit(1); });
