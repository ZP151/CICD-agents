/**
 * Azure DevOps transport for the delivery action runtime.
 *
 * Executes supported action kinds against the real ADO API and re-reads the
 * authoritative artifact afterwards. The daemon supplies a Project Link
 * resolver so the transport never holds credentials or org/project state.
 */
import { addAzureWorkItemComment, readAzureWorkItem } from "../ado/workItems.js";
import { getAzureDevOpsAuth } from "../ado/auth.js";
import { ToolError } from "../tools/executor.js";
import type { ArtifactRef } from "./artifactRef.js";
import type { ActionRecord } from "./actions/actionTypes.js";
import type { ActionTransport, ArtifactObservation, ExecuteOutcome } from "./actions/actionTransport.js";

export interface AdoProjectLinkResolution {
  organization: string;
  project: string;
}

export interface AdoActionTransportOptions {
  resolveProjectLink: (projectLinkId: string) => Promise<AdoProjectLinkResolution>;
  /** Injected auth (tests) or real OAuth/PAT resolution when omitted. */
  auth?: (projectLinkId: string) => Promise<Awaited<ReturnType<typeof getAzureDevOpsAuth>>>;
}

const SUPPORTED_KINDS = new Set(["work_item.comment"]);

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
    return { ok: false, result: undefined, summary: `unsupported kind ${record.kind}` };
  }

  async readArtifact(ref: ArtifactRef): Promise<ArtifactObservation | undefined> {
    if (ref.kind === "work_item") {
      const target = await this.resolveTarget(ref);
      const auth = await this.authFor(ref.projectLinkId);
      try {
        const workItem = await readAzureWorkItem({
          organization: target.organization,
          project: target.project,
          workItemId: ref.id,
          auth,
        });
        return {
          ref: { ...ref, revision: workItem.revision },
          revision: workItem.revision,
          fields: workItem.fields,
          relations: workItem.relations,
          correlationIds: [],
        };
      } catch {
        return undefined;
      }
    }
    return undefined;
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
