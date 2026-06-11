import { LLMClient } from "@cicd-agent/core";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { CloudContextBundle } from "./cloudContext.js";

export interface ReviewFinding {
  file: string;
  line: number;
  severity: "info" | "warning" | "blocking";
  category: "bug" | "missing-test" | "security" | "style" | "design";
  message: string;
}

export interface ReviewMetadata {
  estimatedEffort: 1 | 2 | 3 | 4 | 5;
  testsRequired: boolean;
  securityConcern: boolean;
  canBeSplit: boolean;
  keyIssues: string[];
}

export interface ReviewResult {
  summary: string;
  findings: ReviewFinding[];
  discardedFindings: ReviewDiscardedFinding[];
  metadata: ReviewMetadata;
  compression: ReviewCompressionSummary;
  coverage: ReviewContextCoverage;
  tokensIn: number;
  tokensOut: number;
}

export interface ReviewContextCoverage {
  totalFiles: number;
  filesWithHunks: number;
  wholeFileOnlyFiles: number;
  hunkCount: number;
  changedHunkLines: number;
}

export interface ReviewDiscardedFinding {
  file: string;
  line: number;
  severity: ReviewFinding["severity"];
  category: ReviewFinding["category"];
  message: string;
  reason: "unknown_file" | "invalid_line" | "outside_changed_hunk" | "empty_message" | "duplicate";
}

export const DEFAULT_REVIEW_METADATA: ReviewMetadata = {
  estimatedEffort: 1,
  testsRequired: false,
  securityConcern: false,
  canBeSplit: false,
  keyIssues: [],
};

export interface ReviewPromptCompression {
  prompt: string;
  compressed: boolean;
  includedFiles: string[];
  omittedFiles: string[];
}

export interface ReviewCompressionSummary {
  compressed: boolean;
  includedFiles: string[];
  omittedFiles: string[];
}

const SECURITY_PATH_PATTERNS = [
  "auth",
  "security",
  "permission",
  "token",
  "secret",
  "credential",
  "policy",
  "rbac",
];

const INFRA_PATH_PATTERNS = [
  ".github/",
  "azure-pipelines",
  "deploy",
  "deployment",
  "infra/",
  "migration",
  "schema",
  ".sql",
  "dockerfile",
];

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".cs",
  ".go",
  ".java",
  ".kt",
  ".rs",
  ".cpp",
  ".c",
  ".h",
  ".php",
  ".rb",
  ".swift",
]);

const TEST_PATH_PATTERNS = [
  ".test.",
  ".spec.",
  "__tests__/",
  "/test/",
  "/tests/",
];

export const REVIEW_SYSTEM_PROMPT = `You are an automated code reviewer for an internal team.

You see a pull request's changed files (full contents) and a small amount of
related context. Produce a concise summary, then a list of concrete findings.

Rules:
- Only flag real issues. Do not invent file paths or symbols.
- Each finding must be anchored to a file + line that appears in the changed
  files (use the line numbers shown in the file header).
- Use the Azure DevOps PR signals to judge readiness, but do not turn metadata
  signals into code findings unless the changed file content supports them.
- Categorise each finding as one of: bug, missing-test, security, style, design.
- Severity is "info", "warning", or "blocking". Use "blocking" sparingly.
- Estimate review effort from 1 (trivial) to 5 (large/risky), whether tests are
  required, whether there are security concerns, whether the PR should be split,
  and the top issues a human reviewer should inspect.
- Output strictly the following JSON shape (no prose outside the JSON):

{
  "summary": "<markdown summary, 1-3 short paragraphs>",
  "metadata": {
    "estimatedEffort": 1,
    "testsRequired": false,
    "securityConcern": false,
    "canBeSplit": false,
    "keyIssues": ["<short issue title>"]
  },
  "findings": [
    {
      "file": "<repo-relative path>",
      "line": <integer>,
      "severity": "info|warning|blocking",
      "category": "bug|missing-test|security|style|design",
      "message": "<actionable comment, 1-3 sentences>"
    }
  ]
}`;

export function bundleToReviewPrompt(bundle: CloudContextBundle, conventions: string[]): string {
  const parts: string[] = [];
  parts.push(`PR ${bundle.prId} (iteration ${bundle.iterationId}); ${bundle.files.length} file(s) changed.`);
  if (conventions.length > 0) {
    parts.push("\n## Team conventions");
    for (const c of conventions.slice(0, 25)) parts.push(`- ${c}`);
  }
  const prSignals = renderPullRequestSignals(bundle);
  if (prSignals) parts.push(prSignals);
  parts.push("\n## Changed files");
  for (const f of bundle.files) {
    parts.push(renderChangedFileBlock(f));
  }
  if (bundle.relatedSnippets.length > 0) {
    parts.push("\n## Related context");
    for (const s of bundle.relatedSnippets.slice(0, 8)) {
      parts.push(`\n### ${s.path} (${s.reason})`);
      parts.push("```");
      parts.push(s.snippet);
      parts.push("```");
    }
  }
  return parts.join("\n");
}

