import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AuthUser, HealthStatus } from "../../api.js";
import { AccountSettingsSection, BuiltInCapabilitiesSettingsSection } from "./AccountSettingsSection.js";
import type { AppSettings } from "./settingsTypes.js";

const authUser: AuthUser = {
  authenticated: true,
  name: "Zhou Ping",
  upn: "Zhou.Ping@totalebizsolutions.com",
  oid: "oid-1",
  fromCache: false,
  azureAuthConfig: {
    tenantId: "tenant-1",
    clientId: "client-1",
    usesDefaultTenant: false,
    usesDefaultClient: false,
    azureDevOpsScopes: ["499b84ac-1321-427f-aa17-267ca6975798/.default"],
  },
};

const settings: AppSettings = {
  workMode: "coding",
  defaultOpenDestination: "vscode",
  terminalShell: "powershell",
  language: "auto",
  inferenceSpeed: "fast",
  codeReviewMode: "inline",
  suggestedPrompts: true,
  secretSource: "local_env",
  additionalModels: [],
  azureTenantId: "tenant-1",
  azureClientId: "client-1",
};

const health: HealthStatus = {
  ok: true,
  cloudProjectLinkStore: true,
  cloudSessions: false,
};

function renderAccountSection(
  overrides: Partial<{
    authUser: AuthUser;
    settings: AppSettings;
    health: HealthStatus | null;
  }> = {},
): string {
  return renderToStaticMarkup(
    <AccountSettingsSection
      authUser={overrides.authUser ?? authUser}
      health={overrides.health ?? health}
      settings={overrides.settings ?? settings}
      onSettingChange={() => undefined}
    />,
  );
}

describe("AccountSettingsSection", () => {
  it("keeps personal identity details out of the default visible settings row", () => {
    const html = renderAccountSection();

    expect(html).toContain("Signed in");
    expect(html).toContain('title="Zhou Ping - Zhou.Ping@totalebizsolutions.com"');
    expect(html).toContain("Active");
    expect(html).not.toContain(">Zhou Ping</p>");
    expect(html).not.toContain(">Zhou.Ping@totalebizsolutions.com</p>");
    expect(html).not.toContain("Azure session");
  });

  it("keeps Azure auth fields available inside a collapsed advanced section", () => {
    const html = renderAccountSection();

    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("Advanced Azure auth");
    expect(html).toContain("Azure tenant ID");
    expect(html).toContain("Azure client ID");
    expect(html).toContain("Application client ID for Azure DevOps delegated access.");
    expect(html).toContain('value="tenant-1"');
    expect(html).toContain('value="client-1"');
    expect(html).not.toContain("settings-advanced-meta");
  });

  it("summarizes managed storage in the compact identity strip", () => {
    const html = renderAccountSection();

    expect(html).toContain("Cloud enabled");
    expect(html).not.toContain("Managed storage");
    expect(html).not.toContain("Project Link storage");
    expect(html).not.toContain("Session storage");
  });

  it("keeps delivery capabilities out of the account group", () => {
    const html = renderAccountSection();

    expect(html).not.toContain("Capabilities");
    expect(html).not.toContain("Allow approved remote writes");
  });

  it("keeps delivery permissions in their own section", () => {
    const html = renderToStaticMarkup(<BuiltInCapabilitiesSettingsSection authUser={authUser} />);

    expect(html).toContain("Capabilities");
    expect(html).toContain("Connected as Zhou Ping.");
    expect(html).toContain("Allow approved remote writes");
  });
});
