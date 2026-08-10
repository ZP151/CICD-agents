import { useCallback, useEffect, useState } from "react";
import { useAppData } from "../App.js";
import { RUNTIME_URL, messageFromErrorResponse } from "../api/runtime.js";
import { resolveActiveProjectLink } from "../projectLinks.js";
import {
  approveDeliveryAction,
  proposeDeliveryAction,
  rejectDeliveryAction,
  type DeliveryActionRecord,
} from "../api/delivery.js";
import {
  ActionButton,
  ActionLink,
  InlineNotice,
  WorkbenchFilterTabs,
  WorkbenchPage,
  WorkbenchSkeleton,
} from "../components/workbench/WorkbenchPrimitives.js";

interface WorkItemView {
  id: number;
  type: string;
  title: string;
  state: string;
  revision: number;
  iterationPath?: string;
  description?: string;
  acceptanceCriteria?: string;
  comments: string[];
  drift: Array<{ kind: string; evidence: string[]; followUp: string; question: boolean }>;
}

const DRIFT_LABELS: Record<string, string> = {
  merged_but_active: "Merged but active",
  ci_failing_without_comment: "CI failing, no comment",
  done_but_incomplete: "Done but incomplete",
  active_without_evidence: "Active without evidence",
  acceptance_criteria_mismatch: "Acceptance criteria mismatch",
  child_crosses_iteration: "Child crosses iteration",
};

const VIEWS = [
  { key: "all", label: "Assigned to me" },
  { key: "ready", label: "Ready" },
  { key: "blocked", label: "Blocked" },
];

export function azureWorkItemUrl(
  projectLink: { adoOrgUrl?: string; adoProject?: string } | null | undefined,
  workItemId: number,
): string | null {
  const organization = projectLink?.adoOrgUrl?.trim().replace(/\/+$/, "") ?? "";
  const project = projectLink?.adoProject?.trim() ?? "";
  if (!organization || !project || !workItemId) return null;
  return `${organization}/${encodeURIComponent(project)}/_workitems/edit/${workItemId}`;
}

export function deliveryActionSummary(action: DeliveryActionRecord): string {
  const payload = action.payload as Record<string, unknown>;
  if (action.kind === "work_item.comment") {
    const text = deliveryActionCommentText(action);
    return text ? `Add this update: ${text}` : "Add a work item update";
  }
  if (action.kind === "work_item.update") {
    const fields = payload.fields;
    if (fields && typeof fields === "object") {
      const nextState = (fields as Record<string, unknown>)["System.State"];
      if (typeof nextState === "string" && nextState.trim()) return `Set the work item state to ${nextState.trim()}`;
    }
    return "Update the work item";
  }
  return action.kind;
}

export function deliveryActionCommentText(action: Pick<DeliveryActionRecord, "payload">): string {
  const text = (action.payload as Record<string, unknown>).text;
  return typeof text === "string" ? text.trim() : "";
}

export function deliveryActionBelongsToProjectLink(
  action: Pick<DeliveryActionRecord, "target">,
  projectLinkId: string,
): boolean {
  return Boolean(projectLinkId) && action.target.projectLinkId === projectLinkId;
}