export function bundleToCompressedReviewPrompt(
  bundle: CloudContextBundle,
  conventions: string[],
  charBudget: number,
): ReviewPromptCompression {
  const fullPrompt = bundleToReviewPrompt(bundle, conventions);
  if (fullPrompt.length <= charBudget) {
    return {
      prompt: fullPrompt,
      compressed: false,
      includedFiles: bundle.files.map((file) => file.path),
      omittedFiles: [],
    };
  }

  const parts: string[] = [];
  const includedFiles: string[] = [];
  const omittedFiles: string[] = [];
  parts.push(`PR ${bundle.prId} (iteration ${bundle.iterationId}); ${bundle.files.length} file(s) changed.`);
  parts.push("\n## Compression note");
  parts.push(
    "The PR is larger than the prompt budget. Complete file blocks below are included when they fit; omitted files are listed explicitly for reviewer awareness.",
  );
  if (conventions.length > 0) {
    parts.push("\n## Team conventions");
    for (const c of conventions.slice(0, 25)) parts.push(`- ${c}`);
  }
  const prSignals = renderPullRequestSignals(bundle);
  if (prSignals) parts.push(prSignals);

  parts.push("\n## Changed files");
  const reservedFooterChars = Math.min(1200, Math.floor(charBudget * 0.25));
  const sortedFiles = [...bundle.files].sort((a, b) => scoreReviewFilePriority(b) - scoreReviewFilePriority(a));
  for (const file of sortedFiles) {
    const block = renderChangedFileBlock(file);
    const nextLength = parts.join("\n").length + block.length + reservedFooterChars;
    if (nextLength <= charBudget) {
      parts.push(block);
      includedFiles.push(file.path);
    } else {
      omittedFiles.push(file.path);
    }
  }

  const omittedByType = groupOmittedFiles(bundle.files.filter((file) => omittedFiles.includes(file.path)));
  if (omittedByType.added.length) parts.push(`\n## Additional added files (insufficient prompt budget)\n${omittedByType.added.join("\n")}`);
  if (omittedByType.modified.length) parts.push(`\n## Additional modified files (insufficient prompt budget)\n${omittedByType.modified.join("\n")}`);
  if (omittedByType.deleted.length) parts.push(`\n## Deleted files\n${omittedByType.deleted.join("\n")}`);

  if (bundle.relatedSnippets.length > 0) {
    const relatedParts: string[] = ["\n## Related context"];
    for (const s of bundle.relatedSnippets.slice(0, 8)) {
      const block = `\n### ${s.path} (${s.reason})\n\`\`\`\n${s.snippet}\n\`\`\``;
      if (parts.join("\n").length + relatedParts.join("\n").length + block.length <= charBudget) {
        relatedParts.push(block);
      }
    }
    if (relatedParts.length > 1) parts.push(relatedParts.join("\n"));
  }

  return { prompt: parts.join("\n"), compressed: true, includedFiles, omittedFiles };
}

export function scoreReviewFilePriority(file: CloudContextBundle["files"][number]): number {
  const path = normalizePath(file.path);
  const changeType = String(file.changeType).toLowerCase();
  let score = 0;
  if (SECURITY_PATH_PATTERNS.some((pattern) => path.includes(pattern))) score += 80;
  if (INFRA_PATH_PATTERNS.some((pattern) => path.includes(pattern))) score += 45;
  if (changeType.includes("add")) score += 12;
  if (changeType.includes("edit") || changeType.includes("modify")) score += 10;
  if (changeType.includes("delete")) score += 8;
  if (CODE_EXTENSIONS.has(extensionOf(path))) score += 20;
  if (TEST_PATH_PATTERNS.some((pattern) => path.includes(pattern))) score += 10;
  score += scoreChangedHunks(file);
  if (file.content.length > 12_000) score -= 18;
  else if (file.content.length > 6_000) score -= 8;
  else if (file.content.length < 2_000) score += 8;
  return score;
}

