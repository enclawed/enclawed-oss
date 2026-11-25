// CLI-to-authenticator transport: Yubico's libfido2 command-line tools
// (`fido2-token`, `fido2-cred`, `fido2-assert`), the reference CTAP2
// implementation, packaged by every major OS distribution (Debian/Ubuntu
// `fido2-tools`, Fedora `fido2-tools`, Homebrew `libfido2`, Yubico's Windows
// release). Enclawed adds no npm dependency for the authenticator link.
//
// The transport only carries bytes. Every security decision (rpIdHash, UP,
// UV, backup eligibility, signature, counter, attestation) is made by
// webauthn.ts over what the authenticator signed, so a substituted tool
// cannot pass a check it cannot sign for. The PIN is read by libfido2 itself
// from the terminal (/dev/tty); it never passes through this process.
//
// Refused here, before any ceremony:
//   - `windows://hello`: libfido2's route to Windows' webauthn.dll, which
//     can satisfy the request with Windows Hello (a platform authenticator
//     whose key lives in this computer's TPM);
//   - devices whose CTAP getInfo reports `plat` (a platform authenticator);
//   - devices that cannot verify the user: neither a PIN set (`clientPin`)
//     nor built-in user verification configured (`uv`).

import { spawnSync, type SpawnSyncOptions, type SpawnSyncReturns } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type Fido2DeviceInfo = {
  path: string;
  description: string;
  options: Map<string, boolean>;
  aaguid: string | null;
  algorithms: string[];
  versions: string[];
};

export type UvMode = "pin" | "builtin";

export type MadeCredential = {
  clientDataHash: Uint8Array;
  rpId: string;
  fmt: string;
  /** Raw authenticator data (libfido2 prints it CBOR-wrapped; unwrapped here). */
  authDataCbor: Uint8Array;
  credentialId: Uint8Array;
  sig: Uint8Array;
  x5c: Uint8Array[];
};

export type GotAssertion = {
  clientDataHash: Uint8Array;
  rpId: string;
  authDataCbor: Uint8Array;
  sig: Uint8Array;
};

export type TransportErrorCode =
  | "tools-missing"
  | "no-device"
  | "platform-authenticator"
  | "no-user-verification"
  | "unsupported-algorithm"
  | "ceremony-failed"
  | "bad-output";

export class TransportError extends Error {
  constructor(
    readonly code: TransportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TransportError";
  }
}

/** The authenticator link the gate uses; libfido2 in production, injectable for tests. */
export interface Fido2Transport {
  listDevices(): Fido2DeviceInfo[];
  makeCredential(p: {
    device: Fido2DeviceInfo;
    clientDataHash: Uint8Array;
    rpId: string;
    userName: string;
    userId: Uint8Array;
    alg: "es256" | "eddsa";
  }): MadeCredential;
  /** Silent probe (UP and UV off): is this credential on this device? No touch, no PIN. */
  hasCredential(p: { device: Fido2DeviceInfo; rpId: string; credentialId: Uint8Array }): boolean;
  getAssertion(p: {
    device: Fido2DeviceInfo;
    clientDataHash: Uint8Array;
    rpId: string;
    credentialId: Uint8Array;
  }): GotAssertion;
}

type Runner = (cmd: string, args: string[], opts: SpawnSyncOptions) => SpawnSyncReturns<string>;

// System locations first: a tool earlier on a user-writable PATH cannot
// shadow the distribution's copy. (It still could not forge a signature.)
const SYSTEM_DIRS =
  process.platform === "win32"
    ? []
    : ["/usr/bin", "/usr/local/bin", "/opt/homebrew/bin", "/opt/local/bin"];

export function findTool(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const dirs = [...SYSTEM_DIRS, ...(env.PATH ?? "").split(path.delimiter).filter(Boolean)];
  for (const dir of dirs) {
    const p = path.join(dir, exe);
    try {
      fs.accessSync(p, fs.constants.X_OK);
      if (fs.statSync(p).isFile()) {
        return p;
      }
    } catch {
      /* next */
    }
  }
  return null;
}

