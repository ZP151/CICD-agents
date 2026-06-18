import type { CloudContextBundle } from "./cloudContext.js";
import type { ReviewDiscardedFinding, ReviewFinding } from "./types.js";

export function postProcessReviewFindings(
  findings: ReviewFinding[],
  bundle: CloudContextBundle,
): { findings: ReviewFinding[]; discardedFindings: ReviewDiscardedFinding[] } {
  const fileIndex = new Map<string, { path: string; lineCount: number; hunks: CloudContextBundle["files"][number]["hunks"] }>();
  for (const file of bundle.files) {
    const normalized = normalizePath(file.path);
    const lineCount = Math.max(1, file.content.split(/\r?\n/).length);
    fileIndex.set(normalized, { path: file.path, lineCount, hunks: file.hunks });
    fileIndex.set(`/${normalized}`, { path: file.path, lineCount, hunks: file.hunks });
  }

  const accepted: ReviewFinding[] = [];
  const discardedFindings: ReviewDiscardedFinding[] = [];
  const seen = new Set<string>();

  for (const finding of findings) {
    const discard = (reason: ReviewDiscardedFinding["reason"]) => {
      discardedFindings.push({ ...finding, reason });
    };
    if (!finding.message.trim()) {
      discard("empty_message");
      continue;
    }
    const indexed = fileIndex.get(normalizePath(finding.file)) ?? fileIndex.get(`/${normalizePath(finding.file)}`);
    if (!indexed) {
      discard("unknown_file");
      continue;
    }
    if (!Number.isInteger(finding.line) || finding.line < 1 || finding.line > indexed.lineCount) {
      discard("invalid_line");
      continue;
    }
    if (indexed.hunks?.length && !lineInChangedHunks(finding.line, indexed.hunks)) {
      discard("outside_changed_hunk");
      continue;
    }
    const normalizedFinding = { ...finding, file: indexed.path };
    const key = [
      normalizePath(normalizedFinding.file),
      normalizedFinding.line,
      normalizedFinding.category,
      normalizedFinding.message.trim().toLowerCase(),
    ].join(":");
    if (seen.has(key)) {
      discardedFindings.push({ ...normalizedFinding, reason: "duplicate" });
      continue;
    }
    seen.add(key);
    accepted.push(normalizedFinding);
  }

  return { findings: accepted, discardedFindings };
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
}

function lineInChangedHunks(line: number, hunks: NonNullable<CloudContextBundle["files"][number]["hunks"]>): boolean {
  return hunks.some((hunk) => {
    const start = hunk.modifiedStart;
    const count = hunk.modifiedLineCount;
    if (start <= 0 || count <= 0) return false;
    return line >= start && line < start + count;
  });
}
