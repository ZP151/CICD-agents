import { RUNTIME_URL, messageFromErrorResponse } from "./runtime.js";

/** Global read-only kill switch for all remote delivery writes. */
export interface DeliveryWritesState {
  enabled: boolean;
}

export async function fetchDeliveryWritesState(): Promise<DeliveryWritesState> {
  const r = await fetch(`${RUNTIME_URL}/delivery/writes-enabled`);
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Delivery state HTTP ${r.status}`, r));
  return r.json() as Promise<DeliveryWritesState>;
}

export async function setDeliveryWritesEnabled(enabled: boolean): Promise<DeliveryWritesState> {
  const r = await fetch(`${RUNTIME_URL}/delivery/writes-enabled`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Delivery state HTTP ${r.status}`, r));
  return r.json() as Promise<DeliveryWritesState>;
}

export interface DeliveryActionRecord {
  id: string;
  status: string;
  kind: string;
  target: Record<string, unknown>;
  payload: Record<string, unknown>;
  failure?: { kind: string; message: string };
  verificationEvidence?: string[];
}

export async function proposeDeliveryAction(proposal: Record<string, unknown>): Promise<DeliveryActionRecord> {
  const r = await fetch(`${RUNTIME_URL}/delivery/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(proposal),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Propose action HTTP ${r.status}`);
  }
  return r.json() as Promise<DeliveryActionRecord>;
}

export async function approveDeliveryAction(id: string): Promise<DeliveryActionRecord> {
  const r = await fetch(`${RUNTIME_URL}/delivery/actions/${encodeURIComponent(id)}/approve`, {
    method: "POST",
  });
  const body = (await r.json().catch(() => null)) as DeliveryActionRecord | { error?: string } | null;
  if (!r.ok) {
    throw new Error((body as { error?: string } | null)?.error ?? `Approve action HTTP ${r.status}`);
  }
  return body as DeliveryActionRecord;
}
