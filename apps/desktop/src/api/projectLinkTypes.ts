export interface ProjectLink {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  repoPath: string;
  defaultBranch: string;
  targetBranch: string;
  adoOrgUrl: string;
  adoProject: string;
  adoRepoName: string;
  adoPat: string;
  adoPipelineId: string;
  adoPipelineName: string;
  adoMcpEnabled: boolean;
  adoMcpCommand: string;
  adoMcpAuthentication: string;
  adoMcpDomains: string;
  projectTemplate: string;
  buildCommand: string;
  testCommand: string;
}

export type ProjectLinkInput = Omit<ProjectLink, "id" | "createdAt" | "updatedAt">;

export type AdoDiscoveryKind = "projects" | "repositories" | "pipelines";

export type AdoDiscoveryAuthStatus =
  | "ok"
  | "oauth_unavailable"
  | "oauth_no_org_access"
  | "pat_invalid_or_missing_scope"
  | "user_declined"
  | "unknown_error";

export interface AdoDiscoveryOption {
  id: string;
  name: string;
  description: string;
  url: string;
}

export interface AdoDiscoveryResult {
  source: "internal" | "mcp";
  kind: AdoDiscoveryKind;
  items: AdoDiscoveryOption[];
  authMode?: "oauth" | "pat";
  authStatus?: AdoDiscoveryAuthStatus;
  authMessage?: string;
  retryable?: boolean;
}
