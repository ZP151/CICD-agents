import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ProjectLinkInput } from "../../api.js";
import { ProjectLinkAdoSection, projectLinkAdoProjectRepoGridClass } from "./ProjectLinkAdoSection.js";
import {
  ADO_OAUTH_RECOVERY_IDLE,
  adoOauthRecoveryAuthorized,
  adoOauthRecoveryDeclined,
  adoOauthRecoveryStart,
} from "./adoOauthRecovery.js";
import type { AdoDiscoveryFailure } from "./useProjectLinkFormRuntime.js";

const baseForm: ProjectLinkInput = {
  name: "example link",
  repoPath: "C:\\repo\\example",
  defaultBranch: "main",
  targetBranch: "main",
  adoOrgUrl: "https://example-org.visualstudio.com/",
  adoProject: "example-project",
  adoRepoName: "example-repo",
  adoPipelineId: "",
  adoPipelineName: "",
  adoPat: "",
  adoMcpEnabled: false,
  adoMcpCommand: "",
  adoMcpAuthentication: "",
  adoMcpDomains: "repositories,pipelines,work-items",
  projectTemplate: "",
  buildCommand: "",
  testCommand: "",
};

const noop = (): void => undefined;

function renderSection(overrides: {
  discoveryError?: string | null;
  discoveryFailure?: AdoDiscoveryFailure | null;
  recovery?: typeof ADO_OAUTH_RECOVERY_IDLE;
  onRecoverOAuth?: (kind: "projects" | "repositories" | "pipelines") => void;
} = {}): string {
  return renderToStaticMarkup(
    <ProjectLinkAdoSection
      form={baseForm}
      set={() => () => undefined}
      discovered={{ projects: [], repositories: [], pipelines: [] }}
      discovering={null}
      discoveryError={overrides.discoveryError ?? null}
      discoveryFailure={overrides.discoveryFailure ?? null}
      recovery={overrides.recovery ?? ADO_OAUTH_RECOVERY_IDLE}
      onRecoverOAuth={overrides.onRecoverOAuth ?? noop}
      onApplyDiscovery={noop}
      onManualProjectChange={noop}
      onManualRepositoryChange={noop}
      onManualPipelineChange={noop}
    />,
  );
}

const oauthFailure: AdoDiscoveryFailure = {
  kind: "projects",
  message: "Azure DevOps OAuth token is unavailable.",
  authStatus: "oauth_unavailable",
  authMode: "oauth",
  retryable: true,
};

describe("ProjectLinkAdoSection layout", () => {
  it("lets project and repository fields reflow by available width", () => {
    const className = projectLinkAdoProjectRepoGridClass();

    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,14rem),1fr)");
    expect(className).toContain("gap-3");
    expect(className).not.toContain("sm:grid-cols-2");
  });
});

describe("ProjectLinkAdoSection OAuth recovery (MP-001)", () => {
  it("shows a plain danger notice for non-auth failures without a recovery button", () => {
    const html = renderSection({ discoveryError: "repo_path_not_found" });

    expect(html).toContain("Azure DevOps discovery failed");
    expect(html).not.toContain("Enable Azure DevOps access");
  });

  it("offers Enable Azure DevOps access for oauth_unavailable", () => {
    const html = renderSection({
      discoveryError: oauthFailure.message,
      discoveryFailure: oauthFailure,
    });

    expect(html).toContain("Azure DevOps access required");
    expect(html).toContain("Enable Azure DevOps access");
    expect(html).not.toContain("Waiting for browser sign-in");
  });

  it("shows an in-flight waiting state while the browser is open", () => {
    const html = renderSection({
      discoveryError: oauthFailure.message,
      discoveryFailure: oauthFailure,
      recovery: adoOauthRecoveryStart(ADO_OAUTH_RECOVERY_IDLE, "projects"),
    });

    expect(html).toContain("Waiting for browser sign-in…");
    expect(html).not.toContain("Enable Azure DevOps access");
  });

  it("turns the notice success-toned while the one-shot retry runs", () => {
    const html = renderSection({
      discoveryError: oauthFailure.message,
      discoveryFailure: oauthFailure,
      recovery: adoOauthRecoveryAuthorized(
        adoOauthRecoveryStart(ADO_OAUTH_RECOVERY_IDLE, "projects"),
      ),
    });

    expect(html).toContain("Signed in. Re-running discovery…");
    expect(html).not.toContain("Enable Azure DevOps access");
  });

  it("shows Authorization declined with a retry action and keeps the form intact", () => {
    const html = renderSection({
      discoveryError: oauthFailure.message,
      discoveryFailure: oauthFailure,
      recovery: adoOauthRecoveryDeclined(
        adoOauthRecoveryStart(ADO_OAUTH_RECOVERY_IDLE, "projects"),
        "Authorization declined. You can retry when you are ready.",
      ),
    });

    expect(html).toContain("Authorization declined");
    expect(html).toContain("Enable Azure DevOps access");
    expect(html).toContain("example-project");
  });

  it("advises updating the PAT without opening a browser for PAT failures", () => {
    const html = renderSection({
      discoveryError: "PAT is missing required scopes.",
      discoveryFailure: {
        kind: "repositories",
        message: "PAT is missing required scopes.",
        authStatus: "pat_invalid_or_missing_scope",
        authMode: "pat",
        retryable: false,
      },
    });

    expect(html).toContain("Update the stored PAT");
    expect(html).not.toContain("Enable Azure DevOps access");
  });
});
