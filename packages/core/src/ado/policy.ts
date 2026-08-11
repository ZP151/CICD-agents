import { ToolError } from "../tools/executor.js";
import { getAzureDevOpsAuth, type AdoAuth } from "./auth.js";
import { adoBase, adoFetch } from "./client.js";
import { API_VERSION_POLICY } from "./constants.js";
import { getAzurePullRequestById } from "./pullRequests.js";
import { parseAdoJson } from "./response.js";

export interface AzurePullRequestPolicyEvaluation {
  id: string;
  status: string;
  startedDate: string;
  completedDate: string;
  displayName: string;
  typeName: string;
  configurationId: number;
  isBlocking: boolean;
}

export interface AzureBranchPolicyConfiguration {
  id: number;
  revision: number;
  typeId: string;
  displayName: string;
  isEnabled: boolean;
  isBlocking: boolean;
}

/**
 * Read the policy configurations that ADO says apply to one repository ref.
 * This is the pre-PR branch-policy read. It deliberately uses the Git-scoped
 * endpoint rather than the legacy project policy list, whose `scope` filter
 * does not understand hierarchical repository/ref matching.
 */
export async function listAzureBranchPolicyConfigurations(args: {
  organization: string;
  project: string;
  repositoryId: string;
  refName: string;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzureBranchPolicyConfiguration[]> {
  const organization = args.organization.trim();
  const project = args.project.trim();
  const repositoryId = args.repositoryId.trim();
  const refName = normalizeBranchRef(args.refName);
  if (!organization || !project || !repositoryId || !refName) {
    throw new ToolError("ADO organization, project, repository ID, and target ref are required to read branch policies.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const params = new URLSearchParams({
    repositoryId,
    refName,
    "api-version": "7.1",
  });
  const url = `${adoBase(organization)}/${encodeURIComponent(project)}/_apis/git/policy/configurations?${params.toString()}`;
  const response = await adoFetch(url, auth);
  const data = await parseAdoJson(response, "list branch policy configurations") as {
    value?: BranchPolicyConfigurationPayload[];
  };
  return (data.value ?? [])
    .filter((policy) => !policy.isDeleted)
    .map((policy) => ({
      id: Number(policy.id ?? 0),
      revision: Number(policy.revision ?? 0),
      typeId: policy.type?.id ?? "",
      displayName: policy.type?.displayName ?? "Unnamed policy",
      isEnabled: Boolean(policy.isEnabled),
      isBlocking: Boolean(policy.isBlocking),
    }));
}

export async function listAzurePullRequestPolicyEvaluations(args: {
  organization: string;
  project: string;
  repository: string;
  pullRequestId: string | number;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzurePullRequestPolicyEvaluation[]> {
  const org = args.organization.trim();
  const project = args.project.trim();
  const repository = args.repository.trim();
  const pullRequestId = Number(args.pullRequestId ?? 0);
  if (!org || !project || !repository || !pullRequestId) {
    throw new ToolError("ADO organization, project, repository, and pull request ID are required.");
  }
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const pr = await getAzurePullRequestById({
    organization: org,
    project,
    repository,
    pullRequestId,
    auth,
  });
  const projectArtifactPart = pr.projectId || project;
  const codeReviewId = pr.codeReviewId || pullRequestId;
  const artifactId = `vstfs:///CodeReview/CodeReviewId/${projectArtifactPart}/${codeReviewId}`;
  const params = new URLSearchParams({
    artifactId,
    "api-version": API_VERSION_POLICY,
  });
  const url = `${adoBase(org)}/${encodeURIComponent(project)}/_apis/policy/evaluations?${params.toString()}`;
  const resp = await adoFetch(url, auth);
  const data = await parseAdoJson(resp, "list pull request policy evaluations") as {
    value?: PolicyEvaluationPayload[];
  };
  return (data.value ?? []).map(toPolicyEvaluation);
}

interface PolicyEvaluationPayload {
  evaluationId?: string;
  id?: string;
  status?: string;
  startedDate?: string;
  completedDate?: string;
  configuration?: {
    id?: number;
    isBlocking?: boolean;
    settings?: { displayName?: string };
    type?: { displayName?: string };
  };
}

interface BranchPolicyConfigurationPayload {
  id?: number;
  revision?: number;
  isEnabled?: boolean;
  isBlocking?: boolean;
  isDeleted?: boolean;
  type?: { id?: string; displayName?: string };
}

function normalizeBranchRef(branch: string): string {
  const trimmed = branch.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("refs/") ? trimmed : `refs/heads/${trimmed}`;
}

function toPolicyEvaluation(policy: PolicyEvaluationPayload): AzurePullRequestPolicyEvaluation {
  return {
    id: policy.evaluationId ?? policy.id ?? "",
    status: policy.status ?? "",
    startedDate: policy.startedDate ?? "",
    completedDate: policy.completedDate ?? "",
    displayName: policy.configuration?.settings?.displayName ?? policy.configuration?.type?.displayName ?? "",
    typeName: policy.configuration?.type?.displayName ?? "",
    configurationId: Number(policy.configuration?.id ?? 0),
    isBlocking: Boolean(policy.configuration?.isBlocking ?? false),
  };
}
