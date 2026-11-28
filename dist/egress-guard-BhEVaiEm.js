import { createRequire } from "node:module";
import * as nodeNet from "node:net";
//#region src/enclawed/egress-guard.ts
var EgressDeniedError = class extends Error {
	constructor(host, reason) {
		super(`egress denied: ${host ?? "<unknown host>"} (${reason})`);
		this.host = host;
		this.reason = reason;
		this.name = "EgressDeniedError";
	}
};
function hostOf(input) {
	if (typeof input === "string") try {
		return new URL(input).hostname;
	} catch {
		return null;
	}
	if (input && typeof input === "object") {
		const rec = input;
		if (typeof rec.url === "string") try {
			return new URL(rec.url).hostname;
		} catch {
			return null;
		}
		if (typeof rec.hostname === "string") return rec.hostname;
	}
	return null;
}
function createEgressGuard(opts) {
	const allow = new Set([...opts.allowedHosts].map(String));
	const guarded = (async (input, init) => {
		const host = hostOf(input);
		if (!host || !allow.has(host)) {
			const err = new EgressDeniedError(host, "host not on allowlist");
			if (opts.onDeny) try {
				opts.onDeny({
					host,
					input,
					init
				});
			} catch {}
			throw err;
		}
		return opts.fetchImpl(input, init);
	});
	guarded.__enclawedGuard = true;
	return guarded;
}
function installEgressGuard(opts) {
	const previous = globalThis.fetch;
	const guard = createEgressGuard({
		...opts,
		fetchImpl: previous
	});
	if (opts.freeze) {
		Object.defineProperty(globalThis, "fetch", {
			value: guard,
			writable: false,
			configurable: false,
			enumerable: true
		});
		return () => {};
	}
	globalThis.fetch = guard;
	return () => {
		globalThis.fetch = previous;
	};
}
function ipv4ToInt(ip) {
	const parts = ip.split(".");
	if (parts.length !== 4) return null;
	let n = 0;
	for (const p of parts) {
		const x = Number(p);
		if (!Number.isInteger(x) || x < 0 || x > 255) return null;
		n = n * 256 + x;
	}
	return n >>> 0;
}
function ipInCidr(ip, cidr) {
	if (typeof ip !== "string" || typeof cidr !== "string") return false;
	const slash = cidr.indexOf("/");
	if (slash < 0) return ip === cidr;
	const base = cidr.slice(0, slash);
	const bits = Number(cidr.slice(slash + 1));
	if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
	const ipN = ipv4ToInt(ip);
	const baseN = ipv4ToInt(base);
	if (ipN === null || baseN === null) return false;
	if (bits === 0) return true;
	const mask = bits === 32 ? 4294967295 : 4294967295 << 32 - bits >>> 0;
	return (ipN & mask) >>> 0 === (baseN & mask) >>> 0;
}
const LEARNED_IP_TTL_MS = 5 * 6e4;
const dnsRecorders = /* @__PURE__ */ new Set();
let dnsHooksInstalled = false;
function normalizeIp(host) {
	return host.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/%.*$/, "");
}
function harvestIps(values) {
	const out = [];
	const visit = (v) => {
		if (typeof v === "string") out.push(v);
		else if (Array.isArray(v)) for (const e of v) visit(e);
		else if (v && typeof v === "object" && typeof v.address === "string") out.push(v.address);
	};
	for (const v of values) visit(v);
	return out;
}
function installDnsLearningHooks() {
	if (dnsHooksInstalled) return;
	dnsHooksInstalled = true;
	let dns;
	try {
		dns = createRequire(import.meta.url)("node:dns");
	} catch {
		return;
	}
	const announce = (hostname, rest) => {
		if (typeof hostname !== "string" || dnsRecorders.size === 0) return;
		const ips = harvestIps(rest);
		if (ips.length === 0) return;
		for (const rec of dnsRecorders) rec(hostname, ips);
	};
	const wrapCb = (orig) => function wrappedResolve(...args) {
		const hostname = args[0];
		const cbIdx = args.length - 1;
		const cb = args[cbIdx];
		if (typeof cb === "function") args[cbIdx] = function observedCb(err, ...rest) {
			if (!err) announce(hostname, rest);
			return cb.call(this, err, ...rest);
		};
		return orig.apply(this, args);
	};
	dns.lookup = wrapCb(dns.lookup);
	dns.resolve4 = wrapCb(dns.resolve4);
	dns.resolve6 = wrapCb(dns.resolve6);
	if (dns.Resolver?.prototype) {
		dns.Resolver.prototype.resolve4 = wrapCb(dns.Resolver.prototype.resolve4);
		dns.Resolver.prototype.resolve6 = wrapCb(dns.Resolver.prototype.resolve6);
	}
}
function installRawSocketGuard(opts) {
	const allowedHosts = new Set([...opts.allowedHosts].map(String));
	const allowedCidrs = [...opts.allowedCidrs ?? []].map(String);
	const onDeny = opts.onDeny;
	const learnedIps = /* @__PURE__ */ new Map();
	const recorder = (hostname, ips) => {
		if (!allowedHosts.has(hostname.toLowerCase())) return;
		const expiry = Date.now() + LEARNED_IP_TTL_MS;
		for (const ip of ips) learnedIps.set(normalizeIp(ip), expiry);
	};
	dnsRecorders.add(recorder);
	installDnsLearningHooks();
	function isAllowed(host, _port) {
		if (typeof host !== "string" || host.length === 0) return false;
		const lc = host.toLowerCase();
		if (allowedHosts.has(lc)) return true;
		const nip = normalizeIp(host);
		const expiry = learnedIps.get(nip);
		if (expiry !== void 0) {
			if (expiry > Date.now()) return true;
			learnedIps.delete(nip);
		}
		if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
			for (const cidr of allowedCidrs) if (ipInCidr(host, cidr)) return true;
		}
		return false;
	}
	function denyAndAudit(host, port, kind) {
		const reason = `egress denied: ${kind} to ${host || "<unknown>"}:${port ?? "?"} not on allowlist`;
		if (onDeny) try {
			onDeny({
				host,
				port,
				kind,
				reason
			});
		} catch {}
		const err = new EgressDeniedError(host, reason);
		err.kind = kind;
		err.port = port;
		return err;
	}
	const Socket = nodeNet.Socket;
	const originalConnect = Socket.prototype.connect;
	const patchedConnect = function enclawedRawSocketGuardConnect(...args) {
		let probe = args;
		if (Array.isArray(args[0])) probe = args[0];
		let host;
		let port;
		if (typeof probe[0] === "object" && probe[0] !== null && !Array.isArray(probe[0])) {
			const o = probe[0];
			host = o.host;
			port = o.port;
		} else if (typeof probe[0] === "number" || typeof probe[0] === "string" && /^\d+$/.test(probe[0])) {
			port = Number(probe[0]);
			if (typeof probe[1] === "string") host = probe[1];
		}
		const targetHost = typeof host === "string" && host !== "" ? host : typeof host === "number" ? String(host) : "localhost";
		const targetPort = typeof port === "number" ? port : void 0;
		if (!isAllowed(targetHost, targetPort)) throw denyAndAudit(targetHost, targetPort, "net.Socket.connect");
		return originalConnect.apply(this, args);
	};
	if (opts.freeze) {
		const desc = Object.getOwnPropertyDescriptor(Socket.prototype, "connect");
		if (!(desc && desc.configurable === false && desc.writable === false && typeof desc.value === "function" && desc.value.name === "enclawedRawSocketGuardConnect")) Object.defineProperty(Socket.prototype, "connect", {
			value: patchedConnect,
			writable: false,
			configurable: false,
			enumerable: false
		});
	} else Socket.prototype.connect = patchedConnect;
	return {
		uninstall() {
			if (opts.freeze) return;
			Socket.prototype.connect = originalConnect;
			dnsRecorders.delete(recorder);
		},
		isAllowed
	};
}
//#endregion
export { installRawSocketGuard as i, createEgressGuard as n, installEgressGuard as r, EgressDeniedError as t };
