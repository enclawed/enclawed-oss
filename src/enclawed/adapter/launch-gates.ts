// enclawed adapter kit: launch gates that sit around the audit anchor, the
// operator quorum and the credential erase.
//
// The audit-anchor gate. A launcher that takes the audit log "as found"
// launders a log that a same-user process rewrote between sessions (deleted
// the anchor file and history, wrote a fabricated log): the next session
// anchors the fabricated log and the evidence is gone. So before the host
// starts, the device's comparison runs on the log as found, and when the
// device holds anchors that the log, its anchor file or its history do not
// match, the launch is REFUSED until a person accepts the current state as the
// new baseline. decideAnchorGate is that decision; the comparison itself is
// the framework's (the adapter passes its result).
//
// Operator keys off the host. An operator-quorum takeover or latch clear is
// authorized by the device, which checks the operators' signatures; the
// quorum is only as strong as the place the operator private keys live. A key
// FILE is never accepted (each operator signs on another machine and pastes
// the signature), and the operation is refused while an operator private key
// (Ed25519) is found on this host.
//
// The erase re-check. After a hardware halt the host's login is erased; a
// helper that escaped the stop can write it back later. A detached watcher
// keeps re-checking on a fixed schedule (1, 2, 4, 8 s, then every 15 s, for
// 60 s: internal constants, never settings) and erases the login again each
// time it reappears. This is best effort: a copy taken before the erase keeps
// working until it is revoked at the provider.
//
// Ported from codenclawed's anchor-gate.mjs, operator-keys.mjs and
// erase-watch.mjs.

import { createPrivateKey } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { hostUid, inNonInitialUserNamespace } from "../hardware-root/userns.js";

// ─── The audit-anchor launch gate ───────────────────────────────────────

/** The device comparison of the log as found (the framework's checkBoundDeviceAnchor result). */
export type AnchorCheck = Readonly<{
  status: "matched" | "MISMATCH" | "superseded" | "unavailable" | (string & {});
  code?: string | null;
  detail?: string | null;
  counter?: string | null;
  /** The device holds anchors of some log. */
  deviceHasAnchors?: boolean | null;
}>;

export type AnchorGate =
  | Readonly<{ ok: true; status: string; detail: string }>
  | Readonly<{ ok: false; status: string; code: string; detail: string; counter: string | null }>;

/**
 * May a session start on this log with this device? `device` null: no device
 * is bound; `canAnchor` false: the device cannot anchor with authentication
 * (the kit's hardwareRootSessionAnchor decides it). `rootRequired`: the
 * hardware root is required on this host. Otherwise `check` is the device's
 * comparison and `anchorFilePresent` whether the logger's signed anchor file
 * exists.
 *
 * A session with a device bound, or with the root required, anchors its log
 * or does not start: no device while the root is required, a device that
 * cannot anchor, and firmware without anchoring are refused. Only a host
 * that neither requires nor has a device starts without an anchor.
 */
export function decideAnchorGate(o: {
  device: Readonly<{ canAnchor: boolean }> | null;
  rootRequired: boolean;
  check?: AnchorCheck | null;
  anchorFile: string;
  anchorFilePresent: boolean;
}): AnchorGate {
  if (!o.device) {
    if (o.rootRequired) {
      return {
        ok: false,
        status: "no-device",
        code: "anchor-root-required",
        detail: "the hardware root is required on this host and no Enclaweder is bound",
        counter: null,
      };
    }
    return { ok: true, status: "no-device", detail: "no Enclaweder is bound" };
  }
  if (!o.device.canAnchor) {
    return {
      ok: false,
      status: "no-anchor",
      code: "anchor-unauthenticated",
      detail:
        "the bound Enclaweder cannot anchor this log with an authenticated anchor session, so another process of this user could anchor a log of its choosing",
      counter: null,
    };
  }
  const r = o.check;
  if (!r) {
    return {
      ok: false,
      status: "unchecked",
      code: "anchor-not-checked",
      detail: "the device's comparison of the audit log did not run",
      counter: null,
    };
  }
  const detail = r.detail ?? "";
  if (r.status === "matched") {
    // The head is in the log, but the logger's own anchor file is gone: that
    // is how a laundering starts, so it is not taken as found.
    if (!o.anchorFilePresent) {
      return {
        ok: false,
        status: "MISMATCH",
        code: "anchor-file-missing",
        detail: `the anchor file ${o.anchorFile} is missing while the device holds this log's anchor (${detail})`,
        counter: r.counter ?? null,
      };
    }
    return { ok: true, status: r.status, detail };
  }
  if (r.status === "MISMATCH" || r.status === "superseded") {
    return {
      ok: false,
      status: r.status,
      code: r.code ?? r.status,
      detail,
      counter: r.counter ?? null,
    };
  }
  // "unavailable": firmware without anchoring (refused: a bound session must
  // anchor), or a log never anchored on this device (fine only on a device
  // that holds no anchor at all: a first session).
  if (/does not support audit anchoring/.test(detail)) {
    return {
      ok: false,
      status: "no-anchor",
      code: "anchor-unsupported",
      detail: `the bound Enclaweder's firmware cannot anchor the audit log (${detail})`,
      counter: r.counter ?? null,
    };
  }
  if (r.deviceHasAnchors === true) {
    return {
      ok: false,
      status: "unanchored",
      code: o.anchorFilePresent ? "not-anchored-here" : "anchor-file-missing",
      detail: `the Enclaweder holds earlier anchors, but this audit log cannot be shown to be the one it anchored (${detail})`,
      counter: r.counter ?? null,
    };
  }
  return { ok: true, status: r.status, detail };
}

