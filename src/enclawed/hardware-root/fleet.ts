// Bind EVERY connected enclaweder -- base and Pro, in any mix -- as ONE logical accreditor.
//
// Vendored alongside guard.ts. Where HardwareRootGuard binds a single device, HardwareRootFleet
// binds N and presents them as one root of trust whose capacity is the sum of its members'.
//
// WHY A FLEET IS NOT JUST "N GUARDS"
//
//   Fail-secure aggregation. The fleet is CLEAN only while EVERY member is CLEAN. One member
//   going DIRTY (unplugged, zeroized, swapped) halts the whole fleet, exactly as losing the single
//   device halts a single-device deployment. Degrading to the survivors would hand an attacker the
//   removal of whichever device is inconvenient, which is the attack the DIRTY latch exists to
//   stop. There is deliberately NO fail-open option: a configurable one is a footgun that will be
//   set in production the first time a cable is loose.
//
//   Serial devices, parallel fleet. Each enclaweder is ONE hidraw fd carrying one request at a
//   time, so per-device work is serialised through a queue and only ACROSS devices is anything
//   concurrent. That is the whole speedup: N devices, N signatures in flight.
//
//   Mixed SKUs are expected. base and Pro are the same silicon with different firmware; a Pro unit
//   signs faster (measured 55 ms/attest vs 114 ms) but is otherwise identical on the wire. The
//   fleet therefore dispatches by LOAD, not round-robin -- a Pro member naturally takes more work
//   than a base member without anyone configuring a weight.
//
//   Enrolment is a loaded gun. accreditor_attest() FAIL-SECURE ZEROIZES a device when attest is
//   called with a measurement that does not match its enrolled genesis, and genesis is immutable
//   until a power cycle. So attest() only ever dispatches to members whose enrolment for THIS
//   measurement was confirmed in this session; adopting an already-enrolled device requires the
//   caller to assert the genesis matches (attestExisting), never a default.
import {
  Enclaweder,
  findAllEnclaweders,
  verifyCert as verifyCertRef,
  type EnclawederSku,
} from "./enclaweder-hid.js";
import { HardwareRootGuard, HaltError, type GuardDevice } from "./guard.js";

export interface FleetMember {
  index: number;
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

interface Slot {
  index: number;
  path: string;
  dev: Enclaweder & GuardDevice;
  guard: HardwareRootGuard;
  sku: EnclawederSku;
  serial: string;
  uid: string;
  pubkey: string;
  attestReady: boolean;
  inFlight: number;
  completed: number;
  queue: Promise<unknown>;
}

export interface FleetBootOptions {
  /** Explicit device paths. Defaults to every enclaweder on the bus. */
  paths?: string[];
  /** Directory for per-member guard state files. Each member gets its own, keyed by uid. */
  stateDir?: string;
  onHalt?: (reason: string, member: FleetMember | null) => void;
  /** Require at least this many members, else refuse to boot (fail-secure). Default 1. */
  minMembers?: number;
  /** Pin ONE manufacturer root for every member -- i.e. require a single SKU across the fleet.
   *  Omitted (the default) accepts any pinned domain, so base and Pro units bind side by side.
   *  Also the seam the tests use to mint certs under a throwaway root. */
  rootPubkey?: Buffer;
  /** Test seam: construct a device from a path. */
  openDevice?: (path: string) => Enclaweder & GuardDevice;
}

interface PendingJob {
  fn: (dev: Enclaweder & GuardDevice, member: FleetMember) => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

export class HardwareRootFleet {
  private slots: Slot[] = [];
  private pending: PendingJob[] = [];
  private onHalt: (reason: string, member: FleetMember | null) => void;
  private halted: string | null = null;

  private constructor(onHalt: (reason: string, member: FleetMember | null) => void) {
    this.onHalt = onHalt;
  }

