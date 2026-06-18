import type { CloudContextBundle } from "./cloudContext.js";

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
