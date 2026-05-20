import fs from "node:fs";
import path from "node:path";
import type { LLMClient } from "./llm.js";
import type { RepoIndexer } from "./indexer/repoIndexer.js";
import type { VectorIndex, SearchHit } from "./vectorIndex.js";

const CONFIG_GLOBS = [
  "pyproject.toml",
  "requirements.txt",
  "package.json",
  "tsconfig.json",
  "appsettings.json",
  "appsettings.Development.json",
  "azure-pipelines.yml",
  ".github/workflows/",
  "Dockerfile",
];

export type FileChangeStatus = "added" | "modified" | "deleted" | "renamed";

export interface ChangedFile {
  path: string;
  status: FileChangeStatus;
  additions: number;
  deletions: number;
}

export interface ContextChunk {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  importance: number;
  reason: string;
}

export interface ContextBundle {
  targetBranch: string;
  diff: string;
  changedFiles: ChangedFile[];
  relatedChunks: ContextChunk[];
  relatedTests: string[];
  relevantConfigs: string[];
  affectedSymbols: string[];
  truncated: boolean;
}

export function parseDiff(diffText: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  let current: ChangedFile | null = null;
  const diffHeader = /^diff --git a\/(.+?) b\/(.+?)$/;
  const newFile = /^new file mode/;
  const deletedFile = /^deleted file mode/;
  const renamed = /^rename from /;
  for (const raw of diffText.split(/\r?\n/)) {
    const m = diffHeader.exec(raw);
    if (m) {
      if (current) files.push(current);
      current = { path: m[2]!, status: "modified", additions: 0, deletions: 0 };
      continue;
    }
    if (!current) continue;
    if (newFile.test(raw)) current.status = "added";
    else if (deletedFile.test(raw)) current.status = "deleted";
    else if (renamed.test(raw)) current.status = "renamed";
    else if (raw.startsWith("+") && !raw.startsWith("+++")) current.additions++;
    else if (raw.startsWith("-") && !raw.startsWith("---")) current.deletions++;
  }
  if (current) files.push(current);
  return files;
}

function hitsToChunks(hits: SearchHit[], reason: string): ContextChunk[] {
  return hits.map((h) => ({
    path: h.filePath,
    startLine: h.startLine,
    endLine: h.endLine,
    text: h.text,
    importance: h.score,
    reason,
  }));
}

function dedupe(chunks: ContextChunk[]): ContextChunk[] {
  const seen = new Set<string>();
  return [...chunks]
    .sort((a, b) => b.importance - a.importance)
    .filter((c) => {
      const key = `${c.path}:${c.startLine}-${c.endLine}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export class ContextBuilder {
  constructor(
    private readonly repoPath: string,
    private readonly indexer: RepoIndexer,
    private readonly vectors: VectorIndex,
  ) {}

  async build(diff: string, targetBranch: string, llm: LLMClient): Promise<ContextBundle> {
    const changed = parseDiff(diff);

    const affected: string[] = [];
    const relatedTests = new Set<string>();
    for (const cf of changed) {
      const fileId = this.indexer.findFileId(cf.path);
      if (fileId === null) continue;
      const syms = this.indexer.symbolsInFile(cf.path);
      for (const s of syms) {
        affected.push(`${cf.path}::${s.kind} ${s.name}`);
      }
      const stem = path.basename(cf.path, path.extname(cf.path));
      for (const t of this.indexer.filesImporting(stem)) {
        if (t.endsWith("_test.py") || t.toLowerCase().includes("test")) relatedTests.add(t);
      }
    }

    const configs: string[] = [];
    for (const g of CONFIG_GLOBS) {
      const full = path.join(this.repoPath, g);
      try {
        const stat = fs.statSync(full);
        if (stat.isFile()) configs.push(g);
      } catch {
        // ignored
      }
    }

    const related: ContextChunk[] = [];
    if (llm.configured && changed.length > 0) {
      const seed = this.buildSeed(diff, changed);
      const hits = await this.vectors.searchText(llm, seed, 8);
      related.push(...hitsToChunks(hits, "vector"));
    }

    for (const cf of changed.slice(0, 6)) {
      const full = path.join(this.repoPath, cf.path);
      try {
        const stat = fs.statSync(full);
        if (!stat.isFile() || stat.size > 24000) continue;
        const text = fs.readFileSync(full, "utf8");
        related.push({
          path: cf.path,
          startLine: 1,
          endLine: text.split(/\r?\n/).length,
          text,
          importance: 1,
          reason: "changed-file",
        });
      } catch {
        // ignored
      }
    }

    return {
      targetBranch,
      diff,
      changedFiles: changed,
      relatedChunks: dedupe(related),
      relatedTests: [...relatedTests].sort(),
      relevantConfigs: configs,
      affectedSymbols: affected,
      truncated: false,
    };
  }

  private buildSeed(diff: string, changed: ChangedFile[]): string {
    const out: string[] = ["Files changed:"];
    for (const cf of changed.slice(0, 20)) out.push(`- ${cf.status} ${cf.path}`);
    out.push("Diff snippet:");
    out.push(diff.slice(0, 4000));
    return out.join("\n");
  }
}

export function bundleToPrompt(bundle: ContextBundle, tokenBudget: number): string {
  const charBudget = Math.max(2000, tokenBudget * 4);
  const parts: string[] = [];
  parts.push(`## Target branch\n${bundle.targetBranch}\n`);
  parts.push("## Changed files");
  for (const cf of bundle.changedFiles) {
    parts.push(`- ${cf.status}: ${cf.path} (+${cf.additions}/-${cf.deletions})`);
  }
  parts.push("");
  if (bundle.affectedSymbols.length > 0) {
    parts.push("## Affected symbols");
    for (const s of bundle.affectedSymbols.slice(0, 80)) parts.push(`- ${s}`);
    parts.push("");
  }
  if (bundle.relatedTests.length > 0) {
    parts.push("## Related tests");
    for (const t of bundle.relatedTests.slice(0, 40)) parts.push(`- ${t}`);
    parts.push("");
  }
  if (bundle.relevantConfigs.length > 0) {
    parts.push("## Relevant configs");
    for (const c of bundle.relevantConfigs.slice(0, 40)) parts.push(`- ${c}`);
    parts.push("");
  }
  parts.push("## Diff");
  parts.push("```diff");
  const diffCap = Math.floor(charBudget / 2);
  if (bundle.diff.length > diffCap) {
    parts.push(bundle.diff.slice(0, diffCap) + "\n... (diff truncated) ...");
    bundle.truncated = true;
  } else {
    parts.push(bundle.diff);
  }
  parts.push("```");
  parts.push("");

  const used = parts.reduce((sum, p) => sum + p.length + 1, 0);
  let remaining = Math.max(0, charBudget - used);
  parts.push("## Related code");
  for (const chunk of bundle.relatedChunks) {
    const block = `\n### ${chunk.path}:${chunk.startLine}-${chunk.endLine} (reason: ${chunk.reason})\n\`\`\`\n${chunk.text}\n\`\`\`\n`;
    if (block.length > remaining) {
      parts.push("\n_(remaining context truncated)_");
      bundle.truncated = true;
      break;
    }
    parts.push(block);
    remaining -= block.length;
  }
  return parts.join("\n");
}
