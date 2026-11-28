import { a as checkRequestShape, r as NAMED_SHAPE_PROFILES, s as resolveRequestShape } from "./request-shape-CUn8Io5f.js";
//#region src/enclawed/egress-target.ts
const DNS = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
/** Parse a declared egress target. Throws a TypeError naming what is wrong. */
function parseEgressTarget(raw) {
	if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) throw new TypeError("an egress target must be a non-empty string");
	const s = raw.trim();
	const legacy = /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(s);
	if (legacy) {
		const host = legacy[1].toLowerCase();
		const port = legacy[2] ? Number(legacy[2]) : 443;
		if (!DNS.test(host) || port < 1 || port > 65535) throw new TypeError(`egress target ${JSON.stringify(s)} is not a DNS name and port`);
		return {
			scheme: "https",
			host,
			port,
			pathPrefix: "",
			profile: null
		};
	}
	let u;
	try {
		u = new URL(s);
	} catch {
		throw new TypeError(`egress target ${JSON.stringify(s)} is neither a host nor a URL`);
	}
	if (u.protocol !== "https:" && u.protocol !== "http:") throw new TypeError(`egress target ${JSON.stringify(s)} must be https or http`);
	if (u.username || u.password || u.search) throw new TypeError(`egress target ${JSON.stringify(s)} carries credentials or a query`);
	const host = u.hostname.toLowerCase();
	if (!DNS.test(host)) throw new TypeError(`egress target ${JSON.stringify(s)}: the host must be a DNS name`);
	const scheme = u.protocol === "https:" ? "https" : "http";
	const port = u.port ? Number(u.port) : scheme === "https" ? 443 : 80;
	const profileRaw = u.hash.replace(/^#/, "");
	let profile = null;
	if (profileRaw) {
		if (!NAMED_SHAPE_PROFILES.includes(profileRaw)) throw new TypeError(`egress target ${JSON.stringify(s)}: unknown profile ${JSON.stringify(profileRaw)} (known: ${NAMED_SHAPE_PROFILES.join(", ")})`);
		profile = profileRaw;
	}
	const rawPath = /^[a-z]+:\/\/[^/?#]*([^?#]*)/i.exec(s)?.[1] ?? "";
	const pathPrefix = rawPath === "/" ? "" : rawPath.replace(/\/$/, "");
	if (pathPrefix && !profile) throw new TypeError(`egress target ${JSON.stringify(s)} names a path but no profile (#npm-registry, #pypi, #generic); a path alone cannot be enforced`);
	if (profile) {
		const shape = resolveRequestShape({
			profile,
			pathPrefix
		});
		if (!shape.ok) throw new TypeError(`egress target ${JSON.stringify(s)}: ${shape.message}`);
	}
	return {
		scheme,
		host,
		port,
		pathPrefix,
		profile
	};
}
/** The canonical form: scheme://host:port[prefix][#profile], port always written. */
function egressTargetString(t) {
	return `${t.scheme}://${t.host}:${t.port}${t.pathPrefix}${t.profile ? `#${t.profile}` : ""}`;
}
/** The canonical form of a declared target (throws when it does not parse). */
function canonicalEgressTarget(raw) {
	return egressTargetString(parseEgressTarget(raw));
}
/** The containment destination a target becomes (inspected or plain HTTP, with its shape). */
function egressTargetDestination(t) {
	return {
		host: t.host,
		port: t.port,
		mode: t.scheme === "https" ? "inspect" : "http",
		background: true,
		...t.profile ? { shape: {
			profile: t.profile,
			pathPrefix: t.pathPrefix
		} } : {}
	};
}
/**
* Does a URL fall inside a target? Same scheme, host and port; with a
* profile, a GET of that URL must also fit the profile's request grammar.
*/
function urlWithinEgressTarget(url, t) {
	let u;
	try {
		u = new URL(url);
	} catch {
		return false;
	}
	const scheme = u.protocol === "https:" ? "https" : u.protocol === "http:" ? "http" : null;
	if (!scheme || scheme !== t.scheme || u.username || u.password) return false;
	const port = u.port ? Number(u.port) : scheme === "https" ? 443 : 80;
	if (u.hostname.toLowerCase() !== t.host || port !== t.port) return false;
	if (!t.profile) return true;
	const shape = resolveRequestShape({
		profile: t.profile,
		pathPrefix: t.pathPrefix
	});
	if (!shape.ok || !shape.shape) return false;
	const rawTarget = /^[a-z]+:\/\/[^/?#]*([^#]*)/i.exec(url)?.[1] || "/";
	return checkRequestShape(shape.shape, {
		method: "GET",
		target: rawTarget,
		headerPairs: [],
		bodyLength: 0,
		kind: "request"
	}).ok;
}
//#endregion
//#region src/enclawed/skill-capabilities.ts
const CAPABILITY = Object.freeze({
	NET_EGRESS: "net.egress",
	FS_READ: "fs.read",
	FS_WRITE_REV: "fs.write.rev",
	FS_WRITE_IRREV: "fs.write.irrev",
	TOOL_INVOKE: "tool.invoke",
	SPAWN_PROC: "spawn.proc",
	PUBLISH: "publish",
	PAY: "pay",
	MUTATE_SCHEMA: "mutate.schema"
});
const ALL_CAPABILITIES = Object.freeze([
	CAPABILITY.NET_EGRESS,
	CAPABILITY.FS_READ,
	CAPABILITY.FS_WRITE_REV,
	CAPABILITY.FS_WRITE_IRREV,
	CAPABILITY.TOOL_INVOKE,
	CAPABILITY.SPAWN_PROC,
	CAPABILITY.PUBLISH,
	CAPABILITY.PAY,
	CAPABILITY.MUTATE_SCHEMA
]);
const CAP_SET = new Set(ALL_CAPABILITIES);
function isCapabilityToken(value) {
	return typeof value === "string" && CAP_SET.has(value);
}
const REVERSIBLE = new Set([CAPABILITY.FS_READ, CAPABILITY.FS_WRITE_REV]);
function isReversible(cap) {
	return REVERSIBLE.has(cap);
}
function isIrreversible(cap) {
	return !REVERSIBLE.has(cap);
}
function makeCall(input) {
	if (!isCapabilityToken(input.cap)) throw new TypeError(`unknown capability: ${String(input.cap)}`);
	if (typeof input.target !== "string" || input.target.length === 0) throw new TypeError("capability target must be a non-empty string");
	return Object.freeze({
		cap: input.cap,
		target: input.target,
		args: input.args ? Object.freeze({ ...input.args }) : void 0
	});
}
function makeEgressCall(target, args) {
	return makeCall({
		cap: CAPABILITY.NET_EGRESS,
		target: canonicalEgressTarget(target),
		args
	});
}
function projectionKey(call) {
	return JSON.stringify([call.cap, call.target]);
}
//#endregion
//#region src/enclawed/tool-capability-map.ts
const TOOL_CAPABILITIES = Object.freeze({
	read: CAPABILITY.FS_READ,
	memory_search: CAPABILITY.FS_READ,
	memory_get: CAPABILITY.FS_READ,
	image: CAPABILITY.FS_READ,
	sessions_list: CAPABILITY.FS_READ,
	sessions_history: CAPABILITY.FS_READ,
	session_status: CAPABILITY.FS_READ,
	agents_list: CAPABILITY.FS_READ,
	update_plan: CAPABILITY.FS_WRITE_REV,
	sessions_yield: CAPABILITY.FS_WRITE_REV,
	write: CAPABILITY.FS_WRITE_IRREV,
	edit: CAPABILITY.FS_WRITE_IRREV,
	apply_patch: CAPABILITY.FS_WRITE_IRREV,
	exec: CAPABILITY.SPAWN_PROC,
	process: CAPABILITY.SPAWN_PROC,
	code_execution: CAPABILITY.SPAWN_PROC,
	sessions_spawn: CAPABILITY.SPAWN_PROC,
	subagents: CAPABILITY.SPAWN_PROC,
	message: CAPABILITY.PUBLISH,
	sessions_send: CAPABILITY.PUBLISH,
	browser: CAPABILITY.NET_EGRESS,
	web_search: CAPABILITY.NET_EGRESS,
	web_fetch: CAPABILITY.NET_EGRESS,
	x_search: CAPABILITY.NET_EGRESS,
	image_generate: CAPABILITY.NET_EGRESS,
	music_generate: CAPABILITY.NET_EGRESS,
	video_generate: CAPABILITY.NET_EGRESS,
	tts: CAPABILITY.NET_EGRESS,
	canvas: CAPABILITY.TOOL_INVOKE,
	nodes: CAPABILITY.TOOL_INVOKE,
	gateway: CAPABILITY.MUTATE_SCHEMA,
	cron: CAPABILITY.MUTATE_SCHEMA
});
const READ_ONLY_RETRIEVAL = new Set([
	"web_search",
	"web_fetch",
	"x_search"
]);
/** Classify a canonical tool id. Unknown tools are `tool.invoke` (irreversible). */
function classifyToolCall(toolId) {
	const capability = Object.hasOwn(TOOL_CAPABILITIES, toolId) ? TOOL_CAPABILITIES[toolId] : CAPABILITY.TOOL_INVOKE;
	if (READ_ONLY_RETRIEVAL.has(toolId)) return {
		capability,
		reversible: true,
		exemption: "read-only-retrieval"
	};
	return {
		capability,
		reversible: isReversible(capability)
	};
}
const FS_WRITE_TOOLS = new Set([
	"write",
	"edit",
	"apply_patch"
]);
/** Tools whose calls write or delete files, classified per target. */
function isFsWriteTool(toolId) {
	return FS_WRITE_TOOLS.has(toolId);
}
const TOOL_CLASSIFIER_KEY = Symbol.for("enclawed.tool-capability-classifier");
/**
* Publish `classifyToolCall` on the shared classifier slot so plugin-side
* consumers (for example the egress action batcher, which collapses repeats
* only of read-only tools) classify tools by this map instead of a copy.
*/
function publishToolCapabilityClassifier() {
	const globals = globalThis;
	const slot = globals[TOOL_CLASSIFIER_KEY] ?? { classify: null };
	slot.classify = classifyToolCall;
	globals[TOOL_CLASSIFIER_KEY] = slot;
}
//#endregion
export { CAPABILITY as a, isReversible as c, projectionKey as d, canonicalEgressTarget as f, urlWithinEgressTarget as g, parseEgressTarget as h, ALL_CAPABILITIES as i, makeCall as l, egressTargetString as m, isFsWriteTool as n, isCapabilityToken as o, egressTargetDestination as p, publishToolCapabilityClassifier as r, isIrreversible as s, classifyToolCall as t, makeEgressCall as u };
