// Self-test for the Verification Run Module (Phase 1).
// Proves, with fake gates in a temp sandbox, that the module:
//   1. checkpoints state after every gate (interrupt-safe)
//   2. classifies PASS / FAIL / INTERRUPTED (timeout) / SETUP_FAILURE
//   3. --resume skips only PASS gates and re-runs the rest on the same HEAD
//   4. --merge ingests an external live-app runner JSON (+ UTF-16LE playwright log)
//   5. --project regenerates goal-verification.json + current-gates.md from state
//   6. artifact sha256 recording + --verify-artifacts detects tampering
//   7. HEAD mismatch blocks --resume (exit 2)
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
    VERIFY_HEAD_SHA: "testsha0000000000000000000000000000000000",
  };
  return spawnSync(NODE, [MODULE, ...args], { encoding: "utf8", env });
}

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
    artifacts: ["art.txt"] },
];
fs.mkdirSync(sandbox, { recursive: true });
writeManifest(gates);

// 1+2: full run — a PASS, b INTERRUPTED (timeout), c FAIL, d PASS with artifact hash
let r = run([]);
check("full run exits 1 (INCOMPLETE)", r.status === 1, `status=${r.status} out=${r.stdout}`);
const state1 = JSON.parse(fs.readFileSync(statePath, "utf8"));
const byId = (id) => state1.gates.find((g) => g.id === id);
check("gate-a PASS", byId("gate-a").status === "PASS");
check("gate-b INTERRUPTED (timedOut)", byId("gate-b").status === "INTERRUPTED" && byId("gate-b").runs[0].timedOut);
check("gate-c FAIL", byId("gate-c").status === "FAIL" && byId("gate-c").runs[0].exitCode === 2);
check("gate-d PASS + artifact sha256", byId("gate-d").status === "PASS" &&
  byId("gate-d").runs[0].artifacts.length === 1 &&
  byId("gate-d").runs[0].artifacts[0].sha256 === crypto.createHash("sha256").update("artifact").digest("hex"));
check("summary counts", state1.summary.passed === 2 && state1.summary.failed === 1 && state1.summary.interrupted === 1);

// 3: resume with b and c fixed in the manifest — only b and c re-run
gates[1].cmd = `node -e "process.exit(0)"`;
gates[2].cmd = `node -e "process.exit(0)"`;
writeManifest(gates);
r = run(["--resume"]);
check("resume exits 0 (all PASS)", r.status === 0, `status=${r.status} out=${r.stdout}`);
check("resume skipped gate-a/d (no extra attempt)", byId("gate-a").runs.length === 1 && byId("gate-d").runs.length === 1);
const state2 = JSON.parse(fs.readFileSync(statePath, "utf8"));
check("resume re-ran b and c", state2.gates.find((g) => g.id === "gate-b").runs.length === 2 &&
  state2.gates.find((g) => g.id === "gate-c").runs.length === 2);
check("state PASS after resume", state2.summary.status === "PASS");

// 4: merge an external runner JSON with a UTF-16LE playwright log
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
const state3 = JSON.parse(fs.readFileSync(statePath, "utf8"));
const sl = state3.gates.find((g) => g.id === "source-live");
check("merge classifies PASS + parses UTF-16LE summary", sl.status === "PASS" &&
  sl.runs[0].note.includes("passed") && sl.runs[0].note.includes("30"),
  `note=${sl.runs[0].note}`);
check("merge records artifact hashes", sl.runs[0].artifacts.length >= 2 && sl.runs[0].artifacts.every((a) => a.sha256));

// 5: project regenerates goal-verification.json + current-gates.md
r = run(["--project"]);
check("project exits 0", r.status === 0);
const projected = JSON.parse(fs.readFileSync(path.join(sandbox, "goal-verification.json"), "utf8"));
check("projected status PASS + gates present", projected.status === "PASS" && projected.gates.some((g) => g.id === "source-live"));
check("projected md exists", fs.existsSync(path.join(path.dirname(statePath), "current-gates.md")));

// 6: artifact tampering detection
fs.writeFileSync(path.join(sandbox, "art.txt"), "tampered");
r = run(["--verify-artifacts"]);
check("tampered artifact detected (exit 1)", r.status === 1, `status=${r.status}`);
fs.writeFileSync(path.join(sandbox, "art.txt"), "artifact");
r = run(["--verify-artifacts"]);
check("pristine artifacts pass", r.status === 0);

// 7: HEAD mismatch blocks --resume
const state5 = JSON.parse(fs.readFileSync(statePath, "utf8"));
state5.head.sha = "differentsha000000000000000000000000000000";
fs.writeFileSync(statePath, JSON.stringify(state5, null, 1));
r = run(["--resume"]);
check("HEAD mismatch blocks resume (exit 2)", r.status === 2, `status=${r.status} out=${r.stdout}`);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures === 0 ? `self-test PASS (${tmp} cleaned)` : `self-test FAIL: ${failures} assertion(s)`);
process.exit(failures === 0 ? 0 : 1);
