/**
 * Ensures the Tauri sidecar binary exists before `tauri dev` is launched.
 * - If the binary is already present → exit immediately (fast path).
 * - If it is missing → run the full build-sidecar pipeline (one-time cost).
 *
 * Usage (called automatically by `pnpm tauri:dev`):
 *   node scripts/ensure-sidecar.mjs
 */
import { spawnSync, execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, "..");
const binariesDir = resolve(desktopRoot, "src-tauri/binaries");

// ── Resolve Rust target triple (same logic as build-sidecar.mjs) ─────────────
function getRustTargetTriple() {
  const result = spawnSync("rustc", ["-Vv"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error("rustc not found. Please install the Rust toolchain: https://rustup.rs");
  }
  const match = result.stdout.match(/^host:\s+(.+)$/m);
  if (!match) throw new Error("Could not parse rustc host triple");
  return match[1].trim();
}

const triple = getRustTargetTriple();
const ext = process.platform === "win32" ? ".exe" : "";
const sidecarPath = resolve(binariesDir, `cicd-daemon-${triple}${ext}`);

if (existsSync(sidecarPath)) {
  console.log(`[ensure-sidecar] Binary already exists: ${sidecarPath}`);
  console.log("[ensure-sidecar] Skipping build — delete the binary to force a rebuild.");
  process.exit(0);
}

console.log(`[ensure-sidecar] Sidecar not found at: ${sidecarPath}`);
console.log("[ensure-sidecar] Running full build-sidecar pipeline (one-time cost)...\n");

mkdirSync(binariesDir, { recursive: true });

execSync("node scripts/build-sidecar.mjs", {
  cwd: desktopRoot,
  stdio: "inherit",
});
