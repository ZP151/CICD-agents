#!/usr/bin/env node
import { createProgram } from "./commands.js";

const argv = process.argv;
const args = argv.length <= 2 ? [...argv, "tui"] : argv;

createProgram()
  .parseAsync(args)
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
