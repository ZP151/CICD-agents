import { redact, ToolError } from "../tools/executor.js";
import { getAzureDevOpsAuth, type AdoAuth } from "./auth.js";
import { adoBase, adoFetch } from "./client.js";
import { API_VERSION_BUILD_DIAGNOSTICS } from "./constants.js";

export interface AzureBuildLogExcerpt {
  buildId: number;
  logId: number;
  lineCount: number;
  startLine: number;
  endLine: number;
  excerpt: string;
  truncated: boolean;
  url: string;
}

export async function getAzureBuildLogExcerpt(args: {
  organization: string;
  project: string;
  buildId: string | number;
  logId: string | number;
  pat?: string;
  auth?: AdoAuth;
  maxChars?: number;
}): Promise<AzureBuildLogExcerpt> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const buildId = Number(args.buildId ?? 0);
  const logId = Number(args.logId ?? 0);
  if (!org || !project || !buildId || !logId) {
    throw new ToolError("ADO organization, project, build ID, and log ID are required to read a build log.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const params = new URLSearchParams({ "api-version": API_VERSION_BUILD_DIAGNOSTICS });
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/build/builds/${buildId}/logs/${logId}` +
    `?${params.toString()}`;
  const resp = await adoFetch(url, auth, { headers: { Accept: "text/plain" } });
  if (!resp.ok) {
    throw new ToolError(`ADO get build log failed: HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  }
  const text = await resp.text();
  const excerpt = selectBuildLogExcerpt(text, args.maxChars ?? 6000);
  return {
    buildId,
    logId,
    url,
    ...excerpt,
  };
}

function selectBuildLogExcerpt(text: string, maxChars: number): Omit<AzureBuildLogExcerpt, "buildId" | "logId" | "url"> {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const diagnostics = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) =>
      /##\[error\]|\b(error|failed|failure|exception|assertionerror|traceback)\b|npm ERR!|\bFAIL\b/i.test(line),
    );
  const anchor = diagnostics.at(-1)?.index ?? lines.length - 1;
  const targetLineCount = 80;
  const before = diagnostics.length > 0 ? 24 : targetLineCount;
  const after = diagnostics.length > 0 ? 56 : 0;
  let start = Math.max(0, anchor - before);
  let end = Math.min(lines.length, anchor + after + 1);
  if (end - start > targetLineCount) start = Math.max(0, end - targetLineCount);
  let excerpt = redact(lines.slice(start, end).join("\n").trim());
  let charTruncated = false;
  if (excerpt.length > maxChars) {
    excerpt = excerpt.slice(Math.max(0, excerpt.length - maxChars)).trimStart();
    charTruncated = true;
  }
  return {
    lineCount: lines.length,
    startLine: start + 1,
    endLine: end,
    excerpt,
    truncated: start > 0 || end < lines.length || charTruncated,
  };
}
