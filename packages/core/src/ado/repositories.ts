import { ToolError } from "../tools/executor.js";
import { getAzureDevOpsAuth, type AdoAuth } from "./auth.js";
import { adoBase, adoFetch } from "./client.js";
import { API_VERSION_GIT } from "./constants.js";
import { stripRef } from "./refs.js";
import { parseAdoJson } from "./response.js";
import type { AzureDevOpsDiscoveryOption } from "./types.js";

export async function listAzureRepositories(args: {
  organization: string;
  project: string;
  pat?: string;
  auth?: AdoAuth;
  top?: number;
}): Promise<AzureDevOpsDiscoveryOption[]> {
  const org = args.organization.trim();
  const project = args.project.trim();
  if (!org || !project) throw new ToolError("ADO organization and project are required to list repositories.");
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const params = new URLSearchParams({ "api-version": API_VERSION_GIT });
  const url = `${adoBase(org)}/${encodeURIComponent(project)}/_apis/git/repositories?${params.toString()}`;
  const resp = await adoFetch(url, auth);
  const data = (await parseAdoJson(resp, "list repositories")) as {
    value?: Array<{ id?: string; name?: string; defaultBranch?: string; webUrl?: string; remoteUrl?: string; url?: string }>;
  };
  return (data.value ?? []).slice(0, args.top ?? 100).map((repo) => ({
    id: repo.id ?? repo.name ?? "",
    name: repo.name ?? repo.id ?? "",
    description: stripRef(repo.defaultBranch ?? ""),
    url: repo.webUrl ?? repo.remoteUrl ?? repo.url ?? "",
  })).filter((repo) => repo.id || repo.name);
}
