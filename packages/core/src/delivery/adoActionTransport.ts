/**
 * Azure DevOps transport for the delivery action runtime.
 *
 * Executes supported action kinds against the real ADO API and re-reads the
 * authoritative artifact afterwards. The daemon supplies a Project Link
 * resolver so the transport never holds credentials or org/project state.
 * Every read may record a canonical snapshot into the delivery graph when a
 * graph store is attached.
 */
import { addAzureWorkItemComment, createAzureWorkItem, deleteAzureWorkItem, linkAzureWorkItemToPullRequest, readAzureWorkItem, updateAzureWorkItem } from "../ado/workItems.js";
import { addAzurePullRequestComment, addAzurePullRequestReviewer, updateAzurePullRequest } from "../ado/pullRequestMutations.js";
import { getAzureDevOpsCurrentUser } from "../ado/core.js";
import { API_VERSION_GIT } from "../ado/constants.js";
import { updateAzureDeploymentApproval } from "../ado/environments.js";
import { adoBase, adoFetch } from "../ado/client.js";
import { parseAdoJson } from "../ado/response.js";
import { getAzureDevOpsAuth } from "../ado/auth.js";
import { createAzurePullRequest } from "../ado/pullRequestMutations.js";
import { getAzurePullRequestById } from "../ado/pullRequests.js";
import { readAzureBranchObjectId } from "../ado/refs.js";
import { triggerAzurePipelineRun } from "../ado/pipelines.js";
import { getAzureBuildTimeline, listAzureBuilds } from "../ado/builds.js";
import { ToolError } from "../tools/executor.js";
import type { ArtifactRef } from "./artifactRef.js";
import type { ActionRecord } from "./actions/actionTypes.js";
import type { ActionTransport, ArtifactObservation, ExecuteOutcome } from "./actions/actionTransport.js";
import type { DeliveryGraphStore } from "./snapshotStore.js";
import type { ArtifactSnapshot } from "./observations.js";

export interface AdoProjectLinkResolution {
  organization: string;
  project: string;
}

export interface AdoActionTransportOptions {
  resolveProjectLink: (projectLinkId: string) => Promise<AdoProjectLinkResolution>;
  /** Injected auth (tests) or real OAuth/PAT resolution when omitted. */
  auth?: (projectLinkId: string) => Promise<Awaited<ReturnType<typeof getAzureDevOpsAuth>>>;
  /** When attached, every read records a canonical snapshot (delivery graph). */
  graphStore?: DeliveryGraphStore;
}

const SUPPORTED_KINDS = new Set([
  "work_item.comment",
  "work_item.create",
  "work_item.update",
  "work_item.delete",
  "pull_request.create",
  "pull_request.comment",
  "pull_request.vote",
  "pull_request.update",
  "pipeline.trigger",
  "deployment.approve",
]);

export class AdoActionTransport implements ActionTransport {
  constructor(private readonly options: AdoActionTransportOptions) {}

  async execute(record: ActionRecord): Promise<ExecuteOutcome> {
    if (!SUPPORTED_KINDS.has(record.kind)) {
      return {
        ok: false,
        result: undefined,
        summary: `action kind ${record.kind} is not supported by this transport`,
      };
    }
    if (record.kind === "work_item.comment") {
      return this.executeWorkItemComment(record);
    }
    if (record.kind === "pull_request.create") {
      return this.executePullRequestCreate(record);
    }
    if (record.kind === "work_item.create") {
      return this.executeWorkItemCreate(record);
    }
    if (record.kind === "work_item.update") {
      return this.executeWorkItemUpdate(record);
    }
    if (record.kind === "work_item.delete") {
      return this.executeWorkItemDelete(record);
    }
    if (record.kind === "pull_request.comment") {
      return this.executePullRequestComment(record);
    }
    if (record.kind === "pull_request.vote") {
      return this.executePullRequestVote(record);
    }
    if (record.kind === "pull_request.update") {
      return this.executePullRequestUpdate(record);
    }
    if (record.kind === "pipeline.trigger") {
      return this.executePipelineTrigger(record);
    }
    if (record.kind === "deployment.approve") {
      return this.executeDeploymentApprove(record);
    }
    return { ok: false, result: undefined, summary: `unsupported kind ${record.kind}` };
  }

