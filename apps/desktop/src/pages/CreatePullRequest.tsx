import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../App.js";
import {
  approveDeliveryAction,
  fetchPullRequestPreparation,
  proposeDeliveryAction,
  rejectDeliveryAction,
  runPullRequestValidation,
  type DeliveryActionRecord,
  type PullRequestPreparation,
} from "../api/delivery.js";
import { resolveActiveProjectLink } from "../projectLinks.js";
import {
  ActionButton,
  InlineNotice,
  WorkbenchPage,
  WorkbenchTextArea,
  WorkbenchTextInput,
} from "../components/workbench/WorkbenchPrimitives.js";

export const DEFAULT_PULL_REQUEST_PLANNING_PREFERENCES = {
  sourceBranch: "",
  targetBranch: "",
  title: "",
  description: "",
  workItemId: "",
} as const;

export function buildPullRequestActionProposal(args: {
  preparation: PullRequestPreparation;
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  workItemId?: number;
  now?: number;
}): Record<string, unknown> {
  const now = args.now ?? Date.now();
  const { preparation } = args;
  const sourceBranch = args.sourceBranch.trim();
  const targetBranch = args.targetBranch.trim();
  const preparedWorkItemId = preparation.workItem.item?.id;
  if (!preparation.repositoryId || !preparation.git.remoteSourceSha || !preparation.git.remoteTargetSha) {
    throw new Error("Remote repository and branch revisions must be verified before previewing a PR write.");
  }
  if (sourceBranch !== preparation.git.sourceBranch || targetBranch !== preparation.git.targetBranch) {
    throw new Error("Branch fields changed after evidence was read. Read the evidence again before previewing the write.");
  }
  if (args.workItemId !== preparedWorkItemId) {
    throw new Error("The Work Item changed after evidence was read. Read it again before previewing the write.");
  }
  const sourceCommit = preparation.git.remoteSourceSha || preparation.git.headSha;
  const target = {
    kind: "pull_request",
    projectLinkId: preparation.projectLinkId,
    repositoryId: preparation.repositoryId,
    id: 0,
    sourceCommit,
    iterationId: 1,
  };
  const basedOn: Array<Record<string, unknown>> = [];
  if (sourceBranch && preparation.git.remoteSourceSha) {
    basedOn.push({
      kind: "branch",
      projectLinkId: preparation.projectLinkId,
      repositoryId: preparation.repositoryId,
      name: sourceBranch,
      objectId: preparation.git.remoteSourceSha,
    });
  }
  if (targetBranch && preparation.git.remoteTargetSha) {
    basedOn.push({
      kind: "branch",
      projectLinkId: preparation.projectLinkId,
      repositoryId: preparation.repositoryId,
      name: targetBranch,
      objectId: preparation.git.remoteTargetSha,
    });
  }
  if (preparation.workItem.item && args.workItemId) {
    basedOn.push({
      kind: "work_item",
      projectLinkId: preparation.projectLinkId,
      id: args.workItemId,
      revision: preparation.workItem.item.revision,
    });
  }
  const expectedResult: Array<Record<string, unknown>> = [{ artifact: target, condition: "exists" }];
  if (args.workItemId) {
    expectedResult.push({
      artifact: target,
      condition: "field_contains",
      field: "workItemIds",
      expected: [String(args.workItemId)],
    });
  }
  return {
    turnId: `guided-pr-${now}`,
    projectLinkId: preparation.projectLinkId,
    kind: "pull_request.create",
    target,
    basedOn,
    payload: {
      sourceBranch,
      targetBranch,
      repositoryId: preparation.repositoryId,
      title: args.title.trim(),
      description: args.description.trim(),
      draft: preparation.suggestion.draft,
      ...(args.workItemId ? { workItemId: args.workItemId } : {}),
    },
    risk: "high",
    reason: "Create the reviewed pull request from the verified Guided PR Preparation evidence",
    expectedResult,
    idempotencyKey: `guided-pr-${preparation.repositoryId}-${sourceCommit}-${targetBranch}-${now}`,
    expiresAt: now + 3_600_000,
  };
}

