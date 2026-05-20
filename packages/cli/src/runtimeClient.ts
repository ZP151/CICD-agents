import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { request } from "undici";
import { getSettings } from "@cicd-agent/core";

export class RuntimeUnavailableError extends Error {}

async function isRunning(url: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await request(`${url}/healthz`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (r.statusCode !== 200) return false;
    const body = (await r.body.json()) as { ok?: boolean };
    return Boolean(body.ok);
  } catch {
    return false;
  }
}

function resolveDaemon(repoRoot: string): { cmd: string; args: string[]; shell: boolean } {
  // 1. pnpm .bin shim (present when daemon is a dep of another workspace package)
  const shimName = process.platform === "win32" ? "cicd-agent-daemon.cmd" : "cicd-agent-daemon";
  const shim = path.join(repoRoot, "node_modules", ".bin", shimName);
  if (fs.existsSync(shim)) {
    return { cmd: shim, args: [], shell: process.platform === "win32" };
  }
  // 2. Direct node invocation of compiled dist (works after `pnpm build`)
  const distBin = path.join(repoRoot, "packages", "daemon", "dist", "bin.js");
  if (fs.existsSync(distBin)) {
    return { cmd: process.execPath, args: [distBin], shell: false };
  }
  // 3. Dev fallback: tsx + source
  const tsxName = process.platform === "win32" ? "tsx.cmd" : "tsx";
  const tsxBin = path.join(repoRoot, "node_modules", ".bin", tsxName);
  const srcBin = path.join(repoRoot, "packages", "daemon", "src", "bin.ts");
  if (fs.existsSync(tsxBin) && fs.existsSync(srcBin)) {
    return { cmd: tsxBin, args: [srcBin], shell: process.platform === "win32" };
  }
  // 4. Last resort: hope it is on PATH
  return { cmd: shimName, args: [], shell: process.platform === "win32" };
}

function spawnDaemon(logPath: string): number {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const log = fs.openSync(logPath, "a");
  const repoRoot = findRepoRoot();
  const { cmd, args, shell } = resolveDaemon(repoRoot);
  const proc = spawn(cmd, args, {
    cwd: repoRoot,
    detached: true,
    stdio: ["ignore", log, log],
    env: process.env,
    windowsHide: true,
    shell,
  });
  proc.unref();
  fs.closeSync(log);
  return proc.pid ?? 0;
}

function findRepoRoot(): string {
  let dir = process.cwd();
  // Walk up until we find a pnpm-workspace.yaml or package.json with workspaces.
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const pj = path.join(dir, "package.json");
    if (fs.existsSync(pj)) {
      try {
        const json = JSON.parse(fs.readFileSync(pj, "utf8")) as { workspaces?: unknown };
        if (json.workspaces) return dir;
      } catch {
        // ignored
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export async function ensureRunning(timeoutSec = 20): Promise<string> {
  const settings = getSettings();
  if (await isRunning(settings.runtimeUrl)) return settings.runtimeUrl;
  const logPath = path.join(settings.dataDir, "logs", "runtime.log");
  spawnDaemon(logPath);
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    if (await isRunning(settings.runtimeUrl)) return settings.runtimeUrl;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new RuntimeUnavailableError(
    `runtime did not become healthy within ${timeoutSec}s. See log: ${logPath}`,
  );
}

export class RuntimeClient {
  constructor(public readonly baseUrl: string = getSettings().runtimeUrl) {}

  async listTasks(): Promise<Array<Record<string, unknown>>> {
    const r = await request(`${this.baseUrl}/tasks`);
    if (r.statusCode !== 200) throw new Error(`listTasks: HTTP ${r.statusCode}`);
    return (await r.body.json()) as Array<Record<string, unknown>>;
  }

  async healthz(): Promise<Record<string, unknown>> {
    const r = await request(`${this.baseUrl}/healthz`);
    if (r.statusCode !== 200) throw new Error(`healthz: HTTP ${r.statusCode}`);
    return (await r.body.json()) as Record<string, unknown>;
  }

  async submitPipeline(payload: Record<string, unknown>): Promise<{ taskId: string; status: string }> {
    const r = await request(`${this.baseUrl}/tasks/submit-pipeline`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.statusCode !== 202) {
      throw new Error(`submit-pipeline: HTTP ${r.statusCode}: ${await r.body.text()}`);
    }
    return (await r.body.json()) as { taskId: string; status: string };
  }

  async getTask(taskId: string): Promise<Record<string, unknown>> {
    const r = await request(`${this.baseUrl}/tasks/${taskId}`);
    if (r.statusCode !== 200) throw new Error(`getTask: HTTP ${r.statusCode}`);
    return (await r.body.json()) as Record<string, unknown>;
  }

  async shutdown(): Promise<Record<string, unknown>> {
    const r = await request(`${this.baseUrl}/shutdown`, { method: "POST" });
    if (r.statusCode !== 200) throw new Error(`shutdown: HTTP ${r.statusCode}`);
    return (await r.body.json()) as Record<string, unknown>;
  }
}
