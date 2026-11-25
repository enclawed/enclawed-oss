// Hardware-root-of-trust binding for enclawed (deps: guard.ts, enclaweder-hid.ts).
//
// PRESENCE POLICY (per design):
//   * The enclaweder is AUTO-DETECTED at bootstrap (USB VID:PID scan). No env flag turns detection
//     off -- if a genuine device is on the bus, it is bound and every gated operation is checked
//     against it. It "cannot be not used": unplugging or zeroizing it after boot trips a persistent
//     DIRTY latch that halts operations until a human recovers with the genuine device present.
//   * If NO device is detected, enclawed runs software-only UNLESS the deployment mandates hardware
//     (ENCLAWEDER_ROOT=required, see ./root-mode.ts), in which case bootstrap fails secure and refuses to start.
// The env flag only decides whether *absence* is fatal; *presence* is always enforced.
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { CS05, type CommandSetProof, proveCommandSet05 } from "./activation.js";
import {
  attestDigest,
  brokerDisabled,
  brokerPathError,
  brokerSocketPath,
  claimOwnership,
  connectRoot,
  OWNER_CLIENT,
  ownerAnswers,
  RootAttestError,
  RootHaltError,
  schedulerFor,
  serveRoot,
  type DeviceScheduler,
  type MemberAttestation,
  type RemoteAttestation,
  type RemoteRoot,
  type RootHealth,
  type RootService,
  type SigningDevice,
} from "./broker.js";
import {
  DeviceLatchError,
  latchGetRaw,
  readCustody,
  readDeviceLatch,
  readFailLog,
  type DeviceFailure,
  type DeviceLatchState,
  type LatchErrorCode,
} from "./device-latch.js";
import {
  Enclaweder,
  findAllEnclaweders,
  verifyCert,
  verifyChallenge,
  type EnclawederSku,
} from "./enclaweder-hid.js";
import { HardwareRootFleet, type FleetMember, skuDisplayName } from "./fleet.js";
import { captureAndRecordTamper } from "./forensics.js";
import { HardwareRootGuard, HaltError, type RecoveryAuth } from "./guard.js";
import { pinnedPathRefusal } from "./hid-transport.js";
import { deriveDeviceKey, type KeyDeriveResult } from "./key-derive.js";
import { dirtyLatch, hostLatches, type Latch } from "./latches.js";
import { QueueJournal, queueJournalPath } from "./queue-journal.js";
import { relayedAnchorDevice } from "./relayed-anchor.js";
import { relayedTotpAccess } from "./relayed-factors.js";
import { hardwareRootMode } from "./root-mode.js";
import {
  type SessionAnchorDecision,
  decideSessionAnchor,
  requireSessionAnchor,
} from "./session-anchor.js";
import { createDeviceTotpSecondFactor, type DeviceTotpAccess } from "./totp-verify.js";

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
/** Set when boot was refused: every gate stays closed until a later boot succeeds (finding H5). */
let refusedReason: string | null = null;
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
  // Strict: anything but "required" / "optional" / unset throws (fail closed).
  return hardwareRootMode() === "required";
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
  return hardwareRootMode() === "optional";
}

/** How a process boots the hardware root. */
export type BootOptions = {
  hidraw?: string;
  statePath?: string;
  /**
   * Demand one manufacturer root instead of the pinned domains, for this process's own devices
   * AND for the devices a broker owner claims to have (tests with simulated devices,
   * single-SKU deployments). Programmatic only: never read from the environment.
   */
  rootPubkey?: Buffer;
  /**
   * The owner's socket a boot with sharing off (ENCLAWEDER_BROKER=off) probes before it opens
   * the device itself (finding N16). Defaults to the machine's broker path. Programmatic only,
   * never read from the environment: tests point it at their own socket so they never reach
   * the real owner of the machine they run on.
   */
  ownerSocket?: string;
};

export async function bootHardwareRoot(
  opts: BootOptions = {},
): Promise<HardwareRootGuard | RemoteRoot | null> {
  if (resolved) {
    return boundGuard ?? remote;
  }
  if (bootPromise) {
    return bootPromise;
  }
  bootPromise = bootOnce(opts).catch((err: unknown) => {
    // A refused boot must not leave the gates open (finding H5): record it; assertHardwareClean
    // and hardwareRootHealth report it until a boot succeeds.
    refusedReason =
      err instanceof HaltError ? err.reason : ((err as Error)?.message ?? String(err));
    bootPromise = null;
    throw err;
  });
  return bootPromise;
}

