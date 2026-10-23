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

import fs from "node:fs";
import { createRequire } from "node:module";
import { platform } from "node:os";

/** USB identity of the enclaweder. Matches the HID_ID uevent pair used by the hidraw scan. */
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

function listHidrawPaths(): string[] {
  const found: string[] = [];
  try {
    for (const hd of fs.readdirSync("/sys/class/hidraw")) {
      try {
        const u = fs.readFileSync(`/sys/class/hidraw/${hd}/device/uevent`, "utf8").toUpperCase();
        if (
          u.includes(ENCLAWEDER_VID.toString(16).padStart(8, "0").toUpperCase()) &&
          u.includes(ENCLAWEDER_PID.toString(16).padStart(8, "0").toUpperCase())
        ) {
          found.push(`/dev/${hd}`);
        }
      } catch {
        /* unreadable node -- skip */
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

function openHidraw(path: string): HidTransport {
  const fd = fs.openSync(path, fs.constants.O_RDWR | fs.constants.O_NONBLOCK);
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