function scoreChangedHunks(file: CloudContextBundle["files"][number]): number {
  if (!file.hunks?.length) return 0;
  const actionableLineCount = file.hunks.reduce((count, hunk) => {
    const modifiedLines = hunk.modifiedLines.filter((line, index) => line !== hunk.originalLines[index]);
    return count + Math.max(modifiedLines.length, hunk.modifiedLineCount);
  }, 0);
  return 35 + Math.min(actionableLineCount, 20);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
}

function extensionOf(path: string): string {
  const normalized = normalizePath(path);
  const dot = normalized.lastIndexOf(".");
  if (dot < 0) return "";
  return normalized.slice(dot);
}

export async function runReviewPlanner(args: {
  llm: LLMClient;
  bundle: CloudContextBundle;
  conventions: string[];
  charBudget?: number;
}): Promise<ReviewResult> {
  const { llm, bundle, conventions } = args;
  if (!llm.configured) {
    return {
      summary:
        "_Automated review skipped: Azure OpenAI not configured. Configure AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY in the review-agent environment._",
      findings: [],
      discardedFindings: [],
      metadata: DEFAULT_REVIEW_METADATA,
      compression: {
        compressed: false,
        includedFiles: bundle.files.map((file) => file.path),
        omittedFiles: [],
      },
      coverage: summarizeContextCoverage(bundle),
      tokensIn: 0,
      tokensOut: 0,
    };
  }
  const budget = args.charBudget ?? 24000;
  const compression = bundleToCompressedReviewPrompt(bundle, conventions, budget);
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: REVIEW_SYSTEM_PROMPT },
    { role: "user", content: compression.prompt },
  ];
  const resp = await llm.chat({ messages, temperature: 0.1, maxTokens: 1800 });
  const parsed = parseReviewResponse(resp.content);
  const processedFindings = postProcessReviewFindings(parsed?.findings ?? [], bundle);
  return {
    summary: parsed?.summary ?? "(model did not return a structured response)",
    findings: processedFindings.findings,
    discardedFindings: processedFindings.discardedFindings,
    metadata: parsed?.metadata ?? DEFAULT_REVIEW_METADATA,
    compression: summarizeCompression(compression),
    coverage: summarizeContextCoverage(bundle),
    tokensIn: llm.usage.promptTokens,
    tokensOut: llm.usage.completionTokens,
  };
}

export function postProcessReviewFindings(
  findings: ReviewFinding[],
  bundle: CloudContextBundle,
): { findings: ReviewFinding[]; discardedFindings: ReviewDiscardedFinding[] } {
  const fileIndex = new Map<string, { path: string; lineCount: number; hunks: CloudContextBundle["files"][number]["hunks"] }>();
  for (const file of bundle.files) {
    const normalized = normalizePath(file.path);
    const lineCount = Math.max(1, file.content.split(/\r?\n/).length);
    fileIndex.set(normalized, { path: file.path, lineCount, hunks: file.hunks });
    fileIndex.set(`/${normalized}`, { path: file.path, lineCount, hunks: file.hunks });
  }

  const accepted: ReviewFinding[] = [];
  const discardedFindings: ReviewDiscardedFinding[] = [];
  const seen = new Set<string>();

  for (const finding of findings) {
    const discard = (reason: ReviewDiscardedFinding["reason"]) => {
      discardedFindings.push({ ...finding, reason });
    };
    if (!finding.message.trim()) {
      discard("empty_message");
      continue;
    }
    const indexed = fileIndex.get(normalizePath(finding.file)) ?? fileIndex.get(`/${normalizePath(finding.file)}`);
    if (!indexed) {
      discard("unknown_file");
      continue;
    }
    if (!Number.isInteger(finding.line) || finding.line < 1 || finding.line > indexed.lineCount) {
      discard("invalid_line");
      continue;
    }
    if (indexed.hunks?.length && !lineInChangedHunks(finding.line, indexed.hunks)) {
      discard("outside_changed_hunk");
      continue;
    }
    const normalizedFinding = { ...finding, file: indexed.path };
    const key = [
      normalizePath(normalizedFinding.file),
      normalizedFinding.line,
      normalizedFinding.category,
      normalizedFinding.message.trim().toLowerCase(),
    ].join(":");
    if (seen.has(key)) {
      discardedFindings.push({ ...normalizedFinding, reason: "duplicate" });
      continue;
    }
    seen.add(key);
    accepted.push(normalizedFinding);
  }

  return { findings: accepted, discardedFindings };
}

function summarizeCompression(compression: ReviewPromptCompression): ReviewCompressionSummary {
  return {
    compressed: compression.compressed,
    includedFiles: compression.includedFiles,
    omittedFiles: compression.omittedFiles,
  };
}

