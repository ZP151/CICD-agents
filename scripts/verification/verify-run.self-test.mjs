// Self-test for the Verification Run Module (Phase 1, extended for Phase 4).
// Proves, with fake gates in a temp sandbox, that the module:
//   1. checkpoints state after every gate (interrupt-safe)
//   2. classifies PASS / FAIL / INTERRUPTED (timeout) / SETUP_FAILURE
//   3. --resume skips only PASS gates and re-runs the rest on the same HEAD
//   4. latest attempt wins: a later FAIL beats a historical PASS (and a later
//      PASS beats an earlier FAIL)
//   5. artifacts are attempt-scoped by mtime window (stale files never bind)
//   6. requireNoSkips is enforced generically (skipped tests -> FAIL + note)
//   7. failed Playwright summaries retain failed/passed counts + bounded stdout
//   8. --merge ingests an external live-app runner JSON (+ UTF-16LE playwright log)
//   9. runs auto-project goal-verification.json + current-gates.md (no staleness)
//  10. artifact sha256 recording + --verify-artifacts detects tampering
//  11. HEAD mismatch blocks --resume (exit 2)
//  12. --fresh archives the prior state and starts a clean run on current HEAD
// Run: node scripts/verification/verify-run.self-test.mjs
// Exit 0 = all assertions held. No network, no repo writes (temp dir only).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;
const MODULE = path.join(moduleDir, "verify-run.mjs");

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`ok - ${name}`);
  else { failures++; console.error(`FAIL - ${name} ${detail}`); }
}

const TEST_SHA = "testsha0000000000000000000000000000000000";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-run-test-"));
const statePath = path.join(tmp, "state.json");
const manifestPath = path.join(tmp, "manifest.json");
const sandbox = path.join(tmp, "sandbox");

function writeManifest(gates) {
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    name: "self-test",
    headPolicy: "pin-and-require-match",
    repoRoot: sandbox,
    gates,
  }, null, 1));
}

function run(args) {
  const env = {
    ...process.env,
    VERIFY_MANIFEST_PATH: manifestPath,
    VERIFY_STATE_PATH: statePath,
    VERIFY_REPO_ROOT: sandbox,
    VERIFY_HEAD_SHA: TEST_SHA,
  };
  return spawnSync(NODE, [MODULE, ...args], { encoding: "utf8", env });
}

function readState() {
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}
const stateGate = (id, state) => state.gates.find((g) => g.id === id);

const gates = [
  { id: "gate-a", tier: "unit", required: true, requireNoSkips: false, timeoutMs: 10000,
    cmd: `node -e "process.exit(0)"`, description: "passes" },
  { id: "gate-b", tier: "unit", required: true, requireNoSkips: false, timeoutMs: 1500,
    cmd: `node -e "setTimeout(()=>process.exit(0), 60000)"`, description: "times out" },
  { id: "gate-c", tier: "unit", required: true, requireNoSkips: false, timeoutMs: 10000,
    cmd: `node -e "process.exit(2)"`, description: "fails" },
  { id: "gate-d", tier: "unit", required: true, requireNoSkips: false, timeoutMs: 10000,
    cmd: `node -e "require('fs').writeFileSync(process.argv[1],'artifact');process.exit(0)" ${path.join(sandbox, "art.txt").replace(/\\/g, "/")}`,
    description: "writes an artifact",
    artifacts: ["art.txt", "*.txt"] },
];
fs.mkdirSync(sandbox, { recursive: true });
writeManifest(gates);

// 1+2: full run — a PASS, b INTERRUPTED (timeout), c FAIL, d PASS with artifact hash
let r = run([]);
check("full run exits 1 (INCOMPLETE)", r.status === 1, `status=${r.status} out=${r.stdout}`);
let state1 = readState();
check("gate-a PASS", stateGate("gate-a", state1).status === "PASS");
check("gate-b INTERRUPTED (timedOut)", stateGate("gate-b", state1).status === "INTERRUPTED" && stateGate("gate-b", state1).runs[0].timedOut);
check("gate-c FAIL", stateGate("gate-c", state1).status === "FAIL" && stateGate("gate-c", state1).runs[0].exitCode === 2);
check("gate-d PASS + artifact sha256", stateGate("gate-d", state1).status === "PASS" &&
  stateGate("gate-d", state1).runs[0].artifacts.length === 1 &&
  stateGate("gate-d", state1).runs[0].artifacts[0].sha256 === crypto.createHash("sha256").update("artifact").digest("hex"));
