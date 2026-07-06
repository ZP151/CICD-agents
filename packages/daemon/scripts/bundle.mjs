/**
 * Bundles the daemon into a single CJS file.
 * Native modules (better-sqlite3, sqlite-vec, web-tree-sitter) are left external
 * so they can be picked up as assets by @yao-pkg/pkg.
 */
import { build } from "esbuild";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Match the esbuild target to the running Node version so the bundle is
// compatible with the Node runtime embedded by pkg.
const nodeMajor = process.versions.node.split(".")[0];
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const daemonVersion = packageJson.version ?? "0.1.0";

await build({
  entryPoints: [resolve(root, "src/bin.ts")],
  bundle: true,
  platform: "node",
  target: `node${nodeMajor}`,
  format: "cjs",
  outfile: resolve(root, "dist/bundle.cjs"),
  // Replace import.meta.url with the CJS-compatible equivalent so that
  // ESM-compiled core files (projectTemplates.ts, db/database.ts) don't crash at
  // module load time with "ERR_INVALID_ARG_TYPE: path must be string or URL".
  // esbuild define values must be identifiers or JSON, so we inject the
  // expression as a top-level variable via banner and reference it by name.
  define: {
    "import.meta.url": "__importMetaUrl",
    "process.env.npm_package_version": JSON.stringify(daemonVersion),
  },
  // Native addons/packages must stay external; pkg embeds their binaries as assets
  // and several of them resolve files relative to their package directory.
  external: [
    "better-sqlite3",
    "sqlite-vec",
    "web-tree-sitter",
    "keytar",
    "@azure/msal-node-extensions",
    "@azure/msal-node-runtime",
  ],
  banner: {
    js: [
      "// Bundled by esbuild for Tauri sidecar distribution",
      "const __importMetaUrl = require('url').pathToFileURL(__filename).href;",
    ].join("\n"),
  },
  logLevel: "info",
});