  async readArtifact(ref: ArtifactRef): Promise<ArtifactObservation | undefined> {
    if (ref.kind === "work_item") {
      return this.readWorkItem(ref);
    }
    if (ref.kind === "pull_request") {
      return this.readPullRequest(ref);
    }
    if (ref.kind === "build") {
      return this.readBuild(ref);
    }
    if (ref.kind === "branch") {
      const target = await this.resolveTarget(ref);
      const auth = await this.authFor(ref.projectLinkId);
      const branch = await readAzureBranchObjectId({
        organization: target.organization,
        project: target.project,
        repository: ref.repositoryId,
        branch: ref.name,
        auth,
      });
      if (!branch) return undefined;
      return {
        ref: { ...ref, objectId: branch.objectId },
        revision: branch.objectId,
        fields: { objectId: branch.objectId },
        relations: [],
        correlationIds: [],
      };
    }
    return undefined;
  }

  private async readWorkItem(ref: Extract<ArtifactRef, { kind: "work_item" }>): Promise<ArtifactObservation | undefined> {
    const target = await this.resolveTarget(ref);
    const auth = await this.authFor(ref.projectLinkId);
    try {
      const workItem = await readAzureWorkItem({
        organization: target.organization,
        project: target.project,
        workItemId: ref.id,
        auth,
      });
      const observation: ArtifactObservation = {
        ref: { ...ref, revision: workItem.revision },
        revision: workItem.revision,
        fields: workItem.fields,
        relations: workItem.relations,
        correlationIds: [],
        comments: workItem.comments,
      };
      await this.recordSnapshot(observation);
      return observation;
    } catch {
      return undefined;
    }
  }

  private async readPullRequest(
    ref: Extract<ArtifactRef, { kind: "pull_request" }>,
  ): Promise<ArtifactObservation | undefined> {
    const target = await this.resolveTarget(ref);
    const auth = await this.authFor(ref.projectLinkId);
    try {
      // Creation targets (id 0) have no current revision; the staleness guard
      // applies to the basedOn branch refs instead, and the runtime resolves
      // the real id from the execution result before verification.
      if (ref.id === 0) return undefined;
      const pr = await getAzurePullRequestById({
        organization: target.organization,
        project: target.project,
        repository: ref.repositoryId,
        pullRequestId: ref.id,
        auth,
        includeWorkItemRefs: true,
      });
      // The authoritative source commit is the current tip of the source
      // branch at re-read time.
      const sourceBranch = await readAzureBranchObjectId({
        organization: target.organization,
        project: target.project,
        repository: ref.repositoryId,
        branch: pr.sourceBranch,
        auth,
      });
      const sourceCommit = sourceBranch?.objectId ?? ref.sourceCommit;
      const currentUser = await getAzureDevOpsCurrentUser({ organization: target.organization, auth }).catch(() => undefined);
      const myVote = currentUser
        ? await readMyVote(pr, currentUser.id, currentUser.displayName)
        : undefined;
      const comments = await readPullRequestComments({
        organization: target.organization,
        project: target.project,
        repository: ref.repositoryId,
        pullRequestId: ref.id,
        auth,
      });
      const observation: ArtifactObservation = {
        ref: { ...ref, sourceCommit },
        revision: sourceCommit,
        fields: {
          title: pr.title,
          status: pr.status,
          isDraft: pr.isDraft,
          sourceBranch: pr.sourceBranch,
          targetBranch: pr.targetBranch,
          ...(myVote !== undefined ? { myVote } : {}),
        },
        relations: pr.workItemRefs.map((workItem) => workItem.url),
        correlationIds: [sourceCommit],
        comments,
      };
      await this.recordSnapshot(observation);
      return observation;
    } catch {
      return undefined;
    }
  }

