import type { CloudContextBundle } from "./cloudContext.js";
import type {
  ReviewCompressionSummary,
  ReviewContextCoverage,
  ReviewPromptCompression,
} from "./types.js";
import { scoreReviewFilePriority } from "./reviewFilePriority.js";

export { scoreReviewFilePriority } from "./reviewFilePriority.js";

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

export function summarizeCompression(compression: ReviewPromptCompression): ReviewCompressionSummary {
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
