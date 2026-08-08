import { useCallback, useEffect, useState } from "react";
import {
  approveDeliveryAction,
  fetchDeliveryEvidence,
  proposeDeliveryAction,
  type DeliveryActionRecord,
  type DeliveryEvidenceBundle,
} from "../../api/delivery.js";
import {
  ActionButton,
  InlineNotice,
  WorkbenchDisclosure,
  WorkbenchSidePanel,
} from "../../components/workbench/WorkbenchPrimitives.js";

const CLASS_LABELS: Record<string, string> = {
  code_regression: "Code regression",
  pipeline_configuration: "Pipeline / configuration",
  dependency: "Dependency / package",
  agent_infrastructure: "Agent / infrastructure",
  permission_credential: "Permission / credential",
  flaky_test: "Flaky test",
  cancelled: "Cancelled / user action",
  unknown: "Unknown / insufficient evidence",
};

interface DeliveryRunInspectorProps {
  buildId: number;
  definitionId: number;
  projectLinkId: string;
  repositoryId: string;
  branch: string;
  onClose: () => void;
}

/**
 * Delivery run Inspector (Cycle 03). The Inspector owns the artifact: it
 * shows the bounded evidence bundle and classification, and offers recovery
 * actions through the verified action runtime — never a chat side effect.
 */
