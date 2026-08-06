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

export function desktopManualChunk(id: string): string | undefined {
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
  if (packageName === "@assistant-ui/react") return "vendor-assistant-ui";
  if (packageName.startsWith("@codemirror/") || packageName.startsWith("@uiw/")) {
    return "vendor-codemirror";
  }
  if (packageName === "lucide-react") return "vendor-icons";
  return undefined;
}

function devServerPort(): number {
  const configured = Number(process.env["VITE_DEV_SERVER_PORT"] ?? "1420");
  return Number.isInteger(configured) && configured > 0 && configured < 65_536
    ? configured
    : 1420;
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
      port: devServerPort(),
      strictPort: true,
      warmup: {
        // Route chunks are dynamic imports (AppShell lazy()), so Vite's
        // default warmup — which recurses static imports only — never reaches
        // them. On a genuinely cold cache the first browser request pays
        // optimizeDeps plus 15-32s per on-demand route chunk transform in the
        // critical path (measured in the source-live E2E trace:
        // /chat document 34.5s, pages/Chat.tsx 22s, api/* 15-32s each). Warm
        // the whole route chunk graph plus the nested lazy chunks at server
        // start so a cold browser loads already-compiled modules. The listed
        // pages/*.tsx entries are the 10 route chunks; the remaining three are
        // dynamic imports nested inside Chat/Work (MarkdownContent, artifact
        // workspace content, source code viewport).
        clientFiles: [
          "./src/pages/Chat.tsx",
          "./src/pages/Work.tsx",
          "./src/pages/Dashboard.tsx",
          "./src/pages/Repos.tsx",
          "./src/pages/TaskViewer.tsx",
          "./src/pages/PullRequests.tsx",
          "./src/pages/CreatePullRequest.tsx",
          "./src/pages/Pipelines.tsx",
          "./src/pages/Settings.tsx",
          "./src/pages/ProjectLinks.tsx",
          "./src/components/conversation/MarkdownContent.tsx",
          "./src/pages/chat/artifacts/ArtifactWorkspaceContent.tsx",
          "./src/pages/chat/artifacts/SourceCodeViewport.tsx",
        ],
      },
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
