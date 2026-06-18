import { ToolError } from "../tools/executor.js";
import { getAzureDevOpsAuth, type AdoAuth } from "./auth.js";
import { adoBase, adoFetch } from "./client.js";
import { API_VERSION_CORE } from "./constants.js";
import { parseAdoJson } from "./response.js";
import type { AzureDevOpsDiscoveryOption } from "./types.js";

export async function listAzureProjects(args: {
  organization: string;
  pat?: string;
  auth?: AdoAuth;
  top?: number;
}): Promise<AzureDevOpsDiscoveryOption[]> {
  const org = args.organization.trim();
  if (!org) throw new ToolError("ADO organization is required to list projects.");
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const params = new URLSearchParams({
    "$top": String(args.top ?? 100),
    "api-version": API_VERSION_CORE,
  });
  const url = `${adoBase(org)}/_apis/projects?${params.toString()}`;
  const resp = await adoFetch(url, auth);
  const data = (await parseAdoJson(resp, "list projects")) as {
    value?: Array<{ id?: string; name?: string; description?: string; url?: string }>;
  };
  return (data.value ?? []).map((project) => ({
    id: project.id ?? project.name ?? "",
    name: project.name ?? project.id ?? "",
    description: project.description ?? "",
    url: project.url ?? "",
  })).filter((project) => project.id || project.name);
}
