// Verification Run Module (Phase 1).
//
// Manifest-driven, checkpoint/resume/merge verification runner for MergePilot v1.
// The manifest (verify-manifest.json) is the authoritative gate config; the state
// file (verification-state.json) is the single machine evidence source; docs and
// goal-verification.json are projections of that state — never hand-edited.
//
// Commands:
//   node verify-run.mjs --status                     print state summary (JSON)
//   node verify-run.mjs --migrate                    seed state from goal-verification.json
//   node verify-run.mjs [--tier <t>] [--gates <ids>] run gates (checkpoint after each)
//   node verify-run.mjs --resume [--tier ..]         re-run only gates not PASS
//   node verify-run.mjs --merge <runner.json> [--gate <id>]  merge an external runner result
//   node verify-run.mjs --project                    project state -> goal-verification.json x2 + current-gates.md
//   node verify-run.mjs --verify-artifacts           check recorded sha256 against disk
//   node verify-run.mjs --release                    stop repo-owned 1420 / daemon 8787 owners
//
// Exit codes: 0 = all required gates PASS; 1 = run failed (or evidence incomplete);
// 2 = usage/state error (e.g. HEAD mismatch on resume).
//
// Env overrides for tests: VERIFY_MANIFEST_PATH, VERIFY_STATE_PATH,
// VERIFY_REPO_ROOT, VERIFY_HEAD_SHA (skip git resolution).

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.VERIFY_REPO_ROOT
  ?? path.resolve(MODULE_DIR, "../..");
const MANIFEST_PATH = process.env.VERIFY_MANIFEST_PATH
  ?? path.join(MODULE_DIR, "verify-manifest.json");
const STATE_PATH = process.env.VERIFY_STATE_PATH
  ?? path.join(repoRoot, "docs/manual-testing/2026-08-05/verification/verification-state.json");
const GOAL_JSON_PATHS = [
  path.join(repoRoot, "goal-verification.json"),
  path.join(repoRoot, "docs/manual-testing/2026-08-05/verification/goal-verification.json"),
];
const PROJECTED_MD_PATH = path.join(
  path.dirname(STATE_PATH), "current-gates.md");

const GATE_STATUS_ORDER = ["FAIL", "INTERRUPTED", "RUNNING", "NOT_RUN", "PASS"];

function currentHead() {
  if (process.env.VERIFY_HEAD_SHA) {
    return { sha: process.env.VERIFY_HEAD_SHA, ref: "refs/heads/test", message: "env override" };
  }
  const sha = execSyncQuiet("git", ["rev-parse", "HEAD"], repoRoot);
  const ref = execSyncQuiet("git", ["symbolic-ref", "--short", "HEAD"], repoRoot);
  const message = execSyncQuiet("git", ["log", "-1", "--format=%s", "HEAD"], repoRoot);
  if (!sha) throw new Error("cannot resolve HEAD (run inside the repo or set VERIFY_HEAD_SHA)");
  return { sha, ref, message };
}

function execSyncQuiet(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "";
}

function loadManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return null;
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}

function saveState(state) {
  state.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 1) + "\n");
}

function gateStatusOf(gate) {
  const runs = gate.runs ?? [];
  if (runs.some((r) => r.status === "RUNNING")) return "RUNNING";
  if (runs.some((r) => r.status === "PASS")) return "PASS";
  if (runs.some((r) => r.status === "FAIL")) return "FAIL";
  if (runs.some((r) => r.status !== "NOT_RUN")) return "INTERRUPTED";
  return "NOT_RUN";
}

function computeSummary(gates) {
  const summary = {
    required: gates.filter((g) => g.required).length,
    passed: gates.filter((g) => g.required && g.status === "PASS").length,
    failed: gates.filter((g) => g.required && g.status === "FAIL").length,
    notRun: gates.filter((g) => g.status === "NOT_RUN").length,
    interrupted: gates.filter((g) => g.status === "INTERRUPTED").length,
    running: gates.filter((g) => g.status === "RUNNING").length,
  };
  summary.status =
    summary.failed === 0 && summary.notRun === 0 && summary.interrupted === 0 && summary.running === 0
      ? "PASS" : "INCOMPLETE";
  return summary;
}

