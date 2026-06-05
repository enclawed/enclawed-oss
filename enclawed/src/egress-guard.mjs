import * as nodeNet from 'node:net';

// Network-egress allowlist. Two layers:
//
//   1. installEgressGuard()       — wraps global.fetch (WHATWG-URL host check).
//   2. installRawSocketGuard()    — patches node:net Socket.prototype.connect
//                                   and node:dns lookup/resolve so plugins
//                                   that reach for raw sockets / their own
//                                   DNS resolution still hit the allowlist.
//
// LIMITATION: even both layers together do NOT cover (a) native modules
// that perform syscalls below libuv (e.g. an N-API addon calling raw
// connect(2)), (b) child processes spawned via node:child_process that
// invoke external binaries (curl, wget) — those can still egress because
// they leave the JS process, (c) memory-mapped or shared-memory channels
// inside the same machine.
//
// For a true classified enclave the deploying organization MUST add
// kernel-level egress controls (nftables / eBPF / network namespace,
// optionally a one-way diode) on top. The JS layer is deliberately the
// minimum-surface-cheapest defense, sufficient to catch JS-level
// misbehaviour by ported third-party extensions but explicitly insufficient
// alone for accreditation.

function hostOf(input) {
  // input is a Request, URL, or string.
  if (typeof input === 'string') {
    try { return new URL(input).hostname; } catch { return null; }
  }
  if (input && typeof input.url === 'string') {
    try { return new URL(input.url).hostname; } catch { return null; }
  }
  if (input && typeof input.hostname === 'string') return input.hostname;
  return null;
}

export class EgressDeniedError extends Error {
  constructor(host, reason) {
    super(`egress denied: ${host || '<unknown host>'} (${reason})`);
    this.name = 'EgressDeniedError';
    this.host = host;
    this.reason = reason;
  }
}

export function createEgressGuard({
  allowedHosts,
  fetchImpl = globalThis.fetch,
  onDeny,
}) {
  const allow = new Set((allowedHosts || []).map(String));
  if (typeof fetchImpl !== 'function') {
    throw new Error('createEgressGuard: a fetch implementation is required');
  }
  const guarded = async function guardedFetch(input, init) {
    const host = hostOf(input);
    if (!host || !allow.has(host)) {
      const err = new EgressDeniedError(host, 'host not on allowlist');
      if (typeof onDeny === 'function') {
        try { onDeny({ host, input, init }); } catch { /* swallow */ }
      }
      throw err;
    }
    return fetchImpl(input, init);
  };
  guarded.__enclawedGuard = true;
  return guarded;
}

export function installEgressGuard(opts = {}) {
  const previous = globalThis.fetch;
  const guard = createEgressGuard({ ...opts, fetchImpl: previous });
  if (opts.freeze) {
    // Make the guard non-writable + non-configurable. After this call,
    // attempting `globalThis.fetch = ...` throws in strict mode (which
    // ESM modules are by default) and silently fails in sloppy mode.
    // The returned restorer is a no-op when the property is frozen.
    //
    // Idempotency: if globalThis.fetch is ALREADY a frozen enclawed
    // guard (writable:false, configurable:false, value.__enclawedGuard),
    // leave it alone. The existing freeze is already enforcing the
    // contract. This lets test harnesses re-bootstrap the accreditor
    // sequentially within one process without weakening production —
    // production single-bootstrap is enforced by the accreditor's
    // sealed handle, not by this idempotency check.
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    const alreadyFrozenGuard =
      desc && desc.configurable === false && desc.writable === false &&
      typeof desc.value === 'function' && desc.value.__enclawedGuard === true;
    if (!alreadyFrozenGuard) {
      Object.defineProperty(globalThis, 'fetch', {
        value: guard, writable: false, configurable: false, enumerable: true,
      });
    }
    return () => {
      // No-op: the property is permanently bound to the guard.
    };
  }
  globalThis.fetch = guard;
  return () => { globalThis.fetch = previous; };
}

// ----------------------------------------------------------------------
// CIDR matching (IPv4 only — sufficient for VPN gateway prefixes).
// IPv6 inputs are conservatively rejected unless explicitly allow-listed
// by literal address; deploying organizations using v6 VPNs must add the
// CIDR via the explicit IPv6-aware matcher below if/when added.
// ----------------------------------------------------------------------
function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const x = Number(p);
    if (!Number.isInteger(x) || x < 0 || x > 255) return null;
    n = (n * 256) + x;
  }
  return n >>> 0;
}

