// Marks an async scope whose outbound payload has already been through the
// `message_sending` and `media_sending` hooks, so nested send paths (a channel
// reply deliverer that itself calls `deliverOutboundPayloads` or the shared
// sending helper) do not mediate the same bytes a second time. A second pass
// would add a second delay, a second ledger charge and a second round of
// noise to one message.
//
// The scope is set only by the core reply dispatcher around a channel's
// `deliver` callback, after it ran the hooks itself. Kept dependency-free so
// the dispatcher hot path pays only for `node:async_hooks`.

import { AsyncLocalStorage } from "node:async_hooks";

const mediatedScope = new AsyncLocalStorage<true>();

/** True inside a delivery whose payload already ran the outbound sending hooks. */
export function isOutboundSendMediated(): boolean {
  return mediatedScope.getStore() === true;
}

/** Run `fn` as a delivery whose payload already ran the outbound sending hooks. */
export function runAsMediatedOutboundSend<T>(fn: () => T): T {
  return mediatedScope.run(true, fn);
}
