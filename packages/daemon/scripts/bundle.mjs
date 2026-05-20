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

await build({
  entryPoints: [resolve(root, "src/bin.ts")],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outfile: resolve(root, "dist/bundle.cjs"),
  // Native addons must stay external; pkg will embed the .node binaries as assets
  external: ["better-sqlite3", "sqlite-vec", "web-tree-sitter"],
  // Silence the "require() of ES module" dynamic-require warnings from fastify plugins
  banner: {
    js: "// Bundled by esbuild for Tauri sidecar distribution",
  },
  logLevel: "info",
});