async function bootOnce(opts: BootOptions): Promise<HardwareRootGuard | RemoteRoot | null> {
  return (async (): Promise<HardwareRootGuard | RemoteRoot | null> => {
    // Bind EVERY connected enclaweder, base and Pro alike, as one accreditor. An explicit
    // hidraw path (opt or env) still pins exactly one device, so existing single-device
    // deployments are unchanged.
    const pinned = opts.hidraw ?? process.env.ENCLAWEDER_HIDRAW;
    if (pinned) {
      // A pinned path must be an Enclaweder by its USB identity (finding H10).
      const why = pinnedPathRefusal(pinned);
      if (why) {
        throw new HaltError(`refusing the pinned Enclaweder path: ${why}`);
      }
    }
    const paths = pinned ? [pinned] : findAllEnclaweders();
    const path = paths[0] ?? null;
    if (!path) {
      // No device visible HERE (a sandbox, a container), but the machine's owner may serve one.
      // Its devices are attested by connectRoot (certificate + device-signed latch read over our
      // nonce), so joining it as a client is the one way such a process is hardware-accredited;
      // it never opens a device and never becomes an owner.
      const viaOwner = await clientOfOwnerWithoutDevice(opts);
      if (viaOwner) {
        return viaOwner;
      }
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
      // Never open the node next to a live owner (finding N16): its frames would interleave.
      if (await ownerAnswers(opts.ownerSocket ?? brokerSocketPath())) {
        throw new HaltError(
          "an Enclawed process on this machine owns the Enclaweder; with sharing turned off (ENCLAWEDER_BROKER=off) this process may not open it as well",
        );
      }
      const g = await bindLocal(paths, opts);
      resolved = true;
      refusedReason = null;
      return g;
    }
    // One broker path per host user, or none (finding H11): never a fallback that splits owners.
    const pathErr = brokerPathError();
    if (pathErr) {
      throw new HaltError(`the hardware root broker has no socket path: ${pathErr}`);
    }
    const r = await acquireRoot(paths, opts);
    resolved = true;
    refusedReason = null;
    return r;
  })();
}

/**
 * A process that sees no device joins the machine's owner as a client, when one answers on the
 * canonical socket; null when none does (then the device-absent rules apply).
 */
async function clientOfOwnerWithoutDevice(opts: BootOptions): Promise<RemoteRoot | null> {
  if (brokerDisabled() || brokerPathError() || !(await ownerAnswers(brokerSocketPath()))) {
    return null;
  }
  refuseDirty(latchesOf(opts), "");
  let r: RemoteRoot | null;
  try {
    r = await connectRoot(brokerSocketPath(), 500, { rootPubkey: opts.rootPubkey ?? null });
  } catch (err) {
    if (err instanceof RootHaltError) {
      throw new HaltError(err.message);
    }
    if (err instanceof RootAttestError) {
      throw new HaltError(
        `refusing the process on the hardware root broker socket: ${err.message}`,
      );
    }
    throw err;
  }
  if (!r) {
    return null;
  }
  remote = r;
  shared = true;
  resolved = true;
  refusedReason = null;
  // This process cannot take the devices over (it sees none): losing the owner is UNAVAILABLE,
  // and a new owner must be found by a fresh boot.
  void r.lost.then(() => {
    if (!sharedDirty) {
      remote = null;
    }
  });
  return r;
}

/**
 * Binds the detected devices in this process: the one place a device is
 * opened. Every connected Enclaweder, base and Pro alike, as one accreditor.
 */
