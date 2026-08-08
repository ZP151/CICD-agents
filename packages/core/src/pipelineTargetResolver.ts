/**
 * PipelineTargetResolver (MP-010).
 *
 * Resolves the single pipeline a workflow should act on. The canonical paths
 * are typed: an explicit ID wins; otherwise the target is discovered from the
 * mapped ADO repository identity (single match auto-selected, multiple
 * candidates require an explicit user choice). The legacy Project Link
 * pipeline fields are never consulted (GAP-01). Authorization or connector
 * failures are never disguised as "pipeline not found".
 */
import type { AdoAuth } from "./ado/auth.js";
import { adoAuthDiagnosticFromError } from "./ado/diagnostics.js";

export type PipelineTargetStatus =
  | "resolved"
  | "ambiguous"
  | "not_found"
  | "unauthorized"
  | "connector_unavailable"
  | "capability_missing";

export type PipelineTargetSource =
  | "explicit_id"
  | "repository_discovery"
  | "user_selection"
  | "none";

export interface PipelineTargetCandidate {
  id: number;
  name: string;
  description?: string;
}

export interface PipelineTargetResolution {
  status: PipelineTargetStatus;
  pipelineId?: number;
  pipelineName?: string;
  candidates?: PipelineTargetCandidate[];
  source: PipelineTargetSource;
  message: string;
}

export interface PipelineDefinitionLike {
  id: number;
  name: string;
  description?: string;
}

export interface PipelineTargetResolverDeps {
  /** Repository-filtered pipeline discovery (native ADO adapter or MCP). */
  listDefinitions(input: {
    organization: string;
    project: string;
    repositoryId?: string;
    repositoryType?: string;
    auth: AdoAuth;
    top: number;
  }): Promise<PipelineDefinitionLike[]>;
  /**
   * Local capability gate (e.g. MCP pipelines domain allow-list). Return a
   * message when the pipelines domain is unavailable.
   */
  capabilityGate?(): string | undefined;
}

export function pipelineIdValue(value: unknown): number | undefined {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export class PipelineTargetResolver {
  constructor(private readonly deps: PipelineTargetResolverDeps) {}

  async resolve(input: {
    explicitId?: number;
    projectLink: {
      adoOrgUrl: string;
      adoProject: string;
      adoRepoName?: string;
      adoPipelineId?: string;
      adoPipelineName?: string;
      adoPat?: string;
    };
    auth?: AdoAuth;
    top?: number;
  }): Promise<PipelineTargetResolution> {
    const explicitId = pipelineIdValue(input.explicitId);
    if (explicitId !== undefined) {
      return {
        status: "resolved",
        pipelineId: explicitId,
        pipelineName: input.projectLink.adoPipelineName,
        source: "explicit_id",
        message: `Pipeline #${explicitId}`,
      };
    }

    const capabilityMessage = this.deps.capabilityGate?.();
    if (capabilityMessage) {
      return {
        status: "capability_missing",
        source: "none",
        message: capabilityMessage,
      };
    }

    // V2 canonical (GAP-01): the target comes from the repository identity
    // alone. A single definition for the mapped repo is auto-selected;
    // multiple candidates require an explicit user choice; none means not
    // found. The legacy Project Link pipeline fields are never consulted.
    try {
      const definitions = await this.discoverDefinitions(input);
      if (definitions.length === 0) {
        return {
          status: "not_found",
          source: "none",
          message:
            "No pipeline candidates were returned for the current project/repository mapping. Refresh the pipeline list or check the Project Link.",
        };
      }
      if (definitions.length === 1) {
        const match = definitions[0]!;
        return {
          status: "resolved",
          pipelineId: match.id,
          pipelineName: match.name,
          source: "repository_discovery",
          message: `Discovered pipeline #${match.id} (${match.name}) for the mapped repository in ${input.projectLink.adoProject}.`,
        };
      }
      return {
        status: "ambiguous",
        candidates: definitions.map((definition) => ({
          id: definition.id,
          name: definition.name,
          description: definition.description,
        })),
        source: "repository_discovery",
        message: `Multiple pipelines are mapped to this repository in ${input.projectLink.adoProject}. Choose the intended one.`,
      };
    } catch (err) {
      const diagnostic = adoAuthDiagnosticFromError(err, input.projectLink.adoPat ? "pat" : "oauth");
      if (diagnostic.status === "oauth_unavailable" || diagnostic.status === "oauth_no_org_access" || diagnostic.status === "pat_invalid_or_missing_scope" || diagnostic.status === "user_declined") {
        return {
          status: "unauthorized",
          source: "repository_discovery",
          message: diagnostic.message,
        };
      }
      return {
        status: "connector_unavailable",
        source: "repository_discovery",
        message: diagnostic.message,
      };
    }
  }

  private async discoverDefinitions(input: {
    projectLink: {
      adoOrgUrl: string;
      adoProject: string;
      adoRepoName?: string;
    };
    auth?: AdoAuth;
    top?: number;
  }): Promise<PipelineDefinitionLike[]> {
    return this.deps.listDefinitions({
      organization: input.projectLink.adoOrgUrl,
      project: input.projectLink.adoProject,
      repositoryId: input.projectLink.adoRepoName || undefined,
      repositoryType: input.projectLink.adoRepoName ? "TfsGit" : undefined,
      auth: input.auth!,
      top: input.top ?? 20,
    });
  }
}

/** Apply a user selection from an ambiguous result (RA-044 -> RA-047). */
export function pipelineTargetFromSelection(
  resolution: PipelineTargetResolution,
  candidateId: number,
): PipelineTargetResolution {
  const candidate = resolution.candidates?.find((item) => item.id === candidateId);
  if (!candidate) {
    return {
      status: "ambiguous",
      candidates: resolution.candidates,
      source: "user_selection",
      message: "The selected pipeline is no longer in the candidate list. Choose again.",
    };
  }
  return {
    status: "resolved",
    pipelineId: candidate.id,
    pipelineName: candidate.name,
    source: "user_selection",
    message: `Using pipeline #${candidate.id} (${candidate.name}).`,
  };
}
