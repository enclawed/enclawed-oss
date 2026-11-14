// Hardware-root-of-trust binding for enclawed (deps: guard.ts, enclaweder-hid.ts).
//
// PRESENCE POLICY (per design):
//   * The enclaweder is AUTO-DETECTED at bootstrap (USB VID:PID scan). No env flag turns detection
//     off -- if a genuine device is on the bus, it is bound and every gated operation is checked
//     against it. It "cannot be not used": unplugging or zeroizing it after boot trips a persistent
//     DIRTY latch that halts operations until a human recovers with the genuine device present.
//   * If NO device is detected, enclawed runs software-only UNLESS the deployment mandates hardware
//     (ENCLAWEDER_ROOT=required|1|true), in which case bootstrap fails secure and refuses to start.
// The env flag only decides whether *absence* is fatal; *presence* is always enforced.
import { dirname } from "node:path";
import {
  brokerDisabled,
  brokerSocketPath,
  claimOwnership,
  connectRoot,
  OWNER_CLIENT,
  ownerAnswers,
  RootHaltError,
  schedulerFor,
  serveRoot,
  type DeviceScheduler,
  type RemoteRoot,
  type RootHealth,
  type RootService,
  type SigningDevice,
} from "./broker.js";
import { Enclaweder, findAllEnclaweders } from "./enclaweder-hid.js";
import { HardwareRootFleet, type FleetMember, skuDisplayName } from "./fleet.js";
import { captureAndRecordTamper } from "./forensics.js";
import { HardwareRootGuard, HaltError } from "./guard.js";
import { dirtyLatch, hostLatches, type Latch } from "./latches.js";
import { QueueJournal, queueJournalPath } from "./queue-journal.js";

/** Where the guard keeps its state (and, beside it, the device request journal). */
function guardStatePath(opts: { statePath?: string }): string {
  return (
    opts.statePath ??
    process.env.ENCLAWEDER_STATE ??
    `${process.env.HOME ?? "/var/lib/enclawed"}/.enclawed-hw-root.state`
  );
}

/** Every latch on this host, those an earlier version wrote included. */
function latchesOf(opts: { statePath?: string }): Latch[] {
  return hostLatches(
    guardStatePath(opts),
    process.env.ENCLAWEDER_STATE_DIR ?? process.env.HOME ?? "/var/lib/enclawed",
  );
}

/** Refuses to go on while any latch on this host is DIRTY, whichever device left it. */
function refuseDirty(latches: Latch[], when: string): void {
  const d = dirtyLatch(latches);
  if (d) {
    throw new HaltError(
      `hardware root is latched DIRTY (${d.dirty?.reason ?? "reason not recorded"}) by ` +
        `enclaweder ${d.bound?.serial ?? "of unrecorded serial"}${when}. Human recovery is ` +
        `required with that device present.`,
    );
  }
}

let boundGuard: HardwareRootGuard | null = null;
let boundDev: Enclaweder | null = null;
let boundFleet: HardwareRootFleet | null = null;
let bootPromise: Promise<HardwareRootGuard | RemoteRoot | null> | null = null;
let resolved = false;
// Sharing the machine's devices with its other Enclawed processes: as their
// owner (brokerHandle, ownerScheduler) or as a client of the owner (remote).
// Once a process has shared a device it never falls back to software-only:
// `shared` keeps every gate closed while ownership changes hands, and
// `sharedDirty` latches a takeover the guard refused.
let remote: RemoteRoot | null = null;
let shared = false;
let sharedDirty: string | null = null;
let brokerHandle: { close(): Promise<void> } | null = null;
let ownerScheduler: DeviceScheduler | null = null;

/**
 * What running without an Enclaweder means, said wherever it applies. Keys
 * held in software sit on the host, so whoever compromises the host can use
 * them, and secrets on it are exposed.
 */
