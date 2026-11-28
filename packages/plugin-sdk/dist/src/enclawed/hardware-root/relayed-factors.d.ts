import type { RemoteRoot, RootHealth } from "./broker.js";
import type { DeviceTotpAccess } from "./totp-verify.js";
/** What the relay needs from the client's connection to the owner. */
export type FactorRelayRoot = Pick<RemoteRoot, "members" | "attest" | "relaySealed" | "relayUnlockUse">;
/**
 * The client's DeviceTotpAccess through the owner. `health` is this process's view of the root
 * (it must turn non-CLEAN when the owner is lost or replaced). Null when the root is not CLEAN.
 */
export declare function relayedTotpAccess(root: FactorRelayRoot, health: () => RootHealth, o?: Readonly<{
    /**
     * Whether a device that refuses the sealed UNLOCK_USE (firmware before command set 0.5, or an
     * owner saying so) may get it in the clear. Default: only when the hardware root is not required.
     */
    clearUnlockUse?: () => boolean;
}>): (DeviceTotpAccess & {
    cert: Buffer;
}) | null;
