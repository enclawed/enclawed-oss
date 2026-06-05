// User-space network-egress allowlist. NOT a substitute for kernel-level
// egress controls; see enclawed/MODIFICATIONS.md §7.5.
//
// Two layers:
//   1. installEgressGuard()    — wraps global.fetch (WHATWG-URL host check).
//   2. installRawSocketGuard() — patches node:net Socket.prototype.connect so
//                                code that bypasses fetch and reaches for raw
//                                sockets (imapflow, nodemailer, tsdav) is
//                                caught at the same allowlist boundary.
//
// LIMITATION: even both layers together do NOT cover (a) native addons that
// call connect(2) below libuv, or (b) child processes spawned via
// node:child_process that invoke external binaries (git, curl) — those leave
// the JS process. For those, gate the spawn itself (SPAWN_PROC) and add
// kernel-level egress controls for a true enclave.

import * as nodeNet from "node:net";
import { createRequire } from "node:module";

export class EgressDeniedError extends Error {
  override name = "EgressDeniedError";
  /** Set by the raw-socket guard so callers can branch on the egress kind. */
  kind?: string;
  /** Destination port, when known (raw-socket guard only). */
  port?: number;
  constructor(public readonly host: string | null, public readonly reason: string) {
    super(`egress denied: ${host ?? "<unknown host>"} (${reason})`);
  }
}

function hostOf(input: unknown): string | null {
  if (typeof input === "string") {
    try {
      return new URL(input).hostname;
    } catch {
      return null;
    }
  }
  if (input && typeof input === "object") {
    const rec = input as { url?: unknown; hostname?: unknown };
    if (typeof rec.url === "string") {
      try {
        return new URL(rec.url).hostname;
      } catch {
        return null;
      }
    }
    if (typeof rec.hostname === "string") {return rec.hostname;}
  }
  return null;
}

export type GuardedFetch = typeof fetch & { __enclawedGuard: true };

export function createEgressGuard(opts: {
  allowedHosts: Iterable<string>;
  fetchImpl: typeof fetch;
  onDeny?: (info: { host: string | null; input: unknown; init: unknown }) => void;
}): GuardedFetch {
  const allow = new Set([...opts.allowedHosts].map(String));
  const guarded = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const host = hostOf(input);
    if (!host || !allow.has(host)) {
      const err = new EgressDeniedError(host, "host not on allowlist");
      if (opts.onDeny) {
        try {
          opts.onDeny({ host, input, init });
        } catch {
          /* swallow */
        }
      }
      throw err;
    }
    return opts.fetchImpl(input, init);
  }) as GuardedFetch;
  guarded.__enclawedGuard = true;
  return guarded;
}

export function installEgressGuard(opts: {
  allowedHosts: Iterable<string>;
  onDeny?: (info: { host: string | null; input: unknown; init: unknown }) => void;
  freeze?: boolean;
}): () => void {
  const previous = globalThis.fetch;
  const guard = createEgressGuard({ ...opts, fetchImpl: previous });
  if (opts.freeze) {
    // After this call, `globalThis.fetch = ...` throws in strict mode
    // (ESM default) and silently fails in sloppy mode. The returned
    // restorer is a no-op when the property is frozen — the host process
    // is permanently bound to the guard.
    Object.defineProperty(globalThis, "fetch", {
      value: guard, writable: false, configurable: false, enumerable: true,
    });
    return () => { /* no-op */ };
  }
  globalThis.fetch = guard;
  return () => {
    globalThis.fetch = previous;
  };
}

// ----------------------------------------------------------------------
// Raw-socket guard. Patches Socket.prototype.connect so any code that
// bypasses fetch and reaches for raw sockets is caught at the same
// allowlist boundary. tls.TLSSocket extends net.Socket, so the patch
// covers TLS too; http.Agent / https.Agent ultimately use Socket, so
// they're covered transitively.
// ----------------------------------------------------------------------

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {return null;}
  let n = 0;
  for (const p of parts) {
    const x = Number(p);
    if (!Number.isInteger(x) || x < 0 || x > 255) {return null;}
    n = n * 256 + x;
  }
  return n >>> 0;
}