/** The refusal the launcher prints; `cli` is the adapter's command name. */
export function anchorGateMessage(
  g: Extract<AnchorGate, { ok: false }>,
  auditLog: string,
  cli: string,
): string {
  return (
    `the audit log does not match what the Enclaweder anchored (${g.status}${g.code !== g.status ? `, ${g.code}` : ""}): ${g.detail}. ` +
    "Not starting: a session started now would anchor this log and hide what happened to it. " +
    `Keep the files as they are (${auditLog} and its anchor files), check them with: ${cli} audit verify. ` +
    `If you know why (you restored or replaced the log, took the anchor channel over, or share the device with another log), accept the current state as the new baseline with: ${cli} audit accept`
  );
}

// ─── Operator keys stay off the host ────────────────────────────────────

const MAX_KEY_BYTES = 64 * 1024;
const MAX_ENTRIES = 4000;
const KEYISH = /\.(pem|key|der|priv|sk)$/i;
const OPERATORISH = /operator|quorum|custod/i;

/** Is the file at `p` an Ed25519 private key? Never returns or logs the key. */
export function isEd25519PrivateKeyFile(p: string): boolean {
  let st: fs.Stats;
  try {
    st = fs.statSync(p);
  } catch {
    return false;
  }
  if (!st.isFile() || st.size === 0 || st.size > MAX_KEY_BYTES) {
    return false;
  }
  let buf: Buffer;
  try {
    buf = fs.readFileSync(p);
  } catch {
    return false;
  }
  try {
    const text = buf.toString("latin1");
    try {
      const key = text.includes("-----BEGIN")
        ? createPrivateKey({ key: text, format: "pem" })
        : createPrivateKey({ key: buf, format: "der", type: "pkcs8" });
      return key.asymmetricKeyType === "ed25519";
    } catch {
      return false;
    }
  } finally {
    buf.fill(0);
  }
}

function expand(p: string, home: string): string | null {
  if (p.length === 0 || p.length > 4096) {
    return null;
  }
  if (p === "~" || p.startsWith("~/")) {
    return path.join(home, p.slice(1));
  }
  return path.isAbsolute(p) ? p : null;
}

function pathStrings(doc: unknown, home: string, out = new Set<string>(), depth = 0): Set<string> {
  if (depth > 32) {
    return out;
  }
  if (typeof doc === "string") {
    const p = expand(doc, home);
    if (p) {
      out.add(p);
    }
  } else if (Array.isArray(doc)) {
    for (const v of doc) {
      pathStrings(v, home, out, depth + 1);
    }
  } else if (doc && typeof doc === "object") {
    for (const v of Object.values(doc)) {
      pathStrings(v, home, out, depth + 1);
    }
  }
  return out;
}

function filesUnder(dir: string, budget: { left: number }, depth = 4): string[] {
  const out: string[] = [];
  const stack: [string, number][] = [[dir, 0]];
  while (stack.length > 0 && budget.left > 0) {
    const [d, k] = stack.pop() as [string, number];
    let names: string[];
    try {
      names = fs.readdirSync(d);
    } catch {
      continue;
    }
    for (const n of names) {
      if (--budget.left < 0) {
        break;
      }
      const p = path.join(d, n);
      let st: fs.Stats;
      try {
        st = fs.lstatSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory() && k < depth) {
        stack.push([p, k + 1]);
      } else if (st.isFile() || st.isSymbolicLink()) {
        out.push(p);
      }
    }
  }
  return out;
}

