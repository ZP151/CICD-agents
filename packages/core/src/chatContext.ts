import fs from "node:fs";
import path from "node:path";
import fastGlob from "fast-glob";
import { parseDiff, type ChangedFile } from "./contextBuilder.js";
import type { LLMClient } from "./llm.js";
import { RepoIndexer } from "./indexer/repoIndexer.js";
import { VectorIndex } from "./vectorIndex.js";
import { runCommand } from "./tools/executor.js";

export interface ChatContextProfile {
  buildCommand?: string;
  testCommand?: string;
  targetBranch?: string;
  pipelineName?: string;
  ignoredGlobs?: string[];
}

export interface ChatContextChunk {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  score?: number;
  reason: string;
}

export interface ChatContextBundle {
  repoSummary?: string;
  projectStructure: Array<{ path: string; kind: string; reason: string }>;
  relevantChunks: ChatContextChunk[];
  changedFiles: ChangedFile[];
  memories: Array<{ key: string; value: string }>;
  profile?: ChatContextProfile;
  indexed: boolean;
  embedded: boolean;
  fallbackUsed: boolean;
}

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

const GIT_INTENT_RE =
  /\b(git|status|diff|commit|branch|push|pull|merge|rebase|stash|pr|pull request|changes?|changed|review|stage|checkout)\b/i;

export function shouldInspectGit(message: string): boolean {
  return GIT_INTENT_RE.test(message);
}

export async function buildChatContext(args: {
  repoPath: string;
  message: string;
  llm: LLMClient;
  profile?: ChatContextProfile;
  maxChunks?: number;
  useSemanticIndex?: boolean;
}): Promise<ChatContextBundle> {
  const repoPath = path.resolve(args.repoPath);
  const maxChunks = args.maxChunks ?? 8;

  const repoFiles = await listQuickRepoFiles(repoPath, args.profile?.ignoredGlobs ?? []);
  const projectStructure = summarizeProjectStructure(repoFiles);
  const importantChunks = readImportantFiles(repoPath);

  let relevantChunks: ChatContextChunk[] = [];
  let semanticUsed = false;
  if (args.useSemanticIndex && args.llm.configured) {
    const vectors = new VectorIndex(repoPath);
    try {
      const hits = await vectors.searchText(args.llm, args.message, maxChunks);
      relevantChunks = hits.map((hit) => ({
        path: hit.filePath,
        startLine: hit.startLine,
        endLine: hit.endLine,
        text: hit.text,
        score: hit.score,
        reason: "semantic-search",
      }));
      semanticUsed = relevantChunks.length > 0;
    } finally {
      vectors.close();
    }
  }

  let fallbackUsed = !semanticUsed;
  if (relevantChunks.length === 0) {
    relevantChunks = heuristicChunks(repoPath, repoFiles, args.message, maxChunks);
  }

  const changedFiles = shouldInspectGit(args.message)
    ? await getChangedFiles(repoPath, args.profile?.targetBranch)
    : [];

  return {
    repoSummary: summarizeRepo(repoFiles, 0, repoFiles.length),
    projectStructure,
    relevantChunks: dedupeChunks([...importantChunks, ...relevantChunks]).slice(0, maxChunks + importantChunks.length),
    changedFiles,
    memories: [],
    profile: args.profile,
    indexed: false,
    embedded: semanticUsed,
    fallbackUsed,
  };
}

export async function refreshChatIndex(args: {
  repoPath: string;
  llm: LLMClient;
  profile?: ChatContextProfile;
}): Promise<{ filesSeen: number; filesIndexed: number; embedded: number }> {
  const repoPath = path.resolve(args.repoPath);
  const indexer = new RepoIndexer(repoPath, profileToIndexerProfile(args.profile));
  const vectors = new VectorIndex(repoPath);
  try {
    const stats = await indexer.update();
    const embedded = args.llm.configured ? await vectors.embedPending(args.llm) : 0;
    return { filesSeen: stats.filesSeen, filesIndexed: stats.filesIndexed, embedded };
  } finally {
    indexer.close();
    vectors.close();
  }
}