export const INSTALL_HINT =
  "install libfido2's tools: Debian/Ubuntu `sudo apt install fido2-tools`, Fedora `sudo dnf install fido2-tools`, macOS `brew install libfido2`, Windows: Yubico's libfido2 release (https://developers.yubico.com/libfido2/Releases/)";

function b64(text: string, what: string): Uint8Array {
  const t = text.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(t)) {
    throw new TransportError("bad-output", `libfido2 printed a malformed ${what}`);
  }
  return new Uint8Array(Buffer.from(t, "base64"));
}

/** Parse `fido2-token -L`: "<path>: vendor=..., product=... (<description>)". */
export function parseDeviceList(stdout: string): Array<{ path: string; description: string }> {
  const out: Array<{ path: string; description: string }> = [];
  for (const line of stdout.split(/\r?\n/)) {
    // Paths may contain ':' (windows://hello, ioreg://, pcsc://); the
    // separator is the first ": " (colon + space).
    const at = line.indexOf(": ");
    if (at <= 0) {
      continue;
    }
    out.push({ path: line.slice(0, at), description: line.slice(at + 2).trim() });
  }
  return out;
}

/** Parse `fido2-token -I <dev>` (CTAP authenticatorGetInfo, as libfido2 prints it). */
export function parseDeviceInfo(stdout: string): Omit<Fido2DeviceInfo, "path" | "description"> {
  const options = new Map<string, boolean>();
  let aaguid: string | null = null;
  let algorithms: string[] = [];
  let versions: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at < 0) {
      continue;
    }
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    if (key === "options") {
      for (const raw of value.split(",")) {
        const opt = raw.trim();
        if (!opt) {
          continue;
        }
        if (opt.startsWith("no") && opt.length > 2) {
          options.set(opt.slice(2), false);
        } else {
          options.set(opt, true);
        }
      }
    } else if (key === "aaguid") {
      aaguid = value.toLowerCase();
    } else if (key === "algorithms") {
      algorithms = value
        .split(",")
        .map((s) => s.trim().split(/\s+/)[0])
        .filter(Boolean);
    } else if (key === "version strings") {
      versions = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return { options, aaguid, algorithms, versions };
}

/** Why a device is refused before any ceremony, or null when it may be used. */
export function deviceRefusal(
  dev: Fido2DeviceInfo,
): { code: TransportErrorCode; message: string } | null {
  if (/^windows:\/\//i.test(dev.path)) {
    return {
      code: "platform-authenticator",
      message:
        "the Windows WebAuthn route (windows://hello) can answer with Windows Hello, whose key lives in this computer; use a security key over raw HID (run elevated, or from WSL with usbipd)",
    };
  }
  if (dev.options.get("plat") === true) {
    return { code: "platform-authenticator", message: `${dev.path} is a platform authenticator` };
  }
  if (!dev.versions.some((v) => v.startsWith("FIDO_2"))) {
    return {
      code: "no-user-verification",
      message: `${dev.path} is U2F-only and cannot verify a PIN`,
    };
  }
  if (dev.options.get("clientPin") !== true && dev.options.get("uv") !== true) {
    return {
      code: "no-user-verification",
      message: `${dev.path} has no PIN set and no built-in user verification; set a PIN first: fido2-token -S ${dev.path}`,
    };
  }
  return null;
}

export function uvModeFor(dev: Fido2DeviceInfo): UvMode {
  return dev.options.get("clientPin") === true ? "pin" : "builtin";
}