export default function CreatePullRequest(): JSX.Element {
  const navigate = useNavigate();
  const { projectLinks, projectLinksLoading } = useAppData();
  const projectLink = resolveActiveProjectLink(projectLinks);
  const projectLinkId = projectLink?.id ?? "";
  const [sourceBranch, setSourceBranch] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [workItemId, setWorkItemId] = useState("");
  const [preparation, setPreparation] = useState<PullRequestPreparation | null>(null);
  const [action, setAction] = useState<DeliveryActionRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async () => {
    setError(null);
    setAction(null);
    if (!projectLinkId) {
      setError("Select a Project Link in Context before preparing a pull request.");
      return;
    }
    const numericWorkItemId = workItemId.trim() ? Number(workItemId) : undefined;
    if (numericWorkItemId !== undefined && (!Number.isInteger(numericWorkItemId) || numericWorkItemId <= 0)) {
      setError("Work Item ID must be a positive integer.");
      return;
    }
    setBusy(true);
    try {
      const next = await fetchPullRequestPreparation({
        projectLinkId,
        ...(sourceBranch.trim() ? { sourceBranch: sourceBranch.trim() } : {}),
        ...(targetBranch.trim() ? { targetBranch: targetBranch.trim() } : {}),
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(numericWorkItemId ? { workItemId: numericWorkItemId } : {}),
      });
      setPreparation(next);
      setSourceBranch(next.suggestion.sourceBranch);
      setTargetBranch(next.suggestion.targetBranch);
      setTitle(next.suggestion.title);
      setDescription(next.suggestion.description);
      if (next.suggestion.workItemId) setWorkItemId(String(next.suggestion.workItemId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [description, projectLinkId, sourceBranch, targetBranch, title, workItemId]);

  const preview = useCallback(async () => {
    if (!preparation) return;
    setBusy(true);
    setError(null);
    try {
      const numericWorkItemId = workItemId.trim() ? Number(workItemId) : undefined;
      const record = await proposeDeliveryAction(buildPullRequestActionProposal({
        preparation,
        title,
        description,
        sourceBranch,
        targetBranch,
        workItemId: numericWorkItemId,
      }));
      setAction(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [description, preparation, sourceBranch, targetBranch, title, workItemId]);

  const validateCurrentSha = useCallback(async () => {
    if (!preparation) return;
    setBusy(true);
    setError(null);
    try {
      await runPullRequestValidation({
        projectLinkId: preparation.projectLinkId,
        expectedHeadSha: preparation.git.headSha,
      });
      const numericWorkItemId = workItemId.trim() ? Number(workItemId) : undefined;
      const next = await fetchPullRequestPreparation({
        projectLinkId: preparation.projectLinkId,
        sourceBranch: sourceBranch.trim(),
        targetBranch: targetBranch.trim(),
        title: title.trim(),
        description: description.trim(),
        ...(numericWorkItemId ? { workItemId: numericWorkItemId } : {}),
      });
      setPreparation(next);
      setSourceBranch(next.suggestion.sourceBranch);
      setTargetBranch(next.suggestion.targetBranch);
      setTitle(next.suggestion.title);
      setDescription(next.suggestion.description);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [description, preparation, sourceBranch, targetBranch, title, workItemId]);

  const approve = useCallback(async () => {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      setAction(await approveDeliveryAction(action.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [action]);

  const reject = useCallback(async () => {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      setAction(await rejectDeliveryAction(action.id, "User rejected the Guided PR Preparation preview."));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [action]);

  const previewDisabled = !preparation
    || !title.trim()
    || sourceBranch.trim() !== preparation.git.sourceBranch
    || targetBranch.trim() !== preparation.git.targetBranch
    || (workItemId.trim() ? Number(workItemId) : undefined) !== preparation.workItem.item?.id
    || preparation.suggestion.readiness === "blocked"
    || preparation.suggestion.readiness === "insufficient_evidence";

  return (
    <WorkbenchPage className="mx-auto w-full max-w-4xl px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
      <header className="flex items-start justify-between gap-3 border-b border-[rgb(var(--app-border))] pb-3">
        <div>
          <h1 className="text-lg font-semibold text-[rgb(var(--app-text))]">Guided PR Preparation</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[rgb(var(--app-text-muted))]">
            Read the selected Project Link, Work Item, Git revisions, diff, validation state, and Azure DevOps target policies. Edit the suggestion before creating a typed approval preview.
          </p>
        </div>
        <ActionButton type="button" tone="quiet" onClick={() => navigate("/pulls")}>Back to Changes</ActionButton>
      </header>

      <section className="space-y-3 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4">
        <p className="text-xs text-[rgb(var(--app-text-muted))]">
          Project Link: <span className="font-medium text-[rgb(var(--app-text))]">{projectLinksLoading ? "Loading..." : projectLink?.name || "Not selected"}</span>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Source branch"><WorkbenchTextInput value={sourceBranch} placeholder="Use checked-out branch" onChange={(event) => setSourceBranch(event.target.value)} /></Field>
          <Field label="Target branch"><WorkbenchTextInput value={targetBranch} placeholder="Use configured target" onChange={(event) => setTargetBranch(event.target.value)} /></Field>
        </div>
        <Field label="Work Item ID"><WorkbenchTextInput value={workItemId} inputMode="numeric" placeholder="Optional" onChange={(event) => setWorkItemId(event.target.value)} /></Field>
        <div className="flex justify-end"><ActionButton type="button" tone="primary" loading={busy && !preparation} onClick={() => void analyze()} disabled={!projectLinkId}>Read evidence and prepare</ActionButton></div>
      </section>

      {error && <InlineNotice tone="danger" title="Could not complete the action">{error}</InlineNotice>}

      {preparation && (
        <>
          <EvidencePanel preparation={preparation} />
          <div className="flex justify-end">
            <ActionButton type="button" loading={busy} onClick={() => void validateCurrentSha()}>
              {preparation.validation.status === "passed" ? "Re-run current-SHA validation" : "Run current-SHA validation"}
            </ActionButton>
          </div>
          <section className="space-y-3 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-[rgb(var(--app-text))]">Editable pull request suggestion</h2>
              <span className="rounded-full border border-[rgb(var(--app-border))] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-muted))]">{preparation.suggestion.readiness.replace("_", " ")}</span>
            </div>
            <Field label="Title"><WorkbenchTextInput value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
            <Field label="Description"><WorkbenchTextArea rows={12} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
            {(sourceBranch.trim() !== preparation.git.sourceBranch
              || targetBranch.trim() !== preparation.git.targetBranch
              || (workItemId.trim() ? Number(workItemId) : undefined) !== preparation.workItem.item?.id) && (
              <InlineNotice tone="warning" title="Evidence changed">Branch or Work Item identity changed after the read. Run “Read evidence and prepare” again before creating an approval preview.</InlineNotice>
            )}
            <div className="flex justify-end"><ActionButton type="button" tone="primary" loading={busy && Boolean(preparation)} onClick={() => void preview()} disabled={previewDisabled}>Create approval preview</ActionButton></div>
          </section>
        </>
      )}

      {action && (
        <section className="space-y-3 rounded-lg border border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft))] p-4">
          <div>
            <h2 className="text-sm font-semibold text-[rgb(var(--app-text))]">Typed ActionRecord preview</h2>
            <p className="mt-1 text-xs text-[rgb(var(--app-text-muted))]">Status: {action.status}. Approval executes this persisted payload, then Azure DevOps is re-read and verified.</p>
          </div>
          <pre className="max-h-72 overflow-auto rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3 text-[11px] leading-5 text-[rgb(var(--app-text-muted))]">{JSON.stringify({ kind: action.kind, target: action.target, payload: action.payload }, null, 2)}</pre>
          {action.status === "awaiting_approval" || action.status === "proposed" ? (
            <div className="flex justify-end gap-2">
              <ActionButton type="button" tone="quiet" loading={busy} onClick={() => void reject()}>Reject</ActionButton>
              <ActionButton type="button" tone="primary" loading={busy} onClick={() => void approve()}>Approve and create PR</ActionButton>
            </div>
          ) : null}
          {action.status === "verified" && <InlineNotice tone="success" title="Pull request verified">Azure DevOps returned the created PR and the post-write verification predicates passed.</InlineNotice>}
          {action.failure && <InlineNotice tone="danger" title="Action failed">{action.failure.message}</InlineNotice>}
        </section>
      )}
    </WorkbenchPage>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-[rgb(var(--app-text))]">{label}</span>{children}</label>;
}

function EvidencePanel({ preparation }: { preparation: PullRequestPreparation }): JSX.Element {
  const enabledPolicies = preparation.policies.configurations.filter((policy) => policy.isEnabled);
  return (
    <section className="space-y-3 border-y border-[rgb(var(--app-border))] py-4">
      <h2 className="text-sm font-semibold text-[rgb(var(--app-text))]">Read-only evidence</h2>
      <dl className="grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2">
        <Evidence label="Local branch" value={`${preparation.git.sourceBranch || "unknown"} @ ${shortSha(preparation.git.headSha)}`} />
        <Evidence label="Remote source" value={preparation.git.remoteSourceSha ? shortSha(preparation.git.remoteSourceSha) : "unavailable"} />
        <Evidence label="Target branch" value={`${preparation.git.targetBranch || "unknown"} @ ${shortSha(preparation.git.remoteTargetSha || preparation.git.targetSha || "")}`} />
        <Evidence label="Diff" value={`${preparation.git.commits.length} commits · ${preparation.git.changedFiles.length} files${preparation.git.dirty ? " · working tree dirty" : ""}`} />
        <Evidence label="Work Item" value={preparation.workItem.item ? `#${preparation.workItem.item.id} · ${preparation.workItem.item.state} · rev ${preparation.workItem.item.revision}` : preparation.workItem.message || preparation.workItem.status} />
        <Evidence label="Current-SHA validation" value={preparation.validation.summary} />
        <Evidence label="ADO policies" value={preparation.policies.status === "available" ? `${enabledPolicies.length} enabled · ${enabledPolicies.filter((policy) => policy.isBlocking).length} blocking` : preparation.policies.message || preparation.policies.status} />
        <Evidence label="Repository identity" value={preparation.repositoryId || "unresolved"} />
      </dl>
      {(preparation.suggestion.missingEvidence.length > 0 || preparation.suggestion.risks.length > 0) && (
        <div className="grid gap-3 text-xs sm:grid-cols-2">
          <EvidenceList title="Missing evidence" items={preparation.suggestion.missingEvidence} />
          <EvidenceList title="Risks and policy requirements" items={preparation.suggestion.risks} />
        </div>
      )}
      {preparation.validation.outputExcerpt && (
        <details className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-xs">
          <summary className="cursor-pointer text-[rgb(var(--app-text-muted))]">Validation output excerpt</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-[rgb(var(--app-text-subtle))]">{preparation.validation.outputExcerpt}</pre>
        </details>
      )}
    </section>
  );
}

function Evidence({ label, value }: { label: string; value: string }): JSX.Element {
  return <div className="min-w-0"><dt className="text-[rgb(var(--app-text-subtle))]">{label}</dt><dd className="mt-0.5 break-words text-[rgb(var(--app-text))]">{value}</dd></div>;
}

function EvidenceList({ title, items }: { title: string; items: string[] }): JSX.Element {
  return <div><h3 className="font-medium text-[rgb(var(--app-text))]">{title}</h3>{items.length ? <ul className="mt-1 list-disc space-y-1 pl-4 text-[rgb(var(--app-text-muted))]">{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-1 text-[rgb(var(--app-text-subtle))]">None</p>}</div>;
}

function shortSha(sha: string): string {
  return sha ? sha.slice(0, 8) : "unknown";
}
