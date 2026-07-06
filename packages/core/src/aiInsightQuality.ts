export type AiInsightRiskCategory = "correctness" | "security" | "config" | "tests" | "deployment";

export interface AiInsightQualityExpectation {
  requiredFiles: string[];
  requiredEvidence?: string[];
  requiredCategories: AiInsightRiskCategory[];
  reviewOnly?: boolean;
}

export interface AiInsightQualityCheck {
  id: string;
  passed: boolean;
  detail: string;
}

export interface AiInsightQualityResult {
  passed: boolean;
  score: number;
  checks: AiInsightQualityCheck[];
}

const CATEGORY_PATTERNS: Record<AiInsightRiskCategory, RegExp[]> = {
  correctness: [
    /\b(correctness|bug|behavior|validation|exception|throw ex|stack trace|regression)\b/i,
    /\bmodelstate\b/i,
  ],
  security: [
    /\b(security|secret|credential|api\s*key|apikey|token|password|key vault)\b/i,
  ],
  config: [
    /\b(config|configuration|settings|web\.config|appsettings|environment)\b/i,
  ],
  tests: [
    /\b(test|tests|coverage|unit|integration|regression)\b/i,
  ],
  deployment: [
    /\b(deploy|deployment|pipeline|build|release|package|ci)\b/i,
  ],
};

const WRITE_ESCALATION_PATTERNS = [
  /\b(would you like me to|shall i|should i)\s+(stage|commit|push|create\s+(a\s+)?pr|open\s+(a\s+)?pull request)\b/i,
  /\bapprove\b.{0,60}\b(git\s+add|git\s+commit|git\s+push|create\s+(a\s+)?pull request)\b/i,
  /\bnext\b.{0,60}\b(stage|commit|push|create\s+(a\s+)?pr)\b/i,
];

export function evaluateAiInsightAnswer(
  answer: string,
  expectation: AiInsightQualityExpectation,
): AiInsightQualityResult {
  const checks: AiInsightQualityCheck[] = [];
  const normalizedAnswer = normalize(answer);

  for (const file of expectation.requiredFiles) {
    const matched = mentionsFile(normalizedAnswer, file);
    checks.push({
      id: `file:${file}`,
      passed: matched,
      detail: matched ? `Mentions ${file}.` : `Missing required file evidence: ${file}.`,
    });
  }

  for (const evidence of expectation.requiredEvidence ?? []) {
    const matched = mentionsEvidence(normalizedAnswer, evidence);
    checks.push({
      id: `evidence:${evidence}`,
      passed: matched,
      detail: matched ? `Mentions ${evidence}.` : `Missing required evidence: ${evidence}.`,
    });
  }

  for (const category of expectation.requiredCategories) {
    const matched = CATEGORY_PATTERNS[category].some((pattern) => pattern.test(answer));
    checks.push({
      id: `category:${category}`,
      passed: matched,
      detail: matched ? `Covers ${category} risk.` : `Missing ${category} risk classification.`,
    });
  }

  if (expectation.reviewOnly) {
    const escalatesWrite = WRITE_ESCALATION_PATTERNS.some((pattern) => pattern.test(answer));
    checks.push({
      id: "scope:review-only",
      passed: !escalatesWrite,
      detail: escalatesWrite
        ? "Review-only answer escalates into a write-action prompt."
        : "Review-only answer does not ask to stage, commit, push, or create a PR.",
    });
  }

  const passedCount = checks.filter((check) => check.passed).length;
  return {
    passed: checks.every((check) => check.passed),
    score: checks.length === 0 ? 1 : passedCount / checks.length,
    checks,
  };
}

function normalize(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}

function mentionsFile(normalizedAnswer: string, filePath: string): boolean {
  const normalizedPath = normalize(filePath);
  if (normalizedAnswer.includes(normalizedPath)) return true;
  const basename = normalizedPath.split("/").filter(Boolean).pop();
  return Boolean(basename && normalizedAnswer.includes(basename));
}

function mentionsEvidence(normalizedAnswer: string, evidence: string): boolean {
  return normalizedAnswer.includes(normalize(evidence));
}