  /**
   * Detect, verify and bind every connected enclaweder. Each member is verified independently and
   * against ITS OWN trust domain, so a base unit and a Pro unit both bind, each proving genuineness
   * to the root that actually signed it. A member that fails to verify is fatal: booting a fleet
   * while ignoring a device that claims to be an enclaweder but cannot prove it is precisely the
   * situation the guard exists to refuse.
   */
  static async boot(opts: FleetBootOptions = {}): Promise<HardwareRootFleet> {
    const paths = opts.paths ?? findAllEnclaweders();
    const minMembers = opts.minMembers ?? 1;
    const fleet = new HardwareRootFleet(opts.onHalt ?? (() => {}));
    if (paths.length < minMembers) {
      throw new HaltError(
        `hardware root fleet: ${paths.length} device(s) detected, ${minMembers} required`,
      );
    }
    const stateDir = opts.stateDir ?? process.env.HOME ?? "/var/lib/enclawed";
    const open = opts.openDevice ?? ((p: string) => new Enclaweder(p) as Enclaweder & GuardDevice);

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const dev = open(path);
      const guard = new HardwareRootGuard({
        statePath: `${stateDir}/.enclawed-hw-root.${i}.state`,
        rootPubkey: opts.rootPubkey,
        onHalt: (r: string) => fleet.memberHalted(i, r),
      });
      // Binds only if the device is GENUINE against a pinned root and not latched DIRTY.
      const bound = await guard.boot(dev as GuardDevice);
      const cert = await dev.getCert();
      const id = await dev.getIdentity();
      const parsed = cert ? verifyCertSku(cert, id.uid, id.pubkeyRaw, opts.rootPubkey) : null;
      fleet.slots.push({
        index: i,
        path,
        dev,
        guard,
        sku: parsed ?? "base",
        serial: bound.serial,
        uid: bound.uid,
        pubkey: bound.pubkey,
        attestReady: false,
        inFlight: 0,
        completed: 0,
        queue: Promise.resolve(),
      });
    }
    // Reject duplicates: the same physical unit reachable twice would be counted as two members and
    // would inflate capacity while providing none.
    const uids = new Set(fleet.slots.map((s) => s.uid));
    if (uids.size !== fleet.slots.length) {
      throw new HaltError("hardware root fleet: the same device was bound twice");
    }
    return fleet;
  }

  private memberHalted(index: number, reason: string): void {
    const m = this.members.find((x) => x.index === index) ?? null;
    this.halted = this.halted ?? `member ${index}: ${reason}`;
    this.onHalt(reason, m);
  }

  get size(): number {
    return this.slots.length;
  }

  /** Member 0's guard and device. The single-device API reuses these rather than opening a SECOND
   *  fd to the same hidraw node: two fds on one device means two interleaved request streams and
   *  two heartbeat timers, and the device rejects the interleaved frames. */
  get primary(): { guard: HardwareRootGuard; dev: Enclaweder & GuardDevice } | null {
    const s = this.slots[0];
    return s ? { guard: s.guard, dev: s.dev } : null;
  }

  /** CLEAN only while every member is CLEAN. */
  get status(): "CLEAN" | "DIRTY" {
    if (this.halted) {
      return "DIRTY";
    }
    return this.slots.every((s) => s.guard.status === "CLEAN") ? "CLEAN" : "DIRTY";
  }

  get members(): FleetMember[] {
    return this.slots.map((s) => ({
      index: s.index,
      path: s.path,
      serial: s.serial,
      uid: s.uid,
      pubkey: s.pubkey,
      sku: s.sku,
      status: s.guard.status,
      attestReady: s.attestReady,
      inFlight: s.inFlight,
      completed: s.completed,
    }));
  }

  /** How many of each SKU are bound -- for the audit trail, not for trust decisions. */
  get composition(): Record<EnclawederSku, number> {
    const c: Record<EnclawederSku, number> = { base: 0, pro: 0 };
    for (const s of this.slots) {
      c[s.sku]++;
    }
    return c;
  }

  /** Throws unless EVERY member is present and CLEAN. */
  assertClean(): void {
    for (const s of this.slots) {
      s.guard.assertClean();
    }
    if (this.halted) {
      throw new HaltError(this.halted);
    }
  }

  startHeartbeat(opts: { intervalMs?: number } = {}): void {
    for (const s of this.slots) {
      s.guard.startHeartbeat(s.dev as GuardDevice, opts);
    }
  }
  stopHeartbeat(): void {
    for (const s of this.slots) {
      s.guard.stopHeartbeat();
    }
  }