function refreshGateStatuses(state) {
  for (const gate of state.gates) gate.status = gateStatusOf(gate);
  state.summary = computeSummary(state.gates);
  return state;
}

function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

// Resolve artifact globs relative to repoRoot, newest first.
function resolveArtifacts(globs, repoRoot) {
  const out = [];
  for (const g of globs ?? []) {
    const abs = path.resolve(repoRoot, g);
    const dir = path.dirname(abs);
    const base = path.basename(abs);
    if (!fs.existsSync(dir)) continue;
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch { continue; }
    for (const e of entries) {
      if (simpleGlobMatch(base, e)) out.push(path.join(dir, e));
    }
  }
  // dedupe, keep existing files only
  return [...new Set(out)].filter((p) => fs.existsSync(p)).sort();
}

function simpleGlobMatch(pattern, name) {
  const re = new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
  return re.test(name);
}

function runCommand(cmd, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(cmd, { shell: true, cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.stdout.on("data", (c) => { stdout += c; if (stdout.length > 60_000) stdout = stdout.slice(-60_000); });
    child.stderr.on("data", (c) => { stderr += c; if (stderr.length > 60_000) stderr = stderr.slice(-60_000); });
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

function ensureStateForManifest(state, manifest) {
  const byId = new Map(state.gates.map((g) => [g.id, g]));
  for (const m of manifest.gates) {
    if (byId.has(m.id)) continue;
    state.gates.push({ ...m, runs: [], status: "NOT_RUN" });
    byId.set(m.id, true);
  }
  return state;
}

async function runGates(state, manifest, opts) {
  const head = currentHead();
  if (state.head && state.head.sha !== head.sha) {
    throw Object.assign(new Error(
      `state pinned to ${state.head.sha}; current HEAD is ${head.sha}. ` +
      "Re-anchor with --migrate only when product code is unchanged, else start a fresh state."), { code: 2 });
  }
  state.head = { ...head, docSha: head.sha };
  state.runId ??= `verify-${Date.now().toString(36)}`;
  ensureStateForManifest(state, manifest);

  const wanted = manifest.gates.filter((g) =>
    (!opts.tier || g.tier === opts.tier) && (!opts.gates || opts.gates.includes(g.id)));
  const todo = wanted.filter((g) =>
    !opts.resume || gateStatusOf(state.gates.find((s) => s.id === g.id)) !== "PASS");

  for (const m of todo) {
    const gate = state.gates.find((s) => s.id === m.id);
    const attempt = (gate.runs?.length ?? 0) + 1;
    if (opts.resume && gate.status === "PASS") continue;
    if (opts.resume && gate.runs?.length) {
      process.stdout.write(`[resume] re-running ${gate.id} (last ${gate.status})\n`);
    }
    process.stdout.write(`[${gate.id}] attempt ${attempt}/${opts.repeat ?? 1}: ${gate.cmd}\n`);
    const r = await runCommand(m.cmd, m.timeoutMs);
    const status = r.timedOut ? "INTERRUPTED" : r.code === 0 ? "PASS" : "FAIL";
    const run = {
      attempt,
      status,
      exitCode: r.code,
      timedOut: r.timedOut,
      durationMs: r.durationMs,
      startedAt: new Date(Date.now() - r.durationMs).toISOString(),
      finishedAt: new Date().toISOString(),
    };
    if (r.stderr) run.stderrTail = r.stderr.slice(-2000);
    run.artifacts = resolveArtifacts(m.artifacts, repoRoot).map((p) => {
      try { return { path: path.relative(repoRoot, p), sha256: sha256File(p) }; }
      catch { return { path: path.relative(repoRoot, p), sha256: null }; }
    });
    gate.runs ??= [];
    gate.runs.push(run);
    gate.status = gateStatusOf(gate);
    saveState(state); // checkpoint after every gate
    process.stdout.write(`[${gate.id}] ${status} (${r.durationMs}ms, exit ${r.code})\n`);
  }
  refreshGateStatuses(state);
  saveState(state);
  return state;
}

// ---- merge adapter for the live-app runner JSON (run-live-app-e2e.ps1) ----

function decodeLog(p) {
  const raw = fs.readFileSync(p);
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) return raw.toString("utf16le");
  return raw.toString("utf8");
}

function parsePlaywrightSummary(logText) {
  const m = logText.match(/(\d+)\s+passed(?:\s*,\s*(\d+)\s+failed)?(?:\s*,\s*(\d+)\s+did not run)?/);
  if (!m) return null;
  return { passed: Number(m[1]), failed: Number(m[2] ?? 0), didNotRun: Number(m[3] ?? 0) };
}

function classifyRunnerResult(runner) {
  // setup failure (abort JSON) is a distinct class from product failure
  if (runner.prewarmFailed) return { status: "FAIL", setupFailure: true, note: `setup failure: ${runner.error ?? "prewarm"}` };
  if (runner.exitCode === 0) return { status: "PASS", setupFailure: false };
  if (runner.exitCode == null || runner.exitCode == undefined) return { status: "INTERRUPTED", setupFailure: false };
  return { status: "FAIL", setupFailure: false };
}

function mergeRunner(state, runnerPath, gateId) {
  const runner = JSON.parse(fs.readFileSync(runnerPath, "utf8"));
  const gate = state.gates.find((g) => g.id === gateId);
  if (!gate) throw Object.assign(new Error(`gate ${gateId} not in state`), { code: 2 });
  const cls = classifyRunnerResult(runner);
  const run = {
    attempt: (gate.runs?.length ?? 0) + 1,
    status: cls.status,
    setupFailure: cls.setupFailure,
    exitCode: runner.exitCode ?? null,
    timedOut: runner.exitCode == null && !runner.prewarmFailed,
    durationMs: null,
    note: cls.note ?? "",
  };
  const pwLog = runner.playwrightLog && fs.existsSync(path.join(repoRoot, runner.playwrightLog))
    ? path.join(repoRoot, runner.playwrightLog) : null;
  if (pwLog) {
    const summary = parsePlaywrightSummary(decodeLog(pwLog));
    if (summary) run.note += ` playwright ${JSON.stringify(summary)}`;
  }
  const candidates = [
    runner.playwrightLog, runner.daemonLog, runner.daemonErrorLog,
    runner.viteLog, runner.viteErrorLog, runner.prewarmLog, runnerPath,
  ].filter(Boolean);
  run.artifacts = [...new Set(candidates)]
    .map((p) => path.resolve(repoRoot, p))          // absolute, deduped
    .filter((p) => fs.existsSync(p))
    .map((p) => ({ path: path.relative(repoRoot, p), sha256: sha256File(p) }));
  gate.runs ??= [];
  gate.runs.push(run);
  gate.status = gateStatusOf(gate);
  refreshGateStatuses(state);
  saveState(state);
  return state;
}

// ---- projection ----

function projectGoalJson(state, manifest) {
  const gates = state.gates.map((g) => ({
    id: g.id,
    tier: g.tier,
    required: !!g.required,
    requireNoSkips: !!g.requireNoSkips,
    timeoutMs: g.timeoutMs,
    cmd: g.cmd,
    description: g.description,
    runs: (g.runs ?? []).map((r) => ({
      attempt: r.attempt,
      exitCode: r.exitCode ?? null,
      timedOut: !!r.timedOut,
      durationMs: r.durationMs ?? null,
      status: r.status,
      setupFailure: r.setupFailure ?? false,
      note: r.note ?? undefined,
      artifacts: r.artifacts ?? undefined,
    })),
    status: g.status,
  }));
  const doc = {
    schemaVersion: 1,
    runId: state.runId,
    status: state.summary.status,
    commit: {
      sha: state.head.sha,
      ref: state.head.ref,
      message: state.head.message,
    },
    docSha: state.head.docSha,
    remotes: state.remotes,
    codeEquivalence: state.codeEquivalence,
    appVersion: state.appVersion ?? "0.5.26",
    productModel: state.productModel ?? "unknown",
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    updatedAt: state.updatedAt,
    repeat: state.repeat ?? 1,
    summary: state.summary,
    statusMeaning: state.statusMeaning,
    calibrationNote: state.calibrationNote,
    gates,
  };
  for (const p of GOAL_JSON_PATHS) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(doc, null, 1) + "\n");
  }
  return doc;
}

