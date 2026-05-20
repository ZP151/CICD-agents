import type { AdoClient } from "./adoClient.js";

export interface CloudChangedFile {
  path: string;
  changeType: string;
  content: string;
}

export interface CloudContextBundle {
  prId: number;
  iterationId: number;
  files: CloudChangedFile[];
  relatedSnippets: Array<{ path: string; reason: string; snippet: string }>;
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
  maxFiles?: number;
}): Promise<CloudContextBundle> {
  const { ado, project, repositoryId, prId, iterationId, sourceCommit } = args;
  const maxFiles = args.maxFiles ?? 40;

  const changes = await ado.getPullRequestChanges(project, repositoryId, prId, iterationId);
  const entries = changes.changeEntries.slice(0, maxFiles);
  const files: CloudChangedFile[] = [];
  for (const entry of entries) {
    if (!entry.item?.path) continue;
    try {
      const content = await ado.getItemContent(project, repositoryId, entry.item.path, sourceCommit);
      files.push({ path: entry.item.path, changeType: entry.changeType, content });
    } catch {
      files.push({ path: entry.item.path, changeType: entry.changeType, content: "" });
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
