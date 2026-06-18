import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import nodePath from "node:path";
import nodeFs from "node:fs";
import nodeOs from "node:os";

let activeEnvFile: string | null = null;
let loaded = false;

export function loadDaemonEnv(): void {
  if (loaded) return;
  loaded = true;

  const moduleDir = (() => {
    try {
      return nodePath.dirname(fileURLToPath(import.meta.url));
    } catch {
      return null;
    }
  })();
  const candidates = [
    process.env.MERGEPILOT_ENV_FILE,
    nodePath.join(process.cwd(), ".env"),
    moduleDir ? nodePath.resolve(moduleDir, "../../..", ".env") : null,
    nodePath.join(nodeOs.homedir(), ".mergepilot", ".env"),
  ].filter((p): p is string => typeof p === "string");

  for (const p of candidates) {
    if (nodeFs.existsSync(p)) {
      activeEnvFile = p;
      dotenv.config({ path: p });
      break;
    }
  }
}

export function envSourceLabel(): string {
  return activeEnvFile ?? "process environment";
}
