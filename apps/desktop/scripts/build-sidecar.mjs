/**
 * Builds the cicd-daemon Node.js app into a self-contained binary and places it
 * in apps/desktop/src-tauri/binaries/ with the Tauri sidecar naming convention:
 *   cicd-daemon-{rustc-target-triple}[.exe]
 *
 * Run from repo root: pnpm --filter @cicd-agent/desktop build:sidecar
 * Or from the desktop app dir: node scripts/build-sidecar.mjs
 */
import { execSync, spawnSync } from "child_process";
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";

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
// Uses the running Node major version so the pkg binary matches the runtime.
// --------------------------------------------------------------------------
function pkgTargetFor(triple) {
  const nodeMajor = process.versions.node.split(".")[0]; // e.g. "20"
  const nodeTag = `node${nodeMajor}`;
  if (triple.includes("windows")) return `${nodeTag}-win-x64`;
  if (triple.includes("aarch64") && triple.includes("apple")) return `${nodeTag}-macos-arm64`;
  if (triple.includes("apple")) return `${nodeTag}-macos-x64`;
  if (triple.includes("aarch64") && triple.includes("linux")) return `${nodeTag}-linux-arm64`;
  return `${nodeTag}-linux-x64`;
}

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

// --------------------------------------------------------------------------
// pkg requires the full package directory to be reachable from the bundle's
// node_modules lookup chain.  pnpm's virtual store puts packages under
// node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/ which pkg cannot follow.
// We resolve the package root via require.resolve and copy the entire package
// (recursively, skipping nested node_modules) to packages/daemon/node_modules/
// so pkg can find it through normal module resolution from dist/bundle.cjs.
// --------------------------------------------------------------------------
function copyDirRecursive(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    if (entry === "node_modules") continue; // don't recurse into nested deps
    const srcFull = join(src, entry);
    const destFull = join(dest, entry);
    try {
      if (statSync(srcFull).isDirectory()) {
        copyDirRecursive(srcFull, destFull);
      } else {
        copyFileSync(srcFull, destFull);
      }
    } catch { /* skip permission-denied files (e.g. locked .node on Windows) */ }
  }
}

function stageNativeModules() {
  const searchRoots = [daemonRoot, repoRoot, join(repoRoot, "packages/core")];
  const packages = ["better-sqlite3", "sqlite-vec"];
  const req = createRequire(pathToFileURL(join(repoRoot, "package.json")));
  const staged = [];

  for (const pkgName of packages) {
    let pkgMain;
    for (const root of searchRoots) {
      try { pkgMain = req.resolve(pkgName, { paths: [root] }); break; }
      catch { /* try next */ }
    }
    if (!pkgMain) {
      console.warn(`  WARNING: could not resolve ${pkgName}, skipping`);
      continue;
    }

    // Walk up from main entry to find the package root (directory with package.json)
    let pkgRoot = dirname(pkgMain);
    while (pkgRoot !== dirname(pkgRoot)) {
      if (existsSync(join(pkgRoot, "package.json"))) break;
      pkgRoot = dirname(pkgRoot);
    }

    const destPkg = resolve(daemonRoot, "node_modules", pkgName);
    if (existsSync(destPkg)) {
      console.log(`  already present: ${pkgName}`);
      staged.push(destPkg);
      continue;
    }

    console.log(`  staging ${pkgName} (full package):`);
    console.log(`    src:  ${pkgRoot}`);
    console.log(`    dest: ${destPkg.replace(daemonRoot, ".")}`);
    copyDirRecursive(pkgRoot, destPkg);
    staged.push(destPkg);
  }
  return staged;
}

function cleanupStagedDirs(dirs) {
  for (const d of dirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
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

// 2b. Stage native .node files where pkg asset globs can find them.
//     pnpm's virtual store means they aren't at the conventional path.
console.log("\n--- 2b/3  staging native modules for pkg ---");
const stagedDirs = stageNativeModules();

// 3. pkg: wrap dist/bundle.cjs + native assets into a standalone binary
console.log("\n--- 3/3  pkg package ---");
const pkgBin = resolve(daemonRoot, "node_modules/.bin/pkg");
const pkgBinCmd = existsSync(pkgBin + ".cmd") ? `"${pkgBin}.cmd"` : `"${pkgBin}"`;

try {
  run(
    `${pkgBinCmd} dist/bundle.cjs` +
      ` --target ${pkgTarget}` +
      ` --output "${outputPath}"` +
      ` --compress GZip`,
    { cwd: daemonRoot }
  );
} finally {
  // Remove the staged copies so the working tree stays clean
  cleanupStagedDirs(stagedDirs);
}

console.log(`\nSidecar ready: ${outputPath}`);