function projectMarkdown(state) {
  const rows = state.gates.map((g) => {
    const last = (g.runs ?? []).at(-1);
    const counts = last?.note?.match(/\{"passed":\d+,"failed":\d+,"didNotRun":\d+\}/);
    let detail = last ? `exit ${last.exitCode ?? "-"} / ${last.durationMs ?? "-"}ms` : "-";
    if (counts) { try { const c = JSON.parse(counts[0]); detail += ` / ${c.passed} passed, ${c.failed} failed`; } catch {} }
    const arts = (g.runs ?? []).flatMap((r) => r.artifacts ?? []).map((a) => path.basename(a.path)).join(", ");
    return `| ${g.id} | ${g.tier} | ${g.status} | ${detail} | ${arts || "-"} |`;
  });
  const md = `# Current gate report (machine-projected)

> Generated by \`scripts/verification/verify-run.mjs --project\` at
> ${state.updatedAt} from \`verification-state.json\`. Do not hand-edit; run the
> projection command instead.

- Anchored code HEAD: \`${state.head.sha}\` (${state.head.message})
- Document HEAD (docSha): \`${state.head.docSha ?? "-"}\`
- Run: \`${state.runId}\` — status **${state.summary.status}**:
  ${state.summary.passed} passed / ${state.summary.failed} failed /
  ${state.summary.interrupted} interrupted / ${state.summary.running} running /
  ${state.summary.notRun} not run / ${state.summary.required} required.

| gate | tier | status | last run | artifacts |
| --- | --- | --- | --- | --- |
${rows.join("\n")}
`;
  fs.mkdirSync(path.dirname(PROJECTED_MD_PATH), { recursive: true });
  fs.writeFileSync(PROJECTED_MD_PATH, md);
  return md;
}

