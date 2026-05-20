#!/usr/bin/env node
import { startServer } from "./server.js";

startServer().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("review-agent failed to start:", err);
  process.exit(1);
});
