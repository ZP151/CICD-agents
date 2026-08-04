import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../App.js";
import {
  approveDeliveryAction,
  proposeDeliveryAction,
  type DeliveryActionRecord,
} from "../api/delivery.js";
import {
  ActionButton,
  InlineNotice,
  WorkbenchPage,
} from "../components/workbench/WorkbenchPrimitives.js";
import { WorkbenchSelect } from "../components/workbench/WorkbenchPrimitives.js";
import { TextInput } from "./settings/SettingsControls.js";

/**
 * Create PR (Cycle 02 Changes flow). Builds the exact pull_request.create
 * proposal and runs it through the verified action runtime: propose ->
 * approval card -> execute -> re-read -> verify. The page never auto-pushes
 * a branch or creates a PR without approval.
 */
export default function CreatePullRequest(): JSX.Element {
  const navigate = useNavigate();
  const { projectLinks, projectLinksLoading } = useAppData();
  const [projectLinkId, setProjectLinkId] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [targetBranch, setTargetBranch] = useState("main");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [workItemId, setWorkItemId] = useState("");
  const [proposal, setProposal] = useState<DeliveryActionRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState<string[]>([]);

  const projectLink = projectLinks.find((link) => link.id === projectLinkId) ?? null;

  const submit = useCallback(async () => {
    setError(null);
    if (!projectLinkId || !sourceBranch.trim() || !title.trim()) {
      setError("Project Link, source branch, and title are required.");
      return;
    }
    setBusy(true);
    try {
      const idempotencyKey = `create-pr-${Date.now().toString(36)}`;
      const wiId = Number(workItemId);
      const record = await proposeDeliveryAction({
        turnId: "changes-create-pr",
        projectLinkId,
        kind: "pull_request.create",
        target: {
          kind: "pull_request",
          projectLinkId,
          repositoryId: projectLink?.adoRepoName ?? "",
          id: 0,
          sourceCommit: "",
          iterationId: 1,
        },
        basedOn: [{ kind: "branch", projectLinkId, repositoryId: projectLink?.adoRepoName ?? "", name: sourceBranch.trim(), objectId: "" }],
        payload: {
          repositoryId: projectLink?.adoRepoName ?? "",
          sourceBranch: sourceBranch.trim(),
          targetBranch: targetBranch.trim() || "main",
          title: title.trim(),
          description: description.trim(),
          workItemId: wiId > 0 ? wiId : undefined,
        },
        risk: "high",
        reason: "Create the pull request from the Changes workspace",
        expectedResult: [
          { artifact: { kind: "pull_request", projectLinkId, repositoryId: projectLink?.adoRepoName ?? "", id: 0, sourceCommit: "", iterationId: 1 }, condition: "exists" },
          { artifact: { kind: "pull_request", projectLinkId, repositoryId: projectLink?.adoRepoName ?? "", id: 0, sourceCommit: "", iterationId: 1 }, condition: "field_eq", field: "title", expected: title.trim() },
          ...(wiId > 0
            ? [{ artifact: { kind: "pull_request", projectLinkId, repositoryId: projectLink?.adoRepoName ?? "", id: 0, sourceCommit: "", iterationId: 1 }, condition: "relation_present", expected: String(wiId) }]
            : []),
        ],
        idempotencyKey,
        expiresAt: Date.now() + 3_600_000,
      });
      setProposal(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [description, projectLink, projectLinkId, sourceBranch, targetBranch, title, workItemId]);

  const approve = useCallback(async () => {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      const record = await approveDeliveryAction(proposal.id);
      setProposal(record);
      if (record.status === "verified") {
        const target = record.target as { id?: number };
        setVerification([
          `PR #${target.id ?? "?"} created and verified against Azure DevOps.`,
          ...(record.payload["sourceBranch"] ? [`Source: ${String(record.payload["sourceBranch"])}`] : []),
        ]);
      } else if (record.failure) {
        setError(record.failure.message);
      } else {
        setError(`Action ended in status ${record.status}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [proposal]);

  return (
    <WorkbenchPage className="mx-auto w-full max-w-3xl px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[rgb(var(--app-text))]">Create pull request</h1>
          <p className="mt-1 text-xs text-[rgb(var(--app-text-muted))]">
            The exact proposal is stored and verified; nothing is created without approval.
          </p>
        </div>
        <ActionButton type="button" tone="quiet" onClick={() => navigate("/pulls")}>Back to Changes</ActionButton>
      </div>

      <div className="mt-4 space-y-3.5 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4">
        {projectLinksLoading ? (
          <p className="text-xs text-[rgb(var(--app-text-subtle))]">Loading Project Links...</p>
        ) : (
          <label className="block">
            <span className="text-xs font-medium text-[rgb(var(--app-text))]">Project Link</span>
            <WorkbenchSelect
              aria-label="Project Link"
              className="mt-1 w-full"
              value={projectLinkId}
              onChange={(event) => setProjectLinkId(event.target.value)}
            >
              <option value="">Select a Project Link</option>
              {projectLinks.map((link) => (
                <option key={link.id} value={link.id}>{link.name}</option>
              ))}
            </WorkbenchSelect>
          </label>
        )}
        <div className="grid gap-3.5 sm:grid-cols-2">
          <TextInput label="Source branch" placeholder="feature/my-change" value={sourceBranch} onChange={setSourceBranch} />
          <TextInput label="Target branch" placeholder="main" value={targetBranch} onChange={setTargetBranch} />
        </div>
        <TextInput label="Title" placeholder="Describe the change" value={title} onChange={setTitle} />
        <label className="block">
          <span className="text-xs font-medium text-[rgb(var(--app-text))]">Description</span>
          <textarea
            aria-label="Description"
            className="mt-1 w-full rounded-md border border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-sm text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <TextInput label="Work item ID (optional)" placeholder="7913" value={workItemId} onChange={setWorkItemId} />

        {error && <InlineNotice tone="danger" title="Could not complete the action">{error}</InlineNotice>}
        {verification.length > 0 && (
          <InlineNotice tone="success" title="Verified">
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed">
              {verification.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </InlineNotice>
        )}

        {proposal && proposal.status !== "verified" && (
          <div className="rounded-md border border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft))] px-3 py-2">
            <p className="text-xs font-medium text-[rgb(var(--app-warning))]">
              Approval needed: {String(proposal.payload["title"] ?? "")} ({String(proposal.payload["sourceBranch"] ?? "")} → {String(proposal.payload["targetBranch"] ?? "")})
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {proposal && proposal.status === "awaiting_approval" && (
            <ActionButton type="button" tone="primary" onClick={() => void approve()} disabled={busy}>
              Approve and create PR
            </ActionButton>
          )}
          {!proposal && (
            <ActionButton type="button" tone="primary" onClick={() => void submit()} disabled={busy || !projectLinkId}>
              Prepare PR proposal
            </ActionButton>
          )}
        </div>
      </div>
    </WorkbenchPage>
  );
}
