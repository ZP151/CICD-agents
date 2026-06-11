import type { AdoClient } from "./adoClient.js";

export interface CloudChangedFile {
  path: string;
  changeType: string;
  content: string;
  hunks?: CloudChangedHunk[];
}

export interface CloudChangedHunk {
  changeType: string | number;
  originalStart: number;
  originalLineCount: number;
  modifiedStart: number;
  modifiedLineCount: number;
  originalLines: string[];
  modifiedLines: string[];
}

export interface CloudContextBundle {
  prId: number;
  iterationId: number;
  files: CloudChangedFile[];
  relatedSnippets: Array<{ path: string; reason: string; snippet: string }>;
  pullRequest?: CloudPullRequestSignals;
}

export interface CloudPullRequestSignals {
  title: string;
  description: string;
  status: string;
  isDraft: boolean;
  sourceBranch: string;
  targetBranch: string;
  createdBy: string;
  workItemIds: string[];
  reviewerCount: number;
  voteSummary: {
    approved: number;
    waiting: number;
    rejected: number;
  };
  threadCount: number;
  activeThreadCount: number;
  failedBuildCount: number;
  latestBuildResult: string;
  latestBuildStatus: string;
}

const IMPORT_HINT_PATTERNS = [
  /from\s+['"]([^'"]+)['"]/g,
  /import\s+['"]([^'"]+)['"]/g,
  /from\s+([\w.]+)\s+import/g,
  /^\s*using\s+([\w.]+)\s*;/gm,
];

/**
 * Cloud-mode context builder. Without a local Tree-sitter index we extract
 * import-like strings from each changed file and try to fetch those files
 * from the repository to provide additional context.
 */
export async function buildCloudContext(args: {
  ado: AdoClient;
  project: string;
  repositoryId: string;
  prId: number;
  iterationId: number;
  sourceCommit: string;
  baseCommit?: string;
  maxFiles?: number;
}): Promise<CloudContextBundle> {
  const { ado, project, repositoryId, prId, iterationId, sourceCommit } = args;
  const maxFiles = args.maxFiles ?? 40;

  const changes = await ado.getPullRequestChanges(project, repositoryId, prId, iterationId);
  const entries = changes.changeEntries.slice(0, maxFiles);
  const diffByPath = await getDiffsByPath({
    ado,
    project,
    repositoryId,
    baseCommit: args.baseCommit ?? "",
    targetCommit: sourceCommit,
    entries,
  });
  const files: CloudChangedFile[] = [];
  for (const entry of entries) {
    if (!entry.item?.path) continue;
    const path = entry.item.path;
    try {
      const content = await ado.getItemContent(project, repositoryId, path, sourceCommit);
      files.push({ path, changeType: entry.changeType, content, hunks: diffByPath.get(normalizePathKey(path)) });
    } catch {
      files.push({ path, changeType: entry.changeType, content: "", hunks: diffByPath.get(normalizePathKey(path)) });
    }
  }

  const importTokens = new Set<string>();
  for (const f of files) {
    for (const pat of IMPORT_HINT_PATTERNS) {
      const re = new RegExp(pat.source, pat.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(f.content))) {
        if (m[1]) importTokens.add(m[1]);
      }
    }
  }

  // Best-effort: try to resolve each import to a file in the same repo.
  const related: CloudContextBundle["relatedSnippets"] = [];
  const fileSet = new Set(files.map((f) => f.path));
  for (const token of [...importTokens].slice(0, 12)) {
    const candidates = [
      `${token}.ts`,
      `${token}.tsx`,
      `${token}.js`,
      `${token}.py`,
      `${token}.cs`,
      `${token}/index.ts`,
    ];
    for (const candidate of candidates) {
      if (fileSet.has(candidate)) continue;
      try {
        const content = await ado.getItemContent(project, repositoryId, candidate, sourceCommit);
        if (content) {
          related.push({
            path: candidate,
            reason: `import "${token}"`,
            snippet: content.slice(0, 4000),
          });
          break;
        }
      } catch {
        // ignored
      }
    }
  }

  return { prId, iterationId, files, relatedSnippets: related };
}

async function getDiffsByPath(args: {
  ado: AdoClient;
  project: string;
  repositoryId: string;
  baseCommit: string;
  targetCommit: string;
  entries: Array<{ changeType: string; item?: { path?: string }; originalPath?: string }>;
}): Promise<Map<string, CloudChangedHunk[]>> {
  if (!args.baseCommit || !args.targetCommit || typeof args.ado.getFileDiffs !== "function") {
    return new Map();
  }
  const fileDiffParams = args.entries
    .filter((entry) => {
      const type = String(entry.changeType).toLowerCase();
      return entry.item?.path && !type.includes("add") && !type.includes("delete");
    })
    .map((entry) => ({
      path: stripLeadingSlash(entry.item?.path ?? ""),
      originalPath: stripLeadingSlash(entry.originalPath ?? entry.item?.path ?? ""),
    }));
  if (fileDiffParams.length === 0) return new Map();

  try {
    const diffs = await args.ado.getFileDiffs(args.project, args.repositoryId, {
      baseVersionCommit: args.baseCommit,
      targetVersionCommit: args.targetCommit,
      fileDiffParams,
    });
    const out = new Map<string, CloudChangedHunk[]>();
    for (const diff of diffs) {
      const path = diff.path || diff.originalPath;
      if (!path) continue;
      const hunks = (diff.lineDiffBlocks ?? []).map((block) => ({
        changeType: block.changeType ?? "",
        originalStart: Number(block.originalLineNumberStart ?? 0),
        originalLineCount: Number(block.originalLinesCount ?? 0),
        modifiedStart: Number(block.modifiedLineNumberStart ?? 0),
        modifiedLineCount: Number(block.modifiedLinesCount ?? 0),
        originalLines: block.originalLines ?? [],
        modifiedLines: block.modifiedLines ?? [],
      }));
      if (hunks.length > 0) out.set(normalizePathKey(path), hunks);
    }
    return out;
  } catch {
    return new Map();
  }
}

function stripLeadingSlash(value: string): string {
  return value.replace(/^\/+/, "");
}

function normalizePathKey(value: string): string {
  return stripLeadingSlash(value).replace(/\\/g, "/").toLowerCase();
}
