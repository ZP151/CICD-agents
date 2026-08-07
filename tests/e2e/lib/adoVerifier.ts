/**
 * GAP-03 verifier: reads the latest ClaimBot_API pipeline #117 run through
 * MergePilot's own daemon (read-only `inspect_pipeline` workflow action)
 * instead of shelling out to `az devops invoke`, whose CLI keyring is broken
 * on this machine.
 *
 * Constraints honored:
 * - uses the app's own Microsoft ADO auth and core ADO client — no credential
 *   files are read, no tokens are duplicated, no unauthenticated test backdoor
 *   exists, and nothing asks the user for credentials;
 * - read-only: `inspect_pipeline` lists the last 10 runs and renders a failure
 *   timeline; it never creates an approval proposal, never queues a run, and
 *   never creates a chat session (MP-006);
 * - stage-tagged errors so a failing run reports which layer broke:
 *   [fixture-discovery] / [app-auth] / [ado-read] / [unexpected].
 *
 * The pure parsing/classification functions below are unit-tested in
 * `adoVerifier.test.ts`; the request wrapper is exercised by the live E2E.
 */
import type { APIRequestContext } from "@playwright/test";

/** One run as serialized by the daemon's `ado_list_pipeline_runs` tool
 * (core `AzurePipelineRunSummary`). */
export interface AdoPipelineRunSummary {
  id: number;
  name: string;
  state: string;
  result: string;
  createdDate: string;
  finishedDate: string;
  sourceBranch: string;
  url: string;
}

export type DaemonReadStage = "fixture-discovery" | "app-auth" | "ado-read" | "unexpected";

export interface DaemonReadFailure {
  stage: DaemonReadStage;
  detail: string;
}

/** The shape of a `POST /chat/workflow-action` response we rely on. */
export interface InspectPipelineBody {
  ok?: boolean;
  summary?: string;
  workflowState?: {
    workflowPhase?: string;
    authStatus?: string;
    authMessage?: string;
    retryable?: boolean;
  };
  tools?: Array<{ name?: string; stdout?: string }>;
}

const REQUIRED_RUN_FIELDS = [
  "name",
  "state",
  "result",
  "createdDate",
  "finishedDate",
  "sourceBranch",
  "url",
] as const;

function isAdoPipelineRunSummary(run: unknown): run is AdoPipelineRunSummary {
  if (!run || typeof run !== "object") return false;
  const record = run as Record<string, unknown>;
  return Number.isFinite(record.id) && REQUIRED_RUN_FIELDS.every((field) => typeof record[field] === "string");
}

/** Extract the run list from the daemon's `inspect_pipeline` result body.
 *  Runs live in the `ado_list_pipeline_runs` tool's redacted stdout:
 *  `JSON.stringify({ pipelineId, runs, count })`. */
export function extractPipelineRunsFromInspectResult(body: unknown): AdoPipelineRunSummary[] {
  if (!body || typeof body !== "object") return [];
  const record = body as InspectPipelineBody;
  const listTool = record.tools?.find((tool) => tool.name === "ado_list_pipeline_runs");
  if (!listTool?.stdout) return [];
  try {
    const parsed = JSON.parse(listTool.stdout) as { runs?: unknown };
    if (!Array.isArray(parsed.runs)) return [];
    return parsed.runs.filter(isAdoPipelineRunSummary);
  } catch {
    return [];
  }
}

/** Pipeline run ids are monotonically increasing per pipeline: the latest run
 *  is the one with the highest id, regardless of API ordering. */
export function pickLatestPipelineRun(
  runs: AdoPipelineRunSummary[],
): AdoPipelineRunSummary | undefined {
  return runs.reduce<AdoPipelineRunSummary | undefined>(
    (latest, run) => (!latest || run.id > latest.id ? run : latest),
    undefined,
  );
}

/** Classify a failed `inspect_pipeline` response into the layer that broke.
 *  The daemon maps its own ADO auth failures to HTTP 401/400 with
 *  `workflowState.workflowPhase === "auth_required"`; everything else is an
 *  ADO read failure. */
export function classifyInspectFailure(httpStatus: number, body: unknown): DaemonReadFailure {
  const record = (body && typeof body === "object" ? body : {}) as InspectPipelineBody;
  const authPhase = record.workflowState?.workflowPhase === "auth_required";
  if (authPhase || httpStatus === 401) {
    return {
      stage: "app-auth",
      detail:
        `HTTP ${httpStatus} ` +
        `authStatus=${record.workflowState?.authStatus ?? "unknown"} ` +
        `authMessage=${record.workflowState?.authMessage ?? record.summary ?? "unauthorized"}`,
    };
  }
  if (httpStatus >= 400) {
    return {
      stage: "ado-read",
      detail: `HTTP ${httpStatus}: ${record.summary ?? "workflow action failed"}`,
    };
  }
  return { stage: "unexpected", detail: `HTTP ${httpStatus} without a recognized failure shape` };
}

/** Stable ADO repository identity as stored on a Project Link (V2 fields). */
export interface DaemonProjectLinkIdentity {
  id: string;
  name: string;
  repoPath: string;
  adoOrgUrl: string;
  adoProject: string;
  adoRepoName: string;
}

/**
 * Read the latest ClaimBot_API pipeline #117 run through the daemon's own
 * authenticated ADO client. Read-only: never triggers the pipeline, never
 * creates a chat session or turn, never writes anything.
 */
export async function latestClaimBotPipelineRunViaDaemon(
  request: APIRequestContext,
  daemonUrl: string,
  projectLinkId: string,
): Promise<AdoPipelineRunSummary> {
  // Pre-read the Project Link identity the fixture just created.
  const linkResponse = await request.get(`${daemonUrl}/project-links/${projectLinkId}`);
  if (!linkResponse.ok()) {
    throw new Error(
      `[fixture-discovery] project link ${projectLinkId} not readable: HTTP ${linkResponse.status()}.`,
    );
  }
  const projectLink = (await linkResponse.json()) as DaemonProjectLinkIdentity;
  if (
    !projectLink?.repoPath ||
    !projectLink.adoOrgUrl ||
    !projectLink.adoProject ||
    !projectLink.adoRepoName
  ) {
    throw new Error(
      `[fixture-discovery] project link ${projectLinkId} lacks the stable ADO repository identity.`,
    );
  }

  let response: Awaited<ReturnType<APIRequestContext["post"]>>;
  try {
    response = await request.post(`${daemonUrl}/chat/workflow-action`, {
      data: {
        action: "inspect_pipeline",
        repoPath: projectLink.repoPath,
        projectLinkId: projectLink.id,
        // ClaimBot_API fixture pipeline: the GAP-04 proof target, never #108.
        pipelineId: 117,
        // V2 stable identity only (GAP-01): legacy pipeline fields never travel
        // in an API payload.
        projectLink: {
          id: projectLink.id,
          name: projectLink.name,
          repoPath: projectLink.repoPath,
          adoOrgUrl: projectLink.adoOrgUrl,
          adoProject: projectLink.adoProject,
          adoRepoName: projectLink.adoRepoName,
        },
      },
    });
  } catch (error) {
    throw new Error(`[app-auth] daemon workflow-action request failed: ${String(error)}`);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok()) {
    const failure = classifyInspectFailure(response.status(), body);
    throw new Error(`[${failure.stage}] inspect_pipeline failed: ${failure.detail}`);
  }
  const latest = pickLatestPipelineRun(extractPipelineRunsFromInspectResult(body));
  if (!latest) {
    throw new Error("[ado-read] inspect_pipeline succeeded but returned no pipeline runs.");
  }
  return latest;
}
