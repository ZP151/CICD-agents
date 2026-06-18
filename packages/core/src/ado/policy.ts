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