  private async executeWorkItemComment(record: ActionRecord): Promise<ExecuteOutcome> {
    const target = record.target as Extract<ArtifactRef, { kind: "work_item" }>;
    const resolution = await this.resolveTarget(target);
    const auth = await this.authFor(target.projectLinkId);
    const text = (record.payload as { text?: unknown }).text;
    if (typeof text !== "string" || !text.trim()) {
      return { ok: false, result: undefined, summary: "work_item.comment payload must include a non-empty text" };
    }
    const written = await addAzureWorkItemComment({
      organization: resolution.organization,
      project: resolution.project,
      workItemId: target.id,
      text,
      auth,
    });
    if (!written.ok) {
      return {
        ok: false,
        result: undefined,
        summary: `work item comment rejected by ADO (${written.status_code ?? "unknown"}): ${written.error ?? "no error detail"}`,
      };
    }
    return {
      ok: true,
      result: { commentId: written.commentId, revision: written.revision },
      summary: `comment written to work item ${target.id} (revision ${written.revision ?? "?"})`,
    };
  }

  private async executePullRequestCreate(record: ActionRecord): Promise<ExecuteOutcome> {
    const payload = record.payload as {
      sourceBranch?: unknown;
      targetBranch?: unknown;
      repositoryId?: unknown;
      title?: unknown;
      description?: unknown;
      draft?: unknown;
      workItemId?: unknown;
    };
    const sourceBranch = String(payload.sourceBranch ?? "");
    const targetBranch = String(payload.targetBranch ?? "main");
    const repositoryId = String(payload.repositoryId ?? "");
    const title = String(payload.title ?? "");
    if (!sourceBranch || !title || !repositoryId) {
      return {
        ok: false,
        result: undefined,
        summary: "pull_request.create payload must include sourceBranch, repositoryId, and title",
      };
    }
    const target = record.target as Extract<ArtifactRef, { kind: "pull_request" }>;
    const resolution = await this.resolveTarget(target);
    const auth = await this.authFor(target.projectLinkId);

    const created = await createAzurePullRequest({
      organization: resolution.organization,
      project: resolution.project,
      repository: repositoryId,
      sourceBranch,
      targetBranch,
      title,
      description: payload.description === undefined ? undefined : String(payload.description),
      draft: payload.draft === undefined ? undefined : Boolean(payload.draft),
      auth,
    });
    if (!created.pull_request_id) {
      return { ok: false, result: undefined, summary: "ADO did not return a pull request id" };
    }
    const workItemId = Number(payload.workItemId ?? 0);
    if (workItemId > 0) {
      const linked = await linkAzureWorkItemToPullRequest({
        organization: resolution.organization,
        project: resolution.project,
        repository: repositoryId,
        pullRequestId: created.pull_request_id,
        workItemId,
        auth,
      });
      if (!linked.ok) {
        return {
          ok: false,
          result: { pullRequestId: created.pull_request_id, url: created.url },
          summary: `PR created but work item link failed (${linked.status_code ?? "unknown"}): ${linked.error ?? "no error detail"}`,
        };
      }
    }
    return {
      ok: true,
      result: { pullRequestId: created.pull_request_id, url: created.url, workItemId: workItemId || undefined },
      summary: `PR #${created.pull_request_id} created (${sourceBranch} -> ${targetBranch})`,
    };
  }

  private async executeWorkItemCreate(record: ActionRecord): Promise<ExecuteOutcome> {
    const payload = record.payload as { type?: unknown; title?: unknown; description?: unknown };
    const type = String(payload.type ?? "Task");
    const title = String(payload.title ?? "");
    if (type !== "Task" && type !== "Bug") {
      return { ok: false, result: undefined, summary: "work_item.create payload type must be Task or Bug" };
    }
    if (!title.trim()) {
      return { ok: false, result: undefined, summary: "work_item.create payload must include a title" };
    }
    const target = record.target as Extract<ArtifactRef, { kind: "work_item" }>;
    const resolution = await this.resolveTarget(target);
    const auth = await this.authFor(target.projectLinkId);
    const created = await createAzureWorkItem({
      organization: resolution.organization,
      project: resolution.project,
      type,
      title,
      description: payload.description === undefined ? undefined : String(payload.description),
      auth,
    });
    if (!created.ok || !created.id) {
      return {
        ok: false,
        result: undefined,
        summary: `work item create rejected by ADO (${created.status_code ?? "unknown"}): ${created.error ?? "no error detail"}`,
      };
    }
    return {
      ok: true,
      result: { workItemId: created.id, revision: created.revision },
      summary: `${type} #${created.id} created`,
    };
  }

