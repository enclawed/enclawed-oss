import type { RemoteRoot, RootHealth } from "./broker.js";
import type { AnchorCapableDevice } from "./head-anchor.js";
/** What the relay needs from the client's connection to the owner. */
export type AnchorRelayRoot = Pick<RemoteRoot, "members" | "relayAnchor"> & Partial<Pick<RemoteRoot, "relaySealed">>;
/** A relayed anchor read cannot be fresh (see the header); the reader falls back to "offline". */
export declare class RelayedAnchorReadError extends Error {
    constructor();
}
export type RelayedAnchorDevice = AnchorCapableDevice & {
    readonly relayed: true;
    /** The certified primary member's key, the only key a session may be opened against. */
    readonly devicePublicKey: Buffer;
};
/**
 * The client's anchor device through the owner. `health` is this process's view of the root (it
 * must turn non-CLEAN when the owner is lost or replaced). Null when the root is not CLEAN or has
 * no certified primary member.
 */
export declare function relayedAnchorDevice(root: AnchorRelayRoot, health: () => RootHealth): RelayedAnchorDevice | null;
