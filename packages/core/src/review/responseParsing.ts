import {
  DEFAULT_REVIEW_METADATA,
  type ReviewFinding,
  type ReviewMetadata,
} from "./types.js";

export function parseReviewResponse(text: string): { summary: string; findings: ReviewFinding[]; metadata: ReviewMetadata } | null {
  if (!text) return null;
  const trimmed = text.trim().replace(/^```(json)?\s*|\s*```$/g, "");
  try {
    const obj = JSON.parse(trimmed) as { summary?: unknown; metadata?: unknown; findings?: unknown };
    const metadata = normalizeReviewMetadata(obj.metadata);
    const findings = Array.isArray(obj.findings)
      ? obj.findings
          .map((f) => f as Record<string, unknown>)
          .filter((f) => f && typeof f.file === "string" && typeof f.line === "number")
          .map(
            (f): ReviewFinding => ({
              file: String(f.file),
              line: Number(f.line),
              severity: ((["info", "warning", "blocking"] as const).find((s) => s === f.severity) ??
                "info") as ReviewFinding["severity"],
              category: ((["bug", "missing-test", "security", "style", "design"] as const).find(
                (c) => c === f.category,
              ) ?? "style") as ReviewFinding["category"],
              message: String(f.message ?? ""),
            }),
          )
      : [];
    return { summary: typeof obj.summary === "string" ? obj.summary : "", findings, metadata };
  } catch {
    return null;
  }
}

function normalizeReviewMetadata(value: unknown): ReviewMetadata {
  if (!value || typeof value !== "object") return DEFAULT_REVIEW_METADATA;
  const raw = value as Record<string, unknown>;
  const effort = Number(raw.estimatedEffort);
  const estimatedEffort = ([1, 2, 3, 4, 5] as const).find((n) => n === effort) ?? DEFAULT_REVIEW_METADATA.estimatedEffort;
  const keyIssues = Array.isArray(raw.keyIssues)
    ? raw.keyIssues.map((issue) => String(issue).trim()).filter(Boolean).slice(0, 8)
    : [];
  return {
    estimatedEffort,
    testsRequired: raw.testsRequired === true,
    securityConcern: raw.securityConcern === true,
    canBeSplit: raw.canBeSplit === true,
    keyIssues,
  };
}