export const SOFTWARE_ONLY_NOTICE =
  "Running without an Enclaweder: keys are held in software on this host, so a compromised host " +
  "can use them and expose secrets. Using Enclawed without an Enclaweder is far more secure than " +
  "not using Enclawed at all; for security that holds when the host itself is compromised, the " +
  "Enclaweder hardware is required.";

/** True if this deployment refuses to start without a hardware root (absence is fatal). */
export function hardwareRootRequired(): boolean {
  const v = process.env.ENCLAWEDER_ROOT;
  return v === "required" || v === "1" || v === "true";
}

/**
 * Detect and bind the hardware root at bootstrap. Idempotent; concurrent callers share one boot.
 *   - device present -> bind + heartbeat + gate (MANDATORY); throws (fail-secure) if not genuine or
 *     a prior DIRTY latch persists.
 *   - device absent + required -> throws HaltError (refuse to boot).
 *   - device absent + not required -> returns null (software-only); assertHardwareClean() no-ops.
 */
/** Explicit opt-out: the operator is knowingly running without the bound device. */
function hardwareRootOptional(): boolean {
  const v = (process.env.ENCLAWEDER_ROOT ?? "").trim().toLowerCase();
  return v === "optional" || v === "0" || v === "false" || v === "off";
}

export async function bootHardwareRoot(
  opts: { hidraw?: string; statePath?: string } = {},
): Promise<HardwareRootGuard | RemoteRoot | null> {
  if (resolved) {
    return boundGuard ?? remote;
  }
  if (bootPromise) {
    return bootPromise;
  }
  bootPromise = (async (): Promise<HardwareRootGuard | RemoteRoot | null> => {
    // Bind EVERY connected enclaweder, base and Pro alike, as one accreditor. An explicit
    // hidraw path (opt or env) still pins exactly one device, so existing single-device
    // deployments are unchanged.
    const pinned = opts.hidraw ?? process.env.ENCLAWEDER_HIDRAW;
    const paths = pinned ? [pinned] : findAllEnclaweders();
    const path = paths[0] ?? null;
    if (!path) {
      if (hardwareRootRequired()) {
        throw new HaltError("ENCLAWEDER_ROOT=required but no enclaweder was detected at bootstrap");
      }
      // No device on the bus. Two of the four rules live here:
      //
      //   absent + CLEAN, session closed  -> run software-only
      //   absent + session still open     -> refuse: this run would be
      //                                      continuing a session that
      //                                      WAS hardware-accredited,
      //                                      and unplugging must not be
      //                                      the easy way to drop that
      //   absent + DIRTY                  -> refuse: a latched tamper is
      //                                      not cleared by removing the
      //                                      device that reported it
      //
      // "Previously bound" alone is deliberately NOT a reason to halt:
      // a host that closed its last session cleanly may start again
      // without hardware. ENCLAWEDER_ROOT=optional overrides the
      // session rule for an operator who means it.
      const latches = latchesOf(opts);
      refuseDirty(latches, " and no enclaweder is present; removing a device does not clear it");
      const open = latches.find((l) => l.sessionOpen && l.bound?.serial);
      if (open && !hardwareRootOptional()) {
        throw new HaltError(
          `refusing to continue a session accredited by enclaweder ${open.bound!.serial}: the ` +
            `device is not present. Reconnect it, or set ENCLAWEDER_ROOT=optional to start a ` +
            `fresh software-only session.`,
        );
      }
      try {
        console.error(
          "[enclawed] hardware root: no enclaweder detected — running software-only" +
            (process.platform !== "linux"
              ? ` (auto-detect is Linux/hidraw-only; platform=${process.platform})`
              : "") +
            ". Set ENCLAWEDER_ROOT=required to make its absence fatal. " +
            SOFTWARE_ONLY_NOTICE,
        );
      } catch {
        /* logging best-effort */
      }
      resolved = true;
      return null; // software-only: nothing to enforce
    }
    if (brokerDisabled()) {
      const g = await bindLocal(paths, opts);
      resolved = true;
      return g;
    }
    const r = await acquireRoot(paths, opts);
    resolved = true;
    return r;
  })();
  return bootPromise;
}

