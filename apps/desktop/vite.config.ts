import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const desktopPackage = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

function buildSha(): string {
  if (process.env["GITHUB_SHA"]) return process.env["GITHUB_SHA"];
  try {
    return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

function nodePackageName(id: string): string | undefined {
  const normalized = id.replace(/\\/g, "/");
  const nodeModulesIndex = normalized.lastIndexOf("/node_modules/");
  if (nodeModulesIndex === -1) return undefined;

  const packagePath = normalized.slice(nodeModulesIndex + "/node_modules/".length);
  const [scopeOrName, packageName] = packagePath.split("/");
  if (!scopeOrName) return undefined;
  return scopeOrName.startsWith("@") && packageName
    ? `${scopeOrName}/${packageName}`
    : scopeOrName;
}

function desktopManualChunk(id: string): string | undefined {
  const packageName = nodePackageName(id);
  if (!packageName) return undefined;
  if (
    packageName === "react" ||
    packageName === "react-dom" ||
    packageName === "scheduler" ||
    packageName === "@tanstack/react-query" ||
    packageName === "@tanstack/query-core"
  ) {
    return "vendor-react";
  }
  if (packageName === "react-router" || packageName === "react-router-dom") {
    return "vendor-router";
  }
  if (packageName.startsWith("@codemirror/") || packageName.startsWith("@uiw/")) {
    return "vendor-codemirror";
  }
  if (packageName === "lucide-react") return "vendor-icons";
  return undefined;
}

export default defineConfig(() => {
  // Dev and packaged builds both use 8787 (matches the Tauri sidecar in lib.rs).
  // Allow an explicit VITE_RUNTIME_URL env var to override for custom deployments.
  const defaultPort = "8787";
  const runtimeUrl =
    process.env["VITE_RUNTIME_URL"] ?? `http://127.0.0.1:${defaultPort}`;

  return {
    plugins: [react()],
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
    },
    envPrefix: ["VITE_", "TAURI_"],
    build: {
      target: "es2022",
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: desktopManualChunk,
        },
      },
    },
    define: {
      // Bake the resolved URL into the bundle so api.ts always talks to the
      // right port regardless of how the app was built.
      "import.meta.env.VITE_RUNTIME_URL": JSON.stringify(runtimeUrl),
      __MERGEPILOT_DESKTOP_VERSION__: JSON.stringify(desktopPackage.version),
      __MERGEPILOT_BUILD_SHA__: JSON.stringify(buildSha()),
    },
  };
});