check("summary counts", state1.summary.passed === 2 && state1.summary.failed === 1 && state1.summary.interrupted === 1);

// 3: resume with b and c fixed in the manifest — only b and c re-run
gates[1].cmd = `node -e "process.exit(0)"`;
gates[2].cmd = `node -e "process.exit(0)"`;
writeManifest(gates);
r = run(["--resume"]);
check("resume exits 0 (all PASS)", r.status === 0, `status=${r.status} out=${r.stdout}`);
state1 = readState();
check("resume skipped gate-a/d (no extra attempt)", stateGate("gate-a", state1).runs.length === 1 && stateGate("gate-d", state1).runs.length === 1);
check("resume re-ran b and c", stateGate("gate-b", state1).runs.length === 2 &&
  stateGate("gate-c", state1).runs.length === 2);
check("state gate metadata follows the authoritative manifest",
  stateGate("gate-b", state1).cmd === gates[1].cmd &&
  stateGate("gate-c", state1).cmd === gates[2].cmd,
  `gate-b=${stateGate("gate-b", state1).cmd} gate-c=${stateGate("gate-c", state1).cmd}`);
check("state PASS after resume", state1.summary.status === "PASS");

// 4: latest attempt wins — a later PASS overrides an earlier FAIL, then a later
//    FAIL must override the historical PASS (the Phase 4 aggregation contract).
r = run([]);
check("full re-run exits 0 (all latest PASS)", r.status === 0, `status=${r.status} out=${r.stdout}`);
state1 = readState();
check("later PASS overrides earlier FAIL", stateGate("gate-c", state1).status === "PASS" &&
  stateGate("gate-c", state1).runs.at(-1).status === "PASS");
gates[2].cmd = `node -e "process.exit(3)"`;
writeManifest(gates);
r = run([]);
state1 = readState();
const gateC = stateGate("gate-c", state1);
check("later FAIL overrides historical PASS", gateC.status === "FAIL" &&
  gateC.runs.map((x) => x.status).join(",") === "FAIL,PASS,PASS,FAIL", `statuses=${gateC.runs.map((x) => x.status).join(",")}`);

// 5: runs auto-project — docs reflect the canonical FAIL without --project
const projectedAfterRun = JSON.parse(fs.readFileSync(path.join(sandbox, "goal-verification.json"), "utf8"));
check("run auto-projects goal-verification.json with FAIL", projectedAfterRun.status === "INCOMPLETE" &&
  projectedAfterRun.gates.find((g) => g.id === "gate-c").status === "FAIL", `status=${projectedAfterRun.status}`);
const mdAfterRun = fs.readFileSync(path.join(path.dirname(statePath), "current-gates.md"), "utf8");
check("run auto-projects current-gates.md with FAIL row", mdAfterRun.includes("| gate-c | unit | FAIL |"), mdAfterRun.split("\n").find((l) => l.includes("gate-c")));

// 6: attempt-scoped artifacts — a pre-existing file matching the glob must not
//    bind to a new attempt
fs.writeFileSync(path.join(sandbox, "stale.txt"), "stale");
r = run(["--gates", "gate-d"]);
const stateArt = readState();
const dGate = stateGate("gate-d", stateArt);
check("re-run records only this attempt's artifacts",
  dGate.runs.length === 4 && dGate.runs.at(-1).artifacts.length === 1 &&
  path.basename(dGate.runs.at(-1).artifacts[0].path) === "art.txt" &&
  !dGate.runs.at(-1).artifacts.some((a) => a.path.includes("stale")),
  JSON.stringify(dGate.runs.at(-1).artifacts));

// 7: requireNoSkips enforced generically (vitest summary in stdout, exit 0)
writeManifest([
  { id: "gate-skip-violation", tier: "unit", required: true, requireNoSkips: true, timeoutMs: 10000,
    cmd: `node -e "console.log('Tests  3 passed | 1 skipped (4)');process.exit(0)"`, description: "skips" },
  { id: "gate-skip-tolerated", tier: "unit", required: true, requireNoSkips: false, timeoutMs: 10000,
    cmd: `node -e "console.log('Tests  3 passed | 1 skipped (4)');process.exit(0)"`, description: "skips tolerated" },
]);
r = run([]);
const stateSkip = readState();
const violation = stateGate("gate-skip-violation", stateSkip);
check("requireNoSkips turns skipped PASS into FAIL", violation.status === "FAIL" &&
  violation.runs[0].skipped === 1 && violation.runs[0].note.includes("requireNoSkips"),
  `status=${violation.status} note=${violation.runs[0].note}`);
