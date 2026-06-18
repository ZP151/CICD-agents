export function extractAdoOrg(adoOrgUrl: string): string {
  try {
    const url = new URL(adoOrgUrl);
    if (url.hostname === "dev.azure.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      return parts[0] ?? adoOrgUrl;
    }
    return url.origin;
  } catch {
    return adoOrgUrl;
  }
}

export function extractAdoThreadId(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const id = (value as { id?: unknown; threadId?: unknown }).id ?? (value as { threadId?: unknown }).threadId;
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  if (typeof id === "string" && id.trim()) return id.trim();
  return "";
}

export function extractAdoThreadUrl(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const url = (value as { url?: unknown; _links?: { web?: { href?: unknown } } })._links?.web?.href ??
    (value as { url?: unknown }).url;
  return typeof url === "string" && url.trim() ? url.trim() : "";
}

export function buildAdoThreadUrl(args: {
  orgUrl: string;
  project: string;
  repository: string;
  pullRequestId: number;
  threadId: string;
}): string {
  const base = args.orgUrl.replace(/\/$/, "");
  if (!base || !args.project || !args.repository || !args.threadId) return "";
  const project = encodeURIComponent(args.project);
  const repository = encodeURIComponent(args.repository);
  return `${base}/${project}/_git/${repository}/pullrequest/${args.pullRequestId}?_a=files&discussionId=${encodeURIComponent(args.threadId)}`;
}
