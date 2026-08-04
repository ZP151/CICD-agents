import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LLMClient } from "../packages/core/dist/index.js";

function loadEnv(): void {
  for (const file of [path.join(process.cwd(), ".env"), path.join(os.homedir(), ".mergepilot", "config.toml")]) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
    }
  }
  const config = fs.readFileSync(path.join(os.homedir(), ".mergepilot", "config.toml"), "utf8");
  const section = config.match(/\[azure_auth\]\s*\n([\s\S]*?)(?=\n\[|\s*$)/)?.[1] ?? "";
  const value = (key: string) => section.match(new RegExp(`^\s*${key}\s*=\s*"([^"]*)"`, "m"))?.[1] ?? "";
  const tenant = value("tenant_id"); const client = value("client_id");
  if (tenant) process.env.MERGEPILOT_AZURE_TENANT_ID = tenant;
  if (client) process.env.MERGEPILOT_AZURE_CLIENT_ID = client;
}

async function main() {
  loadEnv();
  const client = new LLMClient();
  try {
    const result = await client.embed(["hello world"]);
    console.log("embed ok, dims:", result[0]?.length);
  } catch (err) {
    console.error("embed failed:", (err as { message?: string })?.message ?? String(err).slice(0, 500));
  }
}
main();
