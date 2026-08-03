/**
 * PipelineTargetResolver (MP-010).
 *
 * Resolves the single pipeline a workflow should act on. ID and name paths
 * are typed: explicit ID, persisted Project Link ID, repository-filtered name
 * discovery, ambiguity must be resolved by the user, and authorization or
 * connector failures are never disguised as "pipeline not found".
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
  | "project_link_id"
  | "name_discovery"
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

    const persistedId = pipelineIdValue(input.projectLink.adoPipelineId);
    if (persistedId !== undefined) {
      return {
        status: "resolved",
        pipelineId: persistedId,
        pipelineName: input.projectLink.adoPipelineName,
        source: "project_link_id",
        message: `Pipeline #${persistedId} from the Project Link`,
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

    const name = input.projectLink.adoPipelineName?.trim();
    try {
      const definitions = await this.discoverDefinitions(input);
      if (!name) {
        if (definitions.length === 0) {
          return {
            status: "not_found",
            source: "none",
            message:
              "No pipeline ID or name is configured on this Project Link, and no pipeline candidates were returned for the current project/repository mapping. Refresh the pipeline list or check the Project Link.",
          };
        }
        return {
          status: "not_found",
          candidates: definitions.map((definition) => ({
            id: definition.id,
            name: definition.name,
            description: definition.description,
          })),
          source: "none",
          message:
            "No pipeline ID or name is configured on this Project Link. Choose one of the discovered candidates below, or refresh the pipeline list.",
        };
      }
      const matches = definitions.filter((definition) => definition.name === name);
      if (matches.length === 1) {
        const match = matches[0]!;
        return {
          status: "resolved",
          pipelineId: match.id,
          pipelineName: match.name,
          source: "name_discovery",
          message: `Resolved pipeline "${name}" as #${match.id} in ${input.projectLink.adoProject}.`,
        };
      }
      if (matches.length > 1) {
        return {
          status: "ambiguous",
          candidates: matches.map((match) => ({
            id: match.id,
            name: match.name,
            description: match.description,
          })),
          source: "name_discovery",
          message: `Multiple pipelines are named "${name}" in ${input.projectLink.adoProject}. Choose the intended one.`,
        };
      }
      return {
        status: "not_found",
        source: "name_discovery",
        message: `No pipeline named "${name}" was found in ${input.projectLink.adoProject}${
          input.projectLink.adoRepoName ? ` / ${input.projectLink.adoRepoName}` : ""
        }. Refresh the pipeline list or check the Project Link mapping.`,
      };
    } catch (err) {
      const diagnostic = adoAuthDiagnosticFromError(err, input.projectLink.adoPat ? "pat" : "oauth");
      if (diagnostic.status === "oauth_unavailable" || diagnostic.status === "oauth_no_org_access" || diagnostic.status === "pat_invalid_or_missing_scope" || diagnostic.status === "user_declined") {
        return {
          status: "unauthorized",
          source: "name_discovery",
          message: diagnostic.message,
        };
      }
      return {
        status: "connector_unavailable",
        source: "name_discovery",
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