async function bindLocal(paths: string[], opts: BootOptions): Promise<HardwareRootGuard | null> {
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
      rootPubkey: opts.rootPubkey,
      stateDir: dirname(guardStatePath(opts)),
      onHalt: (r: string, m: FleetMember | null) => {
        try {
          console.error(`[hardware-root] FLEET HALT: ${r}${m ? ` (member ${m.serial})` : ""}`);
        } catch {
          /* logging best-effort */
        }
        // A fleet halt is a tamper event like any other: snapshot it (finding H13).
        void captureAndRecordTamper(`fleet: ${r}`, {
          serial: m?.serial ?? null,
          pubkey: m?.pubkey ?? null,
          status: m?.status ?? "DIRTY",
        }).catch(() => {
          /* forensic capture is best-effort; it must never block the halt */
        });
      },
    });
    const primary = boundFleet.primary;
    boundGuard = primary?.guard ?? null;
    boundDev = primary?.dev ?? null;
    boundFleet.startHeartbeat(); // covers every member, member 0 included
    installCleanExit();
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
    statePath: guardStatePath(opts),
    rootPubkey: opts.rootPubkey,
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
  let bound;
  try {
    bound = await boundGuard.boot(boundDev); // genuine + the DEVICE latch clear; throws otherwise
  } catch (err) {
    const msg = err instanceof HaltError ? err.reason : String(err);
    if (/device latch unsupported/.test(msg) && hardwareRootOptional() && !hardwareRootRequired()) {
      // Firmware before 0.3 cannot hold the latch. Required deployments fail closed above; an
      // operator who set ENCLAWEDER_ROOT=optional runs software-only, said loudly.
      try {
        console.error(
          `[enclawed] hardware root: ${msg}. ENCLAWEDER_ROOT=optional: running software-only. ${SOFTWARE_ONLY_NOTICE}`,
        );
      } catch {
        /* logging best-effort */
      }
      boundDev.close();
      boundDev = null;
      boundGuard = null;
      return null;
    }
    boundGuard = null;
    boundDev.close();
    boundDev = null;
    throw err;
  }
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
  installCleanExit();

  return boundGuard;
}

/**
 * The device stays DIRTY unless this process closes its host session cleanly, so every graceful
 * exit must send the authenticated close: process exit (normal end, process.exit) and SIGINT /
 * SIGTERM / SIGHUP. A signal that already has a handler is left to it (the app's own shutdown
 * calls closeHardwareRootSession); an unhandled one gets a handler that closes, then re-raises the
 * signal so the process ends exactly as it would have. A crash or SIGKILL leaves the device dirty:
 * that is the point.
 */
let cleanExitInstalled = false;
function installCleanExit(): void {
  if (cleanExitInstalled) {
    return;
  }
  cleanExitInstalled = true;
  process.once("exit", () => {
    try {
      closeHardwareRootSession();
    } catch {
      /* exiting anyway */
    }
  });
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    if (process.listenerCount(sig) > 0) {
      continue;
    }
    const onSig = () => {
      try {
        closeHardwareRootSession();
      } catch {
        /* exiting anyway */
      }
      process.removeListener(sig, onSig);
      process.kill(process.pid, sig);
    };
    process.on(sig, onSig);
  }
}

/** This process's own devices, as the owner serves them. */
function localService(): RootService {
  return {
    members: () =>
      hardwareRootMembersLocal().map((m) => ({
        uid: m.uid,
        pubkey: m.pubkey,
        serial: m.serial,
        ...(m.cert ? { cert: m.cert } : {}),
      })),
    // Each member's own signed latch read over the clients' nonce digest (finding H1).
    attest: localAttest,
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
    // The primary guard's latch session signs journal checkpoints (finding H2).
    checkpoint: (head32: Buffer) => {
      if (!boundGuard) {
        return Promise.reject(new HaltError("no Enclaweder is bound"));
      }
      return boundGuard.checkpoint(head32);
    },
    // A client's second factor, to the primary member (the key the client verifies against):
    // sealed frames it cannot read, and unlock uses whose receipts it cannot forge.
    relaySealed: (type, payload) => relayToPrimary(type, payload),
    relayUnlockUse: (payload) => relayToPrimary(0x31, payload),
    // A client's own authenticated anchor session (relayed-anchor.ts): the client verifies the
    // device's signed answers against the primary member's certified key itself.
    relayAnchor: (type, payload) => relayToPrimary(type, payload),
  };
}

