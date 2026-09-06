import fs from "node:fs";
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
import { HardwareRootGuard, HaltError, type GuardDevice, type AttestingDevice } from "./guard.js";

// THE SKU MAPPING. Do not invert these:
//   model 1  ->  base  ->  ENCLW-  ->  "Enclaweder Base"
//   model 2  ->  pro   ->  ECPRO-  ->  "Enclaweder Pro"
// model comes from the ROOT-SIGNED birth certificate and is the only authenticated source; the
// prefix is display only. ENCLAWEDER_DOMAINS in enclaweder-hid.ts binds model to the signing root.
const SERIAL_PREFIX: Record<EnclawederSku, string> = { base: "ENCLW-", pro: "ECPRO-" };
/** Full product names, keyed by the AUTHENTICATED model in the birth certificate. */
const SKU_NAME: Record<EnclawederSku, string> = {
  base: "Enclaweder Base",
  pro: "Enclaweder Pro",
};

/** The product name for a SKU, so single-device callers render it identically. */
export function skuDisplayName(sku: EnclawederSku): string {
  return SKU_NAME[sku];
}

/** Refuse to start a fleet that cannot hold its own file descriptors. */
function assertDescriptorBudget(count: number): void {
  let limit = 0;
  try {
    const m = /Max open files\s+(\d+)/.exec(fs.readFileSync("/proc/self/limits", "utf8"));
    if (m) {
      limit = Number(m[1]);
    }
  } catch {
    /* not Linux, or unreadable -- never block on a diagnostic */
  }
  if (!limit) {
    return;
  }
  const headroom = 64; // stdio, state files, sockets the host already holds
  if (count + headroom > limit) {
    throw new HaltError(
      `hardware root fleet: ${count} devices need more file descriptors than this process has ` +
        `(soft limit ${limit}). Raise it (ulimit -n ${count + headroom * 4}) before binding.`,
    );
  }
}

export interface FleetMember {
  index: number;
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

interface Slot {
  view: FleetMember;
  idle: boolean;
  halted: boolean;
  hbTimer: ReturnType<typeof setTimeout> | null;
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
  /** How many devices to bind concurrently at boot. Default 32. */
  bootConcurrency?: number;
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
  private pending: (PendingJob | undefined)[] = []; // FIFO; head index avoids O(n) shift()
  private pendingHead = 0;
  private idle: Slot[] = []; // stack of slots with nothing in flight -- O(1) dispatch
  private notClean = 0; // members that have halted; keeps assertClean() O(1)
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

    // Every member holds an open hidraw fd for the life of the process. Check the descriptor
    // budget UP FRONT: running out midway leaves half a fleet bound and reports EMFILE from
    // whichever unlucky device hit the wall, which tells an operator nothing useful.
    assertDescriptorBudget(paths.length);

    // Bind in parallel with a bounded window. Sequential binding is four USB round trips per
    // device, so a 4096-device fleet would take over ten minutes to come up; measured on
    // simulated devices at 5 ms/call, 256 members went from 8128 ms to 293 ms. The cap keeps the
    // bus and the descriptor table from being hit by every device at once.
    const width = Math.max(1, Math.min(opts.bootConcurrency ?? 32, paths.length));
    // Preallocated so the workers below can write their own index while
    // running concurrently; every slot is filled before `built` is read.
    const built = Array.from<Slot>({ length: paths.length });
    let nextIndex = 0;
    const bindOne = async (i: number): Promise<void> => {
      const path = paths[i];
      const dev = open(path);
      const guard = new HardwareRootGuard({
        statePath: `${stateDir}/.enclawed-hw-root.${i}.state`,
        rootPubkey: opts.rootPubkey,
        onHalt: (r: string) => fleet.memberHalted(i, r),
      });
      const bound = await guard.boot(dev as GuardDevice);
      const id = await dev.getIdentity();
      const cert = await dev.getCert();
      const parsed = cert ? verifyCertSku(cert, id.uid, id.pubkeyRaw, opts.rootPubkey) : null;
      const sku: EnclawederSku = parsed ?? "base";
      // Render the serial from the AUTHENTICATED model, not the driver's base-prefix default.
      const serial = SERIAL_PREFIX[sku] + Buffer.from(id.uid).toString("hex").toUpperCase();
      const view: FleetMember = {
        index: i,
        path,
        serial,
        uid: bound.uid,
        pubkey: bound.pubkey,
        sku,
        skuName: SKU_NAME[sku],
        status: "CLEAN",
        attestReady: false,
        inFlight: 0,
        completed: 0,
      };
      built[i] = {
        index: i,
        path,
        dev,
        guard,
        sku,
        serial,
        uid: bound.uid,
        pubkey: bound.pubkey,
        attestReady: false,
        inFlight: 0,
        completed: 0,
        queue: Promise.resolve(),
        view,
        idle: false,
        halted: false,
        hbTimer: null,
      };
    };
    await Promise.all(
      Array.from({ length: width }, async () => {
        for (let i = nextIndex++; i < paths.length; i = nextIndex++) {
          await bindOne(i);
        }
      }),
    );
    fleet.slots = built;
    // Reject duplicates    // Reject duplicates: the same physical unit reachable twice would be counted as two members and
    // would inflate capacity while providing none.
    const uids = new Set(fleet.slots.map((s) => s.uid));
    if (uids.size !== fleet.slots.length) {
      throw new HaltError("hardware root fleet: the same device was bound twice");
    }
    for (const slot of fleet.slots) {
      slot.idle = true;
      fleet.idle.push(slot);
    }
    return fleet;
  }

