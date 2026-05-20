import path from "node:path";
import type { ParsedFile, ParsedSymbol } from "./types.js";

export const EXT_TO_LANG: Record<string, string> = {
  ".py": "python",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".cs": "c_sharp",
};

export function detectLanguage(file: string): string | null {
  return EXT_TO_LANG[path.extname(file).toLowerCase()] ?? null;
}

export function isTestPath(rel: string, lang: string): boolean {
  const relLower = rel.toLowerCase();
  if (relLower.includes("/tests/") || relLower.startsWith("tests/")) return true;
  if (lang === "python") {
    if (
      relLower.endsWith("_test.py") ||
      relLower.includes("/test_") ||
      relLower.startsWith("test_")
    ) {
      return true;
    }
  }
  if (lang === "typescript" || lang === "tsx" || lang === "javascript") {
    if (
      relLower.endsWith(".test.ts") ||
      relLower.endsWith(".test.tsx") ||
      relLower.endsWith(".spec.ts") ||
      relLower.endsWith(".spec.tsx") ||
      relLower.endsWith(".test.js") ||
      relLower.endsWith(".spec.js")
    ) {
      return true;
    }
  }
  if (lang === "c_sharp" && (rel.includes(".Tests") || rel.includes("Tests.cs"))) {
    return true;
  }
  return false;
}

// Regex-based fallback parser. Tree-sitter WASM is the long-term plan
// (see ADR-0007 / packages/core README); the regex parser keeps the
// rest of the pipeline functional in environments without WASM.

const PY_DEF = /^\s*(class|def|async\s+def)\s+([A-Za-z_][\w]*)/gm;
const PY_IMPORT = /^\s*(?:from\s+([\w.]+)\s+import\s+[\w.,\s*()]+|import\s+([\w.]+))/gm;

const TS_FN = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][\w]*)/gm;
const TS_CLASS = /^\s*(?:export\s+)?class\s+([A-Za-z_][\w]*)/gm;
const TS_IFACE = /^\s*(?:export\s+)?interface\s+([A-Za-z_][\w]*)/gm;
const TS_METHOD = /^\s+(?:public|private|protected|static|async\s+)*([A-Za-z_][\w]*)\s*\([^)]*\)\s*[:{]/gm;
const TS_IMPORT = /^\s*import\s+[^;]+from\s+['"]([^'"]+)['"]/gm;

const CS_CLASS = /\b(?:public|internal|private|protected)?\s*(?:static\s+)?class\s+([A-Za-z_][\w<>]*)/g;
const CS_IFACE = /\b(?:public|internal)?\s*interface\s+([A-Za-z_][\w<>]*)/g;
const CS_METHOD = /\b(?:public|internal|private|protected)\s+(?:static\s+|virtual\s+|override\s+|async\s+)*[\w<>?]+\s+([A-Za-z_][\w]*)\s*\(/g;
const CS_USING = /^\s*using\s+([\w.]+)\s*;/gm;

function findLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function lineNumberOfOffset(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

function pushAll(
  text: string,
  regex: RegExp,
  kind: string,
  symbols: ParsedSymbol[],
  group = 1,
): void {
  const lines = findLines(text);
  const re = new RegExp(regex.source, regex.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = m[group];
    if (!name) continue;
    const start = lineNumberOfOffset(text, m.index);
    const lineIdx = Math.max(0, start - 1);
    const signature = (lines[lineIdx] ?? "").trim();
    symbols.push({
      kind,
      name,
      qualified: name,
      startLine: start,
      endLine: start,
      signature,
    });
  }
}

function parsePython(text: string): ParsedFile {
  const symbols: ParsedSymbol[] = [];
  const imports: string[] = [];
  const lines = findLines(text);
  const re = new RegExp(PY_DEF.source, PY_DEF.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const kindWord = m[1] ?? "";
    const kind = kindWord.startsWith("class") ? "class" : "function";
    const name = m[2];
    if (!name) continue;
    const start = lineNumberOfOffset(text, m.index);
    const sig = (lines[start - 1] ?? "").trim();
    symbols.push({ kind, name, qualified: name, startLine: start, endLine: start, signature: sig });
  }
  const reImp = new RegExp(PY_IMPORT.source, PY_IMPORT.flags);
  let mi: RegExpExecArray | null;
  while ((mi = reImp.exec(text))) {
    imports.push((mi[1] ?? mi[2] ?? "").trim());
  }
  return { symbols, imports: imports.filter(Boolean) };
}

function parseTs(text: string): ParsedFile {
  const symbols: ParsedSymbol[] = [];
  pushAll(text, TS_FN, "function", symbols);
  pushAll(text, TS_CLASS, "class", symbols);
  pushAll(text, TS_IFACE, "interface", symbols);
  pushAll(text, TS_METHOD, "method", symbols);
  const imports: string[] = [];
  const re = new RegExp(TS_IMPORT.source, TS_IMPORT.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1]) imports.push(m[1]);
  }
  return { symbols, imports };
}

function parseCs(text: string): ParsedFile {
  const symbols: ParsedSymbol[] = [];
  pushAll(text, CS_CLASS, "class", symbols);
  pushAll(text, CS_IFACE, "interface", symbols);
  pushAll(text, CS_METHOD, "method", symbols);
  const imports: string[] = [];
  const re = new RegExp(CS_USING.source, CS_USING.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1]) imports.push(m[1]);
  }
  return { symbols, imports };
}

export function parseFile(text: string, lang: string): ParsedFile {
  switch (lang) {
    case "python":
      return parsePython(text);
    case "typescript":
    case "tsx":
    case "javascript":
      return parseTs(text);
    case "c_sharp":
      return parseCs(text);
    default:
      return { symbols: [], imports: [] };
  }
}
