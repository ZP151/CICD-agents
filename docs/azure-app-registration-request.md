# Azure App Registration Request — CI/CD Agent Desktop

## Purpose

The **CI/CD Agent** is an internal desktop application (Windows/macOS) that assists developers with repository indexing, pull request preparation, and pipeline automation. It is distributed as a packaged installer to company employees.

The application needs to authenticate users against Azure Active Directory so that it can:

- Identify the signed-in employee (display name, UPN, Object ID)
- Access Azure DevOps APIs on the user's behalf
- Access Azure Storage / Cosmos DB for user-scoped session data

Currently the app relies on the Azure CLI being installed on each user's machine. This is not viable for general distribution. We need a first-party App Registration so the app can authenticate users natively via MSAL (Microsoft Authentication Library) without any external tooling dependency.

---

## What We Need

Please create one **App Registration** in Azure Active Directory with the following configuration.

### Basic Settings

| Field | Value |
|---|---|
| **Display name** | CI/CD Agent Desktop |
| **Supported account types** | Accounts in this organizational directory only (single tenant) |
| **Platform** | Mobile and desktop applications |
| **Redirect URI** | `http://localhost` (loopback, required by MSAL Auth Code + PKCE desktop flow) |

### API Permissions Required

| API | Permission | Type | Reason |
|---|---|---|---|
| Microsoft Graph | `User.Read` | Delegated | Read signed-in user's profile (name, UPN) |
| Azure DevOps | `user_impersonation` | Delegated | Call Azure DevOps REST API on behalf of the user |
| Azure Storage | `user_impersonation` | Delegated | Access user-scoped Blob / Table storage |

> All permissions are **Delegated** (act on behalf of the signed-in user). No application-level or admin-only permissions are required.

### Token Configuration

| Setting | Value |
|---|---|
| **Access tokens** | Enabled |
| **ID tokens** | Enabled |
| Allow public client flows | **Yes** — required for Auth Code + PKCE loopback flow from a desktop app |

---

## Authentication Flow

The app uses **OAuth 2.0 Authorization Code + PKCE** (the recommended desktop browser flow):

1. App starts a temporary HTTP server on `http://localhost:{random-port}`.
2. App opens the user's chosen browser (Edge or Chrome) to the Microsoft identity platform sign-in URL.
3. User signs in with their company account — saved browser credentials / Windows SSO pre-fill the form automatically.
4. Microsoft redirects back to `http://localhost:{port}` with an auth code.
5. App exchanges the code for `access_token` + `id_token`, extracts `oid`, `upn`, and `name` from the JWT — no extra Graph call needed.
6. Tokens are persisted in OS-native secure storage (Windows DPAPI / macOS Keychain) for silent re-authentication on the next app start.

No client secret or certificate is required. The app is a **public client** (installed on end-user machines; secrets cannot be kept confidential).

> **Note:** `http://localhost` (no port) as the redirect URI covers all loopback ports per [Microsoft's loopback redirect URI policy](https://learn.microsoft.com/en-us/azure/active-directory/develop/reply-url#localhost-exceptions).

---

## What We Will Do With the Credentials

After the App Registration is created, we only need two values to embed in the app:

| Value | Where used |
|---|---|
| **Application (client) ID** | Hardcoded in the desktop app build |
| **Directory (tenant) ID** | Hardcoded in the desktop app build |

No secret, certificate, or service principal key is involved.

---

## Security Notes

- The app never stores passwords or secrets.
- Tokens are kept in the OS-native secure storage (Windows Credential Manager / macOS Keychain) by MSAL's token cache.
- The redirect URI `http://localhost` is a loopback address — it never leaves the user's machine. This is the [Microsoft-recommended pattern](https://learn.microsoft.com/en-us/azure/active-directory/develop/scenario-desktop-acquire-token-interactive) for native desktop apps.
- All network calls go directly to `login.microsoftonline.com` — no third-party auth proxy.

---

## Reference

- [Microsoft Docs — Auth Code + PKCE for desktop apps](https://learn.microsoft.com/en-us/azure/active-directory/develop/scenario-desktop-acquire-token-interactive)
- [MSAL Node — Interactive auth (loopback)](https://learn.microsoft.com/en-us/azure/active-directory/develop/msal-node-migration#interactive-flows)
- [Public client application (no secret)](https://learn.microsoft.com/en-us/azure/active-directory/develop/msal-client-applications)
- [Localhost redirect URI policy](https://learn.microsoft.com/en-us/azure/active-directory/develop/reply-url#localhost-exceptions)
