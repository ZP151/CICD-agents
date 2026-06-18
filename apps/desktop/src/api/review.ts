import {
  listReviewHistoryLocal,
  mergeReviewQueueItems,
  syncReviewHistoryLocal,
  upsertReviewHistoryLocal,
  type ReviewHistoryRecord,
} from "../reviewHistoryLocal.js";
import {
  appendReviewOperation,
  listReviewOperations,
  type ReviewOperationEvent,
} from "../reviewOperations.js";
import { readLlmConfig, readProjectLinkData } from "./localSettings.js";
import { RUNTIME_URL, messageFromErrorBody } from "./runtime.js";
import type { ReviewQueueItem, ReviewRunResult } from "./pullRequestTypes.js";

export type { ReviewHistoryRecord } from "../reviewHistoryLocal.js";
export { REVIEW_HISTORY_LS_KEY } from "../reviewHistoryLocal.js";

const PROJECT_LINKS_PATH = "/project-links";

export async function fetchProjectLinkReviewQueue(projectLinkId: string): Promise<{
  configured: boolean;
  items: ReviewQueueItem[];
  storage?: "azure" | "local" | "browser";
}> {
  const projectLink = readProjectLinkData(projectLinkId);
  const repoName = typeof projectLink?.["adoRepoName"] === "string" ? projectLink["adoRepoName"] : "";

  try {
    const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/${projectLinkId}/review-queue`);
    if (!r.ok) throw new Error(`${PROJECT_LINKS_PATH}/${projectLinkId}/review-queue HTTP ${r.status}: ${await r.text()}`);
    const body = (await r.json()) as {
      configured: boolean;
      items: ReviewQueueItem[];
      storage?: "azure" | "local";
    };

    if (body.configured) {
      return { configured: true, items: body.items, storage: body.storage ?? "azure" };
    }

    if (body.items.length > 0) syncReviewHistoryLocal(body.items);
    const browserItems = listReviewHistoryLocal(repoName);
    return {
      configured: false,
      items: mergeReviewQueueItems(body.items, browserItems),
      storage: body.items.length > 0 ? "local" : browserItems.length > 0 ? "browser" : "local",
    };
  } catch {
    return {
      configured: false,
      items: listReviewHistoryLocal(repoName),
      storage: "browser",
    };
  }
}

export async function recordProjectLinkReviewHistory(
  projectLinkId: string,
  record: Omit<ReviewHistoryRecord, "repository"> & {
    repository?: string;
  },
): Promise<void> {
  const full = buildReviewHistoryRecord(projectLinkId, record);
  upsertReviewHistoryLocal(full);

  try {
    const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/${projectLinkId}/review-history`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toReviewHistoryPayload(full)),
    });
    if (!r.ok && r.status !== 400) {
      throw new Error(`${PROJECT_LINKS_PATH}/${projectLinkId}/review-history HTTP ${r.status}: ${await r.text()}`);
    }
  } catch {
    // Daemon unreachable: browser copy is enough for this session.
  }
}

export async function recordProjectLinkReviewDisposition(
  projectLinkId: string,
  record: Omit<ReviewHistoryRecord, "repository"> & {
    repository?: string;
  },
  options: { writeBackToAdo?: boolean } = {},
): Promise<ReviewQueueItem | null> {
  const full = buildReviewHistoryRecord(projectLinkId, record);
  upsertReviewHistoryLocal(full);

  try {
    const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/${projectLinkId}/review-disposition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toReviewHistoryPayload(full, {
        writeBackToAdo: options.writeBackToAdo ?? true,
      })),
    });
    if (!r.ok && r.status !== 400) {
      throw new Error(`${PROJECT_LINKS_PATH}/${projectLinkId}/review-disposition HTTP ${r.status}: ${await r.text()}`);
    }
    if (r.ok) {
      const body = (await r.json()) as { record?: ReviewQueueItem };
      if (body.record) {
        upsertReviewHistoryLocal(body.record);
        return body.record;
      }
    }
  } catch {
    // Daemon unreachable: browser copy is enough for this session.
  }
  return null;
}