export function DeliveryRunInspector({
  buildId,
  definitionId,
  projectLinkId,
  repositoryId,
  branch,
  onClose,
}: DeliveryRunInspectorProps): JSX.Element {
  const [evidence, setEvidence] = useState<DeliveryEvidenceBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<DeliveryActionRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDeliveryEvidence(buildId, projectLinkId, definitionId)
      .then((bundle) => {
        if (!cancelled) {
          setEvidence(bundle);
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
  }, [buildId, definitionId, projectLinkId]);

  const runRecoveryAction = useCallback(async (kind: "rerun" | "create_bug") => {
    if (!evidence) return;
    setActionBusy(true);
    setActionError(null);
    setAction(null);
    try {
      const idempotencyKey = `${kind}-${buildId}-${Date.now().toString(36)}`;
      const classification = evidence.classification.class;
      const proposal =
        kind === "rerun"
          ? {
              turnId: "delivery-inspector",
              projectLinkId,
              kind: "pipeline.trigger",
              target: { kind: "build", projectLinkId, definitionId, buildId: 0 },
              basedOn: [],
              payload: { pipelineId: definitionId, branch, sourceCommit: evidence.build.sourceVersion },
              risk: "high",
              reason: `Rerun pipeline #${definitionId} on ${branch} after failure ${evidence.build.buildNumber}`,
              expectedResult: [
                { artifact: { kind: "build", projectLinkId, definitionId, buildId: 0 }, condition: "run_visible", correlation: evidence.build.sourceVersion },
              ],
              idempotencyKey,
              expiresAt: Date.now() + 3_600_000,
            }
          : {
              turnId: "delivery-inspector",
              projectLinkId,
              kind: "work_item.create",
              target: { kind: "work_item", projectLinkId, id: 0, revision: 0 },
              basedOn: [],
              payload: {
                type: "Bug",
                title: `[MergePilot Fixture] CI failure ${evidence.build.buildNumber} (${classification})`,
                description: `Pipeline #${definitionId} run ${evidence.build.buildNumber} failed with classification ${classification}.\n\nDecisive evidence:\n${evidence.classification.decisiveEvidence.join("\n")}`,
              },
              risk: "medium",
              reason: "Track the CI failure as a work item",
              expectedResult: [
                { artifact: { kind: "work_item", projectLinkId, id: 0, revision: 0 }, condition: "field_eq", field: "System.Title", expected: `[MergePilot Fixture] CI failure ${evidence.build.buildNumber} (${classification})` },
              ],
              idempotencyKey,
              expiresAt: Date.now() + 3_600_000,
            };
      const record = await proposeDeliveryAction(proposal);
      setAction(record);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  }, [branch, buildId, definitionId, evidence, projectLinkId]);

  const approve = useCallback(async () => {
    if (!action) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const record = await approveDeliveryAction(action.id);
      setAction(record);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  }, [action]);

  const classification = evidence?.classification;

  return (
    <WorkbenchSidePanel title={`Run ${buildId}`} open onOpenChange={(open) => { if (!open) onClose(); }}>
      <div className="space-y-3">
        {loading && <p className="text-xs text-[rgb(var(--app-text-subtle))]">Loading evidence...</p>}
        {error && <InlineNotice tone="danger" title="Evidence unavailable">{error}</InlineNotice>}
        {evidence && (
          <>
            <div className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
              <p className="text-sm font-medium text-[rgb(var(--app-text))]">{evidence.build.buildNumber}</p>
              <p className="mt-1 text-xs text-[rgb(var(--app-text-muted))]">
                {evidence.build.definitionName} · {evidence.build.result} · {evidence.build.branch} · {evidence.build.sourceVersion.slice(0, 10)}
              </p>
              {classification && (
                <p className="mt-2 inline-flex rounded-md border border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft))] px-2 py-0.5 text-xs font-medium text-[rgb(var(--app-warning))]">
                  {CLASS_LABELS[classification.class] ?? classification.class} ({Math.round(classification.confidence * 100)}%)
                </p>
              )}
            </div>

            {classification && classification.decisiveEvidence.length > 0 && (
              <div className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-subtle))]">Decisive evidence</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
                  {classification.decisiveEvidence.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            )}

            {evidence.errorIssues.length > 0 && (
              <WorkbenchDisclosure label={`Failed tasks (${evidence.timelineIssues.length})`}>
                <ul className="space-y-1.5">
                  {evidence.errorIssues.slice(0, 5).map((issue, index) => (
                    <li key={index} className="text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
                      <span className="font-medium text-[rgb(var(--app-danger))]">[{issue.type}]</span> {issue.message}
                    </li>
                  ))}
                </ul>
              </WorkbenchDisclosure>
            )}

            {evidence.logExcerpts.length > 0 && (
              <WorkbenchDisclosure label={`Log excerpts (${evidence.logExcerpts.length})`}>
                <div className="space-y-2">
                  {evidence.logExcerpts.map((entry) => (
                    <pre
                      key={`${entry.taskName}-${entry.contentHash}`}
                      className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-2 text-[10px] leading-relaxed text-[rgb(var(--app-text-muted))]"
                    >
                      {entry.excerpt}
                    </pre>
                  ))}
                </div>
              </WorkbenchDisclosure>
            )}

            {actionError && <InlineNotice tone="danger" title="Action failed">{actionError}</InlineNotice>}
            {action && action.status !== "verified" && action.status !== "failed" && (
              <div className="rounded-md border border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft))] px-3 py-2">
                <p className="text-xs font-medium text-[rgb(var(--app-warning))]">
                  Approval needed: {String((action.payload as Record<string, unknown>)["title"] ?? action.kind)}
                </p>
              </div>
            )}
            {action && action.status === "verified" && (
              <InlineNotice tone="success" title="Verified">
                {action.kind} completed and verified against Azure DevOps.
              </InlineNotice>
            )}
            {action && action.status === "failed" && action.failure && (
              <InlineNotice tone="danger" title="Action failed">{action.failure.message}</InlineNotice>
            )}

            {!action && (
              <div className="flex flex-wrap gap-2">
                <ActionButton type="button" onClick={() => void runRecoveryAction("rerun")} disabled={actionBusy}>
                  Rerun pipeline
                </ActionButton>
                <ActionButton type="button" tone="quiet" onClick={() => void runRecoveryAction("create_bug")} disabled={actionBusy}>
                  Create Bug
                </ActionButton>
              </div>
            )}
            {action && action.status === "awaiting_approval" && (
              <ActionButton type="button" tone="primary" onClick={() => void approve()} disabled={actionBusy}>
                Approve and execute
              </ActionButton>
            )}
          </>
        )}
      </div>
    </WorkbenchSidePanel>
  );
}
