import path from "node:path";

const BINARY_EXTENSIONS = new Set([
  ".7z",
  ".avi",
  ".bmp",
  ".class",
  ".dll",
  ".doc",
  ".docx",
  ".dylib",
  ".eot",
  ".exe",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".otf",
  ".pdf",
  ".pdb",
  ".png",
  ".ppt",
  ".pptx",
  ".rar",
  ".so",
  ".tar",
  ".tif",
  ".tiff",
  ".ttf",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xls",
  ".xlsx",
  ".zip",
]);

const TEXT_CONTEXT_EXTENSIONS = new Set([
  ".bat",
  ".cmd",
  ".config",
  ".cs",
  ".cshtml",
  ".csproj",
  ".css",
  ".dockerignore",
  ".editorconfig",
  ".env",
  ".gitignore",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".less",
  ".md",
  ".mjs",
  ".props",
  ".ps1",
  ".py",
  ".scss",
  ".sln",
  ".sql",
  ".targets",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".xsd",
  ".yaml",
  ".yml",
]);

const TEXT_CONTEXT_BASENAMES = new Set([
  "dockerfile",
  "license",
  "makefile",
  "readme",
]);

export function isBinaryRepoPath(rel: string): boolean {
  return BINARY_EXTENSIONS.has(path.extname(rel).toLowerCase());
}

export function isTextContextPath(rel: string): boolean {
  if (isBinaryRepoPath(rel)) return false;
  const ext = path.extname(rel).toLowerCase();
  const base = path.basename(rel).toLowerCase();
  if (/\.(?:min)\.(?:css|js)$/.test(base)) return false;
  if (TEXT_CONTEXT_EXTENSIONS.has(ext)) return true;
  return TEXT_CONTEXT_BASENAMES.has(base);
}

export function decodeTextIfLikelyText(buf: Buffer): string | null {
  if (buf.includes(0)) return null;
  const text = buf.toString("utf8");
  if (!text) return text;

  const replacementCount = countMatches(text, "\uFFFD");
  if (replacementCount > 0 && replacementCount / text.length > 0.005) return null;

  let controlCount = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    const allowedWhitespace = code === 9 || code === 10 || code === 12 || code === 13;
    if (code < 32 && !allowedWhitespace) controlCount++;
  }
  if (controlCount > 8 && controlCount / text.length > 0.01) return null;

  return text;
}

function countMatches(text: string, needle: string): number {
  let count = 0;
  let index = text.indexOf(needle);
  while (index !== -1) {
    count++;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
}
