// Hardware-root-of-trust binding for enclawed (TypeScript). Vendored from
// enclaweder/integration/enclawed/hardware-root.mjs -- keep in sync with that source and the two
// deps (guard.ts, enclaweder-hid.ts).
//
// PRESENCE POLICY (per design):
//   * The enclaweder is AUTO-DETECTED at bootstrap (USB VID:PID scan). No env flag turns detection
//     off -- if a genuine device is on the bus, it is bound and every gated operation is checked
//     against it. It "cannot be not used": unplugging or zeroizing it after boot trips a persistent
//     DIRTY latch that halts operations until a human recovers with the genuine device present.
//   * If NO device is detected, enclawed runs software-only UNLESS the deployment mandates hardware
//     (ENCLAWEDER_ROOT=required|1|true), in which case bootstrap fails secure and refuses to start.
// The env flag only decides whether *absence* is fatal; *presence* is always enforced.
import { readFileSync } from "node:fs";
import { Enclaweder, findAllEnclaweders } from "./enclaweder-hid.js";
import { HardwareRootFleet, type FleetMember, skuDisplayName } from "./fleet.js";
import { captureAndRecordTamper } from "./forensics.js";
import { HardwareRootGuard, HaltError } from "./guard.js";

let boundGuard: HardwareRootGuard | null = null;
let boundDev: Enclaweder | null = null;
let boundFleet: HardwareRootFleet | null = null;
let bootPromise: Promise<HardwareRootGuard | null> | null = null;
let resolved = false;

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

/**
 * The guard's persisted state, read directly. Best-effort and
 * read-only: an unreadable or absent file means nothing was bound,
 * which is the ordinary software-only case.
 */
function readGuardState(statePath?: string): {
  status?: string;
  bound?: { serial?: string } | null;
  dirty?: { reason?: string } | null;
  sessionOpen?: boolean;
} | null {
  const p =
    statePath ??
    process.env.ENCLAWEDER_STATE ??
    `${process.env.HOME ?? "/var/lib/enclawed"}/.enclawed-hw-root.state`;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export async function bootHardwareRoot(
  opts: { hidraw?: string; statePath?: string } = {},
): Promise<HardwareRootGuard | null> {
  if (resolved) {
    return boundGuard;
  }
  if (bootPromise) {
    return bootPromise;
  }
  bootPromise = (async (): Promise<HardwareRootGuard | null> => {
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
      const prior = readGuardState(opts.statePath);
      if (prior?.status === "DIRTY") {
        throw new HaltError(
          `hardware root is latched DIRTY (${prior.dirty?.reason ?? "reason not recorded"}) and no ` +
            `enclaweder is present. Human recovery is required; removing the device does not clear it.`,
        );
      }
      if (prior?.sessionOpen && prior.bound?.serial && !hardwareRootOptional()) {
        throw new HaltError(
          `refusing to continue a session accredited by enclaweder ${prior.bound.serial}: the ` +
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
            ". Set ENCLAWEDER_ROOT=required to make its absence fatal.",
        );
      } catch {
        /* logging best-effort */
      }
      resolved = true;
      return null; // software-only: nothing to enforce
    }
    try {
      console.error(`[enclawed] hardware root: enclaweder detected at ${path} — verifying…`);
    } catch {
      /* logging best-effort */
    }
    // MORE THAN ONE DEVICE: the fleet owns every device and the single-device API below reuses
    // its member 0. Do NOT also open `path` here -- two fds on one hidraw node interleave their
    // request streams and their heartbeats, and the device rejects the interleaved frames.
    if (paths.length > 1) {
      boundFleet = await HardwareRootFleet.boot({
        paths,
        stateDir: process.env.ENCLAWEDER_STATE_DIR ?? process.env.HOME ?? "/var/lib/enclawed",
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
      resolved = true;
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

    resolved = true;
    return boundGuard;
  })();
  return bootPromise;
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
  if (!boundGuard) {
    return;
  }
  boundGuard.assertClean();
  // Fail-secure across the whole fleet: every bound device must still be present and CLEAN.
  if (boundFleet) {
    boundFleet.assertClean();
  }
}

/** The bound fleet, or null when only one device was detected (use the single-device API then). */
export function hardwareRootFleetHandle(): HardwareRootFleet | null {
  return boundFleet;
}

/** Every bound device, for the audit trail. Single-device deployments report their one member. */
export function hardwareRootMembers(): FleetMember[] {
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
}

export function hardwareRootPresent(): boolean {
  return boundGuard !== null;
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