export function ipInCidr(ip: string, cidr: string): boolean {
  if (typeof ip !== "string" || typeof cidr !== "string") {return false;}
  const slash = cidr.indexOf("/");
  if (slash < 0) {return ip === cidr;}
  const base = cidr.slice(0, slash);
  const bits = Number(cidr.slice(slash + 1));
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) {return false;}
  const ipN = ipv4ToInt(ip);
  const baseN = ipv4ToInt(base);
  if (ipN === null || baseN === null) {return false;}
  if (bits === 0) {return true;}
  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return ((ipN & mask) >>> 0) === ((baseN & mask) >>> 0);
}

export type RawSocketGuardDenial = {
  host: string;
  port: number | undefined;
  kind: string;
  reason: string;
};

// ----------------------------------------------------------------------
// DNS-learning. Some clients (notably nodemailer) resolve an allowlisted
// hostname to an IP THEMSELVES and then call connect() with the IP literal
// (keeping the hostname only as the TLS servername). The hostname allowlist
// alone would deny that, even though the destination is an allowlisted host.
// To close this without trusting a client-supplied field, we wrap the DNS
// resolution APIs once: whenever an allowlisted hostname resolves, the
// returned IPs are recorded (with a TTL) and the by-IP connect is then
// allowed. Only an IP that was actually resolved from an allowlisted name
// passes — an in-process attacker cannot forge it.
// ----------------------------------------------------------------------

const LEARNED_IP_TTL_MS = 5 * 60_000;

type IpRecorder = (hostname: string, ips: readonly string[]) => void;
const dnsRecorders = new Set<IpRecorder>();
let dnsHooksInstalled = false;

function normalizeIp(host: string): string {
  // Lowercase, strip IPv6 brackets and any zone id so the connect-side host
  // string matches the resolver-side string regardless of surface form.
  return host
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/%.*$/, "");
}

// Pull IP strings out of a DNS callback's result arguments, tolerating every
// shape the dns APIs use: lookup → (address: string) or [{address}], with a
// trailing numeric `family` we ignore; resolve4/6 → string[] or [{address}].
function harvestIps(values: readonly unknown[]): string[] {
  const out: string[] = [];
  const visit = (v: unknown): void => {
    if (typeof v === "string") {
      out.push(v);
    } else if (Array.isArray(v)) {
      for (const e of v) {
        visit(e);
      }
    } else if (v && typeof v === "object" && typeof (v as { address?: unknown }).address === "string") {
      out.push((v as { address: string }).address);
    }
  };
  for (const v of values) {
    visit(v);
  }
  return out;
}

type AnyFn = (...args: unknown[]) => unknown;

