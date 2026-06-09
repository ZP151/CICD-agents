/**
 * Builds the cicd-daemon Node.js app into a self-contained binary and places it
 * in apps/desktop/src-tauri/binaries/ with the Tauri sidecar naming convention:
 *   cicd-daemon-{rustc-target-triple}[.exe]
 *
 * Run from repo root: pnpm --filter @cicd-agent/desktop build:sidecar
 * Or from the desktop app dir: node scripts/build-sidecar.mjs
 */
import { execSync, spawnSync } from "child_process";
import { copyFileSync, mkdirSync, existsSync, readdirSync, readFileSync, statSync, rmSync } from "fs";
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
  const runtimeMajor = Number(process.versions.node.split(".")[0] ?? "22");
  // @yao-pkg/pkg can lag behind newly released Node majors. The repo supports
  // Node >=22, so package the sidecar with the newest known pkg runtime here.
  const nodeMajor = String(Math.min(runtimeMajor, 22));
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
  const packages = [
    "better-sqlite3",
    "sqlite-vec",
    "keytar",
    "@azure/msal-node-extensions",
    "@azure/msal-node-runtime",
  ];
  const req = createRequire(pathToFileURL(join(repoRoot, "package.json")));
  const staged = [];

  for (const pkgName of packages) {
    let pkgMain;
    let pkgRoot;
    for (const root of searchRoots) {
      try { pkgMain = req.resolve(`${pkgName}/package.json`, { paths: [root] }); break; }
      catch {
        try { pkgMain = req.resolve(pkgName, { paths: [root] }); break; }
        catch { /* try next */ }
      }
    }
    if (!pkgMain) {
      pkgRoot = findPnpmPackageRoot(pkgName);
      if (!pkgRoot) {
        console.warn(`  WARNING: could not resolve ${pkgName}, skipping`);
        continue;
      }
    }

    // Walk up from main entry to find the package root (directory with package.json).
    // Guard: stop when we reach the filesystem root to avoid an infinite/huge traversal.
    if (!pkgRoot) {
      let candidate = dirname(pkgMain);
      let foundRoot = false;
      while (candidate !== dirname(candidate)) {
        const manifest = join(candidate, "package.json");
        if (existsSync(manifest)) {
          try {
            const manifestText = readFileSync(manifest, "utf8");
            if (manifestText.includes(`"name": "${pkgName}"`)) {
              pkgRoot = candidate;
              foundRoot = true;
              break;
            }
          } catch { /* keep walking */ }
        }
        candidate = dirname(candidate);
      }
      if (!foundRoot) {
        // Walk-up reached the filesystem root without finding a matching package.json.
        // Fall back to the pnpm virtual store search.
        pkgRoot = findPnpmPackageRoot(pkgName);
        if (!pkgRoot) {
          console.warn(`  WARNING: could not find package root for ${pkgName}, skipping`);
          continue;
        }
      }
    }

    const destPkg = resolve(daemonRoot, "node_modules", pkgName);
    if (existsSync(destPkg)) {
      // Validate the staged directory actually contains the correct package.
      // A stale/corrupt staging (e.g. wrong files from a previous failed run)
      // must be cleared before re-staging.
      const stagedManifest = join(destPkg, "package.json");
      let validStage = false;
      try {
        if (existsSync(stagedManifest)) {
          const content = readFileSync(stagedManifest, "utf8");
          validStage = content.includes(`"name": "${pkgName}"`);
        }
      } catch { /* treat as invalid */ }

      if (validStage) {
        console.log(`  already present: ${pkgName}`);
        staged.push(destPkg);
        continue;
      }

      console.log(`  re-staging ${pkgName} (clearing invalid existing directory):`);
      try { rmSync(destPkg, { recursive: true, force: true }); } catch { /* best-effort */ }
    }

    console.log(`  staging ${pkgName} (full package):`);
    console.log(`    src:  ${pkgRoot}`);
    console.log(`    dest: ${destPkg.replace(daemonRoot, ".")}`);
    copyDirRecursive(pkgRoot, destPkg);
    staged.push(destPkg);
  }
  return staged;
}

function findPnpmPackageRoot(pkgName) {
  const pnpmDir = join(repoRoot, "node_modules", ".pnpm");
  if (!existsSync(pnpmDir)) return null;
  const prefix = `${pkgName.replace("/", "+")}@`;
  for (const entry of readdirSync(pnpmDir)) {
    if (!entry.startsWith(prefix)) continue;
    const candidate = join(pnpmDir, entry, "node_modules", ...pkgName.split("/"));
    if (existsSync(join(candidate, "package.json"))) return candidate;
  }
  return null;
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
