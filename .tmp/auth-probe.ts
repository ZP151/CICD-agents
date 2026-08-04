import { getAzureDevOpsToken } from "../packages/core/dist/store/azureAuth.js";
import { getSettings } from "../packages/core/dist/settings.js";
async function main() {
  const s = getSettings();
  console.log("dataDir:", s.dataDir, "tenant:", Boolean(s.azureTenantId?.length), "client:", Boolean(s.azureClientId?.length));
  try {
    const t = await getAzureDevOpsToken({ interactive: false });
    console.log("token ok, length:", t.length);
  } catch (err: unknown) {
    console.error("token error:", (err as { code?: string; message?: string })?.code, String((err as { message?: string })?.message ?? err).slice(0, 300));
  }
}
main();
