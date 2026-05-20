import fs from "node:fs";
import path from "node:path";
import type { ReviewFinding, ReviewResult } from "./reviewPlanner.js";

export interface LabeledPr {
  id: string;
  description: string;
  expectedCategories: ReviewFinding["category"][];
  expectedSeverities: ReviewFinding["severity"][];
  expectedMessageContains: string[];
}

export interface EvalSample {
  pr: LabeledPr;
  result: ReviewResult;
}

export interface PrecisionRecall {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
}

/**
 * Load the labeled-PR dataset. The schema is intentionally simple so it can
 * be edited by hand. See [README in this folder] for the recommended fields.
 */
export function loadLabeledSet(file: string): LabeledPr[] {
  const text = fs.readFileSync(file, "utf8");
  const raw = JSON.parse(text) as { prs?: LabeledPr[] };
  return raw.prs ?? [];
}

function findingMatchesLabel(f: ReviewFinding, pr: LabeledPr): boolean {
  if (pr.expectedCategories.length && !pr.expectedCategories.includes(f.category)) return false;
  if (pr.expectedSeverities.length && !pr.expectedSeverities.includes(f.severity)) return false;
  if (pr.expectedMessageContains.length) {
    const hay = f.message.toLowerCase();
    return pr.expectedMessageContains.some((s) => hay.includes(s.toLowerCase()));
  }
  return true;
}

export function evaluate(samples: EvalSample[]): PrecisionRecall {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const { pr, result } of samples) {
    const matches = result.findings.filter((f) => findingMatchesLabel(f, pr));
    if (matches.length > 0) tp++;
    else fn++;
    fp += Math.max(0, result.findings.length - matches.length);
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    precision,
    recall,
    f1,
  };
}

/**
 * Save the per-PR + aggregate results so they can be diffed across runs.
 */
export function writeReport(file: string, samples: EvalSample[], pr: PrecisionRecall): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        aggregate: pr,
        samples: samples.map((s) => ({
          prId: s.pr.id,
          expected: {
            categories: s.pr.expectedCategories,
            severities: s.pr.expectedSeverities,
            messageContains: s.pr.expectedMessageContains,
          },
          actualFindings: s.result.findings.length,
          tokensIn: s.result.tokensIn,
          tokensOut: s.result.tokensOut,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );
}