check("skips tolerated without requireNoSkips", stateGate("gate-skip-tolerated", stateSkip).status === "PASS");

// 7: a failed Playwright command commonly prints failed and passed counts on
// separate lines. The canonical evidence must not hide the failed count just
// because the last summary line contains only "passed".
writeManifest([
  { id: "gate-playwright-failure", tier: "mocked-browser-e2e", required: true, requireNoSkips: true, timeoutMs: 10000,
    cmd: `node -e "console.log('9 failed\\n42 passed (4m)');process.exit(1)"`, description: "playwright failure summary" },
]);
r = run([]);
const statePlaywrightFailure = readState();
const playwrightFailureRun = stateGate("gate-playwright-failure", statePlaywrightFailure).runs[0];
check("failed Playwright summary records every result count",
  playwrightFailureRun.status === "FAIL" && playwrightFailureRun.passed === 42 &&
  playwrightFailureRun.failed === 9 && playwrightFailureRun.total === 51,
  JSON.stringify(playwrightFailureRun));
check("failed command retains bounded diagnostic stdout",
  playwrightFailureRun.stdoutTail?.includes("9 failed") && playwrightFailureRun.stdoutTail?.includes("42 passed"),
  JSON.stringify(playwrightFailureRun));
const projectedPlaywrightFailure = JSON.parse(fs.readFileSync(path.join(sandbox, "goal-verification.json"), "utf8"));
const projectedPlaywrightRun = projectedPlaywrightFailure.gates
  .find((g) => g.id === "gate-playwright-failure").runs[0];
check("projected evidence preserves Playwright failures",
  projectedPlaywrightRun.failed === 9 && projectedPlaywrightRun.total === 51 &&
  projectedPlaywrightRun.stdoutTail?.includes("9 failed"),
  JSON.stringify(projectedPlaywrightRun));
const mdPlaywrightFailure = fs.readFileSync(path.join(path.dirname(statePath), "current-gates.md"), "utf8");
check("projected markdown shows passed and failed test counts",
  mdPlaywrightFailure.includes("42 passed, 9 failed"),
  mdPlaywrightFailure.split("\n").find((line) => line.includes("gate-playwright-failure")));

writeManifest([
  { id: "gate-playwright-chain", tier: "mocked-browser-e2e", required: true, requireNoSkips: true, timeoutMs: 10000,
    cmd: `node -e "console.log('1 passed (1s)\\n2 passed (2s)\\n3 passed (3s)');process.exit(0)"`, description: "chained playwright summaries" },
]);
r = run([]);
const chainedPlaywrightRun = stateGate("gate-playwright-chain", readState()).runs[0];
check("chained Playwright summaries are aggregated",
  chainedPlaywrightRun.status === "PASS" && chainedPlaywrightRun.passed === 6 && chainedPlaywrightRun.total === 6,
  JSON.stringify(chainedPlaywrightRun));

// 8: merge an external runner JSON with a UTF-16LE playwright log
const runnerDir = path.join(sandbox, "out");
fs.mkdirSync(runnerDir, { recursive: true });
const pwLog = path.join(runnerDir, "playwright.log");
const logText = "\r\nRunning 30 tests using 1 worker\r\n\r\n  ok 1 [chromium] › test one\r\n  30 passed (4m)\r\n";
fs.writeFileSync(pwLog, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(logText, "utf16le")]));
const runnerJson = path.join(runnerDir, "runner.json");
fs.writeFileSync(runnerJson, JSON.stringify({
  ok: true, exitCode: 0, playwrightLog: "out/playwright.log", daemonLog: "out/daemon.log",
  prewarmLog: "out/prewarm.log",
}));
writeManifest([{ id: "source-live", tier: "source-live-e2e", required: true, requireNoSkips: true,
  timeoutMs: 60000, cmd: "node -e \"process.exit(0)\"", description: "live" }]);