/** One relayed request to the primary member, only while this owner's root is CLEAN. */
async function relayToPrimary(type: number, payload: Buffer): Promise<Buffer> {
  const h = localHealth();
  if (h.status !== "CLEAN") {
    throw new HaltError(`hardware root ${h.status}: ${h.reason}`);
  }
  const dev = boundDev;
  if (!dev) {
    throw new HaltError("no Enclaweder is bound");
  }
  const f = await dev.request(type, 1, payload, 15_000);
  return f?.payload ?? Buffer.alloc(0);
}

/** Each bound member's raw LATCH_GET over `nonce32`, read on that member itself. */
async function localAttest(nonce32: Buffer): Promise<MemberAttestation[]> {
  if (boundFleet) {
    const rs = await boundFleet.all((dev) => latchGetRaw(dev, nonce32));
    return rs.map((r) => {
      if (!r.value) {
        throw r.error ?? new HaltError(`member ${r.member.serial} gave no latch read`);
      }
      return { uid: r.member.uid, latch: r.value.toString("hex") };
    });
  }
  if (!boundDev || !boundGuard?.bound) {
    throw new HaltError("no Enclaweder is bound");
  }
  return [
    { uid: boundGuard.bound.uid, latch: (await latchGetRaw(boundDev, nonce32)).toString("hex") },
  ];
}

/**
 * Each member's latch read, signed by its device over a nonce of the caller's, for a process
 * that wants to check the devices itself (codenclawed's hook; findings H1, H15): every member,
 * never just the first. As the owner, read here; as a client, relayed and verified through the
 * owner. Null when no device is bound. Verify with verifyRootMembers + verifyRootAttestation.
 */