export function deliveryActionTargetWorkItemId(action: Pick<DeliveryActionRecord, "target">): number | null {
  const id = Number(action.target.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function WorkItemLoadingState(): JSX.Element {
  return (
    <div className="space-y-2" role="status">
      <p className="text-xs text-[rgb(var(--app-text-subtle))]">Loading work items…</p>
      <WorkbenchSkeleton rows={3} />
    </div>
  );
}

/**
 * Work workspace (Cycle 04). Projection of ADO work items plus delivery
 * evidence; drift findings are deterministic and every write-back runs
 * through the verified action runtime with a revision check.
 */
export default function Work(): JSX.Element {
  const { projectLinks, projectLinksLoading } = useAppData();
  const activeProjectLink = resolveActiveProjectLink(projectLinks);
  const projectLinkId = activeProjectLink?.id ?? "";
  const [items, setItems] = useState<WorkItemView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; configurationRequired: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState("all");
  const [action, setAction] = useState<DeliveryActionRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [pendingIntent, setPendingIntent] = useState<"comment" | "state" | null>(null);

  // A work-item approval is scoped to the Project Link used to prepare it.
  // Context may change without unmounting this route, so discard projected
  // work and unapproved state before the newly selected link is fetched.
  useEffect(() => {
    setItems([]);
    setError(null);
    setAction(null);
    setActionError(null);
    setSelectedItemId(null);
    setCommentDraft("");
    setPendingIntent(null);
  }, [projectLinkId]);

  useEffect(() => {
    if (!projectLinkId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${RUNTIME_URL}/delivery/work-items?projectLinkId=${encodeURIComponent(projectLinkId)}`)
      .then(async (response) => {
        if (!response.ok) {
          const message = await messageFromErrorResponse("Work items could not be loaded.", response);
          throw Object.assign(new Error(message), { status: response.status });
        }
        return response.json() as Promise<{ workItems: WorkItemView[] }>;
      })
      .then((data) => {
        if (!cancelled) {
          setItems(data.workItems);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const status = err && typeof err === "object" && "status" in err
            ? Number((err as { status?: unknown }).status)
            : 0;
          setError({
            message: err instanceof Error ? err.message : String(err),
            configurationRequired: status === 422,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectLinkId, reloadKey]);

  const visibleItems = items.filter((item) => {
    if (view === "blocked") return item.drift.some((finding) => !finding.question);
    if (view === "ready") return item.drift.length === 0 || item.drift.every((finding) => finding.question);
    return true;
  });
  const visibleAction = action && deliveryActionBelongsToProjectLink(action, projectLinkId) ? action : null;

  const writeBack = useCallback(async (item: WorkItemView, kind: "comment" | "state", commentText?: string) => {
    setActionBusy(true);
    setActionError(null);
    setAction(null);
    try {
      const text = commentText?.trim() ?? "";
      if (kind === "comment" && !text) {
        setActionError("Write a concise progress update before requesting approval.");
        return;
      }
      const RUN_ID = Date.now().toString(36);
      const proposal =
        kind === "comment"
          ? {
              turnId: "work-workspace",
              projectLinkId,
              kind: "work_item.comment",
              target: { kind: "work_item", projectLinkId, id: item.id, revision: item.revision },
              basedOn: [{ kind: "work_item", projectLinkId, id: item.id, revision: item.revision }],
              payload: { text },
              risk: "low",
              reason: "Record the verified progress update on the work item",
              expectedResult: [
                { artifact: { kind: "work_item", projectLinkId, id: item.id, revision: item.revision + 1 }, condition: "revision_gt", expectedRevision: item.revision },
                { artifact: { kind: "work_item", projectLinkId, id: item.id, revision: item.revision + 1 }, condition: "comment_contains", expected: text },
              ],
              idempotencyKey: `work-comment-${item.id}-${RUN_ID}`,
              expiresAt: Date.now() + 3_600_000,
            }
          : {
              turnId: "work-workspace",
              projectLinkId,
              kind: "work_item.update",
              target: { kind: "work_item", projectLinkId, id: item.id, revision: item.revision },
              basedOn: [{ kind: "work_item", projectLinkId, id: item.id, revision: item.revision }],
              payload: { fields: { "System.State": "In Progress" } },
              risk: "medium",
              reason: "Transition the work item with a revision check",
              expectedResult: [
                { artifact: { kind: "work_item", projectLinkId, id: item.id, revision: item.revision + 1 }, condition: "revision_gt", expectedRevision: item.revision },
                { artifact: { kind: "work_item", projectLinkId, id: item.id, revision: item.revision + 1 }, condition: "field_eq", field: "System.State", expected: "In Progress" },
              ],
              idempotencyKey: `work-state-${item.id}-${RUN_ID}`,
              expiresAt: Date.now() + 3_600_000,
            };
      const record = await proposeDeliveryAction(proposal);
      setAction(record);
      setPendingIntent(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  }, [projectLinkId]);

  const approve = useCallback(async () => {
    if (!action) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const record = await approveDeliveryAction(action.id);
      setAction(record);
      if (record.status === "verified") {
        setItems((prev) => prev.map((item) => item.id === Number((record.target as { id?: number }).id ?? 0)
          ? {
              ...item,
              revision: item.revision + 1,
              state: record.kind === "work_item.update" ? "In Progress" : item.state,
              comments: record.kind === "work_item.comment"
                ? [...item.comments, deliveryActionCommentText(record)].filter(Boolean).slice(-3)
                : item.comments,
            }
          : item));
        setCommentDraft("");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  }, [action]);

  const reject = useCallback(async () => {
    if (!action) return;
    setActionBusy(true);
    setActionError(null);
    try {
      setAction(await rejectDeliveryAction(action.id));
      setPendingIntent(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  }, [action]);

  const approvalTargetId = visibleAction ? deliveryActionTargetWorkItemId(visibleAction) : null;
  const approvalTarget = approvalTargetId === null
    ? null
    : items.find((item) => item.id === approvalTargetId) ?? null;

  return (
    <WorkbenchPage className="mx-auto w-full max-w-4xl px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[rgb(var(--app-text))]">Work</h1>
          <p className="mt-1 text-xs text-[rgb(var(--app-text-muted))]">
            Review Azure Boards tasks, their delivery signals, and recent updates before proposing a write-back.
          </p>
        </div>
        {projectLinksLoading ? (
          <p className="text-xs text-[rgb(var(--app-text-subtle))]">Loading Project Links...</p>
        ) : activeProjectLink ? (
          <p className="text-xs text-[rgb(var(--app-text-muted))]">
            Project Link:{" "}
            <span className="font-medium text-[rgb(var(--app-text))]">{activeProjectLink.name}</span>
            {" "}(selected in Context)
          </p>
        ) : (
          <p className="text-xs text-[rgb(var(--app-text-subtle))]">Select a Project Link in Context</p>
        )}
      </div>

      {error && (
        <div className="mt-3">
          <InlineNotice tone="danger" title={error.configurationRequired ? "Finish this Project Link setup" : "Work load failed"}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{error.message}</span>
              <span className="flex shrink-0 items-center gap-2">
                {error.configurationRequired && <ActionLink href="#/project-links" tone="secondary">Manage Project Links</ActionLink>}
                <ActionButton type="button" tone="quiet" onClick={() => setReloadKey((value) => value + 1)}>
                  Retry
                </ActionButton>
              </span>
            </div>
          </InlineNotice>
        </div>
      )}
      {actionError && <div className="mt-3"><InlineNotice tone="danger" title="Action failed">{actionError}</InlineNotice></div>}
      {visibleAction && !["verified", "rejected", "failed", "stale", "cancelled"].includes(visibleAction.status) && (
        <div data-approval-style="compact" className="mt-3 rounded-lg border border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft))] px-3 py-3">
          <p className="text-xs font-semibold text-[rgb(var(--app-text))]">Review before running</p>
          <p className="mt-1 text-xs leading-5 text-[rgb(var(--app-warning))]">
            {approvalTarget
              ? `#${approvalTarget.id} ${approvalTarget.title} — ${deliveryActionSummary(visibleAction)}`
              : deliveryActionSummary(visibleAction)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ActionButton type="button" tone="primary" onClick={() => void approve()} disabled={actionBusy}>
              Approve and run
            </ActionButton>
            <ActionButton type="button" tone="secondary" onClick={() => void reject()} disabled={actionBusy}>
              Skip action
            </ActionButton>
          </div>
        </div>
      )}
      {visibleAction && visibleAction.status === "verified" && (
        <div className="mt-3"><InlineNotice tone="success" title="Verified">{visibleAction.kind} verified against Azure DevOps.</InlineNotice></div>
      )}

      {projectLinkId && (
        <div className="mt-4">
          <WorkbenchFilterTabs
            ariaLabel="Work views"
            options={VIEWS.map((option) => ({ value: option.key, label: option.label }))}
            value={view}
            onValueChange={setView}
          />
          <div className="mt-3 space-y-2">
            {loading && <WorkItemLoadingState />}
            {!loading && !error && visibleItems.length === 0 && (
              <p className="text-xs text-[rgb(var(--app-text-subtle))]">No work items in this view.</p>
            )}
            {visibleItems.map((item) => (
              <div key={item.id} className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      setSelectedItemId((current) => current === item.id ? null : item.id);
                      setPendingIntent(null);
                      setCommentDraft("");
                    }}
                    aria-expanded={selectedItemId === item.id}
                    aria-label={`Open work item #${item.id}: ${item.title}`}
                  >
                    <p className="truncate text-sm font-medium text-[rgb(var(--app-text))]" title={item.title}>{item.title}</p>
                    <p className="mt-0.5 text-xs text-[rgb(var(--app-text-muted))]">
                      #{item.id} · {item.type} · {item.state} · rev {item.revision}
                      {item.iterationPath ? ` · ${item.iterationPath}` : ""}
                    </p>
                  </button>
                  <ActionButton type="button" tone="quiet" onClick={() => setSelectedItemId((current) => current === item.id ? null : item.id)}>
                    {selectedItemId === item.id ? "Close" : "Open"}
                  </ActionButton>
                </div>
                {item.drift.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-[rgb(var(--app-border))] pt-2">
                    {item.drift.map((finding) => (
                      <li key={finding.kind} className="text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
                        <span className="font-medium text-[rgb(var(--app-warning))]">{DRIFT_LABELS[finding.kind] ?? finding.kind}</span>
                        {finding.question ? " (question)" : ""} — {finding.followUp}
                      </li>
                    ))}
                  </ul>
                )}
                {selectedItemId === item.id && (
                  <div className="mt-3 border-t border-[rgb(var(--app-border))] pt-3">
                    {azureWorkItemUrl(activeProjectLink, item.id) && (
                      <a
                        href={azureWorkItemUrl(activeProjectLink, item.id) ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="mb-3 inline-flex text-xs font-medium text-[rgb(var(--app-accent-readable))] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-focus))]/45"
                      >
                        Open source task in Azure DevOps
                      </a>
                    )}
                    <div className="grid gap-3 text-xs text-[rgb(var(--app-text-muted))] sm:grid-cols-2">
                      <div>
                        <p className="font-medium text-[rgb(var(--app-text))]">Task detail</p>
                        <p className="mt-1 leading-relaxed">{item.description?.trim() || "No description is available from Azure Boards for this work item."}</p>
                      </div>
                      <div>
                        <p className="font-medium text-[rgb(var(--app-text))]">Acceptance criteria</p>
                        <p className="mt-1 leading-relaxed">{item.acceptanceCriteria?.trim() || "No acceptance criteria are available."}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 text-xs text-[rgb(var(--app-text-muted))] sm:grid-cols-2">
                      <div>
                        <p className="font-medium text-[rgb(var(--app-text))]">Recent updates</p>
                        {item.comments.length > 0 ? (
                          <ul className="mt-1 space-y-1 leading-relaxed">
                            {item.comments.map((comment, index) => <li key={`${item.id}-comment-${index}`}>• {comment}</li>)}
                          </ul>
                        ) : <p className="mt-1">No recent comments.</p>}
                      </div>
                      <div>
                        <p className="font-medium text-[rgb(var(--app-text))]">Propose a change</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <ActionButton type="button" tone="secondary" onClick={() => setPendingIntent("comment")} disabled={actionBusy}>Add update</ActionButton>
                          <ActionButton type="button" tone="secondary" onClick={() => setPendingIntent("state")} disabled={actionBusy || item.state === "In Progress"}>Move to In Progress</ActionButton>
                        </div>
                      </div>
                    </div>
                    {pendingIntent === "comment" && (
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <label className="min-w-[min(16rem,100%)] flex-1 text-xs text-[rgb(var(--app-text-muted))]">
                          Verified update
                          <textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} rows={2} className="mt-1 w-full rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2 py-1.5 text-sm text-[rgb(var(--app-text))]" placeholder="What changed, and what evidence supports it?" />
                        </label>
                        <ActionButton type="button" tone="primary" onClick={() => void writeBack(item, "comment", commentDraft)} disabled={actionBusy || !commentDraft.trim()}>Request approval</ActionButton>
                      </div>
                    )}
                    {pendingIntent === "state" && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-xs text-[rgb(var(--app-text-muted))]">
                        <span>This will propose changing the state to In Progress. Nothing changes until approval.</span>
                        <ActionButton type="button" tone="primary" onClick={() => void writeBack(item, "state")} disabled={actionBusy}>Request approval</ActionButton>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </WorkbenchPage>
  );
}
