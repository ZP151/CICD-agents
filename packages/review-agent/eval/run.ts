#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluate,
  loadLabeledSet,
  writeReport,
  type EvalSample,
} from "../src/evaluation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LABELS_PATH = process.argv[2] ?? path.join(__dirname, "labels.json");
const OUTPUT_PATH = process.argv[3] ?? path.join(__dirname, "report.json");

async function main(): Promise<void> {
  const prs = loadLabeledSet(LABELS_PATH);
  if (prs.length === 0) {
    // eslint-disable-next-line no-console
    console.error(`no labelled PRs in ${LABELS_PATH}; copy labels.example.json and fill in real data.`);
    process.exit(2);
  }

  // The runner reads each labelled PR id and pulls the actual review output
  // from a Table Storage row (or from disk for offline runs). The owner is
  // expected to wire this up against their own data source; the stub below
  // shows the expected shape.
  const samples: EvalSample[] = prs.map((pr) => ({
    pr,
    result: { summary: "(no data)", findings: [], tokensIn: 0, tokensOut: 0 },
  }));

  const aggregate = evaluate(samples);
  writeReport(OUTPUT_PATH, samples, aggregate);
  // eslint-disable-next-line no-console
  console.log(
    `wrote ${OUTPUT_PATH}  precision=${aggregate.precision.toFixed(3)}  recall=${aggregate.recall.toFixed(3)}  f1=${aggregate.f1.toFixed(3)}`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