export type OperatorKeyFinding = Readonly<{ path: string; why: string }>;

/**
 * Operator private keys on this host. `bases`: the Enclawed and adapter
 * state/config directories (any key under a directory named for operators
 * counts); a key file named like an operator key directly in the home, a
 * base or `cwd` counts; every path a policy document names that holds an
 * Ed25519 private key counts.
 */
export function findHostOperatorKeys(o: {
  home: string;
  cwd: string;
  bases: readonly string[];
  policyFiles?: readonly string[];
  extra?: readonly string[];
}): OperatorKeyFinding[] {
  const found = new Map<string, OperatorKeyFinding>();
  const add = (p: string, why: string) => {
    let real = p;
    try {
      real = fs.realpathSync(p);
    } catch {
      /* keep the path as given */
    }
    if (!found.has(real) && isEd25519PrivateKeyFile(real)) {
      found.set(real, { path: p, why });
    }
  };
  for (const f of o.extra ?? []) {
    add(f, "given on the command line");
  }
  for (const f of o.policyFiles ?? []) {
    let doc: unknown;
    try {
      doc = JSON.parse(fs.readFileSync(f, "utf8"));
    } catch {
      continue;
    }
    for (const p of pathStrings(doc, o.home)) {
      if (KEYISH.test(p) || OPERATORISH.test(path.basename(p))) {
        add(p, `named by the policy ${f}`);
      }
    }
  }
  const bases = [...new Set(o.bases)];
  const budget = { left: MAX_ENTRIES };
  for (const base of bases) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(base);
    } catch {
      continue;
    }
    for (const n of names) {
      if (!OPERATORISH.test(n)) {
        continue;
      }
      const p = path.join(base, n);
      let st: fs.Stats;
      try {
        st = fs.lstatSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        for (const f of filesUnder(p, budget)) {
          add(f, `in the operator key location ${p}`);
        }
      }
    }
  }
  for (const dir of new Set([o.home, ...bases, o.cwd])) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const n of names) {
      if (OPERATORISH.test(n) && (KEYISH.test(n) || !n.includes("."))) {
        add(path.join(dir, n), `named like an operator key in ${dir}`);
      }
    }
  }
  return [...found.values()];
}

export type OperatorAuthorization =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; code: "operator-key-file" | "operator-key-on-host"; message: string }>;

/**
 * May an operator-quorum operation run from this host? Never with a key file
 * (`keyFiles`: the operator key files the command was given), never while an
 * operator private key is on the host (`found`: findHostOperatorKeys).
 */
export function decideOperatorAuthorization(o: {
  command: string;
  keyFiles: readonly string[];
  found: readonly OperatorKeyFinding[];
}): OperatorAuthorization {
  if (o.keyFiles.length > 0) {
    return {
      ok: false,
      code: "operator-key-file",
      message: `${o.command} REFUSED: an operator key file is never accepted on the agent's host. Each operator signs the printed message on their own device (an offline station, a hardware token) and pastes the signature.`,
    };
  }
  if (o.found.length > 0) {
    return {
      ok: false,
      code: "operator-key-on-host",
      message:
        `${o.command} REFUSED: operator private keys are on this host:\n` +
        o.found.map((f) => `  ${f.path} (${f.why})\n`).join("") +
        "An operator key on the agent's host lets any process of this user sign its own takeover, which defeats the device's operator quorum.\n" +
        "Move every operator key off this machine (a hardware token, an offline station, or removable media that is not mounted), then run the command again with offline signatures.\n",
    };
  }
  return { ok: true };
}

/** How many offline signers to ask for: 1 to 8. */
export function offlineSignerCount(n: unknown): number {
  const v = typeof n === "number" ? n : typeof n === "string" ? Number(n) : Number.NaN;
  return Number.isInteger(v) ? Math.max(1, Math.min(8, v)) : 1;
}

/** A pasted 64-byte Ed25519 signature (hex, whitespace ignored); anything else is empty, which the device refuses. */
export function parseOfflineSignature(text: string): Buffer {
  const hex = text.replace(/\s/g, "");
  return Buffer.from(/^[0-9a-f]{128}$/i.test(hex) ? hex : "", "hex");
}

// ─── The erase re-check watcher ─────────────────────────────────────────

