export type Latch = {
    path: string;
    status?: string;
    bound?: {
        serial?: string;
        pubkey?: string;
        uid?: string;
    } | null;
    dirty?: {
        reason?: string;
    } | null;
    sessionOpen?: boolean;
};
/** The file name of one device's latch when several devices are bound. */
export declare function memberLatchName(uid: string): string;
/**
 * Every latch on this host: the single-device one at `statePath`, each
 * device's own beside it, and any an earlier version left in `legacyDir`.
 */
export declare function hostLatches(statePath: string, legacyDir?: string): Latch[];
/** The first latch left DIRTY, or null. */
export declare function dirtyLatch(latches: Latch[]): Latch | null;
