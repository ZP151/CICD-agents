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