export function chatContextToPrompt(bundle: ChatContextBundle, charBudget = 12000): string {
  const parts: string[] = ["## Repository context"];
  if (bundle.repoSummary) parts.push(bundle.repoSummary);
  parts.push(`Index status: ${bundle.indexed ? "indexed" : "quick scan; background index may refresh separately"}`);
  parts.push(`Context retrieval: ${bundle.fallbackUsed ? "project docs and file-structure scan" : "semantic embeddings"}`);

  if (bundle.profile) {
    parts.push("\n## Profile");
    if (bundle.profile.targetBranch) parts.push(`- Target branch: ${bundle.profile.targetBranch}`);
    if (bundle.profile.buildCommand) parts.push(`- Build command: ${bundle.profile.buildCommand}`);
    if (bundle.profile.testCommand) parts.push(`- Test command: ${bundle.profile.testCommand}`);
    if (bundle.profile.pipelineName) parts.push(`- Pipeline: ${bundle.profile.pipelineName}`);
  }

  if (bundle.projectStructure.length > 0) {
    parts.push("\n## Project structure signals");
    for (const item of bundle.projectStructure.slice(0, 30)) {
      parts.push(`- ${item.path} (${item.kind}): ${item.reason}`);
    }
  }

  if (bundle.changedFiles.length > 0) {
    parts.push("\n## Changed files");
    for (const cf of bundle.changedFiles.slice(0, 40)) {
      parts.push(`- ${cf.status}: ${cf.path} (+${cf.additions}/-${cf.deletions})`);
    }
  }

  if (bundle.memories.length > 0) {
    parts.push("\n## Repository memory");
    for (const mem of bundle.memories.slice(0, 30)) parts.push(`- ${mem.key}: ${mem.value}`);
  }

  parts.push("\n## Relevant code and docs");
  let used = parts.join("\n").length;
  for (const chunk of bundle.relevantChunks) {
    const block =
      `\n### ${chunk.path}:${chunk.startLine}-${chunk.endLine} (${chunk.reason})\n` +
      "```\n" +
      `${chunk.text.trim()}\n` +
      "```\n";
    if (used + block.length > charBudget) {
      parts.push("\n_(remaining repository context truncated)_");
      break;
    }
    parts.push(block);
    used += block.length;
  }

  return parts.join("\n");
}

async function listQuickRepoFiles(repoPath: string, ignoredGlobs: string[]): Promise<string[]> {
  return fastGlob("**/*", {
    cwd: repoPath,
    ignore: [...DEFAULT_IGNORED, ...ignoredGlobs],
    onlyFiles: true,
    dot: false,
    followSymbolicLinks: false,
    caseSensitiveMatch: false,
  });
}

function summarizeRepo(files: string[], indexed: number, seen: number): string {
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
  return `Files seen in quick scan: ${seen}; files indexed synchronously this turn: ${indexed}; file types: ${top || "unknown"}.`;
}

function profileToIndexerProfile(profile?: ChatContextProfile): ConstructorParameters<typeof RepoIndexer>[1] {
  if (!profile) return null;
  return {
    name: "chat",
    description: "",
    languages: [],
    build: { command: profile.buildCommand ?? "" },
    test: { command: profile.testCommand ?? "" },
    azure_devops: {
      organization: "",
      project: "",
      repository: "",
      default_target_branch: profile.targetBranch ?? "main",
      pipeline_id: null,
    },
    ignored_globs: profile.ignoredGlobs ?? [],
  };
}

function summarizeProjectStructure(files: string[]): ChatContextBundle["projectStructure"] {
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
  addIf((f) => /(^|\/)(src|lib)\/(index|main|server|app)\./i.test(f), "entrypoint", "likely runtime entrypoint");
  addIf((f) => /test|spec/i.test(f), "test", "test file");
  return dedupeStructure(signals);
}

function readImportantFiles(repoPath: string): ChatContextChunk[] {
  const out: ChatContextChunk[] = [];
  for (const rel of IMPORTANT_FILES) {
    const full = path.join(repoPath, rel);
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile() || stat.size > 16000) continue;
      const text = fs.readFileSync(full, "utf8");
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

function heuristicChunks(repoPath: string, files: string[], message: string, maxChunks: number): ChatContextChunk[] {
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
      if (/readme|package\.json|architecture|chat|planner|agent|server|index/i.test(file)) score += 1;
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
      const text = fs.readFileSync(full, "utf8");
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

async function getChangedFiles(repoPath: string, targetBranch = "main"): Promise<ChangedFile[]> {
  try {
    const diff = await runCommand(["git", "diff", `${targetBranch}...HEAD`], {
      cwd: repoPath,
      allowed: ["git"],
      timeoutSec: 30,
    });
    if (diff.returncode === 0 && diff.stdout.trim()) return parseDiff(diff.stdout);
  } catch {
    // fall back to working tree diff
  }
  try {
    const diff = await runCommand(["git", "diff", "HEAD"], {
      cwd: repoPath,
      allowed: ["git"],
      timeoutSec: 30,
    });
    return parseDiff(diff.stdout);
  } catch {
    return [];
  }
}

function dedupeChunks(chunks: ChatContextChunk[]): ChatContextChunk[] {
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

function dedupeStructure(items: ChatContextBundle["projectStructure"]): ChatContextBundle["projectStructure"] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });
}
