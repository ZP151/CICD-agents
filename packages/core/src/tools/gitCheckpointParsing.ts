export function checkpointFilesFromDiff(diff: string): string[] {
  const files = new Set<string>();
  for (const line of diff.split(/\r?\n/)) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (match?.[2]) files.add(match[2]);
  }
  return [...files].sort((a, b) => a.localeCompare(b));
}

export function pathsFromPorcelainStatus(status: string): { tracked: string[]; untracked: string[] } {
  const tracked = new Set<string>();
  const untracked = new Set<string>();
  for (const line of status.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("## ")) continue;
    const pathPart = line.slice(3).trim();
    if (!pathPart) continue;
    const normalized = pathPart.includes(" -> ") ? pathPart.split(" -> ").pop()!.trim() : pathPart;
    if (line.startsWith("??")) {
      untracked.add(normalized);
    } else {
      tracked.add(normalized);
    }
  }
  return {
    tracked: [...tracked].sort((a, b) => a.localeCompare(b)),
    untracked: [...untracked].sort((a, b) => a.localeCompare(b)),
  };
}