r = run(["--merge", runnerJson, "--gate", "source-live"]);
const state3 = readState();
const sl = stateGate("source-live", state3);
check("merge classifies PASS + parses UTF-16LE summary", sl.status === "PASS" &&
  sl.runs[0].note.includes("passed") && sl.runs[0].note.includes("30"),
  `note=${sl.runs[0].note}`);
check("merge records artifact hashes", sl.runs[0].artifacts.length >= 2 && sl.runs[0].artifacts.every((a) => a.sha256));

const failedPwLog = path.join(runnerDir, "playwright-failed.log");
const failedLogText = "\r\nRunning 30 tests using 1 worker\r\n\r\n  2 failed\r\n  28 passed (4m)\r\n";
fs.writeFileSync(failedPwLog, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(failedLogText, "utf16le")]));
const failedRunnerJson = path.join(runnerDir, "runner-failed.json");
fs.writeFileSync(failedRunnerJson, JSON.stringify({
  ok: false, exitCode: 1, playwrightLog: "out/playwright-failed.log",
}));
r = run(["--merge", failedRunnerJson, "--gate", "source-live"]);
const mergedFailure = stateGate("source-live", readState()).runs.at(-1);
check("merge preserves separate-line Playwright failure counts",
  mergedFailure.status === "FAIL" && mergedFailure.passed === 28 &&
  mergedFailure.failed === 2 && mergedFailure.total === 30,
  JSON.stringify(mergedFailure));

// 9: project regenerates goal-verification.json + current-gates.md from state
r = run(["--project"]);
check("project exits 0", r.status === 0);
const projected = JSON.parse(fs.readFileSync(path.join(sandbox, "goal-verification.json"), "utf8"));
check("projected reflects canonical state (FAIL gate present)", projected.status === "INCOMPLETE" &&
  projected.gates.some((g) => g.id === "source-live") &&
  projected.gates.find((g) => g.id === "gate-c").status === "FAIL" &&
  projected.gates.find((g) => g.id === "gate-skip-violation").status === "FAIL");
check("projected md exists", fs.existsSync(path.join(path.dirname(statePath), "current-gates.md")));

// 10: artifact tampering detection
fs.writeFileSync(path.join(sandbox, "art.txt"), "tampered");
r = run(["--verify-artifacts"]);
check("tampered artifact detected (exit 1)", r.status === 1, `status=${r.status}`);
fs.writeFileSync(path.join(sandbox, "art.txt"), "artifact");
r = run(["--verify-artifacts"]);
check("pristine artifacts pass", r.status === 0);

// 11: HEAD mismatch blocks --resume
const state5 = readState();
state5.head.sha = "differentsha000000000000000000000000000000";
fs.writeFileSync(statePath, JSON.stringify(state5, null, 1));
r = run(["--resume"]);
check("HEAD mismatch blocks resume (exit 2)", r.status === 2, `status=${r.status} out=${r.stdout}`);

// 12: --fresh archives the prior state and starts a clean run on current HEAD
const oldRunId = state5.runId;
r = run(["--fresh"]);
check("fresh exits 0", r.status === 0, `status=${r.status} out=${r.stdout}`);
const stateFresh = readState();
check("fresh state: new runId + all gates NOT_RUN",
  stateFresh.runId !== oldRunId && stateFresh.gates.length === 1 &&
  stateFresh.gates.every((g) => g.runs.length === 0 && g.status === "NOT_RUN"),
  `runId=${stateFresh.runId} gates=${stateFresh.gates.map((g) => `${g.id}:${g.status}`).join(",")}`);
check("fresh head matches current HEAD", stateFresh.head.sha === TEST_SHA,
  `head=${stateFresh.head.sha}`);
check("prior state archived verbatim",
  fs.existsSync(statePath.replace(/\.json$/i, "") + "." + oldRunId + ".json"),
  statePath.replace(/\.json$/i, "") + "." + oldRunId + ".json");
check("fresh auto-projects", fs.readFileSync(path.join(sandbox, "goal-verification.json"), "utf8")
  .includes(stateFresh.runId));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures === 0 ? `self-test PASS (${tmp} cleaned)` : `self-test FAIL: ${failures} assertion(s)`);
process.exit(failures === 0 ? 0 : 1);
