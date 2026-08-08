/**
 * Pipeline failure evidence bundle (Cycle 03).
 *
 * Bounded, redacted evidence for one failed run: timeline issues, log
 * excerpts with secret redaction, changed commits, related PRs/work items,
 * last successful build, and repeated failure signatures. Fetch targeted
 * task logs, never entire builds; if timeline/log access is unavailable,
 * report missing evidence instead of guessing.
 */
import type { ArtifactRef } from "./artifactRef.js";

export interface TimelineIssue {
  taskName: string;
  result: string;
  logUrl?: string;
}

export interface RedactedLogExcerpt {
  taskName: string;
  excerpt: string;
  /** SHA-256 of the raw excerpt before redaction (audit only). */
  contentHash: string;
}

export interface FailureSignature {
  definitionId: number;
  taskName: string;
  errorClass: string;
  /** Normalized error text used for grouping. */
  normalizedText: string;
}

export type EvidenceCoverage = "complete" | "partial" | "missing";

export interface PipelineFailureEvidence {
  build: ArtifactRef & { kind: "build" };
  definition: { id: number; name: string; revision?: number };
  sourceVersion: string;
  timelineIssues: TimelineIssue[];
  logExcerpts: RedactedLogExcerpt[];
  changedCommits: ArtifactRef[];
  relatedPullRequests: ArtifactRef[];
  relatedWorkItems: ArtifactRef[];
  testSummary?: { passed: number; failed: number; skipped: number; total: number };
  lastSuccessfulBuild?: ArtifactRef & { kind: "build" };
  repeatedSignatures: FailureSignature[];
  coverage: EvidenceCoverage;
  missingEvidence: string[];
}

export const LOG_EXCERPT_MAX_CHARS = 4_000;
export const LOG_EXCERPT_TAIL_LINES = 80;

/** Bound and redact one log excerpt. */
export function redactLogText(text: string): { excerpt: string; contentHash: string } {
  const bounded = text.length > LOG_EXCERPT_MAX_CHARS
    ? `…${text.slice(-LOG_EXCERPT_MAX_CHARS)}`
    : text;
  const redacted = bounded
    // Authorization / credential-shaped values.
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, "$1***REDACTED***")
    .replace(/(password|passwd|pat|token|secret|api[_-]?key)\s*[=:]\s*[^\s"']+/gi, "$1=***REDACTED***")
    // Connection strings and URLs with credentials.
    .replace(/(https?:\/\/)[^/@\s]+@/g, "$1***REDACTED***@");
  return { excerpt: redacted, contentHash: sha256Hex(text) };
}

export function classifyEvidenceCoverage(
  timelineIssues: TimelineIssue[],
  logExcerpts: RedactedLogExcerpt[],
  missingEvidence: string[],
): EvidenceCoverage {
  if (missingEvidence.length > 0) return "partial";
  if (timelineIssues.length === 0 && logExcerpts.length === 0) return "missing";
  return "complete";
}

function sha256Hex(text: string): string {
  // FNV-1a fallback keeps this dependency-free; content hashing is audit-only.
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Stable failure signature for incident aggregation. */
export function failureSignature(input: {
  definitionId: number;
  taskName: string;
  errorClass: string;
  normalizedText: string;
}): FailureSignature {
  return { ...input };
}

export function normalizeFailureText(text: string): string {
  return text
    .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g, "<ts>")
    .replace(/\b[0-9a-f]{40}\b/g, "<sha>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}
