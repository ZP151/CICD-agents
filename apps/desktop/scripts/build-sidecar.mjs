/**
 * Builds the cicd-daemon Node.js app into a self-contained binary and places it
 * in apps/desktop/src-tauri/binaries/ with the Tauri sidecar naming convention:
 *   cicd-daemon-{rustc-target-triple}[.exe]
 *
 * Run from repo root: pnpm --filter @cicd-agent/desktop build:sidecar
 * Or from the desktop app dir: node scripts/build-sidecar.mjs
 */
import { execSync, spawnSync } from "child_process";
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, "..");
const repoRoot = resolve(desktopRoot, "../..");
const daemonRoot = resolve(repoRoot, "packages/daemon");
const binariesDir = resolve(desktopRoot, "src-tauri/binaries");

// --------------------------------------------------------------------------
// Resolve the current platform's Rust target triple (same one Tauri uses)
// --------------------------------------------------------------------------
function getRustTargetTriple() {
  const result = spawnSync("rustc", ["-Vv"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(
      "rustc not found. Please install the Rust toolchain: https://rustup.rs"
    );
  }
  const match = result.stdout.match(/^host:\s+(.+)$/m);
  if (!match) throw new Error("Could not parse rustc host triple");
  return match[1].trim();
}

// --------------------------------------------------------------------------
// Map Rust triple → @yao-pkg/pkg target string
// --------------------------------------------------------------------------
function pkgTargetFor(triple) {
  if (triple.includes("windows")) return "node24-win-x64";
  if (triple.includes("aarch64") && triple.includes("apple")) return "node24-macos-arm64";
  if (triple.includes("apple")) return "node24-macos-x64";
  if (triple.includes("aarch64") && triple.includes("linux")) return "node24-linux-arm64";
  return "node24-linux-x64";
}

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
const triple = getRustTargetTriple();
const pkgTarget = pkgTargetFor(triple);
const ext = process.platform === "win32" ? ".exe" : "";
const sidecarName = `cicd-daemon-${triple}${ext}`;
const outputPath = resolve(binariesDir, sidecarName);

console.log(`\nBuilding sidecar for ${triple} (pkg target: ${pkgTarget})`);
console.log(`Output: ${outputPath}\n`);

mkdirSync(binariesDir, { recursive: true });

// 1. Build TypeScript → dist/
console.log("--- 1/3  tsc build ---");
run("pnpm build", { cwd: daemonRoot });

// 2. esbuild: bundle all TS/JS into dist/bundle.cjs (native modules stay external)
console.log("\n--- 2/3  esbuild bundle ---");
run("pnpm bundle", { cwd: daemonRoot });

// 3. pkg: wrap dist/bundle.cjs + native assets into a standalone binary
console.log("\n--- 3/3  pkg package ---");
const pkgBin = resolve(daemonRoot, "node_modules/.bin/pkg");
const pkgBinCmd = existsSync(pkgBin + ".cmd") ? `"${pkgBin}.cmd"` : `"${pkgBin}"`;

run(
  `${pkgBinCmd} dist/bundle.cjs` +
    ` --target ${pkgTarget}` +
    ` --output "${outputPath}"` +
    ` --compress GZip`,
  { cwd: daemonRoot }
);

console.log(`\nSidecar ready: ${outputPath}`);
