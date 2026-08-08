/**
 * Global read-only kill switch for all remote delivery writes.
 *
 * Shared by the delivery REST routes and the chat delivery_propose_action
 * tool so one switch covers every write path. Defaults to enabled; the
 * desktop Built-in capabilities settings exposes it.
 */
export const deliveryWritesState = {
  enabled: true,
};
