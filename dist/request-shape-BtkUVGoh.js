import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, timingSafeEqual } from "node:crypto";
const SEG_CHARS = "A-Za-z0-9._~-";
const GENERIC_SEG = new RegExp(`^[${SEG_CHARS}]{1,48}$`);
/** The accept values forwarded as sent; any other is forwarded as the first ("*\/*"). */
const GENERIC_ACCEPT = Object.freeze([
	"*/*",
	"application/json",
	"text/html",
	"text/plain",
	"application/octet-stream",
	"application/xml",
	"text/markdown",
	"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
]);
const ENCODINGS = [
	"br",
	"deflate",
	"gzip",
	"identity",
	"zstd"
];
/** user-agent of every request to a generic destination. */
const GENERIC_USER_AGENT = "enclawed-relay/1";
/**
* Hop-by-hop headers: the relay never forwards them (./relay-types.ts
* HOP_BY_HOP), so they carry nothing out; a body they announce is checked
* as a body.
*/
const HOP_BY_HOP_NAMES = new Set([
	"connection",
	"keep-alive",
	"proxy-connection",
	"proxy-authorization",
	"proxy-authenticate",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"content-length",
	"http2-settings"
]);
/** Headers accepted and dropped (their values never leave). */
const GENERIC_DROPPED = /^(?:accept-language|cache-control|pragma|if-none-match|if-modified-since|if-match|if-unmodified-since|range|referer|dnt|upgrade-insecure-requests|priority|sec-fetch-[a-z-]{1,24}|sec-ch-[a-z-]{1,32}|sec-gpc|te)$/;
const no = (code, message) => ({
	ok: false,
	code,
	message
});
/**
* log2 of the number of distinct generic paths below a prefix (the empty
* path, "/", and 1..GENERIC_MAX_SEGMENTS segments, each optionally followed
* by a trailing slash, at most GENERIC_MAX_REL characters): counted exactly
* by length (segments of "." and ".." are refused and not counted).
*/
function genericPathCapacityBits() {
	const seg = (n) => n < 1 || n > 48 ? 0n : BigInt(66) ** BigInt(n) - (n === 1 || n === 2 ? 1n : 0n);
	let ways = new Map([[0, 1n]]);
	let total = 2n;
	for (let k = 1; k <= 6; k++) {
		const next = /* @__PURE__ */ new Map();
		for (const [len, w] of ways) for (let n = 1; n <= 48 && len + 1 + n <= 96; n++) next.set(len + 1 + n, (next.get(len + 1 + n) ?? 0n) + w * seg(n));
		ways = next;
		for (const [len, w] of ways) {
			total += w;
			if (len + 1 <= 96) total += w;
		}
	}
	return log2Big(total);
}
/** Bits of choice in the forwarded headers and method of a generic request. */
function genericHeaderCapacityBits() {
	const accept = GENERIC_ACCEPT.length + 1;
	const encoding = 2 ** ENCODINGS.length + 1;
	return Math.log2(accept * encoding * 3 * 2 * 2);
}
/** The whole per-request capacity of the generic profile, in bits. */
function genericCapacityBits() {
	const p = genericPathCapacityBits();
	const h = genericHeaderCapacityBits();
	return {
		path: p,
		headers: h,
		total: p + h
	};
}
function log2Big(n) {
	const s = n.toString(2);
	const head = Number.parseInt(s.slice(0, 53), 2);
	return Math.log2(head) + Math.max(0, s.length - 53);
}
/** Bits a generic request with this path below the prefix carries (an upper bound per request). */
function genericRequestBits(rel) {
	return rel.length * Math.log2(67) + genericHeaderCapacityBits();
}
/** Does this request fit the generic profile below `prefix`? */
function checkGeneric(prefix, req, where) {
	if (req.kind !== "request") return no("request-shape-stream", `${where} takes plain requests only; a WebSocket or gRPC message is refused`);
	if (req.method !== "GET" && req.method !== "HEAD") return no("request-shape-method", `${where} takes GET and HEAD only (a destination without an API profile is for fetching), not ${JSON.stringify(req.method.slice(0, 32))}`);
	if (req.bodyLength !== 0) return no("request-shape-body", `${where} takes no request body`);
	const t = req.target;
	if (t.includes("?") || t.includes("#")) return no("request-shape-query", `${where} takes no query string`);
	let rel;
	if (prefix) {
		if (t !== prefix && !t.startsWith(`${prefix}/`)) return no("request-shape-path", `${where}: the path is outside ${prefix}/`);
		rel = t.slice(prefix.length);
	} else {
		if (!t.startsWith("/")) return no("request-shape-path", `${where}: the target is not a path`);
		rel = t === "/" ? "" : t;
	}
	if (rel.length > 96) return no("request-shape-path", `${where}: the path is longer than 96 characters below the declared prefix`);
	if (rel !== "" && rel !== "/") {
		const segs = rel.slice(1).split("/");
		if (segs.length > 1 && segs[segs.length - 1] === "") segs.pop();
		if (segs.length > 6) return no("request-shape-path", `${where}: more than 6 path segments below the declared prefix`);
		for (const s of segs) if (!GENERIC_SEG.test(s) || s === "." || s === "..") return no("request-shape-path", `${where}: a path segment outside [${SEG_CHARS}]{1,48} (no encoding, no empty or dot segment)`);
	}
	const rewrite = /* @__PURE__ */ new Map();
	const seen = /* @__PURE__ */ new Set();
	for (const [rawName, value] of req.headerPairs) {
		const name = rawName.toLowerCase();
		if (seen.has(name)) return no("request-shape-header", `${where}: the header ${JSON.stringify(name.slice(0, 64))} appears more than once`);
		seen.add(name);
		if (name === "host") continue;
		if (name === "accept") {
			const v = value.trim().toLowerCase();
			if (!GENERIC_ACCEPT.includes(v)) rewrite.set(name, GENERIC_ACCEPT[0]);
			continue;
		}
		if (name === "accept-encoding") {
			const tokens = value.toLowerCase().split(",").map((x) => x.split(";")[0].trim()).filter((x) => ENCODINGS.includes(x));
			const norm = [...new Set(tokens)].toSorted().join(", ") || "identity";
			if (norm !== value) rewrite.set(name, norm);
			continue;
		}
		if (name === "user-agent") {
			rewrite.set(name, GENERIC_USER_AGENT);
			continue;
		}
		if (name === "upgrade" && /websocket/i.test(value)) return no("request-shape-stream", `${where} takes plain requests only; a WebSocket is refused`);
		if (name === "content-length" && value.trim() !== "0") return no("request-shape-body", `${where} takes no request body`);
		if (HOP_BY_HOP_NAMES.has(name)) continue;
		if (GENERIC_DROPPED.test(name)) {
			rewrite.set(name, null);
			continue;
		}
		return no("request-shape-header", `${where} does not take the header ${JSON.stringify(name.slice(0, 64))} (a destination without an API profile takes no credential, cookie or custom header)`);
	}
	return {
		ok: true,
		rewrite,
		bits: genericRequestBits(rel)
	};
}
const API_METHODS = new Set([
	"GET",
	"HEAD",
	"POST",
	"PUT",
	"PATCH",
	"DELETE"
]);
const API_BASE_HEADERS = new Set([
	"host",
	"accept",
	"accept-encoding",
	"accept-language",
	"user-agent",
	"content-type",
	"content-length",
	"connection",
	"authorization"
]);
/** Never declarable: they change how the request is read, routed or framed. */
const API_FORBIDDEN_HEADER = /^(?:transfer-encoding|upgrade|expect|te|forwarded|x-forwarded-.*|x-http-method(?:-override)?|x-method-override|x-original-url|x-rewrite-url|proxy-.*|cookie|via)$/;
const API_HEADER_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const API_LITERAL_SEG = new RegExp(`^[${SEG_CHARS}]{1,128}$`);
const API_PARAM_SEG = new RegExp(`^[${SEG_CHARS}]{1,128}$`);
const QUERY_NAME = /^[A-Za-z0-9._~-]{1,64}$/;
const QUERY_VALUE = /^[A-Za-z0-9._~%+-]{0,256}$/;
const MAX_STRING = 65536;
const MAX_ITEMS = 1e4;
const MAX_SCHEMA_DEPTH = 8;
/** Largest JSON body an API route may declare (the relay's own bound is smaller or equal). */
const MAX_API_BODY = 1024 * 1024;
function schemaProblem(s, depth, at) {
	if (depth > MAX_SCHEMA_DEPTH) return `${at}: schema nested deeper than ${MAX_SCHEMA_DEPTH}`;
	if (!s || typeof s !== "object" || Array.isArray(s)) return `${at}: a schema must be an object`;
	const o = s;
	const allowed = (keys) => Object.keys(o).find((k) => !keys.includes(k));
	switch (o.type) {
		case "object": {
			const extra = allowed([
				"type",
				"properties",
				"required"
			]);
			if (extra) return `${at}: unknown schema field ${JSON.stringify(extra)}`;
			if (!o.properties || typeof o.properties !== "object" || Array.isArray(o.properties)) return `${at}: an object schema names its properties (no other property is taken)`;
			for (const [k, v] of Object.entries(o.properties)) {
				const p = schemaProblem(v, depth + 1, `${at}.${k}`);
				if (p) return p;
			}
			if (o.required !== void 0 && (!Array.isArray(o.required) || o.required.some((r) => typeof r !== "string" || !Object.hasOwn(o.properties, r)))) return `${at}: required must list declared properties`;
			return null;
		}
		case "string": {
			const extra = allowed([
				"type",
				"maxLength",
				"enum"
			]);
			if (extra) return `${at}: unknown schema field ${JSON.stringify(extra)}`;
			if (!Number.isInteger(o.maxLength) || o.maxLength < 0) return `${at}: a string schema needs maxLength`;
			if (o.maxLength > MAX_STRING) return `${at}: maxLength above ${MAX_STRING}`;
			if (o.enum !== void 0 && (!Array.isArray(o.enum) || o.enum.some((e) => typeof e !== "string"))) return `${at}: enum must list strings`;
			return null;
		}
		case "integer":
		case "number": {
			const extra = allowed([
				"type",
				"minimum",
				"maximum"
			]);
			if (extra) return `${at}: unknown schema field ${JSON.stringify(extra)}`;
			for (const k of ["minimum", "maximum"]) if (o[k] !== void 0 && typeof o[k] !== "number") return `${at}: ${k} must be a number`;
			return null;
		}
		case "boolean":
		case "null": return allowed(["type"]) ? `${at}: unknown schema field` : null;
		case "array": {
			const extra = allowed([
				"type",
				"items",
				"maxItems"
			]);
			if (extra) return `${at}: unknown schema field ${JSON.stringify(extra)}`;
			if (!Number.isInteger(o.maxItems) || o.maxItems < 0 || o.maxItems > MAX_ITEMS) return `${at}: an array schema needs maxItems (at most ${MAX_ITEMS})`;
			return schemaProblem(o.items, depth + 1, `${at}[]`);
		}
		default: return `${at}: schema type must be object, string, integer, number, boolean, null or array`;
	}
}
/** Validate an explicit API profile declaration. */
function resolveApiProfile(o) {
	if (!Array.isArray(o.routes) || o.routes.length === 0 || o.routes.length > 256) return {
		ok: false,
		message: "an api profile declares its routes (1 to 256)"
	};
	const routes = [];
	for (const [i, r] of o.routes.entries()) {
		const at = `route ${i}`;
		if (!r || typeof r !== "object" || Array.isArray(r)) return {
			ok: false,
			message: `${at} must be an object`
		};
		const rr = r;
		const extra = Object.keys(rr).find((k) => ![
			"method",
			"path",
			"query",
			"body",
			"stream"
		].includes(k));
		if (extra) return {
			ok: false,
			message: `${at} has an unknown field ${JSON.stringify(extra)}`
		};
		if (typeof rr.method !== "string" || !API_METHODS.has(rr.method)) return {
			ok: false,
			message: `${at}: method must be one of ${[...API_METHODS].join(", ")}`
		};
		if (typeof rr.path !== "string" || !rr.path.startsWith("/") || rr.path.length > 512 || rr.path.slice(1).split("/").some((s) => s !== "{}" && (!API_LITERAL_SEG.test(s) || s === "." || s === ".."))) return {
			ok: false,
			message: `${at}: path must be /segment[/segment...] of literal segments or {} (no encoding, no dot segments)`
		};
		if (rr.query !== void 0 && (!Array.isArray(rr.query) || rr.query.length > 32 || rr.query.some((q) => typeof q !== "string" || !QUERY_NAME.test(q)))) return {
			ok: false,
			message: `${at}: query must list parameter names`
		};
		let body;
		if (rr.body !== void 0) {
			const b = rr.body;
			if (!b || typeof b !== "object" || !Number.isInteger(b.maxBytes) || b.maxBytes < 1 || b.maxBytes > 1048576 || Object.keys(b).some((k) => k !== "maxBytes" && k !== "schema")) return {
				ok: false,
				message: `${at}: body must be { maxBytes (1..${MAX_API_BODY}), schema }`
			};
			if ((rr.method === "GET" || rr.method === "HEAD") && rr.stream === void 0) return {
				ok: false,
				message: `${at}: a ${rr.method} route takes no body`
			};
			const p = schemaProblem(b.schema, 0, `${at} body`);
			if (p) return {
				ok: false,
				message: p
			};
			body = {
				maxBytes: b.maxBytes,
				schema: b.schema
			};
		}
		if (rr.stream !== void 0 && !(rr.stream === "websocket" && rr.method === "GET" || rr.stream === "grpc" && rr.method === "POST")) return {
			ok: false,
			message: `${at}: stream must be "websocket" (method GET) or "grpc" (method POST)`
		};
		routes.push({
			method: rr.method,
			path: rr.path,
			...rr.stream ? { stream: rr.stream } : {},
			...rr.query ? { query: [...rr.query] } : {},
			...body ? { body } : {}
		});
	}
	const headers = [];
	if (o.headers !== void 0) {
		if (!Array.isArray(o.headers) || o.headers.length > 16) return {
			ok: false,
			message: "an api profile's headers must list at most 16 header names"
		};
		for (const h of o.headers) {
			const n = typeof h === "string" ? h.toLowerCase() : "";
			if (!API_HEADER_NAME.test(n) || API_FORBIDDEN_HEADER.test(n)) return {
				ok: false,
				message: `an api profile may not declare the header ${JSON.stringify(h)}`
			};
			headers.push(n);
		}
	}
	return {
		ok: true,
		api: {
			routes,
			headers
		}
	};
}
/** Does a JSON value fit the schema? null: yes; otherwise where it does not. */
function jsonProblem(v, s, at = "body") {
	switch (s.type) {
		case "object":
			if (!v || typeof v !== "object" || Array.isArray(v)) return `${at} is not an object`;
			for (const k of Object.keys(v)) if (!Object.hasOwn(s.properties, k)) return `${at} has the undeclared property ${JSON.stringify(k.slice(0, 64))}`;
			for (const r of s.required ?? []) if (!Object.hasOwn(v, r)) return `${at} lacks ${JSON.stringify(r)}`;
			for (const [k, sub] of Object.entries(s.properties)) if (Object.hasOwn(v, k)) {
				const p = jsonProblem(v[k], sub, `${at}.${k}`);
				if (p) return p;
			}
			return null;
		case "string":
			if (typeof v !== "string") return `${at} is not a string`;
			if (v.length > s.maxLength) return `${at} is longer than ${s.maxLength}`;
			if (s.enum && !s.enum.includes(v)) return `${at} is not one of its declared values`;
			return null;
		case "integer":
		case "number":
			if (typeof v !== "number" || !Number.isFinite(v) || s.type === "integer" && !Number.isInteger(v)) return `${at} is not ${s.type === "integer" ? "an integer" : "a number"}`;
			if (s.minimum !== void 0 && v < s.minimum || s.maximum !== void 0 && v > s.maximum) return `${at} is out of its declared range`;
			return null;
		case "boolean": return typeof v === "boolean" ? null : `${at} is not a boolean`;
		case "null": return v === null ? null : `${at} is not null`;
		case "array":
			if (!Array.isArray(v)) return `${at} is not an array`;
			if (v.length > s.maxItems) return `${at} has more than ${s.maxItems} items`;
			for (const [i, x] of v.entries()) {
				const p = jsonProblem(x, s.items, `${at}[${i}]`);
				if (p) return p;
			}
			return null;
	}
	return `${at} has no schema it fits`;
}
function routeMatches(route, rel) {
	const want = route.path.slice(1).split("/");
	const got = rel.slice(1).split("/");
	if (want.length !== got.length) return false;
	return want.every((w, i) => w === "{}" ? API_PARAM_SEG.test(got[i]) && got[i] !== "." && got[i] !== ".." : w === got[i]);
}
const WEBSOCKET_HEADERS = new Set([
	"upgrade",
	"sec-websocket-key",
	"sec-websocket-version",
	"sec-websocket-protocol"
]);
const GRPC_HEADER = /^(?:te|grpc-[a-z-]{1,32})$/;
/** Does this request (or stream message) fit one of the API profile's routes? */
function checkApi(prefix, api, req, where) {
	const [pathPart, query = null] = (() => {
		const q = req.target.indexOf("?");
		return q < 0 ? [req.target, null] : [req.target.slice(0, q), req.target.slice(q + 1)];
	})();
	if (req.target.includes("#")) return no("request-shape-path", `${where}: a fragment is not sent`);
	if (prefix && !pathPart.startsWith(`${prefix}/`)) return no("request-shape-path", `${where}: the path is outside ${prefix}/`);
	const rel = prefix ? pathPart.slice(prefix.length) : pathPart;
	const byPath = api.routes.filter((r) => routeMatches(r, rel));
	if (byPath.length === 0) return no("request-shape-path", `${where}: ${JSON.stringify(rel.slice(0, 120))} is not a declared route`);
	if (req.kind !== "request") {
		const kind = req.method === "WEBSOCKET" ? "websocket" : "grpc";
		const sr = byPath.find((r) => r.stream === kind);
		if (!sr) return no("request-shape-stream", `${where}: ${JSON.stringify(rel.slice(0, 120))} is not a declared ${kind === "websocket" ? "WebSocket" : "gRPC"} route`);
		const len = req.body?.length ?? req.bodyLength;
		if (sr.body && len > sr.body.maxBytes) return no("request-shape-body", `${where}: a message is larger than the route's ${sr.body.maxBytes} bytes`);
		if (sr.body && req.body) {
			const text = req.body.toString("utf8");
			if (/^\s*[[{]/.test(text)) {
				let v;
				try {
					v = JSON.parse(text);
				} catch {
					return no("request-shape-body", `${where}: a message is not JSON`);
				}
				const p = jsonProblem(v, sr.body.schema, "message");
				if (p) return no("request-shape-body", `${where}: ${p}`);
			}
		}
		return {
			ok: true,
			rewrite: /* @__PURE__ */ new Map(),
			bits: 0
		};
	}
	const route = byPath.find((r) => r.method === req.method);
	if (!route) return no("request-shape-method", `${where}: ${JSON.stringify(req.method.slice(0, 32))} is not declared for this route`);
	if (query !== null) {
		if (query.length > 1024) return no("request-shape-query", `${where}: the query is longer than 1024`);
		const names = /* @__PURE__ */ new Set();
		for (const part of query === "" ? [] : query.split("&")) {
			const eq = part.indexOf("=");
			const name = eq < 0 ? part : part.slice(0, eq);
			const value = eq < 0 ? "" : part.slice(eq + 1);
			if (!(route.query ?? []).includes(name) || names.has(name) || !QUERY_VALUE.test(value)) return no("request-shape-query", `${where}: the query parameter ${JSON.stringify(name.slice(0, 64))} is not declared for this route, repeated, or its value is outside its grammar`);
			names.add(name);
		}
	}
	const seen = /* @__PURE__ */ new Set();
	let contentType = null;
	for (const [rawName, value] of req.headerPairs) {
		const name = rawName.toLowerCase();
		if (seen.has(name)) return no("request-shape-header", `${where}: the header ${JSON.stringify(name.slice(0, 64))} appears more than once`);
		seen.add(name);
		const streamHeader = route.stream === "websocket" && WEBSOCKET_HEADERS.has(name) || route.stream === "grpc" && GRPC_HEADER.test(name);
		if (!API_BASE_HEADERS.has(name) && !api.headers.includes(name) && !streamHeader && !(HOP_BY_HOP_NAMES.has(name) && name !== "upgrade")) return no("request-shape-header", `${where} does not take the header ${JSON.stringify(name.slice(0, 64))}`);
		if (!/^[\x20-\x7e]{0,4096}$/.test(value)) return no("request-shape-header", `${where}: the value of ${JSON.stringify(name)} is outside its grammar`);
		if (name === "content-type") contentType = value;
	}
	if (route.stream) {
		if (req.bodyLength !== 0) return no("request-shape-body", `${where}: a stream's opening request takes no body`);
		return {
			ok: true,
			rewrite: /* @__PURE__ */ new Map(),
			bits: 0
		};
	}
	if (!route.body) {
		if (req.bodyLength !== 0) return no("request-shape-body", `${where}: this route takes no request body`);
		return {
			ok: true,
			rewrite: /* @__PURE__ */ new Map(),
			bits: 0
		};
	}
	if (req.bodyLength > route.body.maxBytes || req.body && req.body.length > route.body.maxBytes) return no("request-shape-body", `${where}: the body is larger than the route's ${route.body.maxBytes} bytes`);
	if (req.bodyLength === 0) return no("request-shape-body", `${where}: this route takes a JSON body`);
	if (!contentType || !/^application\/json\s*(?:;\s*charset=utf-8\s*)?$/i.test(contentType.trim())) return no("request-shape-body", `${where}: the body must be application/json`);
	if (!req.body) return no("request-shape-body", `${where}: the body could not be read`);
	let v;
	try {
		v = JSON.parse(req.body.toString("utf8"));
	} catch {
		return no("request-shape-body", `${where}: the body is not JSON`);
	}
	const p = jsonProblem(v, route.body.schema);
	if (p) return no("request-shape-body", `${where}: ${p}`);
	return {
		ok: true,
		rewrite: /* @__PURE__ */ new Map(),
		bits: 0
	};
}
//#endregion
//#region src/enclawed/containment/request-shape.ts
const REQUEST_SHAPE_PROFILES = Object.freeze([
	"npm-registry",
	"pypi",
	"generic",
	"api"
]);
/** The profiles with a grammar of their own that a URL fragment can name (api needs its routes). */
const NAMED_SHAPE_PROFILES = Object.freeze([
	"npm-registry",
	"pypi",
	"generic"
]);
/** The shape of a destination declared without one: the generic profile at the root. */
const GENERIC_SHAPE = Object.freeze({
	profile: "generic",
	pathPrefix: "",
	pins: /* @__PURE__ */ new Map(),
	requirePins: false,
	api: null
});
const refuse = (code, message) => ({
	ok: false,
	code,
	message
});
const PREFIX = /^(\/[A-Za-z0-9_~+-][A-Za-z0-9._~+-]{0,127}){0,8}$/;
const SRI = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/;
const PYPI_HASH = /^(sha256|sha384|sha512)[:=]([0-9a-f]+)$/;
const DIGEST_BYTES = {
	sha256: 32,
	sha384: 48,
	sha512: 64
};
/** One pin string as digests (every one must match); null when malformed or weak. */
function parseArtifactPin(pin) {
	if (typeof pin !== "string" || pin.length === 0 || pin.length > 1024) return null;
	const out = [];
	for (const tok of pin.trim().split(/\s+|,/).filter(Boolean)) {
		const sri = SRI.exec(tok);
		const hex = sri ? null : PYPI_HASH.exec(tok.toLowerCase());
		const algo = sri?.[1] ?? hex?.[1];
		if (!algo) return null;
		const value = sri ? Buffer.from(sri[2], "base64") : Buffer.from(hex[2], "hex");
		if (value.length !== DIGEST_BYTES[algo]) return null;
		out.push({
			algo,
			value
		});
	}
	return out.length ? out : null;
}
/** Validate a destination's shape; null shape: none declared. */
function resolveRequestShape(decl) {
	if (decl === void 0 || decl === null) return {
		ok: true,
		shape: null
	};
	const d = typeof decl === "string" ? { profile: decl } : decl;
	if (!d || typeof d !== "object" || Array.isArray(d)) return {
		ok: false,
		message: "destination shape must be a profile id or an object"
	};
	const o = d;
	const fields = o.profile === "api" ? [
		"profile",
		"pathPrefix",
		"routes",
		"headers"
	] : o.profile === "generic" ? ["profile", "pathPrefix"] : [
		"profile",
		"pathPrefix",
		"pins",
		"requirePins"
	];
	for (const k of Object.keys(o)) if (!fields.includes(k)) return {
		ok: false,
		message: `destination shape has an unknown field ${JSON.stringify(k)}`
	};
	if (!REQUEST_SHAPE_PROFILES.includes(o.profile)) return {
		ok: false,
		message: `destination shape profile must be one of ${REQUEST_SHAPE_PROFILES.join(", ")}: ${JSON.stringify(o.profile)}`
	};
	const prefix = o.pathPrefix === void 0 ? "" : o.pathPrefix;
	if (typeof prefix !== "string" || !PREFIX.test(prefix) || prefix.split("/").some((s) => s === "." || s === "..")) return {
		ok: false,
		message: `destination shape pathPrefix must be "" or /segment[/segment...] (no dot segments, no encoding): ${JSON.stringify(prefix)}`
	};
	if (o.requirePins !== void 0 && typeof o.requirePins !== "boolean") return {
		ok: false,
		message: "destination shape requirePins must be a boolean"
	};
	const profile = o.profile;
	if (profile === "generic") return {
		ok: true,
		shape: {
			...GENERIC_SHAPE,
			pathPrefix: prefix
		}
	};
	if (profile === "api") {
		const api = resolveApiProfile(o);
		if (!api.ok) return {
			ok: false,
			message: api.message
		};
		return {
			ok: true,
			shape: {
				profile,
				pathPrefix: prefix,
				pins: /* @__PURE__ */ new Map(),
				requirePins: false,
				api: api.api
			}
		};
	}
	const pins = /* @__PURE__ */ new Map();
	if (o.pins !== void 0) {
		if (!o.pins || typeof o.pins !== "object" || Array.isArray(o.pins)) return {
			ok: false,
			message: "destination shape pins must map artifact paths to pins"
		};
		for (const [p, v] of Object.entries(o.pins)) {
			const g = matchGrammar(profile, p);
			if (!g.ok || g.kind !== "artifact") return {
				ok: false,
				message: `destination shape pin ${JSON.stringify(p)} is not an artifact path of the ${profile} profile`
			};
			const digests = parseArtifactPin(v);
			if (!digests) return {
				ok: false,
				message: `destination shape pin for ${JSON.stringify(p)} is not a sha256/sha384/sha512 pin`
			};
			pins.set(p, digests);
		}
	}
	return {
		ok: true,
		shape: {
			profile,
			pathPrefix: prefix,
			pins,
			requirePins: o.requirePins === true,
			api: null
		}
	};
}
const MAX_TARGET = 1024;
const TARGET_CHARS = /^[A-Za-z0-9._~+!@%/-]+$/;
const NPM_NAME = "[A-Za-z0-9][A-Za-z0-9._~-]{0,213}";
const NPM_SCOPE = "@[A-Za-z0-9][A-Za-z0-9._~-]{0,213}";
const NPM_VERSION = "[A-Za-z0-9][A-Za-z0-9._+~-]{0,127}";
const NPM_FILE = "[A-Za-z0-9][A-Za-z0-9._+~-]{0,250}\\.tgz";
const NPM_METADATA = new RegExp(`^/(?:${NPM_SCOPE}(?:%2[fF]|/))?${NPM_NAME}(?:/${NPM_VERSION})?$`);
const NPM_ARTIFACT = new RegExp(`^/(?:${NPM_SCOPE}/)?${NPM_NAME}/-/${NPM_FILE}$`);
const PY_NAME = "[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?";
const PY_VERSION = "[A-Za-z0-9][A-Za-z0-9._+!-]{0,127}";
const PY_SEG = "[A-Za-z0-9][A-Za-z0-9._+-]{0,127}";
const PY_DIST = "[A-Za-z0-9][A-Za-z0-9._+!-]{0,250}\\.(?:whl|tar\\.gz|tar\\.bz2|tgz|zip)";
const PY_SIMPLE = new RegExp(`^/simple/(?:${PY_NAME}/?)?$`);
const PY_JSON = new RegExp(`^/pypi/${PY_NAME}(?:/${PY_VERSION})?/json$`);
const PY_FILE = new RegExp(`^/packages/(?:${PY_SEG}/){0,6}${PY_DIST}$`);
const PY_FILE_METADATA = new RegExp(`^/packages/(?:${PY_SEG}/){0,6}${PY_DIST}\\.metadata$`);
/** Does `rel` (the path below the prefix) belong to the profile's grammar? */
function matchGrammar(profile, rel) {
	if (!rel.startsWith("/") || rel.length > MAX_TARGET || !TARGET_CHARS.test(rel)) return {
		ok: false,
		why: "characters outside the registry path grammar"
	};
	const segs = rel.slice(1).split("/");
	if ((profile === "pypi" && rel.endsWith("/") ? segs.slice(0, -1) : segs).some((s) => s === "" || s === "." || s === "..")) return {
		ok: false,
		why: "an empty, '.' or '..' path segment"
	};
	if (profile === "npm-registry") {
		if (rel.indexOf("%") >= 0 && !(NPM_METADATA.test(rel) && /^\/@[^/%]+%2[fF][^%]*$/.test(rel))) return {
			ok: false,
			why: "percent-encoding outside a scoped package name"
		};
		if (NPM_ARTIFACT.test(rel)) return {
			ok: true,
			kind: "artifact"
		};
		if (NPM_METADATA.test(rel)) return {
			ok: true,
			kind: "metadata"
		};
		return {
			ok: false,
			why: "not a package document or tarball path of the npm registry protocol"
		};
	}
	if (rel.includes("%")) return {
		ok: false,
		why: "percent-encoding"
	};
	if (PY_FILE.test(rel)) return {
		ok: true,
		kind: "artifact"
	};
	if (PY_SIMPLE.test(rel) || PY_JSON.test(rel) || PY_FILE_METADATA.test(rel)) return {
		ok: true,
		kind: "metadata"
	};
	return {
		ok: false,
		why: "not a simple, JSON or files path of the PyPI protocol"
	};
}
const visible = (max, min = 1) => new RegExp(`^[\\x20-\\x7e]{${min},${max}}$`);
/** The request headers a registry client sends, each with its value grammar. */
const HEADER_RULES = [
	[/^host$/, visible(260)],
	[/^accept$/, /^[A-Za-z0-9.+*/;=, _-]{1,512}$/],
	[/^accept-encoding$/, /^[A-Za-z0-9,;=. *-]{1,128}$/],
	[/^accept-language$/, /^[A-Za-z0-9,;=. *-]{1,128}$/],
	[/^user-agent$/, visible(2048)],
	[/^cache-control$/, /^[A-Za-z0-9=, -]{1,128}$/],
	[/^pragma$/, /^no-cache$/i],
	[/^connection$/, /^(keep-alive|close)$/i],
	[/^if-none-match$/, visible(512)],
	[/^if-modified-since$/, /^[A-Za-z0-9,: ]{1,64}$/],
	[/^range$/, /^bytes=\d{1,15}-(\d{1,15})?$/],
	[/^authorization$/, visible(4096)],
	[/^referer$/, visible(512)],
	[/^content-length$/, /^0$/],
	[/^npm-[a-z-]{1,32}$/, visible(512, 0)],
	[/^pacote-[a-z-]{1,32}$/, visible(512, 0)]
];
const MAX_HEADERS = 40;
/** Dropped from a pinned artifact's request: the answer must be the whole identity-encoded file. */
const PINNED_DROP = new Set([
	"range",
	"if-none-match",
	"if-modified-since",
	"accept-encoding"
]);
const NO_DROP = /* @__PURE__ */ new Set();
const NO_REWRITE = /* @__PURE__ */ new Map();
/** Does this request (or stream message) fit the destination's shape? */
function checkRequestShape(shape, req) {
	const where = `the ${shape.profile} destination`;
	if (shape.profile === "generic" || shape.profile === "api") {
		const v = shape.profile === "api" && shape.api ? checkApi(shape.pathPrefix, shape.api, req, where) : shape.profile === "generic" ? checkGeneric(shape.pathPrefix, req, where) : {
			ok: false,
			code: "request-shape-path",
			message: `${where} has no routes`
		};
		return v.ok ? {
			ok: true,
			artifact: null,
			pin: null,
			drop: NO_DROP,
			rewrite: v.rewrite,
			bits: v.bits
		} : refuse(v.code, v.message);
	}
	const profile = shape.profile;
	if (req.kind !== "request") return refuse("request-shape-stream", `${where} takes plain requests only; a WebSocket or gRPC message is refused`);
	if (req.method !== "GET" && req.method !== "HEAD") return refuse("request-shape-method", `${where} takes GET and HEAD only, not ${JSON.stringify(req.method.slice(0, 32))}`);
	if (req.bodyLength !== 0) return refuse("request-shape-body", `${where} takes no request body`);
	const t = req.target;
	if (t.length > MAX_TARGET) return refuse("request-shape-path", `${where}: the path is longer than ${MAX_TARGET}`);
	if (t.includes("?")) return refuse("request-shape-query", `${where} takes no query string`);
	let rel;
	if (shape.pathPrefix) {
		if (!t.startsWith(`${shape.pathPrefix}/`)) return refuse("request-shape-path", `${where}: the path is outside ${shape.pathPrefix}/`);
		rel = t.slice(shape.pathPrefix.length);
	} else rel = t;
	const g = matchGrammar(profile, rel);
	if (!g.ok) return refuse("request-shape-path", `${where}: ${g.why}`);
	const seen = /* @__PURE__ */ new Set();
	if (req.headerPairs.length > MAX_HEADERS) return refuse("request-shape-header", `${where}: more than ${MAX_HEADERS} request headers`);
	for (const [rawName, value] of req.headerPairs) {
		const name = rawName.toLowerCase();
		if (seen.has(name)) return refuse("request-shape-header", `${where}: the header ${JSON.stringify(name.slice(0, 64))} appears more than once`);
		seen.add(name);
		const rule = HEADER_RULES.find(([n]) => n.test(name));
		if (!rule) return refuse("request-shape-header", `${where} does not take the header ${JSON.stringify(name.slice(0, 64))}`);
		if (!rule[1].test(value)) return refuse("request-shape-header", `${where}: the value of ${JSON.stringify(name)} is outside its grammar`);
	}
	if (g.kind !== "artifact") return {
		ok: true,
		artifact: null,
		pin: null,
		drop: NO_DROP,
		rewrite: NO_REWRITE,
		bits: 0
	};
	const pin = shape.pins.get(rel) ?? null;
	if (!pin && shape.requirePins) return refuse("artifact-not-pinned", `${where}: the artifact ${rel} has no declared pin`);
	return {
		ok: true,
		artifact: rel,
		pin,
		drop: pin ? PINNED_DROP : NO_DROP,
		rewrite: NO_REWRITE,
		bits: 0
	};
}
/** Largest pinned artifact the relay verifies (spooled to a private file, never held in memory). */
const MAX_PINNED_ARTIFACT = 4 * 1024 * 1024 * 1024;
function digestsMatch(pins, hashes) {
	return pins.every((p) => {
		const got = hashes.get(p.algo);
		return got !== void 0 && got.length === p.value.length && timingSafeEqual(got, p.value);
	});
}
/**
* Read a pinned artifact's whole answer into a private spool file, hashing
* as it arrives, and hand it over only when every pinned digest matches.
* Anything else (another status, an encoded body, an oversize or broken
* answer, a mismatch) is refused; nothing of it reaches the process.
*/
function verifyPinnedAnswer(res, pins, max = MAX_PINNED_ARTIFACT) {
	return new Promise((resolve) => {
		const status = res.statusCode ?? 0;
		const enc = (res.headers["content-encoding"] ?? "identity").toLowerCase();
		if (status !== 200 || enc !== "identity" && enc !== "") {
			res.resume();
			resolve(refuse("artifact-unverifiable", status !== 200 ? `the pinned artifact was answered with status ${status}, not the artifact itself` : `the pinned artifact came ${enc}-encoded, so its digest cannot be checked`));
			return;
		}
		let dir;
		try {
			dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-artifact-"));
		} catch (err) {
			res.resume();
			resolve(refuse("artifact-unverifiable", `no spool for the pinned artifact: ${err.message}`));
			return;
		}
		const file = path.join(dir, "artifact");
		const discard = () => fs.rmSync(dir, {
			recursive: true,
			force: true
		});
		const out = fs.createWriteStream(file, {
			mode: 384,
			flags: "wx"
		});
		const hashers = [...new Set(pins.map((p) => p.algo))].map((a) => [a, createHash(a)]);
		let size = 0;
		let done = false;
		const fail = (message, code = "artifact-unverifiable") => {
			if (done) return;
			done = true;
			res.destroy();
			out.destroy();
			discard();
			resolve(refuse(code, message));
		};
		res.on("data", (c) => {
			size += c.length;
			if (size > max) {
				fail(`the pinned artifact is larger than ${max} bytes`);
				return;
			}
			for (const [, h] of hashers) h.update(c);
			out.write(c);
		});
		res.on("error", (err) => fail(`the answer broke off: ${err.message}`));
		res.on("aborted", () => fail("the answer broke off"));
		res.on("close", () => {
			if (!res.complete) fail("the answer broke off");
		});
		res.on("end", () => {
			if (done) return;
			out.end(() => {
				if (done) return;
				if (!digestsMatch(pins, new Map(hashers.map(([a, h]) => [a, h.digest()])))) {
					fail("the artifact's content does not match its declared pin; none of it was handed to the process", "artifact-pin-mismatch");
					return;
				}
				done = true;
				const headers = {};
				for (const [k, v] of Object.entries(res.headers)) if (v !== void 0 && ![
					"connection",
					"keep-alive",
					"transfer-encoding",
					"content-length"
				].includes(k)) headers[k] = v;
				resolve({
					ok: true,
					status,
					headers,
					size,
					open() {
						const s = fs.createReadStream(file);
						s.on("close", discard);
						return s;
					},
					discard
				});
			});
		});
	});
}
//#endregion
export { checkRequestShape as a, verifyPinnedAnswer as c, MAX_API_BODY as d, checkApi as f, resolveApiProfile as g, jsonProblem as h, REQUEST_SHAPE_PROFILES as i, GENERIC_ACCEPT as l, genericCapacityBits as m, MAX_PINNED_ARTIFACT as n, parseArtifactPin as o, checkGeneric as p, NAMED_SHAPE_PROFILES as r, resolveRequestShape as s, GENERIC_SHAPE as t, GENERIC_USER_AGENT as u };
