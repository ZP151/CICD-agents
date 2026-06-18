import type { AzureUser } from "./azureAuthTypes.js";

export function selectMsalAccount<T extends { homeAccountId?: string; username?: string }>(
  accounts: T[],
  requestedHomeAccountId: string | undefined,
  activeUser: AzureUser | null,
): T | undefined {
  if (requestedHomeAccountId) {
    const requested = accounts.find((candidate) => candidate.homeAccountId === requestedHomeAccountId);
    if (requested) return requested;
  }
  if (activeUser?.homeAccountId) {
    const active = accounts.find((candidate) => candidate.homeAccountId === activeUser.homeAccountId);
    if (active) return active;
  }
  if (activeUser?.upn || activeUser?.username) {
    const activeName = (activeUser.upn ?? activeUser.username ?? "").toLowerCase();
    const active = accounts.find((candidate) => candidate.username?.toLowerCase() === activeName);
    if (active) return active;
  }
  return accounts[0];
}
