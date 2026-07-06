import type { ChatPlannerSource } from "./chatPlannerTypes.js";
import type { ChatContextBundle } from "./chatContextTypes.js";
import { isTextContextPath } from "./repoFileGuards.js";

interface DiffHunkSource {
  path: string;
  line: number;
  snippet: string;
}

export function chatContextToPrompt(bundle: ChatContextBundle, charBudget = 12000): string {
  const parts: string[] = ["## Repository context"];
  if (bundle.repoSummary) parts.push(bundle.repoSummary);
  parts.push(
    `Index status: ${bundle.indexed ? `indexed (${bundle.indexStats.filesIndexed} files, ${bundle.indexStats.chunksEmbedded}/${bundle.indexStats.chunksIndexed} embedded chunks)` : "quick scan; background index may refresh separately"}`,
  );
  parts.push(`Context retrieval: ${bundle.fallbackUsed ? "project docs, changed files, and file-structure scan" : "semantic embeddings"}`);

  if (bundle.projectLink) {
    parts.push("\n## Project Link");
    if (bundle.projectLink.targetBranch) parts.push(`- Target branch: ${bundle.projectLink.targetBranch}`);
    if (bundle.projectLink.buildCommand) parts.push(`- Build command: ${bundle.projectLink.buildCommand}`);
    if (bundle.projectLink.testCommand) parts.push(`- Test command: ${bundle.projectLink.testCommand}`);
    if (bundle.projectLink.pipelineName) parts.push(`- Pipeline: ${bundle.projectLink.pipelineName}`);
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
    if (bundle.changeSummary) {
      parts.push("\n## Change interpretation");
      parts.push(bundle.changeSummary);
    }
    if (bundle.changeDiffExcerpt) {
      parts.push("\n## Diff excerpt for understanding the change");
      parts.push("```diff");
      parts.push(bundle.changeDiffExcerpt.trim());
      parts.push("```");
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

export function describeChatContext(bundle: ChatContextBundle): string {
  if (bundle.embedded) {
    return `Repository context: semantic index used (${bundle.indexStats.filesIndexed} indexed files, ${bundle.indexStats.chunksEmbedded} embedded chunks).`;
  }
  if (bundle.indexed) {
    return `Repository context: quick scan used; index is available (${bundle.indexStats.filesIndexed} indexed files, ${bundle.indexStats.chunksEmbedded}/${bundle.indexStats.chunksIndexed} embedded chunks).`;
  }
  return `Repository context: quick scan used; background indexing may improve future answers.`;
}

export function chatContextSources(bundle: ChatContextBundle, maxSources = 8): ChatPlannerSource[] {
  const sources: ChatPlannerSource[] = [];
  const seen = new Set<string>();
  const perFileCounts = new Map<string, number>();
  const add = (source: ChatPlannerSource): void => {
    if (source.type === "source_document" && source.file && !isTextContextPath(source.file)) return;
    const key = source.type === "source_document"
      ? `${source.file ?? source.title}:${source.line ?? ""}`
      : source.url;
    if (seen.has(key)) return;
    if (source.type === "source_document" && source.file) {
      const count = perFileCounts.get(source.file) ?? 0;
      if (count >= 3) return;
      perFileCounts.set(source.file, count + 1);
    }
    seen.add(key);
    sources.push(source);
  };

  for (const hunk of diffHunkSources(bundle.changeDiffExcerpt ?? "")) {
    if (sources.length >= maxSources) break;
    add({
      type: "source_document",
      sourceId: sourceIdFor("hunk", `${hunk.path}:${hunk.line}`),
      title: `${hunk.path}:${hunk.line}`,
      file: hunk.path,
      line: hunk.line,
      snippet: hunk.snippet,
    });
  }

  for (const file of bundle.changedFiles.slice(0, Math.min(4, maxSources))) {
    if (sources.length >= maxSources) break;
    add({
      type: "source_document",
      sourceId: sourceIdFor("changed", file.path),
      title: file.path,
      file: file.path,
      snippet: [
        `Changed file: ${file.status} (+${file.additions}/-${file.deletions}).`,
        bundle.changeSummary,
      ].filter(Boolean).join(" "),
    });
  }

  for (const item of bundle.projectStructure) {
    if (sources.length >= maxSources) break;
    add({
      type: "source_document",
      sourceId: sourceIdFor("structure", `${item.kind}:${item.path}`),
      title: `${item.path} (${item.kind})`,
      file: item.path,
      snippet: `Project structure signal: ${item.reason}.`,
    });
  }

  for (const chunk of bundle.relevantChunks) {
    if (sources.length >= maxSources) break;
    add({
      type: "source_document",
      sourceId: sourceIdFor("context", `${chunk.path}:${chunk.startLine}-${chunk.endLine}`),
      title: `${chunk.path}:${chunk.startLine}-${chunk.endLine}`,
      file: chunk.path,
      line: chunk.startLine,
      snippet: snippetForSource(chunk.text),
    });
  }

  return sources.slice(0, maxSources);
}

function diffHunkSources(diffText: string, maxHunks = 8): DiffHunkSource[] {
  if (!diffText.trim()) return [];
  const hunks: DiffHunkSource[] = [];
  let currentPath = "";
  let currentHunk: { path: string; line: number; lines: string[] } | null = null;

  const flush = (): void => {
    if (!currentHunk) return;
    const snippet = currentHunk.lines
      .filter((line) => line && !line.startsWith("\\ No newline"))
      .slice(0, 18)
      .join("\n")
      .trim();
    if (snippet) {
      hunks.push({
        path: currentHunk.path,
        line: currentHunk.line,
        snippet: snippetForSource(snippet, 700),
      });
    }
    currentHunk = null;
  };

  for (const rawLine of diffText.split(/\r?\n/)) {
    const header = rawLine.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (header) {
      flush();
      currentPath = header[2] ?? header[1] ?? "";
      continue;
    }

    const newFile = rawLine.match(/^\+\+\+ b\/(.+)$/);
    if (newFile) {
      currentPath = newFile[1] ?? currentPath;
      continue;
    }

    const hunk = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk && currentPath) {
      flush();
      currentHunk = {
        path: currentPath,
        line: Number.parseInt(hunk[1] ?? "1", 10) || 1,
        lines: [rawLine],
      };
      if (hunks.length >= maxHunks) break;
      continue;
    }

    if (currentHunk) {
      if (rawLine.startsWith("diff --git ")) {
        flush();
      } else {
        currentHunk.lines.push(rawLine);
      }
    }
  }
  flush();
  return hunks.slice(0, maxHunks);
}

function sourceIdFor(prefix: string, value: string): string {
  return `${prefix}-${Buffer.from(value).toString("base64url").slice(0, 24)}`;
}

function snippetForSource(text: string, maxChars = 1800): string {
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars).trimEnd()}\n...` : cleaned;
}
