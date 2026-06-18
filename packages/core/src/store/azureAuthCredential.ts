import {
  DefaultAzureCredential,
  InteractiveBrowserCredential,
  useIdentityPlugin,
  type TokenCredential,
} from "@azure/identity";
import { cachePersistencePlugin } from "@azure/identity-cache-persistence";
import { browserCompletionTemplate } from "./azureAuthBrowser.js";
import {
  REDIRECT_URI,
  TOKEN_CACHE_NAME,
  desktopClientId,
  desktopTenantId,
} from "./azureAuthConfig.js";

let pluginRegistered = false;

function registerCachePersistence(): void {
  if (pluginRegistered) return;
  useIdentityPlugin(cachePersistencePlugin);
  pluginRegistered = true;
}

export function getAzureCredential(opts: {
  interactive?: boolean;
} = {}): TokenCredential {
  const tenantId = desktopTenantId();
  const clientId = desktopClientId();

  if (tenantId || clientId || opts.interactive) {
    registerCachePersistence();
    return new InteractiveBrowserCredential({
      tenantId,
      clientId,
      redirectUri: REDIRECT_URI,
      disableAutomaticAuthentication: !opts.interactive,
      browserCustomizationOptions: {
        successMessage: browserCompletionTemplate({
          title: "You're signed in",
          message: "Microsoft sign-in is complete. Return to the app to continue your work.",
        }),
        errorMessage: browserCompletionTemplate({
          title: "Sign-in did not complete",
          message: "Return to the app and start Microsoft sign-in again.",
          tone: "error",
        }),
      },
      tokenCachePersistenceOptions: {
        enabled: true,
        name: TOKEN_CACHE_NAME,
      },
    });
  }

  return new DefaultAzureCredential();
}