/**
 * Binds the detected devices in this process: the one place a device is
 * opened. Every connected Enclaweder, base and Pro alike, as one accreditor.
 */
async function bindLocal(
  paths: string[],
  opts: { hidraw?: string; statePath?: string },
): Promise<HardwareRootGuard | null> {
  const path = paths[0];
  try {
    console.error(`[enclawed] hardware root: enclaweder detected at ${path} — verifying…`);
  } catch {
    /* logging best-effort */
  }
  // Each guard below refuses its own latch; this refuses the others, so that
  // a device latched DIRTY cannot be bypassed by adding or removing another.
  refuseDirty(latchesOf(opts), "");
  // MORE THAN ONE DEVICE: the fleet owns every device and the single-device API below reuses
  // its member 0. Do NOT also open `path` here -- two fds on one hidraw node interleave their
  // request streams and their heartbeats, and the device rejects the interleaved frames.
  if (paths.length > 1) {
    boundFleet = await HardwareRootFleet.boot({
      paths,
      stateDir: dirname(guardStatePath(opts)),
      onHalt: (r: string, m: FleetMember | null) => {
        try {
          console.error(`[hardware-root] FLEET HALT: ${r}${m ? ` (member ${m.serial})` : ""}`);
        } catch {
          /* logging best-effort */
        }
      },
    });
    const primary = boundFleet.primary;
    boundGuard = primary?.guard ?? null;
    boundDev = primary?.dev ?? null;
    boundFleet.startHeartbeat(); // covers every member, member 0 included
    const c = boundFleet.composition;
    try {
      console.error(
        `[enclawed] hardware root FLEET engaged — ${boundFleet.size} devices ` +
          `(${c.base} base, ${c.pro} Pro) bound as one accreditor.`,
      );
    } catch {
      /* logging best-effort */
    }
    return boundGuard;
  }

  boundDev = new Enclaweder(path); // device detected -> mandatory from here on
  boundGuard = new HardwareRootGuard({
    statePath:
      opts.statePath ??
      process.env.ENCLAWEDER_STATE ??
      `${process.env.HOME ?? "/var/lib/enclawed"}/.enclawed-hw-root.state`,
    onHalt: (r: string) => {
      try {
        console.error(`[hardware-root] HALT: ${r}`);
      } catch {
        /* logging best-effort */
      }
      // Snapshot every identifying signal for a postmortem, off the fail-secure critical path.
      const info = hardwareRootInfo();
      void captureAndRecordTamper(r, {
        serial: info.serial,
        pubkey: info.pubkey,
        status: info.status,
      }).catch(() => {
        /* forensic capture is best-effort; it must never block the halt */
      });
    },
  });
  const bound = await boundGuard.boot(boundDev); // verifies genuine + not DIRTY; throws otherwise
  try {
    console.error(
      `[enclawed] hardware root of trust ENGAGED — enclaweder ${bound.serial} bound ` +
        `(key ${bound.pubkey.slice(0, 16)}…); on-chip challenge-response verified. ` +
        `Agent accreditation now REQUIRES this device present + CLEAN.`,
    );
  } catch {
    /* logging best-effort */
  }
  boundGuard.startHeartbeat(boundDev);

  return boundGuard;
}

/** This process's own devices, as the owner serves them. */
function localService(): RootService {
  return {
    members: () =>
      hardwareRootMembersLocal().map((m) => ({ uid: m.uid, pubkey: m.pubkey, serial: m.serial })),
    run: async (fn) => {
      if (boundFleet) {
        return boundFleet.run((dev) => fn(dev));
      }
      if (!boundDev) {
        throw new HaltError("no Enclaweder is bound");
      }
      return fn(boundDev);
    },
    health: localHealth,
  };
}