  private memberHalted(index: number, reason: string): void {
    const slot = this.slots.find((s) => s.index === index);
    if (slot && !slot.halted) {
      slot.halted = true;
      this.notClean++;
    }
    this.halted = this.halted ?? `member ${index}: ${reason}`;
    this.onHalt(reason, slot ? { ...slot.view, status: slot.guard.status } : null);
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

  /** Close the accredited session on every member. See closeHardwareRootSession(). */
  closeSession(): void {
    for (const s of this.slots) {
      s.guard.closeSession();
    }
  }

  /** CLEAN only while every member is CLEAN. */
  get status(): "CLEAN" | "DIRTY" {
    return this.halted || this.notClean > 0 ? "DIRTY" : "CLEAN";
  }

  /**
   * Snapshot of every member. Each slot owns ONE view object mutated in place, so this is a
   * shallow copy rather than N fresh allocations. It used to be called once per dispatched job,
   * making every job O(N) in allocations: at 4096 devices that alone cost 85 us of bookkeeping per
   * job and made the fleet, not the hardware, the ceiling. Nothing on the hot path calls it now.
   */
  get members(): FleetMember[] {
    return this.slots.map((s) => {
      const v = s.view;
      v.status = s.guard.status;
      v.attestReady = s.attestReady;
      v.inFlight = s.inFlight;
      v.completed = s.completed;
      return { ...v };
    });
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
    // O(1): every transition out of CLEAN routes through memberHalted(), which is what the guards
    // call when they halt. Scanning all members here would put an O(N) walk on the submit path.
    if (this.halted) {
      throw new HaltError(this.halted);
    }
    if (this.notClean > 0) {
      const bad = this.slots.find((s) => s.guard.status !== "CLEAN");
      throw new HaltError(
        `hardware root fleet: member ${bad?.index} (${bad?.serial}) is ${bad?.guard.status}`,
      );
    }
  }

  /**
   * Heartbeat every member, with start times STAGGERED across the interval: 4096 guards polling on
   * the same tick would put 4096 USB round trips into one moment and starve real work, while
   * spreading them keeps each device on its own cadence at a steady aggregate rate.
   */
  startHeartbeat(opts: { intervalMs?: number } = {}): void {
    const interval = opts.intervalMs ?? 1000;
    const n = this.slots.length || 1;
    this.slots.forEach((s, i) => {
      const delay = Math.floor((interval * i) / n);
      s.hbTimer = setTimeout(() => {
        s.hbTimer = null;
        s.guard.startHeartbeat(s.dev as GuardDevice, { ...opts, intervalMs: interval });
      }, delay);
      (s.hbTimer as { unref?: () => void }).unref?.();
    });
  }
  stopHeartbeat(): void {
    for (const s of this.slots) {
      if (s.hbTimer) {
        clearTimeout(s.hbTimer);
        s.hbTimer = null;
      }
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
    if (this.slots.length === 0) {
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

  /**
   * Hand queued work to idle devices. Both sides are O(1) per job: idle slots are popped off a
   * stack instead of rescanning all N, and the pending queue is consumed with a head index instead
   * of shift(). At 4096 members the scan-everything version cost 85 us per job; this is flat.
   */
  private pump(): void {
    while (this.idle.length > 0 && this.pendingHead < this.pending.length) {
      const slot = this.idle.pop() as Slot;
      slot.idle = false;
      if (slot.guard.status !== "CLEAN") {
        continue; // dropped from rotation until recovered
      }
      const job = this.pending[this.pendingHead] as PendingJob;
      this.pending[this.pendingHead++] = undefined; // release the reference
      if (this.pendingHead > 1024 && this.pendingHead * 2 >= this.pending.length) {
        this.pending = this.pending.slice(this.pendingHead);
        this.pendingHead = 0;
      }
      void this.enqueue(slot, job.fn)
        .then(job.resolve, job.reject)
        .finally(() => {
          this.markIdle(slot);
          this.pump();
        });
    }
  }

  private markIdle(slot: Slot): void {
    if (!slot.idle && slot.inFlight === 0 && slot.guard.status === "CLEAN") {
      slot.idle = true;
      this.idle.push(slot);
    }
  }

  private enqueue<T>(
    slot: Slot,
    fn: (dev: Enclaweder & GuardDevice, member: FleetMember) => Promise<T>,
  ): Promise<T> {
    slot.inFlight++;
    // The slot's own view object, refreshed in place -- no array rebuild, no linear search.
    const member = slot.view;
    member.inFlight = slot.inFlight;
    member.completed = slot.completed;
    member.status = slot.guard.status;
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

  /**
   * Run one job on a SPECIFIC member, still queued behind that device's other work. Needed for
   * per-device measurement and diagnostics: run() deliberately picks by load, so it cannot time a
   * single device. Throws if the member does not exist or is not CLEAN.
   */
  async runOn<T>(
    index: number,
    fn: (dev: Enclaweder & GuardDevice, member: FleetMember) => Promise<T>,
  ): Promise<T> {
    this.assertClean();
    const slot = this.slots.find((s) => s.index === index);
    if (!slot) {
      throw new HaltError(`hardware root fleet: no member ${index}`);
    }
    if (slot.guard.status !== "CLEAN") {
      throw new HaltError(`hardware root fleet: member ${index} is ${slot.guard.status}`);
    }
    return this.enqueue(slot, fn);
  }

  /** Run the same job on EVERY member, in parallel. Used for corroboration, not throughput. */
  async all<T>(
    fn: (dev: Enclaweder & GuardDevice, member: FleetMember) => Promise<T>,
  ): Promise<Array<{ member: FleetMember; value: T | null; error: Error | null }>> {
    this.assertClean();
    return Promise.all(
      this.slots.map(async (s) => {
        const member = s.view;
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
    const results = await this.all(async (dev, member) => attesting(dev, member).enroll(meas32));
    for (const r of results) {
      const slot = this.slots[r.member.index];
      const rc = r.value;
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
    const member = slot.view;
    const result = await this.enqueue(slot, (dev, member) =>
      attesting(dev, member).attest(meas32, nonce32),
    );
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

/**
 * Narrow a bound device to one that can enrol and attest.
 *
 * Not every device object reaching the fleet implements those: the wire
 * opcodes for them are not in this tree, so the Enclaweder class does not.
 * Without this check the first call lands as "dev.enroll is not a function"
 * from inside a worker, naming neither the device nor the reason. Fail with
 * both, through the same HaltError path as every other fleet refusal.
 */
function attesting(dev: Enclaweder & GuardDevice, member: FleetMember): AttestingDevice {
  const d = dev as unknown as Partial<AttestingDevice>;
  if (typeof d.enroll !== "function" || typeof d.attest !== "function") {
    throw new HaltError(
      `hardware root fleet: member ${member.index} (${member.skuName} ${member.serial}) ` +
        `does not implement enroll/attest -- this build cannot enrol a measurement on it`,
    );
  }
  return dev as unknown as AttestingDevice;
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