export async function attestHardwareRoot(nonce32: Buffer): Promise<RemoteAttestation | null> {
  if (boundGuard) {
    const digestNonces = [Buffer.from(nonce32)];
    const raw = await localAttest(attestDigest(digestNonces));
    return {
      nonce: nonce32.toString("hex"),
      nonces: digestNonces.map((n) => n.toString("hex")),
      members: hardwareRootMembersLocal().map((m) => ({
        uid: m.uid,
        pubkey: m.pubkey,
        cert: m.cert ?? "",
        sku: m.sku,
        latch: raw.find((r) => r.uid === m.uid)?.latch ?? "",
      })),
    };
  }
  if (shared && remote) {
    return remote.attest(nonce32);
  }
  return null;
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
  opts: BootOptions,
): Promise<HardwareRootGuard | RemoteRoot | null> {
  const sock = brokerSocketPath();
  // Every process on the machine may boot at once: keep trying, within a
  // budget, to become the owner or to reach the one that did.
  const deadline = Date.now() + 15_000;
  for (let attempt = 0; Date.now() < deadline; attempt++) {
    // A client trusts nothing until the host's own latches are clean (finding H1): a DIRTY latch
    // on this host is not cleared by finding someone else answering on the socket.
    refuseDirty(latchesOf(opts), "");
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
      r = await connectRoot(sock, 500, { rootPubkey: opts.rootPubkey ?? null });
    } catch (err) {
      if (err instanceof RootHaltError) {
        throw new HaltError(err.message);
      }
      if (err instanceof RootAttestError) {
        throw new HaltError(
          `refusing the process on the hardware root broker socket: ${err.message}`,
        );
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
async function takeOver(paths: string[], opts: BootOptions): Promise<void> {
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
  if (refusedReason && !boundGuard && !shared) {
    throw new HaltError(`hardware root boot was refused: ${refusedReason}`);
  }
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
  if (refusedReason && !boundGuard && !shared) {
    return { status: "DIRTY", reason: `boot refused: ${refusedReason}` };
  }
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

/**
 * Command set 0.5: KEY_DERIVE on the primary member, for this launch (key-derive.ts). Null when no
 * hardware root is held here. `derive(label32)` answers `{ ok: false, code: "unsupported" }` on
 * firmware before 0.5 (a kit then keeps its older key and reports KEY_DERIVE_RESIDUAL), and
 * "no-activation" when this process made no device-verified activation in the last 120 s.
 */
export function hardwareRootKeyDerivation(): {
  uid: string;
  pubkey: string;
  derive(label32: Buffer): Promise<KeyDeriveResult>;
} | null {
  if (!boundGuard && shared) {
    const r = remote;
    const m = r?.members[0];
    if (!r || !m || hardwareRootHealth().status !== "CLEAN") {
      return null;
    }
    return {
      uid: m.uid,
      pubkey: m.pubkey,
      derive: (label32) =>
        deriveDeviceKey(
          (type, payload) => r.relaySealed(type, payload),
          Buffer.from(m.pubkey, "hex"),
          Buffer.from(m.uid, "hex"),
          label32,
        ),
    };
  }
  const dev = boundDev;
  const b = boundGuard?.bound;
  if (!dev || !b || localHealth().status !== "CLEAN") {
    return null;
  }
  const relay = async (type: 0x35 | 0x36, payload: Buffer) =>
    (await dev.request(type, 1, payload, 15_000))?.payload ?? Buffer.alloc(0);
  return {
    uid: b.uid,
    pubkey: b.pubkey,
    derive: (label32) =>
      deriveDeviceKey(relay, Buffer.from(b.pubkey, "hex"), Buffer.from(b.uid, "hex"), label32),
  };
}

/**
 * Command set 0.5, proven by the device (activation.ts proveCommandSet05): a fresh ANCHOR_READ on
 * the primary member over this process's nonce, signed by its certified key, carried directly or
 * relayed by the owner (who cannot forge it). Never IDENTIFY's version, which is unsigned and,
 * through the owner, the owner's word. "unproven" when no hardware root is held here or it is not
 * CLEAN.
 */
export async function hardwareRootCommandSet(): Promise<CommandSetProof> {
  if (!boundGuard && shared) {
    const r = remote;
    const m = r?.members[0];
    if (!r || !m || hardwareRootHealth().status !== "CLEAN") {
      return { status: "unproven", reason: "the hardware root is not CLEAN here" };
    }
    return proveCommandSet05(
      (nonce) => r.relayAnchor(CS05.ANCHOR_READ, nonce),
      Buffer.from(m.pubkey, "hex"),
      Buffer.from(m.uid, "hex"),
    );
  }
  const dev = boundDev;
  const b = boundGuard?.bound;
  if (!dev || !b || localHealth().status !== "CLEAN") {
    return { status: "unproven", reason: "no CLEAN hardware root is held here" };
  }
  return proveCommandSet05(
    (nonce) => dev.anchorRead(nonce),
    Buffer.from(b.pubkey, "hex"),
    Buffer.from(b.uid, "hex"),
  );
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
export function hardwareRootSigningDevice(): Pick<
  Enclaweder,
  "getIdentity" | "challenge" | "getCert"
> | null {
  if (!boundGuard && shared) {
    if (!remote || remote.members.length !== 1 || hardwareRootHealth().status !== "CLEAN") {
      return null;
    }
    // getCert relays the member's certificate, which connectRoot verified (finding H15).
    return remote.device() as unknown as Pick<Enclaweder, "getIdentity" | "challenge" | "getCert">;
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

/**
 * The bound primary device for device-verified TOTP (TOTP_VERIFY / SIGN_ATTESTED; totp-verify.ts)
 * and the device-counted unlock (UNLOCK_GRANT / UNLOCK_USE), with the key and certificate the
 * guard verified at boot. Null unless the root is CLEAN. A client of another owner gets the same
 * access through the owner (relayed-factors.ts): codes sealed to the device, every answer checked
 * here against the primary member's certified key over a nonce chosen here.
 */
export function hardwareRootTotpDevice(): (DeviceTotpAccess & { cert: Buffer }) | null {
  if (!boundGuard && shared) {
    const r = remote;
    if (!r) {
      return null;
    }
    // Bound to THIS connection: an owner that went away or was replaced refuses every later use.
    return relayedTotpAccess(r, () =>
      remote === r && !boundGuard
        ? hardwareRootHealth()
        : { status: "UNAVAILABLE", reason: "the hardware root's owner changed" },
    );
  }
  const dev = boundDev;
  const b = boundGuard?.bound;
  const cert = boundGuard?.certificate;
  if (!dev || !b || !cert || localHealth().status !== "CLEAN") {
    return null;
  }
  return {
    pubkeyRaw: Buffer.from(b.pubkey, "hex"),
    uid: Buffer.from(b.uid, "hex"),
    cert,
    run: (fn) => fn(dev),
  };
}

/**
 * The audit anchor this session must use, decided by the kit (session-anchor.ts): this process's
 * own bound device, or, for a client of the machine's owner, the authenticated anchor session
 * relayed through the owner (relayed-anchor.ts). A session with a hardware root that cannot anchor
 * with authentication is refused (`ok: false`); adapters run the session only on `ok: true`.
 */
export function hardwareRootSessionAnchor(): SessionAnchorDecision {
  if (!boundGuard && shared) {
    const r = remote;
    const device = r
      ? relayedAnchorDevice(r, () =>
          remote === r && !boundGuard
            ? hardwareRootHealth()
            : { status: "UNAVAILABLE", reason: "the hardware root's owner changed" },
        )
      : null;
    return decideSessionAnchor({
      bound: true,
      device,
      devicePublicKey: device?.devicePublicKey ?? null,
      relayed: true,
    });
  }
  if (!boundGuard) {
    return decideSessionAnchor({
      bound: refusedReason !== null,
      device: null,
      devicePublicKey: null,
    });
  }
  const b = boundGuard.bound;
  const clean = localHealth().status === "CLEAN";
  return decideSessionAnchor({
    bound: true,
    device: clean ? boundDev : null,
    devicePublicKey: clean && b ? Buffer.from(b.pubkey, "hex") : null,
  });
}

/** hardwareRootSessionAnchor(), throwing SessionAnchorRefused when the session must not run. */
export function requireHardwareRootSessionAnchor(): ReturnType<typeof requireSessionAnchor> {
  return requireSessionAnchor(hardwareRootSessionAnchor());
}

/** The device-verified TOTP second factor that auth/device-factor.ts consumes. */
export async function deviceTotpSecondFactor(): Promise<
  ReturnType<typeof createDeviceTotpSecondFactor>
> {
  return createDeviceTotpSecondFactor(hardwareRootTotpDevice);
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
      cert: m.cert,
      // The model the certificate proves, never the serial prefix (finding H1).
      sku: m.sku,
      skuName: skuDisplayName(m.sku),
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
      ...(boundGuard.certificate ? { cert: boundGuard.certificate.toString("hex") } : {}),
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

/**
 * As closeHardwareRootSession(), waiting for each device to acknowledge the clean close (the
 * only thing that disarms its dirty-on-start latch). Call it from SIGINT/SIGTERM handlers and
 * every graceful exit path; a process that dies without it leaves the device DIRTY, by design.
 */
export async function closeHardwareRootSessionAsync(): Promise<void> {
  await boundFleet?.closeSessionAsync();
  await boundGuard?.closeSessionAsync().catch(() => undefined);
  ownerScheduler?.stop();
  await brokerHandle?.close().catch(() => undefined);
  brokerHandle = null;
}

export function hardwareRootPresent(): boolean {
  return boundGuard !== null || shared;
}
export function getHardwareGuard(): HardwareRootGuard | null {
  return boundGuard;
}
/** Recover inside the running agent. `auth` is verified by the DEVICE; see guard.recover(). */
export async function recoverHardwareRoot(auth: RecoveryAuth): Promise<boolean | undefined> {
  if (boundGuard && boundDev) {
    return boundGuard.recover(boundDev, auth);
  }
  return undefined;
}

/**
 * Recover a DIRTY latch from a process that has NOT booted the root (a CLI, the installer).
 *
 * The Enclaweder holds the latch and clears it only with two factors it verifies itself (an
 * authenticator code or security-key assertion AND a one-time recovery code) or with the operator
 * quorum. `humanConfirmed` is no longer accepted as an authority: a process of this user could
 * always pass `true`. Nothing here ends an accredited session (finding H4): only the guard that
 * opened a device host session closes it, on a clean exit.
 */
export async function recoverHardwareRootStandalone(opts: {
  auth?: RecoveryAuth;
  /** Refused with an explanation: no longer an authority. */
  humanConfirmed?: boolean;
  /** The latch cache to update: the single-device one by default, or one device's own. */
  statePath?: string;
  /** Pin one device (its hidraw path). */
  hidraw?: string;
  /** Demand one manufacturer root instead of the pinned domains (tests, single-SKU deployments). */
  rootPubkey?: Buffer;
}): Promise<{ recovered: boolean; serial?: string }> {
  if (!opts.auth) {
    throw new HaltError(
      "recovery: the Enclaweder now holds the latch and clears it only with two factors it verifies (an authenticator code or security key AND a one-time recovery code) or with the operator quorum; 'humanConfirmed' is not an authority. Run: enclawed hardware-root recover",
    );
  }
  // A live owner holds the device; a second handle would interleave with it.
  if (!brokerDisabled() && (await ownerAnswers(brokerSocketPath()))) {
    throw new HaltError(
      "recovery: an Enclawed process on this machine owns the Enclaweder; stop it first",
    );
  }
  const paths = opts.hidraw ? [opts.hidraw] : findAllEnclaweders();
  if (paths.length === 0) {
    throw new HaltError("recovery: no enclaweder detected on the bus");
  }
  const guard = new HardwareRootGuard({
    statePath: guardStatePath(opts),
    rootPubkey: opts.rootPubkey,
  });
  const devs = paths.map((p) => new Enclaweder(p));
  try {
    // The device the latch names, wherever it enumerates now; with none recorded, the first.
    const keys = await Promise.all(
      devs.map((d) =>
        d
          .getIdentity()
          .then((id) => id.pubkeyRaw.toString("hex"))
          .catch(() => null),
      ),
    );
    const own = keys.indexOf(guard.bound?.pubkey ?? "");
    const recovered = await guard.recover(devs[Math.max(own, 0)], opts.auth);
    const serial = guard.bound?.serial;
    return serial ? { recovered, serial } : { recovered };
  } finally {
    for (const d of devs) {
      d.close();
    }
  }
}

/** One device as `enclawed hardware-root status` reports it, read directly and verified. */
export interface DeviceRootReport {
  path: string;
  serial: string;
  uid: string;
  /** The device's identity key (hex), as it reported it. */
  pubkey: string;
  /** The device's own state (ACC_STATE), or null when it did not answer. */
  state: number | null;
  /** Birth certificate: valid under a pinned root, missing, or present but not valid. */
  cert: "valid" | "missing" | "invalid" | null;
  /** The SKU the valid certificate's root makes it. */
  sku: EnclawederSku | null;
  /** The device signed our fresh nonce with the key it reported: true, false, or not tried. */
  keyProof: boolean | null;
  latch: DeviceLatchState | null;
  latchError: string | null;
  latchErrorCode: LatchErrorCode | null;
  failures: { total: bigint; pending: number; entries: DeviceFailure[] } | null;
  custody: { counter: number; m: number; keys: string[] } | null;
}

/**
 * The hardware root as the DEVICES report it (signed answers over fresh nonces), plus every host
 * latch cache. Reads only; never binds, never opens a host session. Refuses to open a device that
 * a live owner holds: then the owner's health is reported instead.
 */
export async function hardwareRootStatusStandalone(
  opts: { statePath?: string; rootPubkey?: Buffer } = {},
): Promise<{
  hostLatches: Latch[];
  owner: RootHealth | null;
  devices: DeviceRootReport[];
}> {
  const hostLatches = latchesOf(opts);
  if (!brokerDisabled() && (await ownerAnswers(brokerSocketPath()))) {
    const r = await connectRoot(brokerSocketPath()).catch(() => null);
    const owner = r
      ? r.health()
      : { status: "UNAVAILABLE" as const, reason: "owner did not answer" };
    return { hostLatches, owner, devices: [] };
  }
  const devices: DeviceRootReport[] = [];
  for (const p of findAllEnclaweders()) {
    let dev: Enclaweder | null = null;
    try {
      dev = new Enclaweder(p);
      const id = await dev.getIdentity();
      const rep: DeviceRootReport = {
        path: p,
        serial: id.serial,
        uid: id.uid.toString("hex"),
        pubkey: id.pubkeyRaw.toString("hex"),
        state: null,
        cert: null,
        sku: null,
        keyProof: null,
        latch: null,
        latchError: null,
        latchErrorCode: null,
        failures: null,
        custody: null,
      };
      // Read-only probes: nothing here binds, opens a session or changes the device.
      rep.state = await dev
        .getStatus()
        .then((s) => s.state)
        .catch(() => null);
      const cert = await dev.getCert().catch(() => null);
      const parsed = cert ? verifyCert(cert, id.uid, id.pubkeyRaw, opts.rootPubkey ?? null) : null;
      rep.cert = !cert ? "missing" : parsed ? "valid" : "invalid";
      if (parsed?.sku) {
        rep.sku = parsed.sku;
        rep.serial =
          (parsed.sku === "pro" ? "ECPRO-" : "ENCLW-") + id.uid.toString("hex").toUpperCase();
      }
      try {
        // Signed over our fresh nonce under the reported key: a proof of possession by itself.
        rep.latch = await readDeviceLatch(dev, id.pubkeyRaw, id.uid);
        rep.keyProof = true;
        rep.failures = await readFailLog(dev, id.pubkeyRaw, id.uid).catch(() => null);
        const c = await readCustody(dev, id.pubkeyRaw, id.uid).catch(() => null);
        rep.custody = c
          ? { counter: c.counter, m: c.m, keys: c.keys.map((k) => k.toString("hex")) }
          : null;
      } catch (err) {
        rep.latchError = err instanceof DeviceLatchError ? err.message : String(err);
        rep.latchErrorCode = err instanceof DeviceLatchError ? err.code : null;
        if (rep.latchErrorCode === "bad-signature") {
          rep.keyProof = false;
        }
      }
      if (rep.keyProof === null) {
        // No signed latch read: ask for a plain proof of possession instead.
        const nonce = randomBytes(32);
        rep.keyProof = await dev
          .challenge(nonce)
          .then((c) => verifyChallenge(id.pubkeyRaw, nonce, c.uid, c.sig))
          .catch(() => null);
      }
      devices.push(rep);
    } catch (err) {
      devices.push({
        path: p,
        serial: "?",
        uid: "?",
        pubkey: "",
        state: null,
        cert: null,
        sku: null,
        keyProof: null,
        latch: null,
        latchError: err instanceof Error ? err.message : String(err),
        latchErrorCode: null,
        failures: null,
        custody: null,
      });
    } finally {
      dev?.close();
    }
  }
  return { hostLatches, owner: null, devices };
}

/**
 * The host seam for code outside the core TypeScript build: the enterprise edition's sealed
 * accreditors. They reach
 * THIS hardware root through it (broker client with device attestation, device-held latch, one
 * owner per device), never a copy of their own: a second implementation was a second owner of
 * the device that bypassed every check here. Installed once per process; a later module instance
 * of this file (a test runner's isolation, or a second bundle) leaves the first in place.
 */
export const HARDWARE_ROOT_SEAM = Symbol.for("enclawed.hardware-root.v1");
export type HardwareRootSeam = Readonly<{
  version: 1;
  bootHardwareRoot: typeof bootHardwareRoot;
  assertHardwareClean: typeof assertHardwareClean;
  hardwareRootHealth: typeof hardwareRootHealth;
}>;
if (!(HARDWARE_ROOT_SEAM in globalThis)) {
  Object.defineProperty(globalThis, HARDWARE_ROOT_SEAM, {
    value: Object.freeze({
      version: 1,
      bootHardwareRoot,
      assertHardwareClean,
      hardwareRootHealth,
    }) satisfies HardwareRootSeam,
    writable: false,
    configurable: false,
    enumerable: false,
  });
}

export type { RecoveryAuth } from "./guard.js";
export { parseRecoveryCode, parseTotp, formatRecoveryCode } from "./recovery-code.js";

// Forensics: apps register who/where the current operator is (setForensicContext); the guard captures
// a full snapshot automatically on any DIRTY/tamper transition.
export {
  setForensicContext,
  getForensicContext,
  setForensicAuditSink,
  verifyForensicLog,
  FORENSIC_AUDIT_TYPE,
  captureForensics,
  forensicLogPath,
  type ForensicSnapshot,
  type DeviceForensics,
} from "./forensics.js";

export { HardwareRootFleet, type FleetMember } from "./fleet.js";
export { CS05_REFLASH_RUNBOOK, proveCommandSet05, type CommandSetProof } from "./activation.js";
export { KEY_DERIVE_RESIDUAL, type KeyDeriveResult } from "./key-derive.js";
