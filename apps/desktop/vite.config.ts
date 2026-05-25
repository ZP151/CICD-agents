import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // In production Tauri builds (pnpm build), the sidecar daemon listens on 18787
  // to avoid colliding with a developer's local daemon on 8787.
  // Allow an explicit VITE_RUNTIME_URL env var to override for custom deployments.
  const defaultPort = mode === "production" ? "18787" : "8787";
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
    },
    define: {
      // Bake the resolved URL into the bundle so api.ts always talks to the
      // right port regardless of how the app was built.
      "import.meta.env.VITE_RUNTIME_URL": JSON.stringify(runtimeUrl),
    },
  };
});