function localHealth(): RootHealth {
  if (!boundGuard) {
    return { status: "UNAVAILABLE", reason: "no Enclaweder is bound" };
  }
  try {
    boundGuard.assertClean();
    boundFleet?.assertClean();
  } catch (err) {
    return { status: "DIRTY", reason: (err as Error).message };
  }
  return { status: "CLEAN" };
}

/**
 * Becomes the machine's owner of the devices, or a client of the owner that
 * already serves them. Ownership is the socket: whoever listens on it first
 * binds the devices; everyone else signs through it.
 */
async function acquireRoot(
  paths: string[],
  opts: { hidraw?: string; statePath?: string },
): Promise<HardwareRootGuard | RemoteRoot | null> {
  const sock = brokerSocketPath();
  // Every process on the machine may boot at once: keep trying, within a
  // budget, to become the owner or to reach the one that did.
  const deadline = Date.now() + 15_000;
  for (let attempt = 0; Date.now() < deadline; attempt++) {
    const server = await claimOwnership(sock);
    if (server) {
      let settle!: (v: { svc: RootService; scheduler: DeviceScheduler }) => void;
      let fail!: (e: unknown) => void;
      const ready = new Promise<{ svc: RootService; scheduler: DeviceScheduler }>((res, rej) => {
        settle = res;
        fail = rej;
      });
      ready.catch(() => undefined);
      const served = serveRoot(server, ready);
      try {
        const g = await bindLocal(paths, opts);
        const svc = localService();
        // Every request to the devices, and its outcome, in an append-only,
        // hash-chained journal that the device itself signs as it grows.
        ownerScheduler = schedulerFor(
          svc,
          new QueueJournal(queueJournalPath(guardStatePath(opts))),
        );
        settle({ svc, scheduler: ownerScheduler });
        brokerHandle = served;
        remote = null;
        return g;
      } catch (err) {
        fail(err);
        // Let waiting clients read the reason before the socket goes.
        await new Promise((r) => setTimeout(r, 200));
        await served.close();
        throw err;
      }
    }
    let r: RemoteRoot | null;
    try {
      r = await connectRoot(sock);
    } catch (err) {
      if (err instanceof RootHaltError) {
        throw new HaltError(err.message);
      }
      throw err;
    }
    if (r) {
      remote = r;
      shared = true;
      void r.lost.then(() => takeOver(paths, opts));
      return r;
    }
    await new Promise((res) => setTimeout(res, Math.min(1000, 50 * 2 ** attempt) * Math.random()));
  }
  throw new HaltError("could not reach or become the owner of this machine's Enclaweders");
}

/**
 * The owner went away. Its clients read UNAVAILABLE until one of them has
 * bound the devices itself (full genuine check, persisted DIRTY latch) or has
 * connected to whoever did. A takeover the guard refuses latches DIRTY.
 */
async function takeOver(
  paths: string[],
  opts: { hidraw?: string; statePath?: string },
): Promise<void> {
  for (;;) {
    try {
      const found = (opts.hidraw ?? process.env.ENCLAWEDER_HIDRAW) ? paths : findAllEnclaweders();
      if (found.length === 0) {
        sharedDirty = "the Enclaweder is gone: no device on the bus after its owner exited";
        return;
      }
      // Owner now, or a client of whoever took over (acquireRoot watches it).
      await acquireRoot(found, opts);
      return;
    } catch (err) {
      if (err instanceof HaltError) {
        sharedDirty = err.message;
        return;
      }
      await new Promise((res) => setTimeout(res, 500));
    }
  }
}

/** Hardware-root status for the audit trail, so every accredited action records whether it was
 *  anchored in the enclaweder hardware (and which device), not just a boot-time flag. */