export function createLibfido2Transport(
  opts: { env?: NodeJS.ProcessEnv; run?: Runner; timeoutMs?: number } = {},
): Fido2Transport {
  const env = opts.env ?? process.env;
  const run: Runner =
    opts.run ?? ((cmd, args, o) => spawnSync(cmd, args, { ...o, encoding: "utf8" }));
  const timeout = opts.timeoutMs ?? 120_000;
  const tool = (name: string): string => {
    const p = findTool(name, env);
    if (!p) {
      throw new TransportError("tools-missing", `${name} was not found; ${INSTALL_HINT}`);
    }
    return p;
  };
  // PIN prompts and touch requests go to the terminal; stdout carries the result.
  const ceremony = (cmd: string, args: string[], input: string): string => {
    const r = run(tool(cmd), args, { input, stdio: ["pipe", "pipe", "inherit"], timeout });
    if (r.status !== 0) {
      throw new TransportError(
        "ceremony-failed",
        `${cmd} did not complete (exit ${String(r.status ?? r.signal)})`,
      );
    }
    return r.stdout ?? "";
  };
  return {
    listDevices() {
      const r = run(tool("fido2-token"), ["-L"], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 15_000,
      });
      if (r.status !== 0) {
        return [];
      }
      return parseDeviceList(r.stdout ?? "").map((d) => {
        if (/^windows:\/\//i.test(d.path)) {
          return { ...d, options: new Map(), aaguid: null, algorithms: [], versions: [] };
        }
        const i = run(tool("fido2-token"), ["-I", d.path], {
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 15_000,
        });
        return { ...d, ...parseDeviceInfo(i.status === 0 ? (i.stdout ?? "") : "") };
      });
    },
    makeCredential(p) {
      const refusal = deviceRefusal(p.device);
      if (refusal) {
        throw new TransportError(refusal.code, refusal.message);
      }
      if (!p.device.algorithms.includes(p.alg)) {
        throw new TransportError(
          "unsupported-algorithm",
          `${p.device.path} does not offer ${p.alg}`,
        );
      }
      const input = [
        Buffer.from(p.clientDataHash).toString("base64"),
        p.rpId,
        p.userName,
        Buffer.from(p.userId).toString("base64"),
        "",
      ].join("\n");
      // -v: request user verification at creation. Not resident (-r): the
      // host keeps the credential id; nothing is stored in the key's slots.
      const out = ceremony("fido2-cred", ["-M", "-v", p.device.path, p.alg], input).split(/\r?\n/);
      if (out.length < 6) {
        throw new TransportError("bad-output", "fido2-cred printed too few lines");
      }
      return {
        clientDataHash: b64(out[0], "client data hash"),
        rpId: out[1].trim(),
        fmt: out[2].trim(),
        authDataCbor: b64(out[3], "authenticator data"),
        credentialId: b64(out[4], "credential id"),
        sig: b64(out[5], "attestation signature"),
        x5c: out[6]?.trim() ? [b64(out[6], "attestation certificate")] : [],
      };
    },
    hasCredential(p) {
      if (deviceRefusal(p.device)) {
        return false;
      }
      const input = [
        Buffer.from(new Uint8Array(32)).toString("base64"),
        p.rpId,
        Buffer.from(p.credentialId).toString("base64"),
        "",
      ].join("\n");
      const r = run(
        tool("fido2-assert"),
        ["-G", "-t", "up=false", "-t", "uv=false", p.device.path],
        {
          input,
          stdio: ["pipe", "pipe", "ignore"],
          timeout: 15_000,
        },
      );
      return r.status === 0;
    },
    getAssertion(p) {
      const refusal = deviceRefusal(p.device);
      if (refusal) {
        throw new TransportError(refusal.code, refusal.message);
      }
      const input = [
        Buffer.from(p.clientDataHash).toString("base64"),
        p.rpId,
        Buffer.from(p.credentialId).toString("base64"),
        "",
      ].join("\n");
      const uvArgs = uvModeFor(p.device) === "pin" ? ["-t", "pin=true"] : ["-t", "uv=true"];
      const out = ceremony(
        "fido2-assert",
        ["-G", "-t", "up=true", ...uvArgs, p.device.path],
        input,
      ).split(/\r?\n/);
      if (out.length < 4) {
        throw new TransportError("bad-output", "fido2-assert printed too few lines");
      }
      return {
        clientDataHash: b64(out[0], "client data hash"),
        rpId: out[1].trim(),
        authDataCbor: b64(out[2], "authenticator data"),
        sig: b64(out[3], "assertion signature"),
      };
    },
  };
}
