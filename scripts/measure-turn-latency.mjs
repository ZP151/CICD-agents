#!/usr/bin/env node
/**
 * Performance baseline: separates app-side latency from model time-to-first
 * token (TTFT) and turn end-to-end latency, measured against the source
 * daemon. Records P50/P95 per metric.
 *
 * Requires a running daemon on 127.0.0.1:8787 (start it the same way the
 * live E2E runner does: pnpm --filter @mergepilot/core build, then
 * pnpm --filter @mergepilot/daemon dev).
 *
 * Metrics:
 *   healthz / project-links  — app-side request handling baseline (no LLM)
 *   ttft-first-event         — POST /chat → first SSE turn.* block (transport)
 *   ttft-narrative           — POST /chat → first turn.narrative.delta block
 *                              (model TTFT, dominates the above)
 *   turn-e2e                 — POST /chat → terminal turn.done/failed/cancelled
 *
 * Usage:
 *   node scripts/measure-turn-latency.mjs [--turns 15] [--prompt "..."]
 *   MERGEPILOT_PERF_REPO=<repo> node scripts/measure-turn-latency.mjs
 *
 * Evidence: writes output/performance-baseline-<timestamp>.json and prints
 * a P50/P95 table to stdout.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const DAEMON_URL = process.env.MERGEPILOT_DAEMON_URL ?? "http://127.0.0.1:8787";
const TURNS = Number(process.env.MERGEPILOT_PERF_TURNS ?? "15");
const REPO_PATH = process.env.MERGEPILOT_PERF_REPO ?? repoRoot;
const PROMPT = process.env.MERGEPILOT_PERF_PROMPT ?? "What is the current git branch?";
const TERMINAL_EVENTS = new Set(["turn.done", "turn.failed", "turn.cancelled"]);

function p50p95(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
  return { count: sorted.length, p50: at(0.5), p95: at(0.95), min: sorted[0], max: sorted[sorted.length - 1] };
}

function fmt(v) {
  return v ? `${v.toFixed(0)}ms` : "n/a";
}

function tableRow(label, m) {
  console.log(`${label.padEnd(24)} ${String(m.p50.toFixed(0)).padStart(6)}ms  ${String(m.p95.toFixed(0)).padStart(6)}ms  ${String(m.min.toFixed(0)).padStart(6)}ms  ${String(m.max.toFixed(0)).padStart(6)}ms  (n=${m.count})`);
}

async function measureEndpoint(pathname, method = "GET") {
  const samples = [];
  const count = pathname === "/healthz" ? 30 : 10;
  for (let i = 0; i < count; i += 1) {
    const t0 = performance.now();
    const res = await fetch(`${DAEMON_URL}${pathname}`, { method });
    await res.arrayBuffer();
    samples.push(performance.now() - t0);
    if (res.status >= 400) throw new Error(`${pathname} returned ${res.status}`);
  }
  return p50p95(samples);
}

async function runTurn() {
  const t0 = performance.now();
  const res = await fetch(`${DAEMON_URL}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: PROMPT,
      repoPath: REPO_PATH,
      projectLink: { name: "perf-fixture", repoPath: REPO_PATH },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`POST /chat returned ${res.status}`);
  let firstEventAt = null;
  let narrativeAt = null;
  let terminalAt = null;
  let buffer = "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const eventLine = block.split("\n").find((line) => line.startsWith("event: "));
      const event = eventLine ? eventLine.slice("event: ".length) : "";
      if (!firstEventAt && event.startsWith("turn.")) firstEventAt = performance.now();
      if (!narrativeAt && event === "turn.narrative.delta") narrativeAt = performance.now();
      if (TERMINAL_EVENTS.has(event)) terminalAt = performance.now();
    }
  }
  return {
    ttftFirstEvent: firstEventAt === null ? null : firstEventAt - t0,
    ttftNarrative: narrativeAt === null ? null : narrativeAt - t0,
    turnE2e: terminalAt === null ? null : terminalAt - t0,
  };
}

const health = await fetch(`${DAEMON_URL}/healthz`).then((r) => r.json()).catch(() => null);
if (!health) {
  console.error(`No daemon on ${DAEMON_URL}. Start it first (core build + daemon dev).`);
  process.exit(2);
}

console.log(`daemon ${health.version} @ ${DAEMON_URL}; turns=${TURNS}; prompt="${PROMPT}"; repo=${REPO_PATH}\n`);
console.log("metric                        p50      p95      min      max    ");
console.log("────────────────────────────────────────────────────────────────");

const appHealthz = await measureEndpoint("/healthz");
tableRow("app healthz", appHealthz);
const appLinks = await measureEndpoint("/project-links");
tableRow("app project-links", appLinks);

const ttftFirst = [];
const ttftNarrative = [];
const turnE2e = [];
let failed = 0;
for (let i = 0; i < TURNS; i += 1) {
  const m = await runTurn();
  if (m.ttftFirstEvent !== null) ttftFirst.push(m.ttftFirstEvent);
  if (m.ttftNarrative !== null) ttftNarrative.push(m.ttftNarrative);
  if (m.turnE2e !== null) turnE2e.push(m.turnE2e);
  else failed += 1;
}
tableRow("ttft-first-event", p50p95(ttftFirst));
tableRow("ttft-narrative", p50p95(ttftNarrative));
tableRow("turn-e2e", p50p95(turnE2e));
if (failed > 0) console.log(`\nWARNING: ${failed}/${TURNS} turns did not reach a terminal event.`);

const report = {
  schemaVersion: 1,
  appVersion: health.version,
  daemonUrl: DAEMON_URL,
  startedAt: new Date().toISOString(),
  turns: TURNS,
  prompt: PROMPT,
  repoPath: REPO_PATH,
  model: health.llmProvider === "azure" ? { provider: health.llmProvider, azureDeployment: health.azureDeployment } : { provider: health.llmProvider },
  metrics: {
    "app-healthz": appHealthz,
    "app-project-links": appLinks,
    "ttft-first-event": p50p95(ttftFirst),
    "ttft-narrative": p50p95(ttftNarrative),
    "turn-e2e": p50p95(turnE2e),
  },
  failedTurns: failed,
};
const outDir = path.join(repoRoot, "output");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `performance-baseline-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`\nEvidence: ${outPath}`);
