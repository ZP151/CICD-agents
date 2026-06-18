export interface ChatInlineProjectLinkForTools {
  adoOrgUrl: string;
  adoProject: string;
  adoRepoName: string;
  targetBranch: string;
  adoPat?: string;
  adoPipelineId?: string;
}

export function inlineProjectLinkToToolExtra(projectLink: ChatInlineProjectLinkForTools): Record<string, unknown> {
  const orgBase = projectLink.adoOrgUrl.replace(/\/$/, "");
  return {
    ado_org: orgBase,
    ado_project: projectLink.adoProject,
    ado_repository: projectLink.adoRepoName,
    ado_target_branch: projectLink.targetBranch,
    ...(projectLink.adoPat ? { ado_pat: projectLink.adoPat } : {}),
    ...(projectLink.adoPipelineId ? { ado_pipeline_id: projectLink.adoPipelineId } : {}),
  };
}