function verifyArtifacts(state) {
  let bad = 0;
  for (const g of state.gates) {
    for (const r of g.runs ?? []) {
      for (const a of r.artifacts ?? []) {
        const p = path.join(repoRoot, a.path);
        if (!fs.existsSync(p)) { console.error(`MISSING ${a.path}`); bad++; continue; }
        const h = sha256File(p);
        if (h !== a.sha256) { console.error(`TAMPERED ${a.path}: recorded ${a.sha256}, disk ${h}`); bad++; }
      }
    }
  }
  return bad;
}

function releasePorts() {
  // mirrors Stop-PortOwner in run-live-app-e2e.ps1: 8787 any daemon, 1420 repo-owned only
  const ps = `
$repoRoot = '${repoRoot.replace(/'/g, "''")}'
$targets = @(
  @{ Port = 8787; OnlyRepoOwned = $false },
  @{ Port = 1420; OnlyRepoOwned = $true }
)
foreach ($t in $targets) {
  $owners = @(Get-NetTCPConnection -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalAddress -in @('127.0.0.1','0.0.0.0','::','::1') -and $_.LocalPort -eq $t.Port } |
    Select-Object -ExpandProperty OwningProcess -Unique)
  foreach ($owner in $owners) {
    if (-not $owner -or $owner -eq $PID) { continue }
    $pi = Get-CimInstance Win32_Process -Filter "ProcessId = $owner" -ErrorAction SilentlyContinue
    if (-not $pi) { continue }
    $cl = [string]$pi.CommandLine; $ep = [string]$pi.ExecutablePath; $pn = [string]$pi.Name
    $isRepo = $cl.Contains($repoRoot) -or $ep.Contains($repoRoot)
    $isDaemon = $pn -eq 'mergepilot-daemon.exe' -or $ep.EndsWith('\\mergepilot-daemon.exe')
    if ($t.OnlyRepoOwned -and -not $isRepo) { continue }
    if (-not $t.OnlyRepoOwned -and -not ($isRepo -or $isDaemon)) { continue }
    Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
    Write-Output "released $($t.Port) owner $owner ($pn)"
  }
}`;
  const r = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
    { encoding: "utf8" });
  process.stdout.write(r.stdout ?? "");
  process.stderr.write(r.stderr ?? "");
  return r.status ?? -1;
}