function installDnsLearningHooks(): void {
  if (dnsHooksInstalled) {
    return;
  }
  dnsHooksInstalled = true;
  let dns: {
    lookup: AnyFn;
    resolve4: AnyFn;
    resolve6: AnyFn;
    Resolver?: { prototype: { resolve4: AnyFn; resolve6: AnyFn } };
  };
  try {
    // The ESM `node:dns` namespace exports are read-only, so reach for the
    // mutable CJS singleton — the same object Node's net internals and
    // nodemailer (`require('dns')`) use, so the wrappers are honoured.
    const nodeRequire = createRequire(import.meta.url);
    dns = nodeRequire("node:dns");
  } catch {
    // No mutable dns binding available → learning disabled. Fail-closed: a
    // pre-resolved by-IP connect simply stays denied rather than allowed.
    return;
  }

  const announce = (hostname: unknown, rest: readonly unknown[]): void => {
    if (typeof hostname !== "string" || dnsRecorders.size === 0) {
      return;
    }
    const ips = harvestIps(rest);
    if (ips.length === 0) {
      return;
    }
    for (const rec of dnsRecorders) {
      rec(hostname, ips);
    }
  };

  // Wrap a callback-style resolver so it observes (never alters) the result.
  const wrapCb = (orig: AnyFn): AnyFn =>
    function wrappedResolve(this: unknown, ...args: unknown[]): unknown {
      const hostname = args[0];
      const cbIdx = args.length - 1;
      const cb = args[cbIdx];
      if (typeof cb === "function") {
        args[cbIdx] = function observedCb(this: unknown, err: unknown, ...rest: unknown[]): unknown {
          if (!err) {
            announce(hostname, rest);
          }
          return (cb as AnyFn).call(this, err, ...rest);
        };
      }
      return orig.apply(this, args);
    };

  dns.lookup = wrapCb(dns.lookup);
  dns.resolve4 = wrapCb(dns.resolve4);
  dns.resolve6 = wrapCb(dns.resolve6);
  // nodemailer resolves via `new dns.Resolver().resolve4/6` — patch the
  // prototype so those instances are covered too.
  if (dns.Resolver?.prototype) {
    dns.Resolver.prototype.resolve4 = wrapCb(dns.Resolver.prototype.resolve4);
    dns.Resolver.prototype.resolve6 = wrapCb(dns.Resolver.prototype.resolve6);
  }
}

export type RawSocketGuard = {
  /** Restore the original Socket.prototype.connect (no-op when frozen). */
  uninstall: () => void;
  isAllowed: (host: string, port?: number) => boolean;
};