  private async executePipelineTrigger(record: ActionRecord): Promise<ExecuteOutcome> {
    const payload = record.payload as { pipelineId?: unknown; branch?: unknown };
    const pipelineId = Number(payload.pipelineId ?? 0);
    const branch = String(payload.branch ?? "");
    if (!pipelineId || !branch) {
      return { ok: false, result: undefined, summary: "pipeline.trigger payload must include pipelineId and branch" };
    }
    const target = record.target as Extract<ArtifactRef, { kind: "build" }>;
    const resolution = await this.resolveTarget(target);
    const auth = await this.authFor(target.projectLinkId);
    const triggered = await triggerAzurePipelineRun({
      organization: resolution.organization,
      project: resolution.project,
      pipelineId,
      branch,
      auth,
    });
    if (!triggered.run_id) {
      return {
        ok: false,
        result: undefined,
        summary: "ADO did not return a pipeline run id",
      };
    }
    return {
      ok: true,
      result: { runId: triggered.run_id, name: triggered.name },
      summary: `pipeline #${pipelineId} run ${triggered.run_id} triggered on ${branch}`,
    };
  }

  private async readBuild(ref: Extract<ArtifactRef, { kind: "build" }>): Promise<ArtifactObservation | undefined> {
    const target = await this.resolveTarget(ref);
    const auth = await this.authFor(ref.projectLinkId);
    try {
      const builds = await listAzureBuilds({
        organization: target.organization,
        project: target.project,
        definitions: [ref.definitionId],
        top: 1,
        auth,
      });
      const latest = builds[0];
      if (!latest) return undefined;
      const observation: ArtifactObservation = {
        ref: {
          kind: "build",
          projectLinkId: ref.projectLinkId,
          definitionId: ref.definitionId,
          buildId: latest.id,
        },
        revision: latest.id,
        fields: {
          buildNumber: latest.buildNumber,
          status: latest.status,
          result: latest.result,
          sourceBranch: latest.sourceBranch,
          sourceVersion: latest.sourceVersion,
          definitionName: latest.definitionName,
        },
        relations: [],
        correlationIds: [String(latest.sourceVersion), String(latest.buildNumber)],
      };
      await this.recordSnapshot(observation);
      return observation;
    } catch {
      return undefined;
    }
  }

  private async executeDeploymentApprove(record: ActionRecord): Promise<ExecuteOutcome> {
    const payload = record.payload as { approvalId?: unknown; status?: unknown; comment?: unknown };
    const approvalId = Number(payload.approvalId ?? 0);
    const status = String(payload.status ?? "");
    if (!approvalId || (status !== "approved" && status !== "rejected")) {
      return {
        ok: false,
        result: undefined,
        summary: "deployment.approve payload must include approvalId and status (approved|rejected)",
      };
    }
    const target = record.target as Extract<ArtifactRef, { kind: "deployment" }>;
    const resolution = await this.resolveTarget(target);
    const auth = await this.authFor(target.projectLinkId);
    const updated = await updateAzureDeploymentApproval({
      organization: resolution.organization,
      project: resolution.project,
      approvalId,
      status,
      comment: payload.comment === undefined ? undefined : String(payload.comment),
      auth,
    });
    if (!updated.ok) {
      return {
        ok: false,
        result: undefined,
        summary: `deployment approval rejected by ADO (${updated.status_code ?? "unknown"}): ${updated.error ?? "no error detail"}`,
      };
    }
    return {
      ok: true,
      result: { approvalId, status: updated.status },
      summary: `deployment approval ${approvalId} set to ${status}`,
    };
  }

  private async executePullRequestUpdate(record: ActionRecord): Promise<ExecuteOutcome> {
    const payload = record.payload as { repositoryId?: unknown; pullRequestId?: unknown; status?: unknown };
    const repositoryId = String(payload.repositoryId ?? "");
    const pullRequestId = Number(payload.pullRequestId ?? 0);
    const status = String(payload.status ?? "");
    if (!repositoryId || !pullRequestId || (status !== "active" && status !== "abandoned")) {
      return {
        ok: false,
        result: undefined,
        summary: "pull_request.update payload must include repositoryId, pullRequestId, and status (active|abandoned)",
      };
    }
    const target = record.target as Extract<ArtifactRef, { kind: "pull_request" }>;
    const resolution = await this.resolveTarget(target);
    const auth = await this.authFor(target.projectLinkId);
    const updated = await updateAzurePullRequest({
      organization: resolution.organization,
      project: resolution.project,
      repository: repositoryId,
      pullRequestId,
      status,
      auth,
    });
    if (!updated.id) {
      return { ok: false, result: undefined, summary: "ADO did not confirm the PR update" };
    }
    return {
      ok: true,
      result: { pullRequestId, status: updated.status },
      summary: `PR #${pullRequestId} set to ${status}`,
    };
  }