// ---- CLI ----

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.indexOf(name) >= 0;
  const value = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
  };

  const manifest = loadManifest();
  let state = loadState();

  if (flag("--status")) {
    if (!state) { console.log(JSON.stringify({ status: "NO_STATE", manifestGates: manifest.gates.length })); return 0; }
    refreshGateStatuses(state);
    console.log(JSON.stringify({ runId: state.runId, head: state.head, summary: state.summary,
      gates: state.gates.map((g) => [g.id, g.status]) }, null, 1));
    return state.summary.status === "PASS" ? 0 : 1;
  }

  if (flag("--migrate")) {
    const src = JSON.parse(fs.readFileSync(GOAL_JSON_PATHS[0], "utf8"));
    const head = { sha: src.commit.sha, ref: src.commit.ref, message: src.commit.message };
    const headCur = currentHead();
    state = {
      schemaVersion: 2,
      runId: src.runId,
      head: { ...head, docSha: headCur.sha },
      remotes: src.remotes,
      codeEquivalence: src.codeEquivalence,
      appVersion: src.appVersion,
      productModel: src.productModel,
      startedAt: src.startedAt,
      finishedAt: src.finishedAt,
      repeat: src.repeat ?? 1,
      statusMeaning: src.statusMeaning,
      calibrationNote: src.calibrationNote,
      gates: src.gates,
      summary: src.summary,
    };
    ensureStateForManifest(state, manifest);
    refreshGateStatuses(state);
    saveState(state);
    console.log(`migrated: ${state.gates.length} gates, head ${state.head.sha}, docSha ${state.head.docSha}`);
    return 0;
  }

  if (!state) {
    const head = currentHead();
    state = {
      schemaVersion: 2,
      runId: `verify-${Date.now().toString(36)}`,
      head: { ...head, docSha: head.sha },
      remotes: {},
      gates: [],
      summary: { required: 0, passed: 0, failed: 0, notRun: 0, interrupted: 0, running: 0, status: "INCOMPLETE" },
      startedAt: new Date().toISOString(),
      repeat: 1,
    };
    ensureStateForManifest(state, manifest);
    saveState(state);
  }

  if (flag("--merge")) {
    const runnerPath = value("--merge");
    const gateId = value("--gate") ?? "browser-e2e-source-live";
    if (!runnerPath) { console.error("--merge requires a runner JSON path"); return 2; }
    ensureStateForManifest(state, manifest);
    mergeRunner(state, path.resolve(repoRoot, runnerPath), gateId);
    console.log(`merged ${runnerPath} -> ${gateId}: ${state.gates.find((g) => g.id === gateId).status}`);
    return state.summary.status === "PASS" ? 0 : 1;
  }

  if (flag("--project")) {
    if (!state) { console.error("no state to project"); return 2; }
    refreshGateStatuses(state);
    saveState(state);
    projectGoalJson(state, manifest);
    projectMarkdown(state);
    console.log(`projected: goal-verification.json x2 + current-gates.md (${state.gates.length} gates, ${state.summary.status})`);
    return 0;
  }

  if (flag("--verify-artifacts")) {
    if (!state) { console.error("no state"); return 2; }
    const bad = verifyArtifacts(state);
    console.log(bad === 0 ? `artifacts ok (${state.gates.reduce((n, g) => n + (g.runs ?? []).reduce((m, r) => m + (r.artifacts?.length ?? 0), 0), 0)} hashes checked)` : `${bad} artifact problems`);
    return bad === 0 ? 0 : 1;
  }

  if (flag("--release")) {
    const code = releasePorts();
    return code === 0 ? 0 : 1;
  }

  const opts = {
    tier: value("--tier") ?? null,
    gates: value("--gates") ? value("--gates").split(",") : null,
    resume: flag("--resume"),
    repeat: Number(value("--repeat") ?? 1),
  };
  try {
    state = await runGates(state, manifest, opts);
  } catch (e) {
    console.error(e.message);
    return e.code ?? 1;
  }
  console.log(JSON.stringify(state.summary));
  return state.summary.status === "PASS" ? 0 : 1;
}

main().then((code) => process.exit(code));
