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
