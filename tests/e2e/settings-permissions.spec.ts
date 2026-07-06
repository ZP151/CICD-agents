import { expect, type Page, test } from "@playwright/test";

const keyVaultPermissionMessage =
  "Azure Key Vault permission is missing. The signed-in Azure account needs secrets/get access to https://devagentkv001.vault.azure.net/.";

async function mockSettingsRuntime(page: Page): Promise<Array<Record<string, unknown>>> {
  const configureRequests: Array<Record<string, unknown>> = [];

  await page.route(/http:\/\/(127\.0\.0\.1|localhost):8787\/.*/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });

  await page.route(/http:\/\/(127\.0\.0\.1|localhost):8787\/healthz/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        llmConfigured: true,
        llmProvider: "azure",
        envSource: "C:\\Users\\15492\\.mergepilot\\config.toml",
        azureDeployment: "gpt-4o",
        azureApiVersion: "2024-08-01-preview",
        azureEndpoint: "https://devagentproj-resource.openai.azure.com",
        keyVaultSecretError: keyVaultPermissionMessage,
        cloudProjectLinkStore: true,
        cloudSecrets: false,
        cloudSessions: true,
      }),
    });
  });

  await page.route(/http:\/\/(127\.0\.0\.1|localhost):8787\/auth\/status/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        name: "Zhou Ping",
        upn: "Zhou.Ping@totalebizsolutions.com",
        tenantId: "1f432b2e-9e7a-4aa0-ace2-53af62d309f6",
        azureAuthConfig: {
          tenantId: "1f432b2e-9e7a-4aa0-ace2-53af62d309f6",
          clientId: "03da33ef-7161-4b27-ae80-3079313f131d",
          usesDefaultTenant: false,
          usesDefaultClient: false,
          azureDevOpsScopes: ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"],
        },
      }),
    });
  });

  await page.route(/http:\/\/(127\.0\.0\.1|localhost):8787\/daemon\/config$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        llmProvider: "azure",
        secretSource: "key_vault",
        azureDeployment: "gpt-4o",
        azureEmbeddingDeployment: "text-embedding-3-small",
        azureApiVersion: "2024-08-01-preview",
        azureEndpoint: "https://devagentproj-resource.openai.azure.com",
        openaiModel: "",
        aoaiKeyInVault: false,
        azureStorageAccount: "devagentstorage001",
        azureKeyVaultUrl: "https://devagentkv001.vault.azure.net/",
        azureCosmosEndpoint: "https://devagentcosmos001.documents.azure.com:443/",
        azureTenantId: "1f432b2e-9e7a-4aa0-ace2-53af62d309f6",
        azureClientId: "03da33ef-7161-4b27-ae80-3079313f131d",
        azureAuthUsesDefaultTenant: false,
        azureAuthUsesDefaultClient: false,
        reviewAutoApproveEnabled: true,
        reviewStaleAgeHours: 24,
        keyVaultSecretError: keyVaultPermissionMessage,
      }),
    });
  });

  await page.route(/http:\/\/(127\.0\.0\.1|localhost):8787\/daemon\/configure/, async (route) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = route.request().postDataJSON() as Record<string, unknown>;
    } catch {
      payload = {};
    }
    configureRequests.push(payload);
    if (payload.secretSource === "key_vault") {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          code: "key_vault_permission_required",
          message:
            "Azure Key Vault permission is missing. The signed-in Azure account needs secrets/set access to https://devagentkv001.vault.azure.net/.",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        llmConfigured: true,
        cloudProjectLinkStore: true,
        cloudSecrets: false,
        cloudSessions: true,
      }),
    });
  });

  return configureRequests;
}

test("@smoke @mocked settings explains missing Key Vault permission and can switch built-in model secrets to local env", async ({
  page,
}) => {
  const configureRequests = await mockSettingsRuntime(page);

  await page.addInitScript(() => {
    localStorage.removeItem("mergepilot_settings");
  });

  await page.goto("/#/settings");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Azure Key Vault permission is missing")).toBeVisible();
  await expect(page.getByText("secrets/get access to https://devagentkv001.vault.azure.net/")).toBeVisible();
  await expect(page.getByRole("button", { name: "Key Vault" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Local .env" }).click();

  await expect
    .poll(() => configureRequests.some((request) => request.secretSource === "local_env"))
    .toBe(true);
  await expect(page.getByText("Azure Key Vault permission is missing")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Local .env" })).toHaveAttribute("aria-pressed", "true");

  const requestCountBeforeKeyVaultRetry = configureRequests.length;
  await page.getByRole("button", { name: "Key Vault" }).click();

  await expect
    .poll(() =>
      configureRequests
        .slice(requestCountBeforeKeyVaultRetry)
        .some((request) => request.secretSource === "key_vault"),
    )
    .toBe(true);
  await expect(page.getByText("secrets/set access to https://devagentkv001.vault.azure.net/")).toBeVisible();
});
