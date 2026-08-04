/**
 * Azure DevOps transport for the delivery action runtime.
 *
 * Executes supported action kinds against the real ADO API and re-reads the
 * authoritative artifact afterwards. The daemon supplies a Project Link
 * resolver so the transport never holds credentials or org/project state.
 * Every read may record a canonical snapshot into the delivery graph when a
 * graph store is attached.
 */
import { addAzureWorkItemComment, createAzureWorkItem, linkAzureWorkItemToPullRequest, readAzureWorkItem } from "../ado/workItems.js";
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
  "pull_request.create",
  "pipeline.trigger",
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
    if (record.kind === "pipeline.trigger") {
      return this.executePipelineTrigger(record);
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
      const observation: ArtifactObservation = {
        ref: { ...ref, sourceCommit },
        revision: sourceCommit,
        fields: {
          title: pr.title,
          status: pr.status,
          isDraft: pr.isDraft,
          sourceBranch: pr.sourceBranch,
          targetBranch: pr.targetBranch,
        },
        relations: pr.workItemRefs.map((workItem) => workItem.url),
        correlationIds: [sourceCommit],
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