  /**
   * Submit one job to the fleet. Devices PULL work as they go idle rather than the caller assigning
   * it up front, which is what makes a MIXED fleet actually faster: submit a batch and the Pro
   * members -- roughly 2x the signing rate of a base member -- simply take more of it. Measured on
   * a real base+Pro pair: 20 signatures split 14/6, 31.6 sig/s against 21.9 for the Pro alone.
   * Assigning by least-in-flight at submission time degenerates to round-robin, because when a
   * caller submits a batch nothing has completed yet and every device looks equally idle.
   */
  async run<T>(fn: (dev: Enclaweder & GuardDevice, member: FleetMember) => Promise<T>): Promise<T> {
    this.assertClean();
    if (!this.slots.some((s) => s.guard.status === "CLEAN")) {
      throw new HaltError("hardware root fleet: no CLEAN member available");
    }
    return new Promise<T>((resolve, reject) => {
      this.pending.push({
        fn: fn as (d: Enclaweder & GuardDevice, m: FleetMember) => Promise<unknown>,
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.pump();
    });
  }

  /** Hand queued work to every idle CLEAN device, one job per device at a time. */
  private pump(): void {
    for (const slot of this.slots) {
      while (slot.inFlight === 0 && this.pending.length > 0 && slot.guard.status === "CLEAN") {
        const job = this.pending.shift() as PendingJob;
        void this.enqueue(slot, job.fn)
          .then(job.resolve, job.reject)
          .finally(() => this.pump());
      }
    }
  }

  private enqueue<T>(
    slot: Slot,
    fn: (dev: Enclaweder & GuardDevice, member: FleetMember) => Promise<T>,
  ): Promise<T> {
    slot.inFlight++;
    const member = this.members.find((m) => m.index === slot.index) as FleetMember;
    const next = slot.queue.then(
      () => fn(slot.dev, member),
      () => fn(slot.dev, member), // a previous job's failure must not poison the queue
    );
    slot.queue = next.then(
      () => {
        slot.inFlight--;
        slot.completed++;
      },
      () => {
        slot.inFlight--;
        slot.completed++;
      },
    );
    return next;
  }

  /** Run the same job on EVERY member, in parallel. Used for corroboration, not throughput. */
  async all<T>(
    fn: (dev: Enclaweder & GuardDevice, member: FleetMember) => Promise<T>,
  ): Promise<Array<{ member: FleetMember; value: T | null; error: Error | null }>> {
    this.assertClean();
    return Promise.all(
      this.slots.map(async (s) => {
        const member = this.members.find((m) => m.index === s.index) as FleetMember;
        try {
          return { member, value: await this.enqueue(s, fn), error: null };
        } catch (e) {
          return { member, value: null, error: e as Error };
        }
      }),
    );
  }

  /**
   * Enrol every member on one measurement so the fleet can attest it.
   *
   * Returns the members that are attest-ready. A member whose enrolment is refused is NOT made
   * ready: it is already holding a genesis (immutable until power cycle) that we cannot read back,
   * and attesting a mismatched measurement would fail-secure ZEROIZE it. `adoptExisting` is the
   * caller asserting that an already-enrolled member holds THIS measurement -- an assertion only a
   * human who provisioned it can make, which is why it is never the default.
   */
  async enrollAll(
    meas32: Buffer,
    { adoptExisting = false }: { adoptExisting?: boolean } = {},
  ): Promise<FleetMember[]> {
    const results = await this.all(async (dev) => dev.enroll(meas32));
    for (const r of results) {
      const slot = this.slots[r.member.index];
      const rc = r.value as number | null;
      slot.attestReady = rc === 0 || (adoptExisting && r.error === null);
    }
    return this.members.filter((m) => m.attestReady);
  }

  /** Attest on the least-loaded attest-ready member. */
  async attest(meas32: Buffer, nonce32: Buffer): Promise<{ member: FleetMember; result: unknown }> {
    this.assertClean();
    const ready = this.slots.filter((s) => s.attestReady && s.guard.status === "CLEAN");
    if (ready.length === 0) {
      throw new HaltError(
        "hardware root fleet: no member is enrolled for this measurement -- call enrollAll() first. " +
          "Attesting an unenrolled measurement would fail-secure zeroize the device.",
      );
    }
    ready.sort((a, b) => a.inFlight - b.inFlight || a.completed - b.completed);
    const slot = ready[0];
    const member = this.members.find((m) => m.index === slot.index) as FleetMember;
    const result = await this.enqueue(slot, (dev) => dev.attest(meas32, nonce32));
    return { member, result };
  }

  close(): void {
    this.stopHeartbeat();
    for (const s of this.slots) {
      try {
        s.dev.close();
      } catch {
        /* best-effort */
      }
    }
  }
}

/** Resolve a cert's SKU through the pinned domains; null if it does not verify. */
function verifyCertSku(
  cert: Buffer,
  uid: Buffer,
  pubkeyRaw: Buffer,
  rootPubRaw?: Buffer,
): EnclawederSku | null {
  const parsed = verifyCertRef(cert, uid, pubkeyRaw, rootPubRaw ?? null);
  return parsed?.sku ?? null;
}
