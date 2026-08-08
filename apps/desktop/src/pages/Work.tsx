import { useCallback, useEffect, useState } from "react";
import { useAppData } from "../App.js";
import { RUNTIME_URL } from "../api/runtime.js";
import {
  approveDeliveryAction,
  proposeDeliveryAction,
  type DeliveryActionRecord,
} from "../api/delivery.js";
import {
  ActionButton,
  InlineNotice,
  WorkbenchFilterTabs,
  WorkbenchPage,
} from "../components/workbench/WorkbenchPrimitives.js";

interface WorkItemView {
  id: number;
  type: string;
  title: string;
  state: string;
  revision: number;
  iterationPath?: string;
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
  { key: "all", label: "My work" },
  { key: "ready", label: "Ready" },
  { key: "blocked", label: "Blocked" },
];

/**
 * Work workspace (Cycle 04). Projection of ADO work items plus delivery
 * evidence; drift findings are deterministic and every write-back runs
 * through the verified action runtime with a revision check.
 */
export default function Work(): JSX.Element {
  const { projectLinks, projectLinksLoading } = useAppData();
  const activeProjectLink = projectLinks[0] ?? null;
  const projectLinkId = activeProjectLink?.id ?? "";
  const [items, setItems] = useState<WorkItemView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState("all");
  const [action, setAction] = useState<DeliveryActionRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (!projectLinkId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${RUNTIME_URL}/delivery/work-items?projectLinkId=${encodeURIComponent(projectLinkId)}`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ workItems: WorkItemView[] }>;
      })
      .then((data) => {
        if (!cancelled) {
          setItems(data.workItems);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectLinkId]);

  const visibleItems = items.filter((item) => {
    if (view === "blocked") return item.drift.some((finding) => !finding.question);
    if (view === "ready") return item.drift.length === 0 || item.drift.every((finding) => finding.question);
    return true;
  });

  const writeBack = useCallback(async (item: WorkItemView, kind: "comment" | "state") => {
    setActionBusy(true);
    setActionError(null);
    setAction(null);
    try {
      const RUN_ID = Date.now().toString(36);
      const proposal =
        kind === "comment"
          ? {
              turnId: "work-workspace",
              projectLinkId,
              kind: "work_item.comment",
              target: { kind: "work_item", projectLinkId, id: item.id, revision: item.revision },
              basedOn: [{ kind: "work_item", projectLinkId, id: item.id, revision: item.revision }],
              payload: { text: `[MergePilot Fixture] Cycle 04 verified progress update (${RUN_ID}).` },
              risk: "low",
              reason: "Record the verified progress update on the work item",
              expectedResult: [
                { artifact: { kind: "work_item", projectLinkId, id: item.id, revision: item.revision + 1 }, condition: "revision_gt", expectedRevision: item.revision },
                { artifact: { kind: "work_item", projectLinkId, id: item.id, revision: item.revision + 1 }, condition: "comment_contains", expected: "Cycle 04 verified progress update" },
              ],
              idempotencyKey: `cycle04-comment-${item.id}-${RUN_ID}`,
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
              idempotencyKey: `cycle04-state-${item.id}-${RUN_ID}`,
              expiresAt: Date.now() + 3_600_000,
            };
      const record = await proposeDeliveryAction(proposal);
      setAction(record);
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
          ? { ...item, revision: item.revision + 1, state: "In Progress" }
          : item));
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  }, [action]);

  return (
    <WorkbenchPage className="mx-auto w-full max-w-4xl px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[rgb(var(--app-text))]">Work</h1>
          <p className="mt-1 text-xs text-[rgb(var(--app-text-muted))]">
            Azure Boards work items with delivery evidence; every update is approved and verified.
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

      {error && <div className="mt-3"><InlineNotice tone="danger" title="Work load failed">{error}</InlineNotice></div>}
      {actionError && <div className="mt-3"><InlineNotice tone="danger" title="Action failed">{actionError}</InlineNotice></div>}
      {action && action.status !== "verified" && action.status !== "failed" && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft))] px-3 py-2">
          <p className="text-xs font-medium text-[rgb(var(--app-warning))]">
            Approval needed: {String((action.payload as Record<string, unknown>)["text"] ?? (action.payload as Record<string, unknown>)["fields"] ?? action.kind)}
          </p>
          <ActionButton type="button" tone="primary" onClick={() => void approve()} disabled={actionBusy}>
            Approve
          </ActionButton>
        </div>
      )}
      {action && action.status === "verified" && (
        <div className="mt-3"><InlineNotice tone="success" title="Verified">{action.kind} verified against Azure DevOps.</InlineNotice></div>
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
            {loading && <p className="text-xs text-[rgb(var(--app-text-subtle))]">Loading work items...</p>}
            {!loading && visibleItems.length === 0 && (
              <p className="text-xs text-[rgb(var(--app-text-subtle))]">No work items in this view.</p>
            )}
            {visibleItems.map((item) => (
              <div key={item.id} className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[rgb(var(--app-text))]">{item.title}</p>
                    <p className="mt-0.5 text-xs text-[rgb(var(--app-text-muted))]">
                      #{item.id} · {item.type} · {item.state} · rev {item.revision}
                      {item.iterationPath ? ` · ${item.iterationPath}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <ActionButton type="button" tone="quiet" onClick={() => void writeBack(item, "comment")} disabled={actionBusy}>
                      Comment
                    </ActionButton>
                    <ActionButton type="button" tone="quiet" onClick={() => void writeBack(item, "state")} disabled={actionBusy || item.state === "In Progress"}>
                      Start
                    </ActionButton>
                  </div>
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
              </div>
            ))}
          </div>
        </div>
      )}
    </WorkbenchPage>
  );
}