  private async executeWorkItemUpdate(record: ActionRecord): Promise<ExecuteOutcome> {
    const payload = record.payload as { fields?: Record<string, unknown> };
    const fields = payload.fields ?? {};
    const entries = Object.entries(fields).filter(([, value]) => value !== undefined && value !== "");
    if (entries.length === 0) {
      return { ok: false, result: undefined, summary: "work_item.update payload must include fields" };
    }
    const target = record.target as Extract<ArtifactRef, { kind: "work_item" }>;
    const resolution = await this.resolveTarget(target);
    const auth = await this.authFor(target.projectLinkId);
    const updated = await updateAzureWorkItem({
      organization: resolution.organization,
      project: resolution.project,
      workItemId: target.id,
      fields: Object.fromEntries(entries) as Record<string, string | number | boolean>,
      auth,
    });
    if (!updated.ok || !updated.id) {
      return {
        ok: false,
        result: undefined,
        summary: `work item update rejected by ADO (${updated.status_code ?? "unknown"}): ${updated.error ?? "no error detail"}`,
      };
    }
    return {
      ok: true,
      result: { workItemId: updated.id, revision: updated.revision },
      summary: `work item ${updated.id} updated to revision ${updated.revision ?? "?"} (${entries.map(([key]) => key).join(", ")})`,
    };
  }

  private async executeWorkItemDelete(record: ActionRecord): Promise<ExecuteOutcome> {
    const target = record.target as Extract<ArtifactRef, { kind: "work_item" }>;
    const resolution = await this.resolveTarget(target);
    const auth = await this.authFor(target.projectLinkId);
    const deleted = await deleteAzureWorkItem({
      organization: resolution.organization,
      project: resolution.project,
      workItemId: target.id,
      auth,
    });
    if (!deleted.ok) {
      return {
        ok: false,
        result: undefined,
        summary: `work item delete rejected by ADO (${deleted.status_code ?? "unknown"}): ${deleted.error ?? "no error detail"}`,
      };
    }
    return {
      ok: true,
      result: { workItemId: target.id },
      summary: `work item ${target.id} deleted`,
    };
  }

  private async executePullRequestComment(record: ActionRecord): Promise<ExecuteOutcome> {
    const payload = record.payload as { repositoryId?: unknown; pullRequestId?: unknown; content?: unknown };
    const repositoryId = String(payload.repositoryId ?? "");
    const pullRequestId = Number(payload.pullRequestId ?? 0);
    const content = String(payload.content ?? "");
    if (!repositoryId || !pullRequestId || !content.trim()) {
      return { ok: false, result: undefined, summary: "pull_request.comment payload must include repositoryId, pullRequestId, and content" };
    }
    const target = record.target as Extract<ArtifactRef, { kind: "pull_request" }>;
    const resolution = await this.resolveTarget(target);
    const auth = await this.authFor(target.projectLinkId);
    const written = await addAzurePullRequestComment({
      organization: resolution.organization,
      project: resolution.project,
      repository: repositoryId,
      pullRequestId,
      content,
      auth,
    });
    if (!written.ok) {
      return {
        ok: false,
        result: undefined,
        summary: `PR comment rejected by ADO (${written.status_code ?? "unknown"}): ${written.error ?? "no error detail"}`,
      };
    }
    return {
      ok: true,
      result: { threadId: written.threadId, commentId: written.commentId },
      summary: `comment posted on PR #${pullRequestId} (thread ${written.threadId ?? "?"})`,
    };
  }

