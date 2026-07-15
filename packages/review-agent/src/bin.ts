#!/usr/bin/env node
import { startServer } from "./server.js";

startServer().catch((err) => {
  console.error("review-agent failed to start:", err);
  process.exit(1);
});