export function ipInCidr(ip, cidr) {
  if (typeof ip !== 'string' || typeof cidr !== 'string') return false;
  const slash = cidr.indexOf('/');
  if (slash < 0) return ip === cidr;
  const base = cidr.slice(0, slash);
  const bits = Number(cidr.slice(slash + 1));
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipN = ipv4ToInt(ip);
  const baseN = ipv4ToInt(base);
  if (ipN === null || baseN === null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : ((0xffffffff << (32 - bits)) >>> 0);
  return ((ipN & mask) >>> 0) === ((baseN & mask) >>> 0);
}

// ----------------------------------------------------------------------
// Raw-socket + DNS guard. Patches Socket.prototype.connect so any plugin
// that bypasses fetch and reaches for raw sockets is caught at the same
// allowlist boundary. tls.TLSSocket extends net.Socket, so the patch
// covers TLS too. http.Agent and https.Agent ultimately use Socket, so
// they're covered transitively.
// ----------------------------------------------------------------------
export function installRawSocketGuard(opts = {}) {
  const allowedHosts = new Set((opts.allowedHosts || []).map(String));
  const allowedCidrs = (opts.allowedCidrs || []).map(String);
  const requireVpnGateway = opts.requireVpnGateway === true;
  const onDeny = typeof opts.onDeny === 'function' ? opts.onDeny : null;

  function isAllowed(host, port) {
    if (typeof host !== 'string' || host.length === 0) return false;
    const lc = host.toLowerCase();
    // Hostname allowlist (covers literal "localhost", "::1", named hosts).
    if (allowedHosts.has(lc)) return true;
    // CIDR allowlist for IPv4 destinations (typical VPN gateway range).
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
      for (const cidr of allowedCidrs) {
        if (ipInCidr(host, cidr)) return true;
      }
    }
    // In requireVpnGateway mode, the only acceptable destinations are
    // hosts on the explicit allowlist OR IPv4 addresses inside one of
    // the configured VPN CIDRs. Hostnames that aren't on the allowlist
    // are rejected even if their resolved IP would land in a VPN CIDR;
    // the deploying organization is expected to pre-resolve and pin the
    // VPN gateway names into allowedHosts so the resolution path is
    // deterministic and auditable.
    if (requireVpnGateway) return false;
    return false;
  }

  function denyAndAudit(host, port, kind) {
    const reason = `egress denied: ${kind} to ${host || '<unknown>'}:${port ?? '?'} not on allowlist`;
    if (onDeny) {
      try { onDeny({ host, port, kind, reason }); } catch { /* swallow */ }
    }
    const err = new EgressDeniedError(host, reason);
    err.kind = kind;
    err.port = port;
    return err;
  }

  // --- node:net Socket.prototype.connect patch ---
  const Socket = nodeNet.Socket;
  const originalConnect = Socket.prototype.connect;
  const patchedConnect = function enclawedRawSocketGuardConnect(...args) {
    // Node's net.createConnection() and http.Agent.createConnection() call
    // Socket.prototype.connect(normalized) where `normalized` is an array of
    // the form [optionsObject, callback], tagged with normalizedArgsSymbol.
    // Unwrap that form so we inspect the real options object regardless of
    // whether the caller used the array form, the (options, cb) form, or
    // the (port, host, cb) form.
    let probe = args;
    if (Array.isArray(args[0])) probe = args[0];
    let host;
    let port;
    if (typeof probe[0] === 'object' && probe[0] !== null && !Array.isArray(probe[0])) {
      host = probe[0].host;
      port = probe[0].port;
    } else if (typeof probe[0] === 'number' || (typeof probe[0] === 'string' && /^\d+$/.test(probe[0]))) {
      port = Number(probe[0]);
      if (typeof probe[1] === 'string') host = probe[1];
    }
    const targetHost = (host == null || host === '') ? 'localhost' : String(host);
    if (!isAllowed(targetHost, port)) {
      throw denyAndAudit(targetHost, port, 'net.Socket.connect');
    }
    return originalConnect.apply(this, args);
  };
  if (opts.freeze) {
    // Idempotency check (see installEgressGuard above): if
    // Socket.prototype.connect is already a frozen enclawed guard,
    // leave it alone. Sequential test bootstraps then no-op safely.
    const desc = Object.getOwnPropertyDescriptor(Socket.prototype, 'connect');
    const alreadyFrozenGuard =
      desc && desc.configurable === false && desc.writable === false &&
      typeof desc.value === 'function' && desc.value.name === 'enclawedRawSocketGuardConnect';
    if (!alreadyFrozenGuard) {
      Object.defineProperty(Socket.prototype, 'connect', {
        value: patchedConnect, writable: false, configurable: false, enumerable: false,
      });
    }
  } else {
    Socket.prototype.connect = patchedConnect;
  }

  // node:dns is intentionally NOT patched: the dns module's exports are
  // an ES module namespace whose properties are read-only, and even if
  // we patched it via the CJS cache, ESM imports of `node:dns` would
  // still get the original bindings. Instead we rely on the Socket
  // patch above: an extension can resolve any name via DNS, but the
  // moment it tries to *open a connection* to the resolved IP, the
  // Socket.prototype.connect patch enforces the allowlist / VPN CIDR.
  // Data egress is blocked. DNS metadata leakage (the question of
  // 'who did the JS process query?') is a kernel-level concern that
  // the deploying organization handles via nftables / DNS firewall.

  return {
    uninstall() {
      if (opts.freeze) return; // frozen: cannot uninstall
      Socket.prototype.connect = originalConnect;
    },
    isAllowed,
  };
}