  private async executePullRequestVote(record: ActionRecord): Promise<ExecuteOutcome> {
    const payload = record.payload as { repositoryId?: unknown; pullRequestId?: unknown; vote?: unknown; reviewerId?: unknown };
    const repositoryId = String(payload.repositoryId ?? "");
    const pullRequestId = Number(payload.pullRequestId ?? 0);
    const voteName = String(payload.vote ?? "");
    const voteValue: Record<string, number> = { approve: 10, wait: -5, reject: -10, reset: 0 };
    const vote = voteValue[voteName];
    if (!repositoryId || !pullRequestId || vote === undefined) {
      return {
        ok: false,
        result: undefined,
        summary: "pull_request.vote payload must include repositoryId, pullRequestId, and vote (approve|wait|reject|reset)",
      };
    }
    const target = record.target as Extract<ArtifactRef, { kind: "pull_request" }>;
    const resolution = await this.resolveTarget(target);
    const auth = await this.authFor(target.projectLinkId);
    let reviewerId = String(payload.reviewerId ?? "");
    if (!reviewerId) {
      const me = await getAzureDevOpsCurrentUser({ organization: resolution.organization, auth });
      if (!me?.id) {
        return { ok: false, result: undefined, summary: "could not resolve the authenticated reviewer id" };
      }
      reviewerId = me.id;
    }
    const voted = await addAzurePullRequestReviewer({
      organization: resolution.organization,
      project: resolution.project,
      repository: repositoryId,
      pullRequestId,
      reviewerId,
      vote,
      auth,
    });
    if (!voted.pullRequestId) {
      return { ok: false, result: undefined, summary: "ADO did not confirm the reviewer vote" };
    }
    return {
      ok: true,
      result: { reviewerId, vote: voteName },
      summary: `vote ${voteName} recorded on PR #${pullRequestId}`,
    };
  }

  private async recordSnapshot(observation: ArtifactObservation): Promise<void> {
    if (!this.options.graphStore) return;
    const snapshot: ArtifactSnapshot = {
      ref: observation.ref,
      projectLinkId: observation.ref.projectLinkId,
      observedAt: Date.now(),
      source: "poll",
      fields: observation.fields,
      relations: observation.relations,
    };
    try {
      await this.options.graphStore.upsertSnapshot(snapshot);
    } catch {
      // Snapshot recording is observational; a store failure must not break reads.
    }
  }

  private async resolveTarget(ref: ArtifactRef): Promise<AdoProjectLinkResolution> {
    const resolution = await this.options.resolveProjectLink(ref.projectLinkId);
    if (!resolution.organization.trim() || !resolution.project.trim()) {
      throw new ToolError(`project link ${ref.projectLinkId} does not resolve to an ADO org/project`);
    }
    return resolution;
  }

  private async authFor(projectLinkId: string) {
    if (this.options.auth) return this.options.auth(projectLinkId);
    return getAzureDevOpsAuth();
  }
}

async function readMyVote(
  pr: Awaited<ReturnType<typeof getAzurePullRequestById>>,
  userId: string,
  displayName: string,
): Promise<string | undefined> {
  const reviewers = pr.reviewerDetails ?? [];
  const match = reviewers.find((reviewer) =>
    reviewer.id === userId
    || (reviewer.displayName?.trim() ?? "").toLowerCase() === displayName.toLowerCase(),
  );
  if (!match || match.vote === undefined) return undefined;
  if (match.vote === 10) return "approved";
  if (match.vote === -5) return "rejected";
  if (match.vote === -10) return "waiting";
  if (match.vote === 0) return "no_vote";
  return String(match.vote);
}

async function readPullRequestComments(args: {
  organization: string;
  project: string;
  repository: string;
  pullRequestId: number;
  auth: Awaited<ReturnType<typeof getAzureDevOpsAuth>>;
}): Promise<string[]> {
  try {
    const url =
      `${adoBase(args.organization)}/${encodeURIComponent(args.project)}/_apis/git/repositories/` +
      `${encodeURIComponent(args.repository)}/pullRequests/${args.pullRequestId}/threads?api-version=${API_VERSION_GIT}`;
    const resp = await adoFetch(url, args.auth);
    if (!resp.ok) return [];
    const body = await parseAdoJson(resp, "list pull request threads") as {
      value?: Array<{ comments?: Array<{ content?: string }> }>;
    };
    return (body.value ?? [])
      .flatMap((thread) => thread.comments ?? [])
      .map((comment) => String(comment.content ?? ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}
