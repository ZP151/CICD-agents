import fs from "node:fs";
import path from "node:path";
import fastGlob from "fast-glob";
import type { RepoIndexer } from "./indexer/repoIndexer.js";
import { decodeTextIfLikelyText, isTextContextPath } from "./repoFileGuards.js";
import type {
  ChatContextBundle,
  ChatContextChunk,
  ChatContextProjectLink,
} from "./chatContextTypes.js";

const IMPORTANT_FILES = [
  "README.md",
  "readme.md",
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "pyproject.toml",
  "requirements.txt",
  "Dockerfile",
  "docker-compose.yml",
  "azure-pipelines.yml",
];

const DEFAULT_IGNORED = [
  "**/.git/**",
  "**/node_modules/**",
  "**/__pycache__/**",
  "**/.venv/**",
  "**/.idea/**",
  "**/.vs/**",
  "**/bin/**",
  "**/obj/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
];

export async function listQuickRepoFiles(
  repoPath: string,
  ignoredGlobs: string[],
): Promise<string[]> {
  const files = await fastGlob("**/*", {
    cwd: repoPath,
    ignore: [...DEFAULT_IGNORED, ...ignoredGlobs],
    onlyFiles: true,
    dot: false,
    followSymbolicLinks: false,
    caseSensitiveMatch: false,
  });
  return files.filter(isTextContextPath);
}

export function summarizeRepo(files: string[], indexed: number, seen: number): string {
  const byExt = new Map<string, number>();
  for (const file of files) {
    const ext = path.extname(file).toLowerCase() || "(none)";
    byExt.set(ext, (byExt.get(ext) ?? 0) + 1);
  }
  const top = [...byExt.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([ext, count]) => `${ext}:${count}`)
    .join(", ");
  return `Files seen in quick scan: ${seen}; files indexed synchronously this turn: ${indexed}; file types: ${top || "not available"}.`;
}

export function projectLinkToIndexerProjectTemplate(
  projectLink?: ChatContextProjectLink,
): ConstructorParameters<typeof RepoIndexer>[1] {
  if (!projectLink) return null;
  return {
    name: "chat",
    description: "",
    languages: [],
    build: { command: projectLink.buildCommand ?? "" },
    test: { command: projectLink.testCommand ?? "" },
    azure_devops: {
      organization: "",
      project: "",
      repository: "",
      default_target_branch: projectLink.targetBranch ?? "main",
      pipeline_id: null,
    },
    ignored_globs: projectLink.ignoredGlobs ?? [],
  };
}

export function summarizeProjectStructure(files: string[]): ChatContextBundle["projectStructure"] {
  const signals: ChatContextBundle["projectStructure"] = [];
  const addIf = (predicate: (f: string) => boolean, kind: string, reason: string) => {
    for (const file of files.filter(predicate).slice(0, 8)) {
      signals.push({ path: file, kind, reason });
    }
  };
  addIf((f) => /^src\//i.test(f), "source", "top-level source file");
  addIf((f) => /^lib\//i.test(f), "source", "top-level library file");
  addIf((f) => /^apps\//i.test(f), "app", "application workspace");
  addIf((f) => /^packages\//i.test(f), "package", "library or service package");
  addIf((f) => /^docs\//i.test(f), "docs", "project documentation");
  addIf(
    (f) => /(^|\/)(src|lib)\/(index|main|server|app)\./i.test(f),
    "entrypoint",
    "likely runtime entrypoint",
  );
  addIf((f) => /test|spec/i.test(f), "test", "test file");
  return dedupeStructure(signals);
}

export function readImportantFiles(repoPath: string): ChatContextChunk[] {
  const out: ChatContextChunk[] = [];
  const seenRealPaths = new Set<string>();
  for (const rel of IMPORTANT_FILES) {
    const full = path.join(repoPath, rel);
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile() || stat.size > 16000) continue;
      const realPath = fs.realpathSync.native(full).toLowerCase();
      if (seenRealPaths.has(realPath)) continue;
      seenRealPaths.add(realPath);
      const text = decodeTextIfLikelyText(fs.readFileSync(full));
      if (text === null) continue;
      out.push({
        path: rel,
        startLine: 1,
        endLine: text.split(/\r?\n/).length,
        text: text.slice(0, 6000),
        reason: "project-important-file",
      });
    } catch {
      // ignore missing files
    }
  }
  return out;
}

export function heuristicChunks(
  repoPath: string,
  files: string[],
  message: string,
  maxChunks: number,
): ChatContextChunk[] {
  const terms = new Set(
    message
      .toLowerCase()
      .split(/[^a-z0-9_.-]+/)
      .filter((t) => t.length >= 3),
  );
  const scored = files
    .map((file) => {
      const lower = file.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (lower.includes(term)) score += 3;
      }
      if (/readme|package\.json|architecture|chat|planner|agent|server|index/i.test(file))
        score += 1;
      if (
        /(config|settings|configuration)/i.test(message) &&
        /\.(config|json|ya?ml|toml|props|targets|csproj)$/i.test(file)
      )
        score += 2;
      if (
        /(architecture|request|flow|entry|controller|model|view)/i.test(message) &&
        /(^|\/)(controllers?|models?|views?|routes?|services?)\//i.test(file)
      )
        score += 2;
      if (/(^|\/)(legacy|archive|archives|backup|deprecated|old)\//i.test(lower)) score -= 4;
      return { file, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks);

  const out: ChatContextChunk[] = [];
  for (const { file } of scored) {
    const full = path.join(repoPath, file);
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile() || stat.size > 24000) continue;
      const text = decodeTextIfLikelyText(fs.readFileSync(full));
      if (text === null) continue;
      out.push({
        path: file,
        startLine: 1,
        endLine: text.split(/\r?\n/).length,
        text: text.slice(0, 8000),
        reason: "heuristic-file-match",
      });
    } catch {
      // ignore unreadable files
    }
  }
  return out;
}

export function dedupeChunks(chunks: ChatContextChunk[]): ChatContextChunk[] {
  const seen = new Set<string>();
  const out: ChatContextChunk[] = [];
  for (const chunk of chunks) {
    const key = `${chunk.path}:${chunk.startLine}:${chunk.endLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(chunk);
  }
  return out;
}

function dedupeStructure(
  items: ChatContextBundle["projectStructure"],
): ChatContextBundle["projectStructure"] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });
}