export function installRawSocketGuard(opts: {
  allowedHosts: Iterable<string>;
  /** IPv4 CIDR ranges (e.g. a VPN gateway range) that are also permitted. */
  allowedCidrs?: Iterable<string>;
  /**
   * When set, freeze Socket.prototype.connect to the guard so module code
   * cannot reassign it to bypass the allowlist. The returned uninstall()
   * becomes a no-op. Idempotent across repeated frozen installs.
   */
  freeze?: boolean;
  onDeny?: (info: RawSocketGuardDenial) => void;
}): RawSocketGuard {
  const allowedHosts = new Set([...opts.allowedHosts].map(String));
  const allowedCidrs = [...(opts.allowedCidrs ?? [])].map(String);
  const onDeny = opts.onDeny;

  // IP → expiry(ms). Populated by the DNS hook whenever an allowlisted
  // hostname resolves, so a client that pre-resolves and connects by IP is
  // allowed for exactly the addresses that name just produced.
  const learnedIps = new Map<string, number>();
  const recorder: IpRecorder = (hostname, ips) => {
    if (!allowedHosts.has(hostname.toLowerCase())) {
      return;
    }
    const expiry = Date.now() + LEARNED_IP_TTL_MS;
    for (const ip of ips) {
      learnedIps.set(normalizeIp(ip), expiry);
    }
  };
  dnsRecorders.add(recorder);
  installDnsLearningHooks();

  function isAllowed(host: string, _port?: number): boolean {
    if (typeof host !== "string" || host.length === 0) {return false;}
    const lc = host.toLowerCase();
    // Hostname allowlist (covers literal "localhost", "::1", named hosts).
    if (allowedHosts.has(lc)) {return true;}
    // IP literal learned from an allowlisted hostname's DNS resolution
    // (e.g. nodemailer pre-resolving smtp.gmail.com). Expired entries are
    // pruned so a stale resolution cannot keep an IP allowed forever.
    const nip = normalizeIp(host);
    const expiry = learnedIps.get(nip);
    if (expiry !== undefined) {
      if (expiry > Date.now()) {return true;}
      learnedIps.delete(nip);
    }
    // CIDR allowlist for IPv4 destinations (typical VPN gateway range).
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
      for (const cidr of allowedCidrs) {
        if (ipInCidr(host, cidr)) {return true;}
      }
    }
    return false;
  }

  function denyAndAudit(host: string, port: number | undefined, kind: string): EgressDeniedError {
    const reason = `egress denied: ${kind} to ${host || "<unknown>"}:${port ?? "?"} not on allowlist`;
    if (onDeny) {
      try {
        onDeny({ host, port, kind, reason });
      } catch {
        /* swallow — auditing a denial must never crash the connect path */
      }
    }
    const err = new EgressDeniedError(host, reason);
    err.kind = kind;
    err.port = port;
    return err;
  }

  const Socket = nodeNet.Socket;
  // Capture the ORIGINAL connect before patching, then re-apply it with the
  // real `this` inside patchedConnect. Referencing Socket.prototype.connect at
  // call-time instead would recurse into the patched method after a frozen
  // install. unbound-method can't see the explicit `.apply(this, …)` below.
  // oxlint-disable-next-line typescript/unbound-method
  const originalConnect = Socket.prototype.connect;
  const patchedConnect = function enclawedRawSocketGuardConnect(
    this: nodeNet.Socket,
    ...args: unknown[]
  ): nodeNet.Socket {
    // Node's net.createConnection() / http.Agent.createConnection() call
    // Socket.prototype.connect(normalized) where `normalized` is an array of
    // the form [optionsObject, callback]. Unwrap that form so we inspect the
    // real options regardless of whether the caller used the array form, the
    // (options, cb) form, or the (port, host, cb) form.
    let probe: unknown[] = args;
    if (Array.isArray(args[0])) {probe = args[0] as unknown[];}
    let host: unknown;
    let port: unknown;
    if (typeof probe[0] === "object" && probe[0] !== null && !Array.isArray(probe[0])) {
      const o = probe[0] as { host?: unknown; port?: unknown };
      host = o.host;
      port = o.port;
    } else if (
      typeof probe[0] === "number" ||
      (typeof probe[0] === "string" && /^\d+$/.test(probe[0]))
    ) {
      port = Number(probe[0]);
      if (typeof probe[1] === "string") {host = probe[1];}
    }
    const targetHost =
      typeof host === "string" && host !== ""
        ? host
        : typeof host === "number"
          ? String(host)
          : "localhost";
    const targetPort = typeof port === "number" ? port : undefined;
    if (!isAllowed(targetHost, targetPort)) {
      throw denyAndAudit(targetHost, targetPort, "net.Socket.connect");
    }
    return originalConnect.apply(this, args as Parameters<typeof originalConnect>);
  };

  if (opts.freeze) {
    // Idempotency: if connect is already a frozen enclawed guard, leave it
    // alone so sequential bootstraps no-op safely.
    const desc = Object.getOwnPropertyDescriptor(Socket.prototype, "connect");
    const alreadyFrozenGuard =
      desc &&
      desc.configurable === false &&
      desc.writable === false &&
      typeof desc.value === "function" &&
      (desc.value as { name?: string }).name === "enclawedRawSocketGuardConnect";
    if (!alreadyFrozenGuard) {
      Object.defineProperty(Socket.prototype, "connect", {
        value: patchedConnect,
        writable: false,
        configurable: false,
        enumerable: false,
      });
    }
  } else {
    Socket.prototype.connect = patchedConnect as typeof Socket.prototype.connect;
  }

  // DNS resolution is wrapped (installDnsLearningHooks above) only to OBSERVE
  // which IPs an allowlisted hostname resolves to — it never blocks a lookup.
  // Egress is still enforced at connect: an IP not on the allowlist, not in a
  // CIDR, and not learned from an allowlisted name is denied. DNS-metadata
  // leakage (who the process queried) remains a kernel-level concern.

  return {
    uninstall() {
      if (opts.freeze) {return;} // frozen: cannot uninstall
      Socket.prototype.connect = originalConnect;
      dnsRecorders.delete(recorder);
    },
    isAllowed,
  };
}