export function summarizeContextCoverage(bundle: CloudContextBundle): ReviewContextCoverage {
  const filesWithHunks = bundle.files.filter((file) => file.hunks?.length).length;
  const hunkCount = bundle.files.reduce((count, file) => count + (file.hunks?.length ?? 0), 0);
  const changedHunkLines = bundle.files.reduce((count, file) => {
    return count + (file.hunks ?? []).reduce((innerCount, hunk) => innerCount + Math.max(hunk.modifiedLineCount, 0), 0);
  }, 0);
  return {
    totalFiles: bundle.files.length,
    filesWithHunks,
    wholeFileOnlyFiles: Math.max(bundle.files.length - filesWithHunks, 0),
    hunkCount,
    changedHunkLines,
  };
}

function renderChangedFileBlock(file: CloudContextBundle["files"][number]): string {
  if (file.hunks?.length) {
    return [
      `\n### ${file.path} (${file.changeType})`,
      "Changed hunks:",
      ...file.hunks.flatMap((hunk) => renderChangedHunk(hunk)),
    ].join("\n");
  }
  const lines = file.content.split(/\r?\n/);
  return [
    `\n### ${file.path} (${file.changeType})`,
    "```",
    ...lines.map((line, index) => `${index + 1}: ${line}`),
    "```",
  ].join("\n");
}

function renderChangedHunk(hunk: NonNullable<CloudContextBundle["files"][number]["hunks"]>[number]): string[] {
  const lines = [
    `@@ -${hunk.originalStart},${hunk.originalLineCount} +${hunk.modifiedStart},${hunk.modifiedLineCount} @@ (${hunk.changeType})`,
    "```diff",
  ];
  const maxLines = Math.max(hunk.originalLines.length, hunk.modifiedLines.length);
  for (let i = 0; i < maxLines; i++) {
    if (i < hunk.originalLines.length && hunk.originalLines[i] !== hunk.modifiedLines[i]) {
      const lineNo = hunk.originalStart + i;
      lines.push(`-${lineNo}: ${hunk.originalLines[i] ?? ""}`);
    }
    if (i < hunk.modifiedLines.length) {
      const lineNo = hunk.modifiedStart + i;
      const prefix = hunk.originalLines[i] === hunk.modifiedLines[i] ? " " : "+";
      lines.push(`${prefix}${lineNo}: ${hunk.modifiedLines[i] ?? ""}`);
    }
  }
  lines.push("```");
  return lines;
}

function lineInChangedHunks(line: number, hunks: NonNullable<CloudContextBundle["files"][number]["hunks"]>): boolean {
  return hunks.some((hunk) => {
    const start = hunk.modifiedStart;
    const count = hunk.modifiedLineCount;
    if (start <= 0 || count <= 0) return false;
    return line >= start && line < start + count;
  });
}

function groupOmittedFiles(files: CloudContextBundle["files"]) {
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  for (const file of files) {
    const type = String(file.changeType).toLowerCase();
    if (type.includes("add")) added.push(file.path);
    else if (type.includes("delete")) deleted.push(file.path);
    else modified.push(file.path);
  }
  return { added, modified, deleted };
}

function renderPullRequestSignals(bundle: CloudContextBundle): string {
  const pr = bundle.pullRequest;
  if (!pr) return "";
  const lines = [
    "\n## Azure DevOps PR signals",
    `- Title: ${pr.title || "(none)"}`,
    `- Status: ${pr.status || "(unknown)"}${pr.isDraft ? " (draft)" : ""}`,
    `- Branches: ${pr.sourceBranch || "(unknown)"} -> ${pr.targetBranch || "(unknown)"}`,
    `- Author: ${pr.createdBy || "(unknown)"}`,
    `- Description: ${pr.description.trim() ? pr.description.trim().slice(0, 1200) : "(missing)"}`,
    `- Work items: ${pr.workItemIds.length ? pr.workItemIds.slice(0, 12).join(", ") : "(none)"}`,
    `- Reviewers: ${pr.reviewerCount}; votes approved=${pr.voteSummary.approved}, waiting=${pr.voteSummary.waiting}, rejected=${pr.voteSummary.rejected}`,
    `- Threads: ${pr.threadCount}; active=${pr.activeThreadCount}`,
    `- Builds: failed/canceled=${pr.failedBuildCount}; latest status=${pr.latestBuildStatus || "(unknown)"}, latest result=${pr.latestBuildResult || "(unknown)"}`,
  ];
  return lines.join("\n");
}

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
