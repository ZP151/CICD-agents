#!/usr/bin/env node
/**
 * MergePilot goal verification entry (single gate).
 *
 * Runs every required gate against the CURRENT HEAD and writes a machine
 * readable goal-verification.json. Evidence recorded before this run does
 * not count. Required gates with any failure, skip, timeout, or missing
 * artifact are FAIL.
 *
 * Tiers (recorded per gate):
 *   unit                — vitest suites (core / daemon / desktop)
 *   mocked-browser-e2e  — Playwright against Vite with mocked daemon
 *   source-live-e2e     — Playwright against source Vite + source daemon
 *   installed-desktop   — installed Tauri desktop (MSI) E2E
 *   real-ado            — ClaimBot_API + real Azure DevOps E2E
 *
 * Usage:
 *   node scripts/verify-goal.mjs                  # run all gates once
 *   node scripts/verify-goal.mjs --repeat 3       # required gates 3x
 *   node scripts/verify-goal.mjs --gates core-test,desktop-test
 *   node scripts/verify-goal.mjs --tier unit      # only one tier
 *   node scripts/verify-goal.mjs --json           # write goal-verification.json only (no runs)
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(repoRoot, "goal-verification.json");
const VERIFICATION_DIR = path.join(repoRoot, "docs", "manual-testing", "2026-08-05", "verification");
fs.mkdirSync(VERIFICATION_DIR, { recursive: true });

const args = process.argv.slice(2);
const repeat = Number(args.find((a) => a.startsWith("--repeat"))?.split("=")[1]
  ?? args[args.indexOf("--repeat") + 1] ?? 1) || 1;
const onlyGates = (() => {
  const i = args.indexOf("--gates");
  return i >= 0 ? args[i + 1].split(",") : null;
})();
const onlyTier = (() => {
  const i = args.indexOf("--tier");
  return i >= 0 ? args[i + 1] : null;
})();
const writeOnly = args.includes("--json");

function pnpm(...pnpmArgs) {
  const ps = path.join(repoRoot, "scripts", "windows", "pnpm-project.ps1");
  return `powershell -NoProfile -ExecutionPolicy Bypass -File "${ps}" ${pnpmArgs.join(" ")}`;
}

const GATES = [
  { id: "core-typecheck", tier: "unit", required: true, requireNoSkips: false, timeoutMs: 300_000, cmd: pnpm("--filter", "@mergepilot/core", "typecheck"), description: "core typecheck" },
  { id: "core-test", tier: "unit", required: true, requireNoSkips: true, timeoutMs: 900_000, cmd: pnpm("--filter", "@mergepilot/core", "test"), description: "core vitest suite" },
  { id: "daemon-typecheck", tier: "unit", required: true, requireNoSkips: false, timeoutMs: 300_000, cmd: pnpm("--filter", "@mergepilot/daemon", "typecheck"), description: "daemon typecheck" },
  { id: "daemon-test", tier: "unit", required: true, requireNoSkips: true, timeoutMs: 900_000, cmd: pnpm("--filter", "@mergepilot/daemon", "test"), description: "daemon vitest suite" },
  { id: "desktop-typecheck", tier: "unit", required: true, requireNoSkips: false, timeoutMs: 300_000, cmd: pnpm("--filter", "@mergepilot/desktop", "typecheck"), description: "desktop typecheck" },
  { id: "desktop-test", tier: "unit", required: true, requireNoSkips: true, timeoutMs: 900_000, cmd: pnpm("--filter", "@mergepilot/desktop", "test"), description: "desktop vitest suite" },
  { id: "browser-e2e-mocked", tier: "mocked-browser-e2e", required: true, requireNoSkips: true, timeoutMs: 900_000, cmd: `powershell -NoProfile -ExecutionPolicy Bypass -File "${path.join(repoRoot, "scripts", "windows", "run-mocked-browser-e2e.ps1")}"`, description: "mocked browser E2E (Vite 1420)" },
  { id: "browser-e2e-source-live", tier: "source-live-e2e", required: true, requireNoSkips: true, timeoutMs: 900_000, cmd: `powershell -NoProfile -ExecutionPolicy Bypass -File "${path.join(repoRoot, "scripts", "windows", "run-live-app-e2e.ps1")}"`, description: "source Vite + daemon live E2E" },
  { id: "installed-desktop-e2e", tier: "installed-desktop", required: true, requireNoSkips: true, timeoutMs: 900_000, cmd: `powershell -NoProfile -ExecutionPolicy Bypass -File "${path.join(repoRoot, "scripts", "windows", "run-installed-app-smoke.ps1")}"`, description: "installed Tauri desktop E2E" },
  { id: "real-ado-e2e", tier: "real-ado", required: true, requireNoSkips: true, timeoutMs: 1_800_000, cmd: `"${process.execPath}" "${path.join(repoRoot, "scripts", "verify-real-ado.mjs")}"`, description: "ClaimBot_API real ADO E2E (deterministic driver)" },
].filter((gate) => {
  if (onlyGates && !onlyGates.includes(gate.id)) return false;
  if (onlyTier && gate.tier !== onlyTier) return false;
  return true;
});

function runCommand(command, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, { shell: true, cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut, stdout, stderr, durationMs: Date.now() - startedAt });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, timedOut, stdout, stderr: `${stderr}\n${err.message}`, durationMs: Date.now() - startedAt });
    });
  });
}

function parseVitestSummary(output) {
  const tests = output.match(/Tests\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+skipped)?\s*\((\d+)\)/);
  const files = output.match(/Test Files\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+skipped)?\s*\((\d+)\)/);
  return {
    passed: tests ? Number(tests[1]) : undefined,
    skipped: tests ? Number(tests[2] ?? 0) : undefined,
    total: tests ? Number(tests[3]) : undefined,
    filesPassed: files ? Number(files[1]) : undefined,
    filesSkipped: files ? Number(files[2] ?? 0) : undefined,
    filesTotal: files ? Number(files[3]) : undefined,
  };
}

function parsePlaywrightSummary(output) {
  const m = output.match(/(\d+)\s+passed\s*\((\d+)\s*\)/);
  const skipped = output.match(/(\d+)\s+skipped/);
  return { passed: m ? Number(m[1]) : undefined, skipped: skipped ? Number(skipped[1]) : 0 };
}

function gateStatus(run, gate) {
  if (run.timedOut) return "FAIL";
  if (run.code !== 0) return "FAIL";
  if (gate.requireNoSkips && (run.skipped ?? 0) > 0) return "FAIL";
  return "PASS";
}

async function main() {
  const head = (() => {
    try {
      return fs.readFileSync(path.join(repoRoot, ".git", "HEAD"), "utf8").trim().replace(/^ref: /, "");
    } catch {
      return "unknown";
    }
  })();
  const sha = (() => {
    try {
      return fs.readFileSync(path.join(repoRoot, ".git", head.replace("refs/heads/", "refs/heads/")), "utf8").trim();
    } catch {
      return "unknown";
    }
  })();
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const startedAt = new Date().toISOString();
  const runId = `verify-${Date.now().toString(36)}`;

  const gates = [];
  for (const gate of GATES) {
    const runs = [];
    if (writeOnly) {
      gates.push({ ...gate, runs: [], status: "NOT_RUN", skipReason: "json-only invocation" });
      continue;
    }
    for (let i = 0; i < repeat; i += 1) {
      const result = await runCommand(gate.cmd, gate.timeoutMs);
      const summary = gate.tier === "unit"
        ? parseVitestSummary(result.stdout)
        : parsePlaywrightSummary(result.stdout);
      const status = gateStatus({ ...result, skipped: summary?.skipped }, gate);
      runs.push({
        attempt: i + 1,
        exitCode: result.code,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
        status,
        ...summary,
      });
      if (status === "FAIL") {
        // keep the tail of the output for diagnosis
        runs[runs.length - 1].outputTail = (result.stdout + result.stderr).split("\n").slice(-40).join("\n");
        break; // no point repeating a failing gate
      }
      process.stdout.write(`[${gate.id}] attempt ${i + 1}/${repeat}: ${status} (${result.durationMs}ms)\n`);
    }
    const status = runs.every((r) => r.status === "PASS") && runs.length === repeat ? "PASS" : "FAIL";
    gates.push({ ...gate, runs, status });
  }

  const finishedAt = new Date().toISOString();
  const summary = {
    required: gates.filter((g) => g.required).length,
    passed: gates.filter((g) => g.required && g.status === "PASS").length,
    failed: gates.filter((g) => g.required && g.status === "FAIL").length,
    notRun: gates.filter((g) => g.status === "NOT_RUN").length,
  };

  const report = {
    schemaVersion: 1,
    runId,
    status: summary.failed === 0 && summary.notRun === 0 ? "PASS" : "INCOMPLETE",
    commit: { sha, ref: head, message: (() => { try { return fs.readFileSync(path.join(repoRoot, ".git", "COMMIT_EDITMSG"), "utf8").trim(); } catch { return ""; } })() },
    appVersion: pkg.version,
    productModel: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT ?? process.env.MERGEPILOT_AZURE_DEPLOYMENT ?? "unknown",
    startedAt,
    finishedAt,
    repeat,
    summary,
    gates,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(VERIFICATION_DIR, "goal-verification.json"), JSON.stringify(report, null, 2));
  process.stdout.write(`\n${JSON.stringify(summary)}\nwrote ${OUTPUT_PATH}\n`);
  process.exit(report.status === "PASS" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