export interface HardwareRootInfo {
  anchored: boolean;
  serial: string | null;
  pubkey: string | null;
  status: string;
}
export function hardwareRootInfo(): HardwareRootInfo {
  if (!boundGuard && shared) {
    const m = remote?.members[0];
    return {
      anchored: true,
      serial: m?.serial ?? null,
      pubkey: m?.pubkey ?? null,
      status: hardwareRootHealth().status,
    };
  }
  if (!boundGuard) {
    return { anchored: false, serial: null, pubkey: null, status: "software-only" };
  }
  const b = boundGuard.bound;
  return {
    anchored: true,
    serial: b?.serial ?? null,
    pubkey: b?.pubkey ?? null,
    status: boundGuard.status,
  };
}

/** Gate a sensitive operation. Throws HaltError if the bound hardware root is DIRTY. No-op when no
 *  device was detected at bootstrap (software-only deployment). */
export function assertHardwareClean(): void {
  if (!boundGuard && shared) {
    // A client of the machine's owner, or between owners: never a no-op.
    const h = hardwareRootHealth();
    if (h.status !== "CLEAN") {
      throw new HaltError(`hardware root ${h.status}: ${h.reason}`);
    }
    return;
  }
  if (!boundGuard) {
    return;
  }
  boundGuard.assertClean();
  // Fail-secure across the whole fleet: every bound device must still be present and CLEAN.
  if (boundFleet) {
    boundFleet.assertClean();
  }
}

/**
 * The machine's hardware root as this process sees it: CLEAN, DIRTY (latched),
 * or UNAVAILABLE (its owner is gone or busy; not a tamper).
 */
export function hardwareRootHealth(): RootHealth {
  if (sharedDirty) {
    return { status: "DIRTY", reason: sharedDirty };
  }
  if (boundGuard) {
    return localHealth();
  }
  if (shared) {
    return remote?.health() ?? { status: "UNAVAILABLE", reason: "between owners" };
  }
  return { status: "UNAVAILABLE", reason: "no Enclaweder is bound" };
}

/**
 * Every device of this machine's hardware root, for signing: the principal's
 * keys (one per device) and a way to sign on one of them. Each request goes
 * through the owner's scheduler, this process's own included. Null when no
 * device is bound.
 */
export function hardwareRootSigning(): {
  members: { uid: string; pubkey: string }[];
  run<T>(fn: (dev: SigningDevice) => Promise<T>): Promise<T>;
} | null {
  const members = currentMembers();
  if (!members) {
    return null;
  }
  return {
    members,
    // Resolved at each call, not now: ownership may change hands between
    // calls (the owner exits, a client takes over), and a request made
    // meanwhile waits for the new owner rather than failing. A request whose
    // owner left while it was in flight is made again on the new owner; a
    // signature request is safe to repeat. A DIRTY root fails at once.
    run: async (fn) => {
      const until = Date.now() + TAKEOVER_WAIT_MS;
      for (;;) {
        const dev = await currentSigningDevice();
        try {
          return await fn(dev);
        } catch (err) {
          const h = hardwareRootHealth();
          const ownerLost =
            /owner is gone/.test((err as Error).message) || h.status === "UNAVAILABLE";
          if (h.status === "DIRTY" || !ownerLost || Date.now() > until) {
            throw err;
          }
          await new Promise((r) => setTimeout(r, 50));
        }
      }
    },
  };
}

function currentMembers(): { uid: string; pubkey: string }[] | null {
  if (boundGuard) {
    return hardwareRootMembersLocal().map((m) => ({ uid: m.uid, pubkey: m.pubkey }));
  }
  if (shared && remote) {
    return remote.members.map((m) => ({ uid: m.uid, pubkey: m.pubkey }));
  }
  return null;
}

/** How long a request waits for a new owner while ownership changes hands. */
const TAKEOVER_WAIT_MS = 5000;

