// HID transport for the enclaweder, split out so the wire protocol has
// exactly one implementation regardless of platform.
//
// The driver originally opened /dev/hidraw* with fs.openSync and did
// report I/O with fs.writeSync / fs.readSync. That is correct and
// dependency-free, but Linux is the only platform that exposes HID as a
// character device: macOS and Windows enumerate the same device fine
// (it shows in System Information and Device Manager) and simply reach
// it through IOHIDManager / SetupAPI instead. The result was a hardware
// trust anchor that silently degraded to software-only on the two
// platforms most operators run.
//
// Everything above the four calls below — framing, CRC, the response
// parser, the request/response correlation, and all four GuardDevice
// operations — is pure protocol and is shared unchanged.
//
// Linux keeps the zero-dependency hidraw path. node-hid is loaded
// lazily and only where it is actually needed, so a Linux install never
// requires the native module, and a macOS/Windows host missing it
// degrades to software-only rather than throwing.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { platform } from "node:os";
/** USB identity of the enclaweder. Matches the HID_ID uevent pair used by the hidraw scan. */
import { testRunnerRefusal } from "./test-guard.js";
import { inNonInitialUserNamespace } from "./userns.js";

export const ENCLAWEDER_VID = 0x1209;
export const ENCLAWEDER_PID = 0xe100;

/**
 * The whole platform-dependent surface: two report operations and a
 * close. `readReport` is non-blocking and returns 0 when nothing is
 * pending, mirroring the EAGAIN the hidraw path already handles.
 */
export interface HidTransport {
  writeReport(report: Buffer): void;
  readReport(into: Buffer): number;
  close(): void;
}

export type HidBackend = "hidraw" | "node-hid" | "none";

/** Which backend this platform will use, without opening anything. */
export function hidBackend(): HidBackend {
  if (platform() === "linux") {
    return "hidraw";
  }
  return loadNodeHid() ? "node-hid" : "none";
}

type NodeHidModule = {
  devices: () => Array<{ vendorId?: number; productId?: number; path?: string }>;
  HID: new (path: string) => {
    write: (data: number[]) => number;
    readTimeout: (ms: number) => number[];
    close: () => void;
  };
};

let nodeHidCache: NodeHidModule | null | undefined;

/**
 * node-hid is a native optional dependency. A host without prebuilds
 * for its platform must degrade to software-only, not crash the
 * bootstrap, so every failure to load collapses to null.
 */
function loadNodeHid(): NodeHidModule | null {
  if (nodeHidCache !== undefined) {
    return nodeHidCache;
  }
  try {
    const req = createRequire(import.meta.url);
    nodeHidCache = req("node-hid") as NodeHidModule;
  } catch {
    nodeHidCache = null;
  }
  return nodeHidCache;
}

/** Every attached enclaweder, as opaque handles for openHid(). */
export function listEnclawederPaths(): string[] {
  if (platform() === "linux") {
    return listHidrawPaths();
  }
  const hid = loadNodeHid();
  if (!hid) {
    return [];
  }
  try {
    return hid
      .devices()
      .filter((d) => d.vendorId === ENCLAWEDER_VID && d.productId === ENCLAWEDER_PID)
      .map((d) => d.path)
      .filter((p): p is string => typeof p === "string" && p.length > 0)
      .toSorted();
  } catch {
    return [];
  }
}

/**
 * The USB/Bluetooth identity a hidraw node reports, parsed from its uevent's exact
 * `HID_ID=bbbb:vvvvvvvv:pppppppp` line (finding H10). HID_NAME and HID_UNIQ are strings the
 * peripheral supplies about itself, so nothing is ever matched against them.
 */
export function parseHidId(uevent: string): { bus: number; vid: number; pid: number } | null {
  for (const line of uevent.split("\n")) {
    const m = /^HID_ID=([0-9A-Fa-f]{4}):([0-9A-Fa-f]{8}):([0-9A-Fa-f]{8})$/.exec(line.trim());
    if (m) {
      return { bus: parseInt(m[1], 16), vid: parseInt(m[2], 16), pid: parseInt(m[3], 16) };
    }
  }
  return null;
}

/** True when the hidraw node `name` (e.g. "hidraw0") reports the Enclaweder's VID:PID. */
function hidrawIsEnclaweder(name: string): boolean {
  if (!/^hidraw\d+$/.test(name)) {
    return false;
  }
  try {
    const id = parseHidId(fs.readFileSync(`/sys/class/hidraw/${name}/device/uevent`, "utf8"));
    return id !== null && id.vid === ENCLAWEDER_VID && id.pid === ENCLAWEDER_PID;
  } catch {
    return false; // unreadable node, or no such node
  }
}

/**
 * Why a pinned device path (ENCLAWEDER_HIDRAW or an explicit option) must not be opened, or
 * null (finding H10): on Linux it must be a /dev/hidrawN node whose sysfs identity is the
 * Enclaweder's VID:PID, so protocol frames are never written to some other HID device.
 */