/** How long the detached watcher keeps re-checking after a halt, in seconds. */
export const ERASE_WATCH_S = 60;
/** How many in-process re-checks follow the erase before the watcher takes over. */
export const ERASE_RECHECKS = 5;

/** Re-check times (ms after the start): 1, 2, 4, 8 s, then every 15 s, up to ERASE_WATCH_S. */
export function eraseWatchSchedule(): number[] {
  const out: number[] = [];
  let t = 0;
  let step = 1000;
  while (t + step <= ERASE_WATCH_S * 1000) {
    t += step;
    out.push(t);
    step = Math.min(step * 2, 15_000);
  }
  return out;
}

export type EraseWatchEvent =
  | Readonly<{ event: "start"; checks: number }>
  | Readonly<{ event: "reappeared"; erased: readonly string[]; remaining: readonly string[] }>
  | Readonly<{ event: "end"; reappeared: number }>;

/**
 * Watch the erased login and erase it again whenever it reappears. The
 * adapter supplies where the login is (`present`) and how to erase it
 * (`erase`, the kit's eraseCredentials over its locations); `sleep` and
 * `note` are its timer and log.
 */
export async function watchErased(o: {
  present: () => boolean;
  erase: () => Readonly<{ erased: readonly string[]; remaining: readonly string[] }>;
  note?: (e: EraseWatchEvent) => void;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ reappeared: number; checks: number }> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const note = (e: EraseWatchEvent) => {
    try {
      o.note?.(e);
    } catch {
      /* best effort */
    }
  };
  const schedule = eraseWatchSchedule();
  note({ event: "start", checks: schedule.length });
  let reappeared = 0;
  let last = 0;
  for (const at of schedule) {
    await sleep(at - last);
    last = at;
    if (o.present()) {
      reappeared++;
      const r = o.erase();
      note({ event: "reappeared", erased: r.erased, remaining: r.remaining });
    }
  }
  note({ event: "end", reappeared });
  return { reappeared, checks: schedule.length };
}

// ─── The hardware root inside a user namespace ──────────────────────────

/**
 * Hidraw nodes this process could open, whatever sysfs says (a tmpfs over
 * /sys/class/hidraw hides the listing, not the node). A node bound over by
 * /dev/null (a test harness's mask) is not a device. Nodes are only
 * stat'ed, never opened.
 */
export function reachableHidrawNodes(): string[] {
  let names: string[];
  try {
    names = fs.readdirSync("/dev").filter((n) => /^hidraw\d+$/.test(n));
  } catch {
    return [];
  }
  let nul: number | null = null;
  try {
    nul = fs.statSync("/dev/null").rdev;
  } catch {
    nul = null;
  }
  return names
    .map((n) => `/dev/${n}`)
    .filter((p) => {
      try {
        const st = fs.statSync(p);
        return st.isCharacterDevice() && st.rdev !== nul;
      } catch {
        return false;
      }
    });
}

function hidrawListed(): boolean {
  try {
    return fs.readdirSync("/sys/class/hidraw").length > 0;
  } catch {
    return false;
  }
}

/**
 * Why the hardware root must not be touched from here, or null (finding N16,
 * H11). Inside a non-initial user namespace a process could open the device a
 * second time, beside the host's owner, which collides with it and latches the
 * root DIRTY. Refused whenever a device could be reached from here: a
 * reachable hidraw node, a pinned node (`pinnedHidraw`, the ENCLAWEDER_HIDRAW
 * value), or a listed device. With every node masked, nothing is refused.
 */
export function userNamespaceDeviceRisk(
  o: Readonly<{ pinnedHidraw?: string | null }> = {},
): string | null {
  if (process.platform !== "linux" || !inNonInitialUserNamespace()) {
    return null;
  }
  const nodes = reachableHidrawNodes();
  const pinned = (o.pinnedHidraw ?? "").trim();
  if (nodes.length === 0 && !pinned && !hidrawListed()) {
    return null;
  }
  const what = pinned
    ? `ENCLAWEDER_HIDRAW=${pinned} is set`
    : nodes.length
      ? `${nodes.join(", ")} can be opened here`
      : "an Enclaweder is listed";
  return `this process runs in a user namespace (uid ${process.getuid?.()} here, host uid ${hostUid() ?? "unknown"}) and ${what}: from here the device could be opened a second time, beside the host's owner, which collides with it and latches the root DIRTY. Run outside the namespace, or mask the device in it (/dev/null over /dev/hidraw*)`;
}
