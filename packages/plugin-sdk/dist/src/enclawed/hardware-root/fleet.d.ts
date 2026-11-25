import { Enclaweder, type EnclawederSku } from "./enclaweder-hid.js";
import { HardwareRootGuard, type GuardDevice } from "./guard.js";
/** The product name for a SKU, so single-device callers render it identically. */
export declare function skuDisplayName(sku: EnclawederSku): string;
export interface FleetMember {
    index: number;
    /** The member's birth certificate (hex), verified at bind; broker clients re-verify it. */
    cert?: string;
    /** Full product name from the signed certificate: "Enclaweder" or "Enclaweder Pro". */
    skuName: string;
    path: string;
    serial: string;
    uid: string;
    pubkey: string;
    sku: EnclawederSku;
    status: string;
    /** True once enrolment for the fleet's current measurement is confirmed for this member. */
    attestReady: boolean;
    inFlight: number;
    completed: number;
}
export interface FleetBootOptions {
    /** Explicit device paths. Defaults to every enclaweder on the bus. */
    paths?: string[];
    /** Directory for per-member guard state files. Each member gets its own, named by its uid. */
    stateDir?: string;
    onHalt?: (reason: string, member: FleetMember | null) => void;
    /** Require at least this many members, else refuse to boot (fail-secure). Default 1. */
    minMembers?: number;
    /** Pin ONE manufacturer root for every member -- i.e. require a single SKU across the fleet.
     *  Omitted (the default) accepts any pinned domain, so base and Pro units bind side by side.
     *  Also the seam the tests use to mint certs under a throwaway root. */
    rootPubkey?: Buffer;
    /** How many devices to bind concurrently at boot. Default 32. */
    bootConcurrency?: number;
    /** Test seam: construct a device from a path. */
    openDevice?: (path: string) => Enclaweder & GuardDevice;
}
export declare class HardwareRootFleet {
    private slots;
    private pending;
    private pendingHead;
    private idle;
    private notClean;
    private onHalt;
    private halted;
    private constructor();
    /**
     * Detect, verify and bind every connected enclaweder. Each member is verified independently and
     * against ITS OWN trust domain, so a base unit and a Pro unit both bind, each proving genuineness
     * to the root that actually signed it. A member that fails to verify is fatal: booting a fleet
     * while ignoring a device that claims to be an enclaweder but cannot prove it is precisely the
     * situation the guard exists to refuse.
     */
    static boot(opts?: FleetBootOptions): Promise<HardwareRootFleet>;
    private memberHalted;
    get size(): number;
    /** Member 0's guard and device. The single-device API reuses these rather than opening a SECOND
     *  fd to the same hidraw node: two fds on one device means two interleaved request streams and
     *  two heartbeat timers, and the device rejects the interleaved frames. */
    get primary(): {
        guard: HardwareRootGuard;
        dev: Enclaweder & GuardDevice;
    } | null;
    /** Close the accredited session on every member. See closeHardwareRootSession(). */
    closeSession(): void;
    /** As closeSession(), awaiting each device's acknowledgement of the clean close. */
    closeSessionAsync(): Promise<void>;
    /** CLEAN only while every member is CLEAN. */
    get status(): "CLEAN" | "DIRTY";
    /**
     * Snapshot of every member. Each slot owns ONE view object mutated in place, so this is a
     * shallow copy rather than N fresh allocations. It used to be called once per dispatched job,
     * making every job O(N) in allocations: at 4096 devices that alone cost 85 us of bookkeeping per
     * job and made the fleet, not the hardware, the ceiling. Nothing on the hot path calls it now.
     */
    get members(): FleetMember[];
    /** How many of each SKU are bound -- for the audit trail, not for trust decisions. */
    get composition(): Record<EnclawederSku, number>;
    /** Throws unless EVERY member is present and CLEAN. */
    assertClean(): void;
    /**
     * Heartbeat every member, with start times STAGGERED across the interval: 4096 guards polling on
     * the same tick would put 4096 USB round trips into one moment and starve real work, while
     * spreading them keeps each device on its own cadence at a steady aggregate rate.
     */
    startHeartbeat(opts?: {
        intervalMs?: number;
    }): void;
    stopHeartbeat(): void;
    /**
     * Submit one job to the fleet. Devices PULL work as they go idle rather than the caller assigning
     * it up front, which is what makes a MIXED fleet actually faster: submit a batch and the Pro
     * members -- roughly 2x the signing rate of a base member -- simply take more of it. Measured on
     * a real base+Pro pair: 20 signatures split 14/6, 31.6 sig/s against 21.9 for the Pro alone.
     * Assigning by least-in-flight at submission time degenerates to round-robin, because when a
     * caller submits a batch nothing has completed yet and every device looks equally idle.
     */
    run<T>(fn: (dev: Enclaweder & GuardDevice, member: FleetMember) => Promise<T>): Promise<T>;
    /**
     * Hand queued work to idle devices. Both sides are O(1) per job: idle slots are popped off a
     * stack instead of rescanning all N, and the pending queue is consumed with a head index instead
     * of shift(). At 4096 members the scan-everything version cost 85 us per job; this is flat.
     */
    private pump;
    private markIdle;
    private enqueue;
    /**
     * Run one job on a SPECIFIC member, still queued behind that device's other work. Needed for
     * per-device measurement and diagnostics: run() deliberately picks by load, so it cannot time a
     * single device. Throws if the member does not exist or is not CLEAN.
     */
    runOn<T>(index: number, fn: (dev: Enclaweder & GuardDevice, member: FleetMember) => Promise<T>): Promise<T>;
    /** Run the same job on EVERY member, in parallel. Used for corroboration, not throughput. */
    all<T>(fn: (dev: Enclaweder & GuardDevice, member: FleetMember) => Promise<T>): Promise<Array<{
        member: FleetMember;
        value: T | null;
        error: Error | null;
    }>>;
    /**
     * Enrol every member on one measurement so the fleet can attest it.
     *
     * Returns the members that are attest-ready. A member whose enrolment is refused is NOT made
     * ready: it is already holding a genesis (immutable until power cycle) that we cannot read back,
     * and attesting a mismatched measurement would fail-secure ZEROIZE it. `adoptExisting` is the
     * caller asserting that an already-enrolled member holds THIS measurement -- an assertion only a
     * human who provisioned it can make, which is why it is never the default.
     */
    enrollAll(meas32: Buffer, { adoptExisting }?: {
        adoptExisting?: boolean;
    }): Promise<FleetMember[]>;
    /** Attest on the least-loaded attest-ready member. */
    attest(meas32: Buffer, nonce32: Buffer): Promise<{
        member: FleetMember;
        result: unknown;
    }>;
    close(): void;
}
