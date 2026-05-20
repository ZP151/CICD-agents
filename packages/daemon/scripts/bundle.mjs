/**
 * Bundles the daemon into a single CJS file.
 * Native modules (better-sqlite3, sqlite-vec, web-tree-sitter) are left external
 * so they can be picked up as assets by @yao-pkg/pkg.
 */
import { build } from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Match the esbuild target to the running Node version so the bundle is
// compatible with the Node runtime embedded by pkg.
const nodeMajor = process.versions.node.split(".")[0];

await build({
  entryPoints: [resolve(root, "src/bin.ts")],
  bundle: true,
  platform: "node",
  target: `node${nodeMajor}`,
  format: "cjs",
  outfile: resolve(root, "dist/bundle.cjs"),
  // Replace import.meta.url with the CJS-compatible equivalent so that
  // ESM-compiled core files (profiles.ts, db/database.ts) don't crash at
  // module load time with "ERR_INVALID_ARG_TYPE: path must be string or URL".
  define: {
    "import.meta.url": "(require('url').pathToFileURL(__filename).href)",
  },
  // Native addons must stay external; pkg will embed the .node binaries as assets
  external: ["better-sqlite3", "sqlite-vec", "web-tree-sitter"],
  banner: {
    js: "// Bundled by esbuild for Tauri sidecar distribution",
  },
  logLevel: "info",
});