async function currentSigningDevice(): Promise<SigningDevice> {
  const until = Date.now() + TAKEOVER_WAIT_MS;
  for (;;) {
    const h = hardwareRootHealth();
    if (h.status === "DIRTY") {
      throw new HaltError(`hardware root DIRTY: ${h.reason}`);
    }
    if (h.status === "CLEAN") {
      if (boundGuard && ownerScheduler) {
        const sched = ownerScheduler;
        const members = currentMembers()!;
        return {
          getIdentity: async () => ({
            uid: Buffer.from(members[0].uid, "hex"),
            pubkeyRaw: Buffer.from(members[0].pubkey, "hex"),
          }),
          challenge: (nonce32) => sched.submit(OWNER_CLIENT, nonce32),
        };
      }
      if (boundGuard) {
        // Sharing turned off: this process alone drives its devices.
        const svc = localService();
        const members = currentMembers()!;
        return {
          getIdentity: async () => ({
            uid: Buffer.from(members[0].uid, "hex"),
            pubkeyRaw: Buffer.from(members[0].pubkey, "hex"),
          }),
          challenge: (nonce32) => svc.run((d) => d.challenge(nonce32)),
        };
      }
      if (remote) {
        return remote.device();
      }
    }
    if (Date.now() > until) {
      throw new HaltError(`hardware root ${h.status}: ${"reason" in h ? h.reason : ""}`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * The bound primary device, for signing with its key (for example the swarm
 * operator's key). Null unless a device is bound and currently CLEAN, so a
 * caller can never sign through a device the guard has halted. A machine with
 * several devices signs through hardwareRootSigning() instead.
 */
export function hardwareRootSigningDevice(): Pick<Enclaweder, "getIdentity" | "challenge"> | null {
  if (!boundGuard && shared) {
    if (!remote || remote.members.length !== 1 || hardwareRootHealth().status !== "CLEAN") {
      return null;
    }
    return remote.device() as Pick<Enclaweder, "getIdentity" | "challenge">;
  }
  if (!boundDev || !boundGuard?.bound) {
    return null;
  }
  try {
    assertHardwareClean();
  } catch {
    return null;
  }
  return boundDev;
}

export function hardwareRootFleetHandle(): HardwareRootFleet | null {
  return boundFleet;
}

/** Every bound device, for the audit trail. Single-device deployments report their one member. */
export function hardwareRootMembers(): FleetMember[] {
  if (!boundGuard && shared) {
    const status = hardwareRootHealth().status;
    return (remote?.members ?? []).map((m, index) => ({
      index,
      path: "",
      serial: m.serial,
      uid: m.uid,
      pubkey: m.pubkey,
      sku: m.serial.startsWith("ECPRO-") ? "pro" : "base",
      skuName: skuDisplayName(m.serial.startsWith("ECPRO-") ? "pro" : "base"),
      status,
      attestReady: false,
      inFlight: 0,
      completed: 0,
    }));
  }
  return hardwareRootMembersLocal();
}

function hardwareRootMembersLocal(): FleetMember[] {
  if (boundFleet) {
    return boundFleet.members;
  }
  if (!boundGuard?.bound) {
    return [];
  }
  const b = boundGuard.bound;
  // The certificate's model, not the serial prefix. A Pro reports the
  // driver's base prefix over USB, so reading the prefix here called every
  // Pro a Base in the audit trail. Devices bound before the guard persisted
  // this fall back to the prefix, which is all that was ever recorded for
  // them.
  const sku = b.sku ?? (b.serial.startsWith("ECPRO-") ? "pro" : "base");
  return [
    {
      index: 0,
      path: process.env.ENCLAWEDER_HIDRAW ?? "",
      serial: b.serial,
      uid: b.uid,
      pubkey: b.pubkey,
      sku,
      skuName: skuDisplayName(sku),
      status: boundGuard.status,
      attestReady: false,
      inFlight: 0,
      completed: 0,
    },
  ];
}

/** True iff a hardware root was detected and bound at bootstrap. */
/**
 * Close the hardware-accredited session on a deliberate shutdown.
 *
 * Without this the sessionOpen flag never clears, every later boot
 * without the device looks like an interrupted accredited session, and
 * rule "absent + CLEAN -> may run" becomes unreachable. Safe to call
 * when no device was ever bound.
 */
export function closeHardwareRootSession(): void {
  // The fleet owns its members' guards; boundGuard aliases member 0 in
  // a fleet deployment, so closing both is idempotent, not doubled.
  boundFleet?.closeSession();
  boundGuard?.closeSession();
  // A deliberate stop: stop serving, so this machine's other processes take
  // over now rather than when they next find the socket dead.
  ownerScheduler?.stop();
  void brokerHandle?.close();
  brokerHandle = null;
}

export function hardwareRootPresent(): boolean {
  return boundGuard !== null || shared;
}
export function getHardwareGuard(): HardwareRootGuard | null {
  return boundGuard;
}
export async function recoverHardwareRoot(o?: {
  humanConfirmed?: boolean;
}): Promise<boolean | undefined> {
  if (boundGuard && boundDev) {
    return boundGuard.recover(boundDev, o);
  }
  return undefined;
}

/**
 * Recover a DIRTY latch from a process that has NOT booted the root.
 *
 * `recoverHardwareRoot` above only works inside a running agent, because it
 * needs the module-level bindings that `bootHardwareRoot` sets -- and boot
 * REFUSES while the latch is DIRTY, which is exactly the state a recovery tool
 * runs in. So a standalone tool could not reach recovery at all: the latch said
 * "human recovery required" with nothing a human could actually invoke.
 *
 * This attaches its own device handle and guard instead, then defers to
 * `guard.recover()` unchanged -- the bound-key comparison and the fresh
 * challenge-response still decide. Nothing here loosens that; it only supplies
 * the caller the guard was always written to expect.
 */
export async function recoverHardwareRootStandalone(opts: {
  humanConfirmed?: boolean;
  /** The latch to clear: the single-device one by default, or one device's own. */
  statePath?: string;
}): Promise<{ recovered: boolean; serial?: string }> {
  // A live owner holds the device; a second handle would interleave with it.
  if (!brokerDisabled() && (await ownerAnswers(brokerSocketPath()))) {
    throw new HaltError(
      "recovery: an Enclawed process on this machine owns the Enclaweder; stop it first",
    );
  }
  const paths = findAllEnclaweders();
  if (paths.length === 0) {
    throw new HaltError("recovery: no enclaweder detected on the bus");
  }
  const guard = new HardwareRootGuard({ statePath: guardStatePath(opts) });
  const devs = paths.map((p) => new Enclaweder(p));
  try {
    // The device the latch names, wherever it enumerates now. With none of
    // them its own, the first is offered and the guard refuses it as not the
    // bound device.
    const keys = await Promise.all(
      devs.map((d) =>
        d
          .getIdentity()
          .then((id) => id.pubkeyRaw.toString("hex"))
          .catch(() => null),
      ),
    );
    const own = keys.indexOf(guard.bound?.pubkey ?? "");
    const recovered = await guard.recover(devs[Math.max(own, 0)], {
      humanConfirmed: opts.humanConfirmed,
    });
    const serial = guard.bound?.serial;
    return serial ? { recovered, serial } : { recovered };
  } finally {
    guard.closeSession();
    for (const d of devs) {
      d.close();
    }
  }
}

// Forensics: apps register who/where the current operator is (setForensicContext); the guard captures
// a full snapshot automatically on any DIRTY/tamper transition.
export {
  setForensicContext,
  getForensicContext,
  captureForensics,
  forensicLogPath,
  type ForensicSnapshot,
  type DeviceForensics,
} from "./forensics.js";

export { HardwareRootFleet, type FleetMember } from "./fleet.js";