export async function fetchProjectLinkReviewOperations(projectLinkId: string): Promise<ReviewOperationEvent[]> {
  try {
    const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/${projectLinkId}/review-operations`);
    if (!r.ok) throw new Error(`${PROJECT_LINKS_PATH}/${projectLinkId}/review-operations HTTP ${r.status}: ${await r.text()}`);
    const body = (await r.json()) as { items?: ReviewOperationEvent[] };
    return body.items ?? [];
  } catch {
    return listReviewOperations();
  }
}

export async function recordProjectLinkReviewOperation(
  projectLinkId: string,
  event: Omit<ReviewOperationEvent, "id" | "at" | "actor"> & {
    at?: string;
    actor?: string;
  },
): Promise<ReviewOperationEvent> {
  const local = appendReviewOperation(event);
  try {
    const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/${projectLinkId}/review-operations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: local.kind,
        at: local.at,
        pullRequestId: local.pullRequestId,
        actor: local.actor,
        label: local.label,
        ok: local.ok,
        details: local.details,
      }),
    });
    if (!r.ok) return local;
    const body = (await r.json()) as { record?: ReviewOperationEvent };
    return body.record ?? local;
  } catch {
    return local;
  }
}

export async function runProjectLinkReviewRun(
  projectLinkId: string,
  pullRequestId: number,
  targetBranch: string,
): Promise<ReviewRunResult> {
  const projectLink = readProjectLinkData(projectLinkId);
  const llmConfig = readLlmConfig();

  const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/${projectLinkId}/review-run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pullRequestId,
      targetBranch,
      ...(llmConfig ? { llmConfig } : {}),
      ...(projectLink ? { projectLink } : {}),
    }),
  });

  if (!r.ok) {
    const body = await r.text();
    throw new Error(messageFromErrorBody(`review-run HTTP ${r.status}`, body));
  }

  return (await r.json()) as ReviewRunResult;
}

function buildReviewHistoryRecord(
  projectLinkId: string,
  record: Omit<ReviewHistoryRecord, "repository"> & { repository?: string },
): ReviewHistoryRecord {
  const projectLink = readProjectLinkData(projectLinkId);
  const repository =
    record.repository ??
    (typeof projectLink?.["adoRepoName"] === "string" ? projectLink["adoRepoName"] : "");
  if (!repository.trim()) throw new Error("Project Link has no adoRepoName");
  return { ...record, repository: repository.trim() };
}

function toReviewHistoryPayload(
  full: ReviewHistoryRecord,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    pullRequestId: full.pullRequestId,
    lastIterationId: full.lastIterationId,
    findingCount: full.findingCount,
    lastRunAt: full.lastRunAt,
    sourceCommit: full.sourceCommit,
    decisionQueue: full.decisionQueue,
    decisionRiskLevel: full.decisionRiskLevel,
    decisionReason: full.decisionReason,
    decisionReasonCodes: full.decisionReasonCodes,
    contextConfidence: full.contextConfidence,
    autoApprovedAt: full.autoApprovedAt,
    autoApprovalActor: full.autoApprovalActor,
    discardedFindingCount: full.discardedFindingCount,
    hunkCoverageFiles: full.hunkCoverageFiles,
    wholeFileFallbackFiles: full.wholeFileFallbackFiles,
    changedHunkLines: full.changedHunkLines,
    manualDisposition: full.manualDisposition,
    manualDispositionAt: full.manualDispositionAt,
    manualDispositionActor: full.manualDispositionActor,
    manualDispositionNote: full.manualDispositionNote,
    manualDispositionEvents: full.manualDispositionEvents,
    manualDispositionWriteBackAttempted: full.manualDispositionWriteBackAttempted,
    manualDispositionWriteBackOk: full.manualDispositionWriteBackOk,
    manualDispositionWriteBackError: full.manualDispositionWriteBackError,
    manualDispositionWriteBackAt: full.manualDispositionWriteBackAt,
    manualDispositionWriteBackThreadId: full.manualDispositionWriteBackThreadId,
    manualDispositionWriteBackUrl: full.manualDispositionWriteBackUrl,
    manualDispositionWriteBackEvents: full.manualDispositionWriteBackEvents,
    ...extra,
  };
}
