// The machine's Enclaweders as the swarm uses them: through Enclawed's own
// bootstrap, which binds them in one process on the machine (their owner) and
// shares them with every other (each MPI rank, the monitor, a host) through
// its scheduler. The swarm never opens a device.

import {
  bootHardwareRoot,
  hardwareRootHealth,
  hardwareRootSigning,
} from "../hardware-root/index.js";
import type { SigningFleet } from "./signer.js";
import type { HeartbeatStatus } from "./types.js";

/**
 * A device's state as a node reports it. UNAVAILABLE (the devices' owner is
 * gone or busy) is not a tamper: the node sends no heartbeat, its lease
 * lapses, and its rank pauses until the devices answer again.
 */
export type DeviceHealth = { status: HeartbeatStatus | "UNAVAILABLE"; reason?: string };

/** The devices one process can sign through, and their health. */
export type DeviceAccess = {
  fleet: SigningFleet;
  health(): DeviceHealth;
};

/** This machine's Enclaweders, or null when none is present. */
export async function localDevices(): Promise<DeviceAccess | null> {
  if (!(await bootHardwareRoot())) {
    return null;
  }
  const signing = hardwareRootSigning();
  if (!signing) {
    return null;
  }
  return {
    fleet: { members: signing.members, run: (fn) => signing.run(fn) },
    health: () => {
      const h = hardwareRootHealth();
      return h.status === "CLEAN" ? { status: "CLEAN" } : { status: h.status, reason: h.reason };
    },
  };
}