export function pinnedPathRefusal(path: string): string | null {
  if (platform() !== "linux") {
    return null; // node-hid paths are opaque; listEnclawederPaths already filtered by VID/PID
  }
  const m = /^\/dev\/(hidraw\d+)$/.exec(path);
  if (!m) {
    return `${path} is not a /dev/hidrawN node`;
  }
  if (!hidrawIsEnclaweder(m[1])) {
    return `${path} does not report the Enclaweder's USB identity (1209:E100)`;
  }
  return null;
}

function listHidrawPaths(): string[] {
  const found: string[] = [];
  try {
    for (const hd of fs.readdirSync("/sys/class/hidraw")) {
      if (hidrawIsEnclaweder(hd)) {
        found.push(`/dev/${hd}`);
      }
    }
  } catch {
    /* no hidraw subsystem */
  }
  // Numeric sort so fleet member indices stay stable and /dev/hidraw10
  // does not precede /dev/hidraw2.
  return found.toSorted((a, b) => {
    const na = Number(a.replace(/\D+/g, ""));
    const nb = Number(b.replace(/\D+/g, ""));
    return na - nb;
  });
}

export function openHid(path: string): HidTransport {
  return platform() === "linux" ? openHidraw(path) : openNodeHid(path);
}

/**
 * Why this process must not open the device node itself, or null (finding N16, H14). A process
 * outside the initial user namespace reaches the hardware root only through the host's broker;
 * ENCLAWEDER_DEVICE=deny (set by test and benchmark harnesses) refuses every direct open.
 */
export function directOpenRefusal(): string | null {
  const runner = testRunnerRefusal();
  if (runner) {
    return runner;
  }
  if ((process.env.ENCLAWEDER_DEVICE ?? "").trim().toLowerCase() === "deny") {
    return "direct device access is denied in this environment (ENCLAWEDER_DEVICE=deny)";
  }
  if (platform() === "linux" && inNonInitialUserNamespace()) {
    return "this process runs in a non-initial user namespace; it may reach the Enclaweder only through the host's broker, never by opening the device node";
  }
  return null;
}

function openHidraw(path: string): HidTransport {
  const refusal = directOpenRefusal() ?? pinnedPathRefusal(path);
  if (refusal) {
    throw new Error(`enclaweder: refusing to open ${path}: ${refusal}`);
  }
  const fd = fs.openSync(path, fs.constants.O_RDWR | fs.constants.O_NONBLOCK);
  // Single owner per node (findings D1/H11): an exclusive, non-blocking flock on the open file
  // description. Node has no flock(2), so flock(1) is run on an inherited copy of the fd; the
  // lock belongs to the shared description and stays held after the helper exits, until this
  // process closes the fd. Advisory: it stops every Enclawed process (and anything else that
  // asks), not a process that ignores locks -- the device's own one-session rule does that.
  const lock = spawnSync("flock", ["-n", "-x", "3"], { stdio: ["ignore", "ignore", "ignore", fd] });
  if (!lock.error && lock.status === 1) {
    fs.closeSync(fd);
    throw new Error(
      `enclaweder: ${path} is held by another process (exclusive lock); one owner per device`,
    );
  }
  return {
    writeReport(report) {
      fs.writeSync(fd, report);
    },
    readReport(into) {
      try {
        return fs.readSync(fd, into, 0, into.length, null);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "EAGAIN") {
          return 0;
        }
        throw e;
      }
    },
    close() {
      try {
        fs.closeSync(fd);
      } catch {
        /* already closed */
      }
    },
  };
}

function openNodeHid(path: string): HidTransport {
  const refusal = directOpenRefusal();
  if (refusal) {
    throw new Error(`enclaweder: refusing to open ${path}: ${refusal}`);
  }
  const hid = loadNodeHid();
  if (!hid) {
    throw new Error(
      `enclaweder: no HID backend available on ${platform()}. Install the optional ` +
        `native dependency 'node-hid' to drive the hardware root on this platform.`,
    );
  }
  const dev = new hid.HID(path);
  return {
    writeReport(report) {
      // node-hid takes the report as a plain byte array whose first
      // element is the report id — the same 65-byte shape the hidraw
      // path writes.
      dev.write(Array.from(report));
    },
    readReport(into) {
      // 0ms is a non-blocking poll: returns an empty array when no
      // report is pending, which the caller treats exactly like EAGAIN.
      const data = dev.readTimeout(0);
      if (!data || data.length === 0) {
        return 0;
      }
      const n = Math.min(data.length, into.length);
      Buffer.from(data).copy(into, 0, 0, n);
      return n;
    },
    close() {
      try {
        dev.close();
      } catch {
        /* already closed */
      }
    },
  };
}
