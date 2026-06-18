export function stripRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
}

export function normalizeBranchRef(branch: string): string {
  const trimmed = branch.trim();
  if (!trimmed || trimmed.startsWith("refs/")) return trimmed;
  return `refs/heads/${trimmed}`;
}
