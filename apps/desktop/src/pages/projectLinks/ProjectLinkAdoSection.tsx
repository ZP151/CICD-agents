import type { AdoDiscoveryKind, AdoDiscoveryOption, ProjectLinkInput } from "../../api.js";
import { ActionButton, InlineNotice } from "../../components/workbench/WorkbenchPrimitives.js";
import {
  adoRecoveryAction,
  adoRecoveryActionLabel,
  type AdoOauthRecoveryState,
} from "./adoOauthRecovery.js";
import type { AdoDiscoveryFailure } from "./useProjectLinkFormRuntime.js";
import { Field, ProjectDiscoveryField } from "./ProjectLinkFormControls.js";

interface ProjectLinkAdoSectionProps {
  form: ProjectLinkInput;
  set: <K extends keyof ProjectLinkInput>(key: K) => (value: ProjectLinkInput[K]) => void;
  discovered: Record<AdoDiscoveryKind, AdoDiscoveryOption[]>;
  discovering: AdoDiscoveryKind | null;
  discoveryError: string | null;
  discoveryFailure: AdoDiscoveryFailure | null;
  recovery: AdoOauthRecoveryState;
  onRecoverOAuth: (kind: AdoDiscoveryKind) => void;
  onApplyDiscovery: (kind: AdoDiscoveryKind, option: AdoDiscoveryOption) => void;
  onManualProjectChange: (value: string) => void;
  onManualRepositoryChange: (value: string) => void;
  onManualPipelineChange: (value: string) => void;
}

export function ProjectLinkAdoSection({
  form,
  set,
  discovered,
  discovering,
  discoveryError,
  discoveryFailure,
  recovery,
  onRecoverOAuth,
  onApplyDiscovery,
  onManualProjectChange,
  onManualRepositoryChange,
  onManualPipelineChange,
}: ProjectLinkAdoSectionProps): JSX.Element {
  return (
    <section className="space-y-3.5 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4">
      <div>
        <h3 className="text-sm font-semibold text-[rgb(var(--app-text))]">Azure DevOps</h3>
      </div>
      <Field
        label="Organisation URL"
        value={form.adoOrgUrl}
        onChange={set("adoOrgUrl")}
        placeholder="https://dev.azure.com/myorg"
      />
      <div className={projectLinkAdoProjectRepoGridClass()}>
        <ProjectDiscoveryField
          kind="projects"
          label="Project"
          options={discovered.projects}
          value={form.adoProject}
          discovering={discovering}
          placeholder="MyProject"
          onApply={onApplyDiscovery}
          onManualChange={onManualProjectChange}
        />
        <ProjectDiscoveryField
          kind="repositories"
          label="Repository name"
          options={discovered.repositories}
          value={form.adoRepoName}
          discovering={discovering}
          placeholder="my-repo"
          onApply={onApplyDiscovery}
          onManualChange={onManualRepositoryChange}
        />
      </div>
      <ProjectDiscoveryField
        kind="pipelines"
        label="Pipeline"
        options={discovered.pipelines}
        value={form.adoPipelineName}
        discovering={discovering}
        placeholder="CI pipeline"
        onApply={onApplyDiscovery}
        onManualChange={onManualPipelineChange}
      />
      <fieldset className="space-y-2 border-t border-[rgb(var(--app-border))] pt-3">
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-[rgb(var(--app-text))]">
          <input
            type="checkbox"
            checked={form.adoMcpEnabled}
            onChange={(event) => set("adoMcpEnabled")(event.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-[rgb(var(--app-border-strong))] text-[rgb(var(--app-accent))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--app-accent))]"
          />
          <span>
            <span className="block font-medium">Use managed Azure DevOps MCP</span>
            <span className="mt-0.5 block text-xs leading-5 text-[rgb(var(--app-text-muted))]">
              This Project Link selects a connector configured locally. Commands and credentials stay in local config and are never saved here.
            </span>
          </span>
        </label>
        {form.adoMcpEnabled && (
          <div className="pl-6">
            <Field
              label="Allowed MCP domains"
              value={form.adoMcpDomains}
              onChange={set("adoMcpDomains")}
              placeholder="repositories,pipelines,work-items"
            />
            <p className="mt-1.5 text-[11px] leading-4 text-[rgb(var(--app-text-subtle))]">
              Choose from repositories, pipelines, work-items, and pull-requests. Remote write tools still require approval.
            </p>
          </div>
        )}
      </fieldset>
      {discoveryError && (
        <AdoDiscoveryNotice
          errorMessage={discoveryError}
          failure={discoveryFailure}
          recovery={recovery}
          onRecoverOAuth={onRecoverOAuth}
        />
      )}
    </section>
  );
}

/**
 * MP-001: discovery failures with a typed auth status get an explicit,
 * user-triggered recovery action instead of a bare error line. Typing the
 * organisation never opens the browser; only the button does.
 */
function AdoDiscoveryNotice({
  errorMessage,
  failure,
  recovery,
  onRecoverOAuth,
}: {
  errorMessage: string;
  failure: AdoDiscoveryFailure | null;
  recovery: AdoOauthRecoveryState;
  onRecoverOAuth: (kind: AdoDiscoveryKind) => void;
}): JSX.Element | null {
  if (recovery.phase === "retrying_discovery") {
    return (
      <InlineNotice tone="success" title="Azure DevOps access enabled">
        Signed in. Re-running discovery…
      </InlineNotice>
    );
  }

  const action = failure ? adoRecoveryAction(failure.authStatus, failure.retryable, failure.authMode) : null;
  if (!action) {
    return <InlineNotice tone="danger" title="Azure DevOps discovery failed">{errorMessage}</InlineNotice>;
  }

  if (action === "pat_update") {
    return (
      <InlineNotice tone="warning" title="Azure DevOps discovery failed">
        {errorMessage} Update the stored PAT or use the OAuth flow instead.
      </InlineNotice>
    );
  }

  const inFlight = recovery.phase === "authorizing";
  const label =
    recovery.phase === "declined" || recovery.phase === "failed"
      ? recovery.phase === "declined"
        ? "Authorization declined"
        : "Azure DevOps access failed"
      : action === "reauthorize"
        ? "Azure DevOps authorization expired"
        : "Azure DevOps access required";
  const kind = recovery.kind ?? (failure?.kind ?? "projects");

  return (
    <InlineNotice tone={recovery.phase === "declined" || recovery.phase === "failed" ? "danger" : "warning"} title={label}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          {recovery.phase === "declined" || recovery.phase === "failed"
            ? (recovery.message ?? errorMessage)
            : `${errorMessage} Authorize in your browser to retry discovery in this form.`}
        </span>
        <ActionButton
          type="button"
          tone="primary"
          loading={inFlight}
          disabled={inFlight}
          onClick={() => onRecoverOAuth(kind)}
          className="shrink-0"
        >
          {inFlight ? "Waiting for browser sign-in…" : adoRecoveryActionLabel(action)}
        </ActionButton>
      </div>
    </InlineNotice>
  );
}

export function projectLinkAdoProjectRepoGridClass(): string {
  return "grid min-w-0 gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]";
}
