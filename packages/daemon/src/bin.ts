#!/usr/bin/env node

// --port <N> CLI argument takes priority over RUNTIME_PORT env var.
// This ensures the Tauri sidecar can set the port reliably regardless of
// whether environment variable inheritance works on the target platform.
const portArgIdx = process.argv.indexOf("--port");
if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
  process.env["RUNTIME_PORT"] = process.argv[portArgIdx + 1];
}

import { startServer } from "./server.js";

startServer()
  .then((app) => {
    const addr = app.server.address();
    const port = typeof addr === "object" && addr ? addr.port : process.env["RUNTIME_PORT"] ?? "?";
    // eslint-disable-next-line no-console
    console.log(`cicd-daemon listening on port ${port}`);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("daemon failed to start:", err);
    process.exit(1);
  });
