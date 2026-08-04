import { getAzureDevOpsAuth, type AdoAuth } from "./auth.js";
import { adoBase, adoFetch } from "./client.js";
import { API_VERSION_GIT } from "./constants.js";
import { parseAdoJson } from "./response.js";
import { ToolError } from "../tools/executor.js";

export function stripRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
}

export function normalizeBranchRef(branch: string): string {
  const trimmed = branch.trim();
  if (!trimmed || trimmed.startsWith("refs/")) return trimmed;
  return `refs/heads/${trimmed}`;
}

export interface AzureBranchRef {
  name: string;
  objectId: string;
}

/** Read the current object id of a branch ref (source of truth for PR sources). */
export async function readAzureBranchObjectId(args: {
  organization: string;
  project: string;
  repository: string;
  branch: string;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzureBranchRef | undefined> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const repository = args.repository.trim();
  const branchRef = normalizeBranchRef(args.branch);
  if (!org || !project || !repository || !branchRef) {
    throw new ToolError("ADO organization, project, repository, and branch are required.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const url =
    `${adoBase(org)}/${encodeURIComponent(project)}/_apis/git/repositories/` +
    `${encodeURIComponent(repository)}/refs?filterContains=${encodeURIComponent(branchRef)}` +
    `&api-version=${API_VERSION_GIT}`;
  const resp = await adoFetch(url, auth);
  if (!resp.ok) return undefined;
  const body = await parseAdoJson(resp, "get branch refs") as {
    value?: Array<{ name?: string; objectId?: string }>;
  };
  const match = (body.value ?? []).find((ref) => ref.name === branchRef);
  const objectId = match?.objectId;
  if (!objectId) return undefined;
  return { name: match.name ?? branchRef, objectId };
}
