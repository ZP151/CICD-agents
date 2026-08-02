export interface ChatInlineProjectLinkForTools {
  adoOrgUrl: string;
  adoProject: string;
  adoRepoName: string;
  targetBranch: string;
  adoPat?: string;
  adoMcpEnabled?: boolean;
  adoMcpDomains?: string;
}

export function inlineProjectLinkToToolExtra(projectLink: ChatInlineProjectLinkForTools): Record<string, unknown> {
  const orgBase = projectLink.adoOrgUrl.replace(/\/$/, "");
  return {
    ado_org: orgBase,
    ado_project: projectLink.adoProject,
    ado_repository: projectLink.adoRepoName,
    ado_target_branch: projectLink.targetBranch,
    ado_mcp_enabled: projectLink.adoMcpEnabled === true,
    ado_mcp_domains: projectLink.adoMcpDomains ?? "",
    ...(projectLink.adoPat ? { ado_pat: projectLink.adoPat } : {}),
  };
}
