import { a as __require, n as __esmMin, o as __toCommonJS, r as __exportAll, t as __commonJSMin } from "./chunk-iyeSoAlh.js";
import { i as formatErrorMessage$1 } from "./errors-D8p6rxH8.js";
import { i as normalizeLowercaseStringOrEmpty$1 } from "./string-coerce-BUSzWgUA.js";
import { t as createDedupeCache } from "./dedupe-B0oahHDC.js";
import { r as MAX_IMAGE_BYTES } from "./constants-D11gkljK.js";
import { n as fetchWithSsrFGuard } from "./fetch-guard-CqBeRyBG.js";
import { l as saveMediaBuffer } from "./store-AweEzF7v.js";
import { n as fetchRemoteMedia } from "./fetch-BbXHz4dv.js";
import "./error-runtime-ZxMCL7t6.js";
import { t as createLoggerBackedRuntime } from "./runtime-logger-DMjbp3ho.js";
import { d as ssrfPolicyFromDangerouslyAllowPrivateNetwork } from "./ssrf-policy-DVcaXdVR.js";
import "./ssrf-runtime-g42yz-N7.js";
import "./media-runtime-DybdZk30.js";
import "./text-runtime-DpDoI-Qm.js";
import "./runtime-api-j-U0u4GP.js";
import { c as validateUrbitBaseUrl, d as formatTargetHint, f as normalizeShip, h as resolveTlonOutboundTarget, m as parseTlonTarget, p as parseChannelNest, s as normalizeUrbitHostname, u as resolveTlonAccount } from "./setup-core-g3PWD3kx.js";
import { t as getTlonRuntime } from "./runtime-C-YJAp-m.js";
import { t as tlonSetupWizard } from "./setup-surface-BzuYeO7K.js";
import { c as tslib_es6_exports, s as init_tslib_es6 } from "./tslib.es6-CHJmDIJ0.js";
import { $ as splitEvery, A as sdkStreamMixin, At as isValidHostLabel, B as init_config$1, C as Crc32Node, Ct as translateTraits, D as serde_exports, Dt as parseQueryString, E as init_serde, Et as parseUrl, F as resolveEndpoint, Ft as require_dist_cjs$40, G as REGION_INI_NAME, H as NODE_REGION_CONFIG_FILE_OPTIONS, I as isIpAddress, J as booleanSelector, K as loadConfig, L as customEndpointFunctions, M as createChecksumStream, Mt as HttpRequest, N as endpoints_exports, Nt as hasOwn$1, O as v4, Ot as normalizeProvider$1, P as init_endpoints, Pt as getSmithyContext, Q as splitHeader, R as EndpointError, S as init_checksum, St as NormalizedSchema, T as generateIdempotencyToken, Tt as init_transport, U as NODE_REGION_CONFIG_OPTIONS, V as resolveRegionConfig, W as REGION_ENV_NAME, X as toUint8Array, Y as ProviderError, Z as NumericValue, _t as getValueFromTextNode, at as dateToUtcString, bt as schema_exports, ct as parseRfc7231DateTime, dt as fromUtf8, et as _parseEpochTimestamp, ft as fromBase64, gt as NoOpLogger, ht as init_client$1, it as LazyJsonString, j as createBufferedReadable, jt as HttpResponse, k as writeKey$1, kt as isValidHostname, lt as toUtf8, mt as client_exports$1, n as init_event_streams, nt as _parseRfc7231DateTime, ot as parseEpochTimestamp, pt as isArrayBuffer, q as SelectorType$1, rt as quoteHeader, st as parseRfc3339DateTimeWithOffset, t as event_streams_exports, tt as _parseRfc3339DateTimeWithOffset, ut as toBase64, vt as decorateServiceException, w as Uint8ArrayBlobAdapter, wt as deref, x as checksum_exports, xt as TypeRegistry, yt as init_schema, z as config_exports } from "./event-streams-CQM0R5S6.js";
import { env, versions } from "node:process";
import * as path$1 from "node:path";
import { platform, release } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import crypto, { randomBytes, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
//#region extensions/tlon/src/settings.ts
const SETTINGS_DESK = "moltbot";
const SETTINGS_BUCKET = "tlon";
/**
* Parse channelRules - handles both JSON string and object formats.
* Settings-store doesn't support nested objects, so we store as JSON string.
*/
function parseChannelRules(value) {
	if (!value) return;
	if (typeof value === "string") try {
		const parsed = JSON.parse(value);
		if (isChannelRulesObject(parsed)) return parsed;
	} catch {
		return;
	}
	if (isChannelRulesObject(value)) return value;
}
/**
* Parse settings from the raw Urbit settings-store response.
* The response shape is: { [bucket]: { [key]: value } }
*/
function parseSettingsResponse(raw) {
	if (!raw || typeof raw !== "object") return {};
	const bucket = raw[SETTINGS_BUCKET];
	if (!bucket || typeof bucket !== "object") return {};
	const settings = bucket;
	return {
		groupChannels: Array.isArray(settings.groupChannels) ? settings.groupChannels.filter((x) => typeof x === "string") : void 0,
		dmAllowlist: Array.isArray(settings.dmAllowlist) ? settings.dmAllowlist.filter((x) => typeof x === "string") : void 0,
		autoDiscover: typeof settings.autoDiscover === "boolean" ? settings.autoDiscover : void 0,
		showModelSig: typeof settings.showModelSig === "boolean" ? settings.showModelSig : void 0,
		autoAcceptDmInvites: typeof settings.autoAcceptDmInvites === "boolean" ? settings.autoAcceptDmInvites : void 0,
		autoAcceptGroupInvites: typeof settings.autoAcceptGroupInvites === "boolean" ? settings.autoAcceptGroupInvites : void 0,
		groupInviteAllowlist: Array.isArray(settings.groupInviteAllowlist) ? settings.groupInviteAllowlist.filter((x) => typeof x === "string") : void 0,
		channelRules: parseChannelRules(settings.channelRules),
		defaultAuthorizedShips: Array.isArray(settings.defaultAuthorizedShips) ? settings.defaultAuthorizedShips.filter((x) => typeof x === "string") : void 0,
		ownerShip: typeof settings.ownerShip === "string" ? settings.ownerShip : void 0,
		pendingApprovals: parsePendingApprovals(settings.pendingApprovals)
	};
}
function isChannelRulesObject(val) {
	if (!val || typeof val !== "object" || Array.isArray(val)) return false;
	for (const [, rule] of Object.entries(val)) if (!rule || typeof rule !== "object") return false;
	return true;
}
/**
* Parse pendingApprovals - handles both JSON string and array formats.
* Settings-store stores complex objects as JSON strings.
*/
function parsePendingApprovals(value) {
	if (!value) return;
	let parsed = value;
	if (typeof value === "string") try {
		parsed = JSON.parse(value);
	} catch {
		return;
	}
	if (!Array.isArray(parsed)) return;
	return parsed.filter((item) => {
		if (!item || typeof item !== "object") return false;
		const obj = item;
		return typeof obj.id === "string" && (obj.type === "dm" || obj.type === "channel" || obj.type === "group") && typeof obj.requestingShip === "string" && typeof obj.timestamp === "number";
	});
}
/**
* Parse a single settings entry update event.
*/
function parseSettingsEvent(event) {
	if (!event || typeof event !== "object") return null;
	const evt = event;
	if (evt["put-entry"]) {
		const put = evt["put-entry"];
		if (put.desk !== SETTINGS_DESK || put["bucket-key"] !== SETTINGS_BUCKET) return null;
		return {
			key: typeof put["entry-key"] === "string" ? put["entry-key"] : "",
			value: put.value
		};
	}
	if (evt["del-entry"]) {
		const del = evt["del-entry"];
		if (del.desk !== SETTINGS_DESK || del["bucket-key"] !== SETTINGS_BUCKET) return null;
		return {
			key: typeof del["entry-key"] === "string" ? del["entry-key"] : "",
			value: void 0
		};
	}
	return null;
}
/**
* Apply a single settings update to the current state.
*/
function applySettingsUpdate(current, key, value) {
	const next = { ...current };
	switch (key) {
		case "groupChannels":
			next.groupChannels = Array.isArray(value) ? value.filter((x) => typeof x === "string") : void 0;
			break;
		case "dmAllowlist":
			next.dmAllowlist = Array.isArray(value) ? value.filter((x) => typeof x === "string") : void 0;
			break;
		case "autoDiscover":
			next.autoDiscover = typeof value === "boolean" ? value : void 0;
			break;
		case "showModelSig":
			next.showModelSig = typeof value === "boolean" ? value : void 0;
			break;
		case "autoAcceptDmInvites":
			next.autoAcceptDmInvites = typeof value === "boolean" ? value : void 0;
			break;
		case "autoAcceptGroupInvites":
			next.autoAcceptGroupInvites = typeof value === "boolean" ? value : void 0;
			break;
		case "groupInviteAllowlist":
			next.groupInviteAllowlist = Array.isArray(value) ? value.filter((x) => typeof x === "string") : void 0;
			break;
		case "channelRules":
			next.channelRules = parseChannelRules(value);
			break;
		case "defaultAuthorizedShips":
			next.defaultAuthorizedShips = Array.isArray(value) ? value.filter((x) => typeof x === "string") : void 0;
			break;
		case "ownerShip":
			next.ownerShip = typeof value === "string" ? value : void 0;
			break;
		case "pendingApprovals":
			next.pendingApprovals = parsePendingApprovals(value);
			break;
	}
	return next;
}
/**
* Create a settings store subscription manager.
*
* Usage:
*   const settings = createSettingsManager(api, logger);
*   await settings.load();
*   settings.subscribe((newSettings) => { ... });
*/
function createSettingsManager(api, logger) {
	let state = {
		current: {},
		loaded: false
	};
	const listeners = /* @__PURE__ */ new Set();
	const notify = () => {
		for (const listener of listeners) try {
			listener(state.current);
		} catch (err) {
			logger?.error?.(`[settings] Listener error: ${String(err)}`);
		}
	};
	return {
		get current() {
			return state.current;
		},
		get loaded() {
			return state.loaded;
		},
		async load() {
			try {
				const deskData = (await api.scry("/settings/all.json"))?.all?.[SETTINGS_DESK];
				state.current = parseSettingsResponse(deskData ?? {});
				state.loaded = true;
				logger?.log?.(`[settings] Loaded: ${JSON.stringify(state.current)}`);
				return state.current;
			} catch (err) {
				logger?.log?.(`[settings] No settings found (using defaults): ${String(err)}`);
				state.current = {};
				state.loaded = true;
				return state.current;
			}
		},
		async startSubscription() {
			await api.subscribe({
				app: "settings",
				path: "/desk/" + SETTINGS_DESK,
				event: (event) => {
					const update = parseSettingsEvent(event);
					if (!update) return;
					logger?.log?.(`[settings] Update: ${update.key} = ${JSON.stringify(update.value)}`);
					state.current = applySettingsUpdate(state.current, update.key, update.value);
					notify();
				},
				err: (error) => {
					logger?.error?.(`[settings] Subscription error: ${String(error)}`);
				},
				quit: () => {
					logger?.log?.("[settings] Subscription ended");
				}
			});
			logger?.log?.("[settings] Subscribed to settings updates");
		},
		onChange(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
}
//#endregion
//#region extensions/tlon/src/urbit/errors.ts
var UrbitError = class extends Error {
	constructor(code, message, options) {
		super(message, options);
		this.name = "UrbitError";
		this.code = code;
	}
};
var UrbitUrlError = class extends UrbitError {
	constructor(message, options) {
		super("invalid_url", message, options);
		this.name = "UrbitUrlError";
	}
};
var UrbitHttpError = class extends UrbitError {
	constructor(params) {
		const suffix = params.bodyText ? ` - ${params.bodyText}` : "";
		super("http_error", `${params.operation} failed: ${params.status}${suffix}`, { cause: params.cause });
		this.name = "UrbitHttpError";
		this.status = params.status;
		this.operation = params.operation;
		this.bodyText = params.bodyText;
	}
};
var UrbitAuthError = class extends UrbitError {
	constructor(code, message, options) {
		super(code, message, options);
		this.name = "UrbitAuthError";
	}
};
//#endregion
//#region extensions/tlon/src/urbit/fetch.ts
async function urbitFetch(params) {
	const validated = validateUrbitBaseUrl(params.baseUrl);
	if (!validated.ok) throw new UrbitUrlError(validated.error);
	return await fetchWithSsrFGuard({
		url: new URL(params.path, validated.baseUrl).toString(),
		fetchImpl: params.fetchImpl,
		init: params.init,
		timeoutMs: params.timeoutMs,
		maxRedirects: params.maxRedirects,
		signal: params.signal,
		policy: params.ssrfPolicy,
		lookupFn: params.lookupFn,
		auditContext: params.auditContext,
		pinDns: params.pinDns
	});
}
//#endregion
//#region extensions/tlon/src/urbit/auth.ts
async function authenticate(url, code, options = {}) {
	const { response, release } = await urbitFetch({
		baseUrl: url,
		path: "/~/login",
		init: {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ password: code }).toString()
		},
		ssrfPolicy: options.ssrfPolicy,
		lookupFn: options.lookupFn,
		fetchImpl: options.fetchImpl,
		timeoutMs: options.timeoutMs ?? 15e3,
		maxRedirects: 3,
		auditContext: "tlon-urbit-login"
	});
	try {
		if (!response.ok) throw new UrbitAuthError("auth_failed", `Login failed with status ${response.status}`);
		await response.text().catch(() => {});
		const cookie = response.headers.get("set-cookie");
		if (!cookie) throw new UrbitAuthError("missing_cookie", "No authentication cookie received");
		return cookie;
	} finally {
		await release();
	}
}
//#endregion
//#region extensions/tlon/src/urbit/context.ts
function resolveShipFromHostname(hostname) {
	const trimmed = normalizeUrbitHostname(hostname);
	if (!trimmed) return "";
	if (trimmed.includes(".")) return trimmed.split(".")[0] ?? trimmed;
	return trimmed;
}
function normalizeUrbitShip(ship, hostname) {
	return (ship?.replace(/^~/, "") ?? resolveShipFromHostname(hostname)).trim();
}
function normalizeUrbitCookie(cookie) {
	return cookie.split(";")[0] ?? cookie;
}
function getUrbitContext(url, ship) {
	const validated = validateUrbitBaseUrl(url);
	if (!validated.ok) throw new UrbitUrlError(validated.error);
	return {
		baseUrl: validated.baseUrl,
		hostname: validated.hostname,
		ship: normalizeUrbitShip(ship, validated.hostname)
	};
}
/**
* Get the default SSRF policy for image uploads.
* Uses a restrictive policy that blocks private networks by default.
*/
function getDefaultSsrFPolicy() {}
//#endregion
//#region node_modules/@urbit/aura/dist/aura.cjs.production.min.js
var require_aura_cjs_production_min = /* @__PURE__ */ __commonJSMin(((exports) => {
	function n(n) {
		let t = !0, [e, r, u] = n.split("..");
		r = r || "0.0.0", u = u || "0000";
		let [s, c, l] = e.slice(1).split(".");
		"-" === s.at(-1) && (s = s.slice(0, -1), t = !1);
		const [d, p, g] = r.split("."), h = u.split(".").map(((n) => BigInt("0x" + n)));
		return function(n) {
			const t = n.pos ? a + BigInt(n.year) : a - (BigInt(n.year) - 1n), e = (() => {
				let e = i(t) ? f : o, r = n.time.day - 1n, a = n.month - 1n;
				for (; 0n !== a;) {
					const [n, ...t] = e;
					r += BigInt(n), a -= 1n, e = t;
				}
				let u = !0, s = t;
				for (; 1 == u;) s % 4n !== 0n ? (s -= 1n, r += i(s) ? 366n : 365n) : s % 100n !== 0n ? (s -= 4n, r += i(s) ? 1461n : 1460n) : s % 400n !== 0n ? (s -= 100n, r += i(s) ? 36525n : 36524n) : (r += s / 400n * (4n * 36524n + 1n), u = !1);
				return r;
			})();
			return n.time.day = e, m(n.time);
		}({
			pos: t,
			year: BigInt(s),
			month: BigInt(c),
			time: {
				day: BigInt(l),
				hour: BigInt(d),
				minute: BigInt(p),
				second: BigInt(g),
				ms: h
			}
		});
	}
	function t(n) {
		const t = {
			day: 0n,
			hour: 0n,
			minute: 0n,
			second: 0n,
			ms: []
		};
		n = n.slice(1);
		let [e, r] = n.split("..");
		return r = r || "0000", t.ms = r.split(".").map(((n) => BigInt("0x" + n))), e.split(".").forEach(((e) => {
			switch (e[0]) {
				case "d":
					t.day += BigInt(e.slice(1));
					break;
				case "h":
					t.hour += BigInt(e.slice(1));
					break;
				case "m":
					t.minute += BigInt(e.slice(1));
					break;
				case "s":
					t.second += BigInt(e.slice(1));
					break;
				default: throw new Error("bad dr: " + n);
			}
		})), r = r || "0000", m(t);
	}
	Object.defineProperty(exports, "__esModule", { value: !0 });
	const e = BigInt("170141184475152167957503069145530368000"), r = BigInt("18446744073709551616"), a = BigInt("292277024400");
	function i(n) {
		return n % 4n === 0n && n % 100n !== 0n || n % 400n === 0n;
	}
	const o = [
		31,
		28,
		31,
		30,
		31,
		30,
		31,
		31,
		30,
		31,
		30,
		31
	], f = [
		31,
		29,
		31,
		30,
		31,
		30,
		31,
		31,
		30,
		31,
		30,
		31
	], u = 86400n, s = 3600n, c = 60n, l = 146097n, d = 36524n;
	function m(n) {
		let t = n.second + u * n.day + s * n.hour + c * n.minute, e = n.ms, r = 0n, a = 3n;
		for (; 0 !== e.length;) {
			const [n, ...t] = e;
			r += n << 16n * a, e = t, a -= 1n;
		}
		return r | t << 64n;
	}
	function p(n) {
		let t = n >> 64n;
		const e = (BigInt("0xffffffffffffffff") & n).toString(16).padStart(16, "0").match(/.{4}/g).map(((n) => BigInt("0x" + n)));
		for (; 0n === e.at(-1);) e.pop();
		let r = t / u;
		t %= u;
		let a = t / s;
		t %= s;
		let i = t / c;
		return t %= c, {
			ms: e,
			day: r,
			minute: i,
			hour: a,
			second: t
		};
	}
	const g = (n, t) => ((n, t) => {
		const e = Number(255n & t), r = Number((65280n & t) / 256n), a = String.fromCharCode(e) + String.fromCharCode(r);
		return BigInt(((n, t) => {
			let e, r, a, i, o, f, u, s;
			for (e = 3 & n.length, r = n.length - e, a = t, o = 3432918353, f = 461845907, s = 0; s < r;) u = 255 & n.charCodeAt(s) | (255 & n.charCodeAt(++s)) << 8 | (255 & n.charCodeAt(++s)) << 16 | (255 & n.charCodeAt(++s)) << 24, ++s, u = (65535 & u) * o + (((u >>> 16) * o & 65535) << 16) & 4294967295, u = u << 15 | u >>> 17, u = (65535 & u) * f + (((u >>> 16) * f & 65535) << 16) & 4294967295, a ^= u, a = a << 13 | a >>> 19, i = 5 * (65535 & a) + ((5 * (a >>> 16) & 65535) << 16) & 4294967295, a = 27492 + (65535 & i) + ((58964 + (i >>> 16) & 65535) << 16);
			switch (u = 0, e) {
				case 3: u ^= (255 & n.charCodeAt(s + 2)) << 16;
				case 2: u ^= (255 & n.charCodeAt(s + 1)) << 8;
				case 1: u ^= 255 & n.charCodeAt(s), u = (65535 & u) * o + (((u >>> 16) * o & 65535) << 16) & 4294967295, u = u << 15 | u >>> 17, u = (65535 & u) * f + (((u >>> 16) * f & 65535) << 16) & 4294967295, a ^= u;
			}
			return a ^= n.length, a ^= a >>> 16, a = 2246822507 * (65535 & a) + ((2246822507 * (a >>> 16) & 65535) << 16) & 4294967295, a ^= a >>> 13, a = 3266489909 * (65535 & a) + ((3266489909 * (a >>> 16) & 65535) << 16) & 4294967295, a ^= a >>> 16, a >>> 0;
		})(a, n));
	})([
		3077398253,
		3995603712,
		2243735041,
		1261992695
	][n], t), h = (n) => y(4, 65535n, 65536n, 4294967295n, g, n), y = (n, t, e, r, a, i) => {
		const o = b(n, t, e, a, i);
		return o < r ? o : b(n, t, e, a, o);
	}, b = (n, t, e, r, a) => {
		const i = (a, o, f) => {
			if (a > n) return n % 2 != 0 || f === t ? t * f + o : t * o + f;
			{
				const n = BigInt(r(a - 1, f).toString());
				return i(a + 1, f, a % 2 != 0 ? (o + n) % t : (o + n) % e);
			}
		};
		return i(1, a % t, a / t);
	}, x = (n) => w(4, 65535n, 65536n, 4294967295n, g, n), w = (n, t, e, r, a, i) => {
		const o = B(n, t, e, a, i);
		return o < r ? o : B(n, t, e, a, o);
	}, B = (n, t, e, r, a) => {
		const i = (n, a, o) => {
			if (n < 1) return t * o + a;
			{
				const f = r(n - 1, a);
				return i(n - 1, n % 2 != 0 ? (o + t - f % t) % t : (o + e - f % e) % e, a);
			}
		}, o = n % 2 != 0 ? a / t : a % t, f = n % 2 != 0 ? a % t : a / t;
		return i(n, f === t ? o : f, f === t ? f : o);
	};
	var I = {
		F: g,
		fe: b,
		Fe: y,
		feis: h,
		fein: (n) => {
			const t = (n) => {
				const e = 4294967295n & n, r = 18446744069414584320n & n;
				return n >= 65536n && n <= 4294967295n ? 65536n + h(n - 65536n) : n >= 4294967296n && n <= 18446744073709551615n ? r | t(e) : n;
			};
			return t(n);
		},
		fen: B,
		Fen: w,
		tail: x,
		fynd: (n) => {
			const t = (n) => {
				const e = 4294967295n & n, r = 18446744069414584320n & n;
				return n >= 65536n && n <= 4294967295n ? 65536n + x(n - 65536n) : n >= 4294967296n && n <= 18446744073709551615n ? r | t(e) : n;
			};
			return t(BigInt(n));
		}
	};
	const v = /^~([a-z]{3}|([a-z]{6}(\-[a-z]{6}){0,3}(\-(\-[a-z]{6}){4})*))$/;
	function S(n) {
		const t = N(n), e = (n) => n.toString(2).padStart(8, "0"), r = t.reduce(((n, r, a) => a % 2 != 0 || 1 === t.length ? n + e(E.indexOf(r)) : n + e(C.indexOf(r))), ""), a = BigInt("0b" + r);
		return I.fynd(a);
	}
	function $(n) {
		const t = I.fein(n), e = Math.ceil(t.toString(16).length / 2), r = Math.ceil(t.toString(16).length / 4);
		return "~" + (e <= 1 ? E[Number(t)] : function n(t, e, a) {
			const i = 65535n & t, o = C[Number(i >> 8n)], f = E[Number(255n & i)];
			return e === r ? a : n(t >> 16n, e + 1, o + f + (3 & e ? "-" : 0 === e ? "" : "--") + a);
		}(t, 0, ""));
	}
	function A(n) {
		let t;
		return t = "bigint" == typeof n ? n : z(n), t <= 255n ? "czar" : t <= 65535n ? "king" : t <= 4294967295n ? "duke" : t <= 18446744073709551615n ? "earl" : "pawn";
	}
	function k(n) {
		switch (n) {
			case "czar": return "galaxy";
			case "king": return "star";
			case "duke": return "planet";
			case "earl": return "moon";
			case "pawn": return "comet";
		}
	}
	function z(n) {
		if (!function(n) {
			return v.test(n) && j(n) && n === $(S(n));
		}(n)) throw new Error("invalid @p literal: " + n);
		return S(n);
	}
	const C = "\ndozmarbinwansamlitsighidfidlissogdirwacsabwissibrigsoldopmodfoglidhopdardorlorhodfolrintogsilmirholpaslacrovlivdalsatlibtabhanticpidtorbolfosdotlosdilforpilramtirwintadbicdifrocwidbisdasmidloprilnardapmolsanlocnovsitnidtipsicropwitnatpanminritpodmottamtolsavposnapnopsomfinfonbanmorworsipronnorbotwicsocwatdolmagpicdavbidbaltimtasmalligsivtagpadsaldivdactansidfabtarmonranniswolmispallasdismaprabtobrollatlonnodnavfignomnibpagsopralbilhaddocridmocpacravripfaltodtiltinhapmicfanpattaclabmogsimsonpinlomrictapfirhasbosbatpochactidhavsaplindibhosdabbitbarracparloddosbortochilmactomdigfilfasmithobharmighinradmashalraglagfadtopmophabnilnosmilfopfamdatnoldinhatnacrisfotribhocnimlarfitwalrapsarnalmoslandondanladdovrivbacpollaptalpitnambonrostonfodponsovnocsorlavmatmipfip".match(/.{1,3}/g), E = "\nzodnecbudwessevpersutletfulpensytdurwepserwylsunrypsyxdyrnuphebpeglupdepdysputlughecryttyvsydnexlunmeplutseppesdelsulpedtemledtulmetwenbynhexfebpyldulhetmevruttylwydtepbesdexsefwycburderneppurrysrebdennutsubpetrulsynregtydsupsemwynrecmegnetsecmulnymtevwebsummutnyxrextebfushepbenmuswyxsymselrucdecwexsyrwetdylmynmesdetbetbeltuxtugmyrpelsyptermebsetdutdegtexsurfeltudnuxruxrenwytnubmedlytdusnebrumtynseglyxpunresredfunrevrefmectedrusbexlebduxrynnumpyxrygryxfeptyrtustyclegnemfermertenlusnussyltecmexpubrymtucfyllepdebbermughuttunbylsudpemdevlurdefbusbeprunmelpexdytbyttyplevmylwedducfurfexnulluclennerlexrupnedlecrydlydfenwelnydhusrelrudneshesfetdesretdunlernyrsebhulrylludremlysfynwerrycsugnysnyllyndyndemluxfedsedbecmunlyrtesmudnytbyrsenwegfyrmurtelreptegpecnelnevfes".match(/.{1,3}/g);
	function N(n) {
		return n.replace(/[\^~-]/g, "").match(/.{1,3}/g) || [];
	}
	function j(n) {
		const t = N(n);
		return !(t.length % 2 != 0 && 1 !== t.length) && t.every(((n, e) => e % 2 != 0 || 1 === t.length ? E.includes(n) : C.includes(n)));
	}
	function _(n, t) {
		let e = [], r = [e];
		for (let a = 0; a < n.length; a++) e.length < t ? e.push(n[a]) : (e = [n[a]], r.push(e));
		return r;
	}
	function q(n, t) {
		return n = M(n), function(n, t, e) {
			if ("nan" === n) return function(n, t) {
				return O(BigInt(n + 1)) << BigInt(t - 1);
			}(t, e);
			if ("inf" === n) return U(!0, t, e);
			if ("-inf" === n) return U(!1, t, e);
			let r = 0, a = !0;
			"-" === n[r] && (a = !1, r++);
			let i = "";
			for (; "." !== n[r] && "e" !== n[r] && void 0 !== n[r];) i += n[r++];
			"." === n[r] && r++;
			let o = "";
			for (; "e" !== n[r] && void 0 !== n[r];) o += n[r++];
			"e" === n[r] && r++;
			let f = !0;
			"-" === n[r] && (f = !1, r++);
			let u = "";
			for (; void 0 !== n[r];) u += n[r++];
			return BigInt("0b" + function(n, t, e, r, a, i, o) {
				return 0 !== o && (i ? (r += a.padEnd(o, "0").slice(0, o), a = a.slice(o)) : (a = r.padStart(o, "0").slice(-o) + a, r = r.slice(0, -o))), function(n, t, e, r, a, i) {
					function o(n) {
						return console.warn(n), 1;
					}
					const f = 2 ** (t - 1) - 1, u = 1 - f, s = f, c = u - n, l = 2 * f + 1 + n + 3, d = new Array(l), m = 10n ** a;
					var p, g, h, y, b, x, w = 0, B = !e;
					for (p = l; p; d[--p] = 0);
					for (p = f + 2; r && p; d[--p] = 1n & r, r >>= 1n);
					for (p = f + 1; i > 0n && p < l; (d[++p] = (i *= 2n) >= m ? 1 : 0) && (i -= m));
					for (p = -1; ++p < l && !d[p];);
					if (d[(g = n - 1 + (p = (w = f + 1 - p) >= u && w <= s ? p + 1 : f + 1 - (w = u - 1))) + 1]) {
						if (!(h = d[g])) for (y = g + 2; !h && y < l; h = d[y++]);
						for (y = g + 1; h && --y >= 0; (d[y] = (d[y] ? 0 : 1) - 0) && (h = 0));
					}
					for (p = p - 2 < 0 ? -1 : p - 3; ++p < l && !d[p];);
					for ((w = f + 1 - p) >= u && w <= s ? ++p : w < u && (w != f + 1 - l && w < c && o("r.construct underflow"), p = f + 1 - (w = u - 1)), r && (o(r ? "r.construct overflow" : "r.construct"), w = s + 1, p = f + 2), x = Math.abs(w + f), y = t + 1, b = ""; --y; b = (1 & x) + b, x = x >>= 1);
					return (B ? "1" : "0") + b + d.slice(p, p + n).join("");
				}(t, n, e, BigInt(r), BigInt(a.length), BigInt(a));
			}(t, e, a, i, o, f, Number(u)));
		}(t.slice(n.l.length), n.w, n.p);
	}
	function F(n, t) {
		return (n = M(n)).l + function(n) {
			if ("n" === n.t) return "nan";
			if ("i" === n.t) return n.s ? "inf" : "-inf";
			let t;
			return n.e - 4 > 0 || n.e + 2 < 0 ? t = 1 : (t = n.e + 1, n.e = 0), (n.s ? "" : "-") + function(n, t) {
				const e = Math.abs(n);
				if (n <= 0) return "0." + "".padEnd(e, "0") + t;
				{
					const n = t.length;
					return e >= n ? t + "".padEnd(e - n, "0") : t.slice(0, e) + "." + t.slice(e);
				}
			}(t, n.a) + (0 === n.e ? "" : "e" + n.e.toString());
		}(function(n, t, e) {
			const r = O(e), a = O(t), i = n & r, o = n >> BigInt(e) & a, f = 0n === (n >> BigInt(t + e) & 1n);
			let u, s, c, l;
			if (o === a) return 0n === i ? {
				t: "i",
				s: f
			} : { t: "n" };
			0n !== o ? (u = 1n << BigInt(e) | i, s = o - (2n ** (t - 1n) - 1n) - e, c = Number(e), l = 1n !== o && 0n === i) : (u = i, s = 1n - (2n ** (t - 1n) - 1n) - e, c = u.toString(2).length - 1, l = !1);
			const d = (2n ** e).toString(10).length + 1, m = function(n, t, e, r, a, i, o) {
				const f = BigInt(t);
				let u, s, c, l, d = 0, m = new Array(o).fill("0"), p = 0;
				if (0n === n) return m[0] = "0", p = 0, {
					digits: m.slice(0, 1).join(""),
					outExponent: p
				};
				r ? t > 0 ? (s = 4n * n, s <<= f, u = 4n, c = 1n << f, l = 1n << f + 1n) : (s = 4n * n, u = 1n << -f + 2n, c = 1n, l = 2n) : t > 0 ? (s = 2n * n, s <<= f, u = 2n, c = 1n << f, l = c) : (s = 2n * n, u = 1n << BigInt(1 - t), c = 1n, l = c);
				let g = Math.ceil(.3010299956639812 * (e + t) - .69);
				if (g > 0) u *= BigInt(10) ** BigInt(g);
				else if (g < 0) {
					const n = BigInt(10) ** BigInt(-g);
					s *= n, c *= n, l !== c && (l *= c);
				}
				s >= u ? g += 1 : (s *= 10n, c *= 10n, l !== c && (l *= 10n));
				let h = g - o;
				p = g - 1;
				let y = !1, b = !1, x = 0;
				for (; g -= 1, x = Number(s / u), s %= u, y = s < c, b = s + l > u, !y && !b && g !== h;) m[d] = String.fromCharCode("0".charCodeAt(0) + x), d += 1, s *= 10n, c *= 10n, l !== c && (l *= 10n);
				let w = y;
				if (y === b) {
					s *= 2n;
					let n = s < u ? -1 : s > u ? 1 : 0;
					w = n < 0, 0 === n && (w = 0 == (1 & x));
				}
				if (w) m[d] = String.fromCharCode("0".charCodeAt(0) + x), d += 1;
				else if (9 === x) for (;;) {
					if (0 === d) {
						m[d] = "1", d += 1, p += 1;
						break;
					}
					if (d -= 1, "9" !== m[d]) {
						m[d] = String.fromCharCode(m[d].charCodeAt(0) + 1), d += 1;
						break;
					}
				}
				else m[d] = String.fromCharCode("0".charCodeAt(0) + x + 1), d += 1;
				return {
					digits: m.slice(0, d).join(""),
					outExponent: p
				};
			}(u, Number(s), c, l, 0, 0, d);
			return {
				t: "d",
				s: f,
				e: m.outExponent,
				a: m.digits
			};
		}(t, BigInt(n.w), BigInt(n.p)));
	}
	function M(n) {
		return "h" === n ? {
			w: 5,
			p: 10,
			l: ".~~"
		} : "s" === n ? {
			w: 8,
			p: 23,
			l: "."
		} : "d" === n ? {
			w: 11,
			p: 52,
			l: ".~"
		} : "q" === n ? {
			w: 15,
			p: 112,
			l: ".~~~"
		} : n;
	}
	function O(n) {
		return 2n ** n - 1n;
	}
	function U(n, t, e) {
		return O(BigInt(n ? t : t + 1)) << BigInt(e);
	}
	function Z(n, t, e, r, a) {
		return void 0 === a && (a = !1), new RegExp(`^${a ? "\\-\\-?" : ""}${n}(0|${0 === r ? t : `${t}${e}{0,${r - 1}}`}${0 === r ? `${e}*` : `(\\.${e}{${r}})*`})$`);
	}
	function P(n) {
		return new RegExp(`^\\.~{${n}}(nan|\\-?(inf|(0|[1-9][0-9]*)(\\.[0-9]+)?(e\\-?(0|[1-9][0-9]*))?))$`);
	}
	const R = {
		c: /^~\-((~[0-9a-fA-F]+\.)|(~[~\.])|[0-9a-z\-\._])*$/,
		da: /^~(0|[1-9][0-9]*)\-?\.0*([1-9]|1[0-2])\.0*[1-9][0-9]*(\.\.([0-9]+)\.([0-9]+)\.([0-9]+)(\.(\.[0-9a-f]{4})+)?)?$/,
		dr: /^~((d|h|m|s)(0|[1-9][0-9]*))(\.(d|h|m|s)(0|[1-9][0-9]*))*(\.(\.[0-9a-f]{4})+)?$/,
		f: /^\.(y|n)$/,
		if: /^(\.(0|[1-9][0-9]{0,2})){4}$/,
		is: /^(\.(0|[1-9a-fA-F][0-9a-fA-F]{0,3})){8}$/,
		n: /^~$/,
		p: v,
		q: /^\.~(([a-z]{3}|[a-z]{6})(\-[a-z]{6})*)$/,
		rd: P(1),
		rh: P(2),
		rq: P(3),
		rs: P(0),
		sb: Z("0b", "1", "[01]", 4, !0),
		sd: Z("", "[1-9]", "[0-9]", 3, !0),
		si: Z("0i", "[1-9]", "[0-9]", 0, !0),
		sv: Z("0v", "[1-9a-v]", "[0-9a-v]", 5, !0),
		sw: Z("0w", "[1-9a-zA-Z~-]", "[0-9a-zA-Z~-]", 5, !0),
		sx: Z("0x", "[1-9a-f]", "[0-9a-f]", 4, !0),
		t: /^~~((~[0-9a-fA-F]+\.)|(~[~\.])|[0-9a-z\-\._])*$/,
		ta: /^~\.[0-9a-z\-\.~_]*$/,
		tas: /^[a-z][a-z0-9\-]*$/,
		ub: Z("0b", "1", "[01]", 4),
		ud: Z("", "[1-9]", "[0-9]", 3),
		ui: Z("0i", "[1-9]", "[0-9]", 0),
		uv: Z("0v", "[1-9a-v]", "[0-9a-v]", 5),
		uw: Z("0w", "[1-9a-zA-Z~-]", "[0-9a-zA-Z~-]", 5),
		ux: Z("0x", "[1-9a-f]", "[0-9a-f]", 4)
	}, T = D;
	function D(n, t) {
		const e = H(n, t);
		if (!e) throw new Error("slav: failed to parse @" + n + " from string: " + t);
		return e;
	}
	const G = H;
	function H(n, t) {
		if (n in R && !R[n].test(t)) return null;
		const e = J(t);
		return e && "dime" === e.type && e.aura === n ? e.atom : null;
	}
	function J(e) {
		if ("" === e) return null;
		const r = e[0];
		if (r >= "a" && r <= "z") return R.tas.test(e) ? {
			type: "dime",
			aura: "tas",
			atom: Q(e)
		} : null;
		if (r >= "0" && r <= "9") {
			const n = K(e);
			return n ? {
				type: "dime",
				...n
			} : null;
		}
		if ("-" === r) {
			let n = !0;
			"-" == e[1] ? e = e.slice(2) : (e = e.slice(1), n = !1);
			const t = K(e);
			return t ? (n ? t.atom = 2n * t.atom : 0n !== t.atom && (t.atom = 1n + 2n * (t.atom - 1n)), {
				type: "dime",
				aura: t.aura.replace("u", "s"),
				atom: t.atom
			}) : null;
		}
		if ("." === r) {
			if (".y" === e) return {
				type: "dime",
				aura: "f",
				atom: 0n
			};
			if (".n" === e) return {
				type: "dime",
				aura: "f",
				atom: 1n
			};
			if (R.is.test(e)) {
				const n = e.slice(1).split(".").reduce(((n, t) => n + t.padStart(4, "0")), "");
				return {
					type: "dime",
					aura: "is",
					atom: BigInt("0x" + n)
				};
			}
			if (R.if.test(e)) return {
				type: "dime",
				aura: "if",
				atom: e.slice(1).split(".").reduce(((n, t, e) => n + (BigInt(t) << BigInt(8 * (3 - e)))), 0n)
			};
			if ("~" === e[1] && (R.rd.test(e) || R.rh.test(e) || R.rq.test(e)) || R.rs.test(e)) {
				let n, t = 0;
				for (; "~" === e[t + 1];) t++;
				switch (t) {
					case 0:
						n = "rs";
						break;
					case 1:
						n = "rd";
						break;
					case 2:
						n = "rh";
						break;
					case 3:
						n = "rq";
						break;
					default: throw new Error("parsing invalid @r*");
				}
				return {
					type: "dime",
					aura: n,
					atom: q(n[1], e)
				};
			}
			if ("~" === e[1] && R.q.test(e)) {
				const n = function(n) {
					try {
						return function(n) {
							const t = n.slice(2).split("-"), e = (n) => {
								if (n < 0) throw new Error("malformed @q");
								return n.toString(16).padStart(2, "0");
							}, r = t.map(((n, t) => {
								let r = function(n, t) {
									return [t.slice(0, 3), t.slice(3)];
								}(0, n);
								return "" === r[1] && 0 === t ? e(E.indexOf(r[0])) : e(C.indexOf(r[0])) + e(E.indexOf(r[1]));
							}));
							return BigInt("0x" + (0 === n.length ? "00" : r.join("")));
						}(n);
					} catch (n) {
						return null;
					}
				}(e);
				return null === n ? null : {
					type: "dime",
					aura: "q",
					atom: n
				};
			}
			if ("_" === e[1] && /^\.(_([0-9a-zA-Z\-\.]|~\-|~~)+)*__$/.test(e)) {
				const n = e.slice(1, -2).split("_").slice(1).map(((n) => J(n = n.replaceAll("~-", "_").replaceAll("~~", "~"))));
				return n.some(((n) => null === n)) ? null : {
					type: "many",
					list: n
				};
			}
			return null;
		}
		if ("~" === r) {
			if ("~" === e) return {
				type: "dime",
				aura: "n",
				atom: 0n
			};
			if (R.da.test(e)) return {
				type: "dime",
				aura: "da",
				atom: n(e)
			};
			if (R.dr.test(e)) return {
				type: "dime",
				aura: "dr",
				atom: t(e)
			};
			if (R.p.test(e)) {
				const n = function(n) {
					if (!v.test(n) || !j(n)) return null;
					const t = S(n);
					return n === $(t) ? t : null;
				}(e);
				return null === n ? null : {
					type: "dime",
					aura: "p",
					atom: n
				};
			}
			return "." === e[1] && R.ta.test(e) ? {
				type: "dime",
				aura: "ta",
				atom: Q(e.slice(2))
			} : "~" === e[1] && R.t.test(e) ? {
				type: "dime",
				aura: "t",
				atom: Q(L(e.slice(2)))
			} : "-" === e[1] && R.c.test(e) ? /^~\-~[0-9a-f]+\.$/.test(e) ? {
				type: "dime",
				aura: "c",
				atom: BigInt("0x" + e.slice(3, -1))
			} : {
				type: "dime",
				aura: "c",
				atom: Q(L(e.slice(2)))
			} : "0" === e[1] && /^~0[0-9a-v]+$/.test(e) ? {
				type: "blob",
				jam: X(5, W, e.slice(2))
			} : null;
		}
		return null;
	}
	function K(n) {
		switch (n.slice(0, 2)) {
			case "0b": return R.ub.test(n) ? {
				aura: "ub",
				atom: BigInt(n.replaceAll(".", ""))
			} : null;
			case "0c": return console.log("aura-js: @uc parsing unsupported (bisk)"), null;
			case "0i": return R.ui.test(n) ? {
				aura: "ui",
				atom: BigInt(n.slice(2))
			} : null;
			case "0x": return R.ux.test(n) ? {
				aura: "ux",
				atom: BigInt(n.replaceAll(".", ""))
			} : null;
			case "0v": return R.uv.test(n) ? {
				aura: "uv",
				atom: X(5, W, n.slice(2))
			} : null;
			case "0w": return R.uw.test(n) ? {
				aura: "uw",
				atom: X(6, V, n.slice(2))
			} : null;
			default: return R.ud.test(n) ? {
				aura: "ud",
				atom: BigInt(n.replaceAll(".", ""))
			} : null;
		}
	}
	function L(n) {
		let t = "", e = 0;
		for (; e < n.length;) switch (n[e]) {
			case ".":
				t += " ", e++;
				continue;
			case "~": switch (n[++e]) {
				case "~":
					t += "~", e++;
					continue;
				case ".":
					t += ".", e++;
					continue;
				default:
					let r = 0;
					do
						r = r << 4 | Number.parseInt(n[e++], 16);
					while ("." !== n[e]);
					t += String.fromCodePoint(r), e++;
					continue;
			}
			default:
				t += n[e++];
				continue;
		}
		return t;
	}
	function Q(n) {
		return function(n) {
			if (0 === n.length) return 0n;
			if ("undefined" != typeof Buffer) return BigInt("0x" + Buffer.from(n.reverse()).toString("hex"));
			let t, e = [];
			for (var r = n.length - 1; r >= 0; --r) t = n[r], e.push(t < 16 ? "0" + t.toString(16) : t.toString(16));
			return BigInt("0x" + e.join(""));
		}(new TextEncoder().encode(n));
	}
	const V = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-~", W = "0123456789abcdefghijklmnopqrstuv";
	function X(n, t, e) {
		let r = 0n;
		const a = BigInt(n);
		for (; "" !== e;) "." !== e[0] && (r = (r << a) + BigInt(t.indexOf(e[0]))), e = e.slice(1);
		return r;
	}
	const Y = nn;
	function nn(n, t) {
		return tn({
			type: "dime",
			aura: n,
			atom: t
		});
	}
	function tn(n) {
		switch (n.type) {
			case "blob": return "~0" + n.jam.toString(32);
			case "many": return "." + n.list.reduce(((n, t) => n + "_" + tn(t).replaceAll("~", "~~").replaceAll("_", "~-")), "") + "__";
			case "dime": switch (n.aura[0]) {
				case "c": return n.atom < 127n ? "~-" + rn(String.fromCharCode(Number(n.atom))) : "~-~" + n.atom.toString(16) + ".";
				case "d": switch (n.aura[1]) {
					case "a": return function(n) {
						const { pos: t, year: e, month: r, time: i } = function(n) {
							const t = p(n), [e, r, i] = function(n) {
								let t = 0n, e = 0n, r = !1;
								t = n / l, (n %= l) < d + 1n ? r = !0 : (r = !1, e = 1n, e += (n -= d + 1n) / d, n %= d);
								let a = 400n * t + 100n * e, i = !0;
								for (; 1 == i;) {
									let t = r ? 366n : 365n;
									if (n < t) {
										i = !1;
										let e = 0n;
										for (;;) {
											let t = BigInt((r ? f : o)[Number(e)]);
											if (n < t) return [
												a,
												e + 1n,
												n + 1n
											];
											e += 1n, n -= t;
										}
									} else a += 1n, n -= t, r = a % 4n === 0n;
								}
								return [
									0n,
									0n,
									0n
								];
							}(t.day);
							t.day = i;
							const u = e > a;
							return {
								pos: u,
								year: u ? e - a : a + 1n - e,
								month: r,
								time: t
							};
						}(n);
						let u = `~${e}${t ? "" : "-"}.${r}.${i.day}`;
						return 0n === i.hour && 0n === i.minute && 0n === i.second && 0 === i.ms.length || (u += `..${i.hour.toString().padStart(2, "0")}.${i.minute.toString().padStart(2, "0")}.${i.second.toString().padStart(2, "0")}`, 0 !== i.ms.length && (u += `..${i.ms.map(((n) => n.toString(16).padStart(4, "0"))).join(".")}`)), u;
					}(n.atom);
					case "r": return function(n) {
						if (0n === n) return "~s0";
						const { day: t, hour: e, minute: r, second: a, ms: i } = p(n);
						let o = [];
						return 0n !== t && o.push("d" + t.toString()), 0n !== e && o.push("h" + e.toString()), 0n !== r && o.push("m" + r.toString()), 0n !== a && o.push("s" + a.toString()), 0 !== i.length && (0 === o.length && o.push("s0"), o.push("." + i.map(((n) => n.toString(16).padStart(4, "0"))).join("."))), "~" + o.join(".");
					}(n.atom);
					default: return en(n.atom);
				}
				case "f": switch (n.atom) {
					case 0n: return ".y";
					case 1n: return ".n";
					default: return en(n.atom);
				}
				case "n": return "~";
				case "i": switch (n.aura[1]) {
					case "f": return "." + fn(n.atom, 1, 4, 10);
					case "s": return "." + fn(n.atom, 2, 8, 16);
					default: return en(n.atom);
				}
				case "p": return $(n.atom);
				case "q": return function(n) {
					const t = n.toString(16), e = t.length, r = Buffer.from(t.padStart(e + e % 2, "0"), "hex"), a = r.length % 2 != 0 && r.length > 1 ? [[r[0]]].concat(_(Array.from(r.slice(1)), 2)) : _(Array.from(r), 2);
					return a.reduce(((n, t) => {
						return n + (".~" === n ? "" : "-") + ((e = t).length % 2 != 0 && a.length > 1 ? void 0 === (r = e)[1] ? E[r[0]] : C[r[0]] + E[r[1]] : ((n) => void 0 === n[1] ? E[n[0]] : C[n[0]] + E[n[1]])(e));
						var e, r;
					}), ".~");
				}(n.atom);
				case "r": switch (n.aura[1]) {
					case "d": return F("d", n.atom);
					case "h": return F("h", n.atom);
					case "q": return F("q", n.atom);
					case "s": return F("s", n.atom);
					default: return en(n.atom);
				}
				case "u": switch (n.aura[1]) {
					case "c": throw new Error("aura-js: @uc rendering unsupported");
					case "b": return "0b" + on(n.atom.toString(2), 4);
					case "i": return "0i" + n.atom.toString(10).padStart(1, "0");
					case "x": return "0x" + on(n.atom.toString(16), 4);
					case "v": return "0v" + on(n.atom.toString(32), 5);
					case "w": return "0w" + on(function(n, t, e) {
						if (0n === e) return t[0];
						let r = "";
						const a = BigInt(6);
						for (; 0n !== e;) r = t[Number(BigInt.asUintN(6, e))] + r, e >>= a;
						return r;
					}(0, an, n.atom), 5);
					default: return on(n.atom.toString(10), 3);
				}
				case "s":
					const t = 1n & n.atom;
					return n.atom = t + (n.atom >> 1n), n.aura = n.aura.replace("s", "u"), (0n === t ? "--" : "-") + tn(n);
				case "t": return "a" === n.aura[1] ? "s" === n.aura[2] ? un(n.atom) : "~." + un(n.atom) : "~~" + rn(un(n.atom));
				default: return en(n.atom);
			}
		}
	}
	function en(n) {
		return "0x" + function(n, t) {
			return t.toString(16).padStart(1, "0");
		}(0, n);
	}
	function rn(n) {
		let t = "";
		for (let e = 0; e < n.length; e += 1) {
			const r = n[e];
			let a = "";
			switch (r) {
				case " ":
					a = ".";
					break;
				case ".":
					a = "~.";
					break;
				case "~":
					a = "~~";
					break;
				default: {
					const t = n.codePointAt(e);
					if (!t) break;
					t > 65535 && (e += 1), a = t >= 97 && t <= 122 || t >= 48 && t <= 57 || "-" === r ? r : `~${t.toString(16)}.`;
				}
			}
			t += a;
		}
		return t;
	}
	const an = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-~";
	function on(n, t) {
		return n.replace(new RegExp(`(?=(?:.{${t}})+$)(?!^)`, "g"), ".");
	}
	function fn(n, t, e, r) {
		void 0 === r && (r = 10);
		let a = "";
		const i = 8n * BigInt(t), o = (1n << i) - 1n;
		for (; e-- > 0;) "" !== a && (a = "." + a), a = (n & o).toString(r) + a, n >>= i;
		return a;
	}
	function un(n) {
		return new TextDecoder("utf-8").decode(function(n) {
			if (0n === n) return new Uint8Array(0);
			const t = n.toString(16), e = t.length % 2 == 0 ? t : "0" + t, r = new Uint8Array(e.length / 2);
			for (let n = 0; n < e.length; n += 2) {
				const t = e.slice(n, n + 2), a = parseInt(t, 16) << 24 >> 24;
				r[n / 2] = a;
			}
			return r;
		}(n).reverse());
	}
	const sn = {
		toSeconds: function(n) {
			const { day: t, hour: e, minute: r, second: a } = p(n);
			return 60n * (60n * (24n * t + e) + r) + a;
		},
		fromSeconds: function(n) {
			return m({
				day: 0n,
				hour: 0n,
				minute: 0n,
				second: n,
				ms: []
			});
		}
	}, cn = {
		cite: function(n) {
			let t;
			return t = "bigint" == typeof n ? n : z(n), t <= 4294967295n ? $(t) : t <= 18446744073709551615n ? $(4294967295n & t).replace("-", "^") : $(BigInt("0x" + t.toString(16).slice(0, 4))) + "_" + $(65535n & t).slice(1);
		},
		sein: function(n) {
			let t;
			t = "bigint" == typeof n ? n : z(n);
			let e = A(t);
			const r = "czar" === e ? t : "king" === e ? 255n & t : "duke" === e ? 65535n & t : "earl" === e ? 4294967295n & t : 65535n & t;
			return "bigint" == typeof n ? r : $(r);
		},
		clan: A,
		kind: function(n) {
			return k(A(n));
		},
		rankToSize: k,
		sizeToRank: function(n) {
			switch (n) {
				case "galaxy": return "czar";
				case "star": return "king";
				case "planet": return "duke";
				case "moon": return "earl";
				case "comet": return "pawn";
			}
		}
	};
	exports.da = {
		toUnix: function(n) {
			return Math.round(Number(1000n * (r / 2000n + (n - e)) / r));
		},
		fromUnix: function(n) {
			return e + BigInt(n) * r / 1000n;
		}
	}, exports.dr = sn, exports.nuck = J, exports.p = cn, exports.parse = T, exports.rend = tn, exports.render = Y, exports.scot = nn, exports.slav = D, exports.slaw = H, exports.tryParse = G, exports.valid = function(n, t) {
		return null !== H(n, t);
	};
}));
//#endregion
//#region extensions/tlon/src/urbit/story.ts
var import_dist = (/* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = require_aura_cjs_production_min();
})))();
/**
* Parse inline markdown formatting (bold, italic, code, links, mentions)
*/
function parseInlineMarkdown(text) {
	const result = [];
	let remaining = text;
	while (remaining.length > 0) {
		const shipMatch = remaining.match(/^(~[a-z][-a-z0-9]*)/);
		if (shipMatch) {
			result.push({ ship: shipMatch[1] });
			remaining = remaining.slice(shipMatch[0].length);
			continue;
		}
		const boldMatch = remaining.match(/^\*\*(.+?)\*\*|^__(.+?)__/);
		if (boldMatch) {
			const content = boldMatch[1] || boldMatch[2];
			result.push({ bold: parseInlineMarkdown(content) });
			remaining = remaining.slice(boldMatch[0].length);
			continue;
		}
		const italicsMatch = remaining.match(/^\*([^*]+?)\*|^_([^_]+?)_(?![a-zA-Z0-9])/);
		if (italicsMatch) {
			const content = italicsMatch[1] || italicsMatch[2];
			result.push({ italics: parseInlineMarkdown(content) });
			remaining = remaining.slice(italicsMatch[0].length);
			continue;
		}
		const strikeMatch = remaining.match(/^~~(.+?)~~/);
		if (strikeMatch) {
			result.push({ strike: parseInlineMarkdown(strikeMatch[1]) });
			remaining = remaining.slice(strikeMatch[0].length);
			continue;
		}
		const codeMatch = remaining.match(/^`([^`]+)`/);
		if (codeMatch) {
			result.push({ "inline-code": codeMatch[1] });
			remaining = remaining.slice(codeMatch[0].length);
			continue;
		}
		const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
		if (linkMatch) {
			result.push({ link: {
				href: linkMatch[2],
				content: linkMatch[1]
			} });
			remaining = remaining.slice(linkMatch[0].length);
			continue;
		}
		const imageMatch = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
		if (imageMatch) {
			result.push({ __image: {
				src: imageMatch[2],
				alt: imageMatch[1]
			} });
			remaining = remaining.slice(imageMatch[0].length);
			continue;
		}
		const urlMatch = remaining.match(/^(https?:\/\/[^\s<>"\]]+)/);
		if (urlMatch) {
			result.push({ link: {
				href: urlMatch[1],
				content: urlMatch[1]
			} });
			remaining = remaining.slice(urlMatch[0].length);
			continue;
		}
		const plainMatch = remaining.match(/^[^*_`~[#~\n:/]+/);
		if (plainMatch) {
			result.push(plainMatch[0]);
			remaining = remaining.slice(plainMatch[0].length);
			continue;
		}
		result.push(remaining[0]);
		remaining = remaining.slice(1);
	}
	return mergeAdjacentStrings(result);
}
/**
* Merge adjacent string elements in an inline array
*/
function mergeAdjacentStrings(inlines) {
	const result = [];
	for (const item of inlines) if (typeof item === "string" && typeof result[result.length - 1] === "string") result[result.length - 1] = result[result.length - 1] + item;
	else result.push(item);
	return result;
}
/**
* Create an image block
*/
function createImageBlock(src, alt = "", height = 0, width = 0) {
	return { block: { image: {
		src,
		height,
		width,
		alt
	} } };
}
/**
* Check if URL looks like an image
*/
function isImageUrl(url) {
	return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(url);
}
/**
* Process inlines and extract any image markers into blocks
*/
function processInlinesForImages(inlines) {
	const cleanInlines = [];
	const imageBlocks = [];
	for (const inline of inlines) if (typeof inline === "object" && "__image" in inline) {
		const img = inline.__image;
		imageBlocks.push(createImageBlock(img.src, img.alt));
	} else cleanInlines.push(inline);
	return {
		inlines: cleanInlines,
		imageBlocks
	};
}
/**
* Convert markdown text to Tlon story format
*/
function markdownToStory(markdown) {
	const story = [];
	const lines = markdown.split("\n");
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (line.startsWith("```")) {
			const lang = line.slice(3).trim() || "plaintext";
			const codeLines = [];
			i++;
			while (i < lines.length && !lines[i].startsWith("```")) {
				codeLines.push(lines[i]);
				i++;
			}
			story.push({ block: { code: {
				code: codeLines.join("\n"),
				lang
			} } });
			i++;
			continue;
		}
		const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
		if (headerMatch) {
			const tag = `h${headerMatch[1].length}`;
			story.push({ block: { header: {
				tag,
				content: parseInlineMarkdown(headerMatch[2])
			} } });
			i++;
			continue;
		}
		if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
			story.push({ block: { rule: null } });
			i++;
			continue;
		}
		if (line.startsWith("> ")) {
			const quoteLines = [];
			while (i < lines.length && lines[i].startsWith("> ")) {
				quoteLines.push(lines[i].slice(2));
				i++;
			}
			const quoteText = quoteLines.join("\n");
			story.push({ inline: [{ blockquote: parseInlineMarkdown(quoteText) }] });
			continue;
		}
		if (line.trim() === "") {
			i++;
			continue;
		}
		const paragraphLines = [];
		while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("#") && !lines[i].startsWith("```") && !lines[i].startsWith("> ") && !/^(-{3,}|\*{3,})$/.test(lines[i].trim())) {
			paragraphLines.push(lines[i]);
			i++;
		}
		if (paragraphLines.length > 0) {
			const inlines = parseInlineMarkdown(paragraphLines.join("\n"));
			const withBreaks = [];
			for (const inline of inlines) if (typeof inline === "string" && inline.includes("\n")) {
				const parts = inline.split("\n");
				for (let j = 0; j < parts.length; j++) {
					if (parts[j]) withBreaks.push(parts[j]);
					if (j < parts.length - 1) withBreaks.push({ break: null });
				}
			} else withBreaks.push(inline);
			const { inlines: cleanInlines, imageBlocks } = processInlinesForImages(withBreaks);
			if (cleanInlines.length > 0) story.push({ inline: cleanInlines });
			story.push(...imageBlocks);
		}
	}
	return story;
}
//#endregion
//#region extensions/tlon/src/urbit/send.ts
async function sendDm({ api, fromShip, toShip, text }) {
	return sendDmWithStory({
		api,
		fromShip,
		toShip,
		story: markdownToStory(text)
	});
}
async function sendDmWithStory({ api, fromShip, toShip, story }) {
	const sentAt = Date.now();
	const id = `${fromShip}/${(0, import_dist.scot)("ud", import_dist.da.fromUnix(sentAt))}`;
	const action = {
		ship: toShip,
		diff: {
			id,
			delta: { add: {
				memo: {
					content: story,
					author: fromShip,
					sent: sentAt
				},
				kind: null,
				time: null
			} }
		}
	};
	await api.poke({
		app: "chat",
		mark: "chat-dm-action",
		json: action
	});
	return {
		channel: "tlon",
		messageId: id
	};
}
async function sendGroupMessage({ api, fromShip, hostShip, channelName, text, replyToId }) {
	return sendGroupMessageWithStory({
		api,
		fromShip,
		hostShip,
		channelName,
		story: markdownToStory(text),
		replyToId
	});
}
async function sendGroupMessageWithStory({ api, fromShip, hostShip, channelName, story, replyToId }) {
	const sentAt = Date.now();
	let formattedReplyId = replyToId;
	if (replyToId && /^\d+$/.test(replyToId)) try {
		formattedReplyId = (0, import_dist.scot)("ud", BigInt(replyToId));
	} catch {}
	const action = { channel: {
		nest: `chat/${hostShip}/${channelName}`,
		action: formattedReplyId ? { post: { reply: {
			id: formattedReplyId,
			action: { add: {
				content: story,
				author: fromShip,
				sent: sentAt
			} }
		} } } : { post: { add: {
			content: story,
			author: fromShip,
			sent: sentAt,
			kind: "/chat",
			blob: null,
			meta: null
		} } }
	} };
	await api.poke({
		app: "channels",
		mark: "channel-action-1",
		json: action
	});
	return {
		channel: "tlon",
		messageId: `${fromShip}/${sentAt}`
	};
}
/**
* Build a story with text and optional media (image)
*/
function buildMediaStory(text, mediaUrl) {
	const story = [];
	const cleanText = text?.trim() ?? "";
	const cleanUrl = mediaUrl?.trim() ?? "";
	if (cleanText) story.push(...markdownToStory(cleanText));
	if (cleanUrl && isImageUrl(cleanUrl)) story.push(createImageBlock(cleanUrl, ""));
	else if (cleanUrl) story.push({ inline: [{ link: {
		href: cleanUrl,
		content: cleanUrl
	} }] });
	return story.length > 0 ? story : [{ inline: [""] }];
}
//#endregion
//#region extensions/tlon/src/urbit/channel-ops.ts
async function putUrbitChannel(deps, params) {
	return await urbitFetch({
		baseUrl: deps.baseUrl,
		path: `/~/channel/${deps.channelId}`,
		init: {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				Cookie: deps.cookie
			},
			body: JSON.stringify(params.body)
		},
		ssrfPolicy: deps.ssrfPolicy,
		lookupFn: deps.lookupFn,
		fetchImpl: deps.fetchImpl,
		timeoutMs: 3e4,
		auditContext: params.auditContext
	});
}
async function pokeUrbitChannel(deps, params) {
	const pokeId = Date.now();
	const { response, release } = await putUrbitChannel(deps, {
		body: [{
			id: pokeId,
			action: "poke",
			ship: deps.ship,
			app: params.app,
			mark: params.mark,
			json: params.json
		}],
		auditContext: params.auditContext
	});
	try {
		if (!response.ok && response.status !== 204) {
			const errorText = await response.text().catch(() => "");
			throw new Error(`Poke failed: ${response.status}${errorText ? ` - ${errorText}` : ""}`);
		}
		return pokeId;
	} finally {
		await release();
	}
}
async function scryUrbitPath(deps, params) {
	const scryPath = `/~/scry${params.path}`;
	const { response, release } = await urbitFetch({
		baseUrl: deps.baseUrl,
		path: scryPath,
		init: {
			method: "GET",
			headers: { Cookie: deps.cookie }
		},
		ssrfPolicy: deps.ssrfPolicy,
		lookupFn: deps.lookupFn,
		fetchImpl: deps.fetchImpl,
		timeoutMs: 3e4,
		auditContext: params.auditContext
	});
	try {
		if (!response.ok) throw new Error(`Scry failed: ${response.status} for path ${params.path}`);
		return await response.json();
	} finally {
		await release();
	}
}
async function createUrbitChannel(deps, params) {
	const { response, release } = await putUrbitChannel(deps, params);
	try {
		if (!response.ok && response.status !== 204) throw new UrbitHttpError({
			operation: "Channel creation",
			status: response.status
		});
	} finally {
		await release();
	}
}
async function wakeUrbitChannel(deps) {
	const { response, release } = await putUrbitChannel(deps, {
		body: [{
			id: Date.now(),
			action: "poke",
			ship: deps.ship,
			app: "hood",
			mark: "helm-hi",
			json: "Opening API channel"
		}],
		auditContext: "tlon-urbit-channel-wake"
	});
	try {
		if (!response.ok && response.status !== 204) throw new UrbitHttpError({
			operation: "Channel activation",
			status: response.status
		});
	} finally {
		await release();
	}
}
async function ensureUrbitChannelOpen(deps, params) {
	await createUrbitChannel(deps, {
		body: params.createBody,
		auditContext: params.createAuditContext
	});
	await wakeUrbitChannel(deps);
}
//#endregion
//#region extensions/tlon/src/urbit/sse-client.ts
var UrbitSSEClient = class {
	constructor(url, cookie, options = {}) {
		this.subscriptions = [];
		this.eventHandlers = /* @__PURE__ */ new Map();
		this.aborted = false;
		this.streamController = null;
		this.reconnectAttempts = 0;
		this.isConnected = false;
		this.streamRelease = null;
		this.lastHeardEventId = -1;
		this.lastAcknowledgedEventId = -1;
		this.ackThreshold = 20;
		const ctx = getUrbitContext(url, options.ship);
		this.url = ctx.baseUrl;
		this.cookie = normalizeUrbitCookie(cookie);
		this.ship = ctx.ship;
		this.channelId = `${Math.floor(Date.now() / 1e3)}-${randomUUID()}`;
		this.channelUrl = new URL(`/~/channel/${this.channelId}`, this.url).toString();
		this.onReconnect = options.onReconnect ?? null;
		this.autoReconnect = options.autoReconnect !== false;
		this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
		this.reconnectDelay = options.reconnectDelay ?? 1e3;
		this.maxReconnectDelay = options.maxReconnectDelay ?? 3e4;
		this.logger = options.logger ?? {};
		this.ssrfPolicy = options.ssrfPolicy;
		this.lookupFn = options.lookupFn;
		this.fetchImpl = options.fetchImpl;
	}
	channelRequestContext() {
		return {
			baseUrl: this.url,
			cookie: this.cookie,
			ship: this.ship,
			channelId: this.channelId,
			ssrfPolicy: this.ssrfPolicy,
			lookupFn: this.lookupFn,
			fetchImpl: this.fetchImpl
		};
	}
	async subscribe(params) {
		const subId = this.subscriptions.length + 1;
		const subscription = {
			id: subId,
			action: "subscribe",
			ship: this.ship,
			app: params.app,
			path: params.path
		};
		this.subscriptions.push(subscription);
		this.eventHandlers.set(subId, {
			event: params.event,
			err: params.err,
			quit: params.quit
		});
		if (this.isConnected) try {
			await this.sendSubscription(subscription);
		} catch (error) {
			this.eventHandlers.get(subId)?.err?.(error);
		}
		return subId;
	}
	async sendSubscription(subscription) {
		const { response, release } = await this.putChannelPayload([subscription], {
			timeoutMs: 3e4,
			auditContext: "tlon-urbit-subscribe"
		});
		try {
			if (!response.ok && response.status !== 204) {
				const errorText = await response.text().catch(() => "");
				throw new Error(`Subscribe failed: ${response.status}${errorText ? ` - ${errorText}` : ""}`);
			}
		} finally {
			await release();
		}
	}
	async connect() {
		await ensureUrbitChannelOpen(this.channelRequestContext(), {
			createBody: this.subscriptions,
			createAuditContext: "tlon-urbit-channel-create"
		});
		await this.openStream();
		this.isConnected = true;
		this.reconnectAttempts = 0;
	}
	async openStream() {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 6e4);
		this.streamController = controller;
		const { response, release } = await urbitFetch({
			baseUrl: this.url,
			path: `/~/channel/${this.channelId}`,
			init: {
				method: "GET",
				headers: {
					Accept: "text/event-stream",
					Cookie: this.cookie
				}
			},
			ssrfPolicy: this.ssrfPolicy,
			lookupFn: this.lookupFn,
			fetchImpl: this.fetchImpl,
			signal: controller.signal,
			auditContext: "tlon-urbit-sse-stream"
		});
		this.streamRelease = release;
		clearTimeout(timeoutId);
		if (!response.ok) {
			await release();
			this.streamRelease = null;
			throw new Error(`Stream connection failed: ${response.status}`);
		}
		this.processStream(response.body).catch((error) => {
			if (!this.aborted) {
				this.logger.error?.(`Stream error: ${String(error)}`);
				for (const { err } of this.eventHandlers.values()) if (err) err(error);
			}
		});
	}
	async processStream(body) {
		if (!body) return;
		const stream = body instanceof ReadableStream ? Readable.fromWeb(body) : body;
		let buffer = "";
		try {
			for await (const chunk of stream) {
				if (this.aborted) break;
				buffer += chunk.toString();
				let eventEnd;
				while ((eventEnd = buffer.indexOf("\n\n")) !== -1) {
					const eventData = buffer.slice(0, eventEnd);
					buffer = buffer.slice(eventEnd + 2);
					this.processEvent(eventData);
				}
			}
		} finally {
			if (this.streamRelease) {
				const release = this.streamRelease;
				this.streamRelease = null;
				await release();
			}
			this.streamController = null;
			if (!this.aborted && this.autoReconnect) {
				this.isConnected = false;
				this.logger.log?.("[SSE] Stream ended, attempting reconnection...");
				await this.attemptReconnect();
			}
		}
	}
	processEvent(eventData) {
		const lines = eventData.split("\n");
		let data = null;
		let eventId = null;
		for (const line of lines) {
			if (line.startsWith("id: ")) eventId = Number.parseInt(line.slice(4), 10);
			if (line.startsWith("data: ")) data = line.slice(6);
		}
		if (!data) return;
		if (eventId !== null && !Number.isNaN(eventId)) {
			if (eventId > this.lastHeardEventId) {
				this.lastHeardEventId = eventId;
				if (eventId - this.lastAcknowledgedEventId > this.ackThreshold) {
					this.logger.log?.(`[SSE] Acking event ${eventId} (last acked: ${this.lastAcknowledgedEventId})`);
					this.ack(eventId).catch((err) => {
						this.logger.error?.(`Failed to ack event ${eventId}: ${String(err)}`);
					});
				}
			}
		}
		try {
			const parsed = JSON.parse(data);
			if (parsed.response === "quit") {
				if (parsed.id) {
					const handlers = this.eventHandlers.get(parsed.id);
					if (handlers?.quit) handlers.quit();
				}
				return;
			}
			if (parsed.id && this.eventHandlers.has(parsed.id)) {
				const { event } = this.eventHandlers.get(parsed.id) ?? {};
				if (event && parsed.json) event(parsed.json);
			} else if (parsed.json) {
				for (const { event } of this.eventHandlers.values()) if (event) event(parsed.json);
			}
		} catch (error) {
			this.logger.error?.(`Error parsing SSE event: ${String(error)}`);
		}
	}
	async poke(params) {
		return await pokeUrbitChannel(this.channelRequestContext(), {
			...params,
			auditContext: "tlon-urbit-poke"
		});
	}
	async scry(path) {
		return await scryUrbitPath({
			baseUrl: this.url,
			cookie: this.cookie,
			ssrfPolicy: this.ssrfPolicy,
			lookupFn: this.lookupFn,
			fetchImpl: this.fetchImpl
		}, {
			path,
			auditContext: "tlon-urbit-scry"
		});
	}
	/**
	* Update the cookie used for authentication.
	* Call this when re-authenticating after session expiry.
	*/
	updateCookie(newCookie) {
		this.cookie = normalizeUrbitCookie(newCookie);
	}
	async ack(eventId) {
		this.lastAcknowledgedEventId = eventId;
		const ackData = {
			id: Date.now(),
			action: "ack",
			"event-id": eventId
		};
		const { response, release } = await this.putChannelPayload([ackData], {
			timeoutMs: 1e4,
			auditContext: "tlon-urbit-ack"
		});
		try {
			if (!response.ok) throw new Error(`Ack failed with status ${response.status}`);
		} finally {
			await release();
		}
	}
	async attemptReconnect() {
		if (this.aborted || !this.autoReconnect) {
			this.logger.log?.("[SSE] Reconnection aborted or disabled");
			return;
		}
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			this.logger.log?.(`[SSE] Max reconnection attempts (${this.maxReconnectAttempts}) reached. Waiting 10s before resetting...`);
			const extendedBackoff = 1e4;
			await new Promise((resolve) => setTimeout(resolve, extendedBackoff));
			this.reconnectAttempts = 0;
			this.logger.log?.("[SSE] Reconnection attempts reset, resuming reconnection...");
		}
		this.reconnectAttempts += 1;
		const delay = Math.min(this.reconnectDelay * 2 ** (this.reconnectAttempts - 1), this.maxReconnectDelay);
		this.logger.log?.(`[SSE] Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`);
		await new Promise((resolve) => setTimeout(resolve, delay));
		try {
			this.channelId = `${Math.floor(Date.now() / 1e3)}-${randomUUID()}`;
			this.channelUrl = new URL(`/~/channel/${this.channelId}`, this.url).toString();
			if (this.onReconnect) await this.onReconnect(this);
			await this.connect();
			this.logger.log?.("[SSE] Reconnection successful!");
		} catch (error) {
			this.logger.error?.(`[SSE] Reconnection failed: ${String(error)}`);
			await this.attemptReconnect();
		}
	}
	async close() {
		this.aborted = true;
		this.isConnected = false;
		this.streamController?.abort();
		try {
			const unsubscribes = this.subscriptions.map((sub) => ({
				id: sub.id,
				action: "unsubscribe",
				subscription: sub.id
			}));
			{
				const { response, release } = await this.putChannelPayload(unsubscribes, {
					timeoutMs: 3e4,
					auditContext: "tlon-urbit-unsubscribe"
				});
				try {
					response.body?.cancel();
				} finally {
					await release();
				}
			}
			{
				const { response, release } = await urbitFetch({
					baseUrl: this.url,
					path: `/~/channel/${this.channelId}`,
					init: {
						method: "DELETE",
						headers: { Cookie: this.cookie }
					},
					ssrfPolicy: this.ssrfPolicy,
					lookupFn: this.lookupFn,
					fetchImpl: this.fetchImpl,
					timeoutMs: 3e4,
					auditContext: "tlon-urbit-channel-close"
				});
				try {
					response.body?.cancel();
				} finally {
					await release();
				}
			}
		} catch (error) {
			this.logger.error?.(`Error closing channel: ${String(error)}`);
		}
		if (this.streamRelease) {
			const release = this.streamRelease;
			this.streamRelease = null;
			await release();
		}
	}
	async putChannelPayload(payload, params) {
		return await urbitFetch({
			baseUrl: this.url,
			path: `/~/channel/${this.channelId}`,
			init: {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					Cookie: this.cookie
				},
				body: JSON.stringify(payload)
			},
			ssrfPolicy: this.ssrfPolicy,
			lookupFn: this.lookupFn,
			fetchImpl: this.fetchImpl,
			timeoutMs: params.timeoutMs,
			auditContext: params.auditContext
		});
	}
};
//#endregion
//#region extensions/tlon/src/monitor/approval.ts
/**
* Approval system for managing DM, channel mention, and group invite approvals.
*
* When an unknown ship tries to interact with the bot, the owner receives
* a notification and can approve or deny the request.
*/
function normalizeLowercaseStringOrEmpty(value) {
	return typeof value === "string" ? value.trim().toLowerCase() : "";
}
/**
* Generate a unique approval ID in the format: {type}-{timestamp}-{shortHash}
*/
function generateApprovalId(type) {
	return `${type}-${Date.now()}-${randomBytes(3).toString("hex")}`;
}
/**
* Create a pending approval object.
*/
function createPendingApproval(params) {
	return {
		id: generateApprovalId(params.type),
		type: params.type,
		requestingShip: params.requestingShip,
		channelNest: params.channelNest,
		groupFlag: params.groupFlag,
		messagePreview: params.messagePreview,
		originalMessage: params.originalMessage,
		timestamp: Date.now()
	};
}
/**
* Truncate text to a maximum length with ellipsis.
*/
function truncate(text, maxLength) {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength - 3) + "...";
}
/**
* Format a notification message for the owner about a pending approval.
*/
function formatApprovalRequest(approval) {
	const preview = approval.messagePreview ? `\n"${truncate(approval.messagePreview, 100)}"` : "";
	switch (approval.type) {
		case "dm": return `New DM request from ${approval.requestingShip}:${preview}\n\nReply "approve", "deny", or "block" (ID: ${approval.id})`;
		case "channel": return `${approval.requestingShip} mentioned you in ${approval.channelNest}:${preview}\n\nReply "approve", "deny", or "block"\n(ID: ${approval.id})`;
		case "group": return `Group invite from ${approval.requestingShip} to join ${approval.groupFlag}\n\nReply "approve", "deny", or "block"\n(ID: ${approval.id})`;
	}
	throw new Error("Unsupported approval type");
}
/**
* Parse an owner's response to an approval request.
* Supports formats:
*   - "approve" / "deny" / "block" (applies to most recent pending)
*   - "approve dm-1234567890-abc" / "deny dm-1234567890-abc" (specific ID)
*   - "block" permanently blocks the ship via Tlon's native blocking
*/
function parseApprovalResponse(text) {
	const match = normalizeLowercaseStringOrEmpty(text).match(/^(approve|deny|block)(?:\s+(.+))?$/);
	if (!match) return null;
	return {
		action: match[1],
		id: match[2]?.trim()
	};
}
/**
* Check if a message text looks like an approval response.
* Used to determine if we should intercept the message before normal processing.
*/
function isApprovalResponse(text) {
	const trimmed = normalizeLowercaseStringOrEmpty(text);
	return trimmed.startsWith("approve") || trimmed.startsWith("deny") || trimmed.startsWith("block");
}
/**
* Find a pending approval by ID, or return the most recent if no ID specified.
*/
function findPendingApproval(pendingApprovals, id) {
	if (id) return pendingApprovals.find((a) => a.id === id);
	return pendingApprovals[pendingApprovals.length - 1];
}
/**
* Remove a pending approval from the list by ID.
*/
function removePendingApproval(pendingApprovals, id) {
	return pendingApprovals.filter((a) => a.id !== id);
}
/**
* Format a confirmation message after an approval action.
*/
function formatApprovalConfirmation(approval, action) {
	if (action === "block") return `Blocked ${approval.requestingShip}. They will no longer be able to contact the bot.`;
	const actionText = action === "approve" ? "Approved" : "Denied";
	switch (approval.type) {
		case "dm":
			if (action === "approve") return `${actionText} DM access for ${approval.requestingShip}. They can now message the bot.`;
			return `${actionText} DM request from ${approval.requestingShip}.`;
		case "channel":
			if (action === "approve") return `${actionText} ${approval.requestingShip} for ${approval.channelNest}. They can now interact in this channel.`;
			return `${actionText} ${approval.requestingShip} for ${approval.channelNest}.`;
		case "group":
			if (action === "approve") return `${actionText} group invite from ${approval.requestingShip} to ${approval.groupFlag}. Joining group...`;
			return `${actionText} group invite from ${approval.requestingShip} to ${approval.groupFlag}.`;
	}
	throw new Error("Unsupported approval type");
}
/**
* Parse an admin command from owner message.
* Supports:
*   - "unblock ~ship" - unblock a specific ship
*   - "blocked" - list all blocked ships
*   - "pending" - list all pending approvals
*/
function parseAdminCommand(text) {
	const trimmed = normalizeLowercaseStringOrEmpty(text);
	if (trimmed === "blocked") return { type: "blocked" };
	if (trimmed === "pending") return { type: "pending" };
	const unblockMatch = trimmed.match(/^unblock\s+(~[\w-]+)$/);
	if (unblockMatch) return {
		type: "unblock",
		ship: unblockMatch[1]
	};
	return null;
}
/**
* Check if a message text looks like an admin command.
*/
function isAdminCommand(text) {
	return parseAdminCommand(text) !== null;
}
/**
* Format the list of blocked ships for display to owner.
*/
function formatBlockedList(ships) {
	if (ships.length === 0) return "No ships are currently blocked.";
	return `Blocked ships (${ships.length}):\n${ships.map((s) => `• ${s}`).join("\n")}`;
}
/**
* Format the list of pending approvals for display to owner.
*/
function formatPendingList(approvals) {
	if (approvals.length === 0) return "No pending approval requests.";
	return `Pending approvals (${approvals.length}):\n${approvals.map((a) => `• ${a.id}: ${a.type} from ${a.requestingShip}`).join("\n")}`;
}
//#endregion
//#region extensions/tlon/src/monitor/approval-runtime.ts
function createTlonApprovalRuntime(params) {
	const { api, runtime, botShipName, getPendingApprovals, setPendingApprovals, getCurrentSettings, setCurrentSettings, getEffectiveDmAllowlist, setEffectiveDmAllowlist, getEffectiveOwnerShip, processApprovedMessage, refreshWatchedChannels } = params;
	const savePendingApprovals = async () => {
		try {
			await api.poke({
				app: "settings",
				mark: "settings-event",
				json: { "put-entry": {
					desk: "moltbot",
					"bucket-key": "tlon",
					"entry-key": "pendingApprovals",
					value: JSON.stringify(getPendingApprovals())
				} }
			});
		} catch (err) {
			runtime.error?.(`[tlon] Failed to save pending approvals: ${String(err)}`);
		}
	};
	const addToDmAllowlist = async (ship) => {
		const normalizedShip = normalizeShip(ship);
		const nextAllowlist = getEffectiveDmAllowlist().includes(normalizedShip) ? getEffectiveDmAllowlist() : [...getEffectiveDmAllowlist(), normalizedShip];
		setEffectiveDmAllowlist(nextAllowlist);
		try {
			await api.poke({
				app: "settings",
				mark: "settings-event",
				json: { "put-entry": {
					desk: "moltbot",
					"bucket-key": "tlon",
					"entry-key": "dmAllowlist",
					value: nextAllowlist
				} }
			});
			runtime.log?.(`[tlon] Added ${normalizedShip} to dmAllowlist`);
		} catch (err) {
			runtime.error?.(`[tlon] Failed to update dmAllowlist: ${String(err)}`);
		}
	};
	const addToChannelAllowlist = async (ship, channelNest) => {
		const normalizedShip = normalizeShip(ship);
		const currentSettings = getCurrentSettings();
		const channelRules = currentSettings.channelRules ?? {};
		const rule = channelRules[channelNest] ?? {
			mode: "restricted",
			allowedShips: []
		};
		const allowedShips = [...rule.allowedShips ?? []];
		if (!allowedShips.includes(normalizedShip)) allowedShips.push(normalizedShip);
		const updatedRules = {
			...channelRules,
			[channelNest]: {
				...rule,
				allowedShips
			}
		};
		setCurrentSettings({
			...currentSettings,
			channelRules: updatedRules
		});
		try {
			await api.poke({
				app: "settings",
				mark: "settings-event",
				json: { "put-entry": {
					desk: "moltbot",
					"bucket-key": "tlon",
					"entry-key": "channelRules",
					value: JSON.stringify(updatedRules)
				} }
			});
			runtime.log?.(`[tlon] Added ${normalizedShip} to ${channelNest} allowlist`);
		} catch (err) {
			runtime.error?.(`[tlon] Failed to update channelRules: ${String(err)}`);
		}
	};
	const blockShip = async (ship) => {
		const normalizedShip = normalizeShip(ship);
		try {
			await api.poke({
				app: "chat",
				mark: "chat-block-ship",
				json: { ship: normalizedShip }
			});
			runtime.log?.(`[tlon] Blocked ship ${normalizedShip}`);
		} catch (err) {
			runtime.error?.(`[tlon] Failed to block ship ${normalizedShip}: ${String(err)}`);
		}
	};
	const isShipBlocked = async (ship) => {
		const normalizedShip = normalizeShip(ship);
		try {
			const blocked = await api.scry("/chat/blocked.json");
			return Array.isArray(blocked) && blocked.some((item) => normalizeShip(item) === normalizedShip);
		} catch (err) {
			runtime.log?.(`[tlon] Failed to check blocked list: ${String(err)}`);
			return false;
		}
	};
	const getBlockedShips = async () => {
		try {
			const blocked = await api.scry("/chat/blocked.json");
			return Array.isArray(blocked) ? blocked : [];
		} catch (err) {
			runtime.log?.(`[tlon] Failed to get blocked list: ${String(err)}`);
			return [];
		}
	};
	const unblockShip = async (ship) => {
		const normalizedShip = normalizeShip(ship);
		try {
			await api.poke({
				app: "chat",
				mark: "chat-unblock-ship",
				json: { ship: normalizedShip }
			});
			runtime.log?.(`[tlon] Unblocked ship ${normalizedShip}`);
			return true;
		} catch (err) {
			runtime.error?.(`[tlon] Failed to unblock ship ${normalizedShip}: ${String(err)}`);
			return false;
		}
	};
	const sendOwnerNotification = async (message) => {
		const ownerShip = getEffectiveOwnerShip();
		if (!ownerShip) {
			runtime.log?.("[tlon] No ownerShip configured, cannot send notification");
			return;
		}
		try {
			await sendDm({
				api,
				fromShip: botShipName,
				toShip: ownerShip,
				text: message
			});
			runtime.log?.(`[tlon] Sent notification to owner ${ownerShip}`);
		} catch (err) {
			runtime.error?.(`[tlon] Failed to send notification to owner: ${String(err)}`);
		}
	};
	const queueApprovalRequest = async (approval) => {
		if (await isShipBlocked(approval.requestingShip)) {
			runtime.log?.(`[tlon] Ignoring request from blocked ship ${approval.requestingShip}`);
			return;
		}
		const approvals = getPendingApprovals();
		const existingIndex = approvals.findIndex((item) => item.type === approval.type && item.requestingShip === approval.requestingShip && (approval.type !== "channel" || item.channelNest === approval.channelNest) && (approval.type !== "group" || item.groupFlag === approval.groupFlag));
		if (existingIndex !== -1) {
			const existing = approvals[existingIndex];
			if (approval.originalMessage) {
				existing.originalMessage = approval.originalMessage;
				existing.messagePreview = approval.messagePreview;
			}
			runtime.log?.(`[tlon] Updated existing approval for ${approval.requestingShip} (${approval.type}) - re-sending notification`);
			await savePendingApprovals();
			await sendOwnerNotification(formatApprovalRequest(existing));
			return;
		}
		setPendingApprovals([...approvals, approval]);
		await savePendingApprovals();
		await sendOwnerNotification(formatApprovalRequest(approval));
		runtime.log?.(`[tlon] Queued approval request: ${approval.id} (${approval.type} from ${approval.requestingShip})`);
	};
	const handleApprovalResponse = async (text) => {
		const parsed = parseApprovalResponse(text);
		if (!parsed) return false;
		const approval = findPendingApproval(getPendingApprovals(), parsed.id);
		if (!approval) {
			await sendOwnerNotification(`No pending approval found${parsed.id ? ` for ID: ${parsed.id}` : ""}`);
			return true;
		}
		if (parsed.action === "approve") {
			switch (approval.type) {
				case "dm":
					await addToDmAllowlist(approval.requestingShip);
					if (approval.originalMessage) {
						runtime.log?.(`[tlon] Processing original message from ${approval.requestingShip} after approval`);
						await processApprovedMessage(approval);
					}
					break;
				case "channel":
					if (approval.channelNest) {
						await addToChannelAllowlist(approval.requestingShip, approval.channelNest);
						if (approval.originalMessage) {
							runtime.log?.(`[tlon] Processing original message from ${approval.requestingShip} in ${approval.channelNest} after approval`);
							await processApprovedMessage(approval);
						}
					}
					break;
				case "group":
					if (approval.groupFlag) try {
						await api.poke({
							app: "groups",
							mark: "group-join",
							json: {
								flag: approval.groupFlag,
								"join-all": true
							}
						});
						runtime.log?.(`[tlon] Joined group ${approval.groupFlag} after approval`);
						setTimeout(() => {
							(async () => {
								try {
									const newCount = await refreshWatchedChannels();
									if (newCount > 0) runtime.log?.(`[tlon] Discovered ${newCount} new channel(s) after joining group`);
								} catch (err) {
									runtime.log?.(`[tlon] Channel discovery after group join failed: ${String(err)}`);
								}
							})();
						}, 2e3);
					} catch (err) {
						runtime.error?.(`[tlon] Failed to join group ${approval.groupFlag}: ${String(err)}`);
					}
					break;
			}
			await sendOwnerNotification(formatApprovalConfirmation(approval, "approve"));
		} else if (parsed.action === "block") {
			await blockShip(approval.requestingShip);
			await sendOwnerNotification(formatApprovalConfirmation(approval, "block"));
		} else await sendOwnerNotification(formatApprovalConfirmation(approval, "deny"));
		setPendingApprovals(removePendingApproval(getPendingApprovals(), approval.id));
		await savePendingApprovals();
		return true;
	};
	const handleAdminCommand = async (text) => {
		const command = parseAdminCommand(text);
		if (!command) return false;
		switch (command.type) {
			case "blocked": {
				const blockedShips = await getBlockedShips();
				await sendOwnerNotification(formatBlockedList(blockedShips));
				runtime.log?.(`[tlon] Owner requested blocked ships list (${blockedShips.length} ships)`);
				return true;
			}
			case "pending":
				await sendOwnerNotification(formatPendingList(getPendingApprovals()));
				runtime.log?.(`[tlon] Owner requested pending approvals list (${getPendingApprovals().length} pending)`);
				return true;
			case "unblock": {
				const shipToUnblock = command.ship;
				if (!await isShipBlocked(shipToUnblock)) {
					await sendOwnerNotification(`${shipToUnblock} is not blocked.`);
					return true;
				}
				await sendOwnerNotification(await unblockShip(shipToUnblock) ? `Unblocked ${shipToUnblock}.` : `Failed to unblock ${shipToUnblock}.`);
				return true;
			}
		}
		throw new Error("Unsupported Tlon admin command");
	};
	return {
		queueApprovalRequest,
		handleApprovalResponse,
		handleAdminCommand
	};
}
//#endregion
//#region extensions/tlon/src/monitor/authorization.ts
function resolveChannelAuthorization(cfg, channelNest, settings) {
	const tlonConfig = cfg.channels?.tlon;
	const fileRules = tlonConfig?.authorization?.channelRules ?? {};
	const rule = (settings?.channelRules ?? {})[channelNest] ?? fileRules[channelNest];
	const defaultShips = settings?.defaultAuthorizedShips ?? tlonConfig?.defaultAuthorizedShips ?? [];
	return {
		mode: rule?.mode ?? "restricted",
		allowedShips: rule?.allowedShips ?? defaultShips
	};
}
//#endregion
//#region extensions/tlon/src/monitor/utils.ts
function extractCites(content) {
	if (!content || !Array.isArray(content)) return [];
	const cites = [];
	for (const verse of content) if (verse?.block?.cite && typeof verse.block.cite === "object") {
		const cite = verse.block.cite;
		if (cite.chan && typeof cite.chan === "object") {
			const { nest, where } = cite.chan;
			const whereMatch = where?.match(/\/msg\/(~[a-z-]+)\/(.+)/);
			cites.push({
				type: "chan",
				nest,
				where,
				author: whereMatch?.[1],
				postId: whereMatch?.[2]
			});
		} else if (cite.group && typeof cite.group === "string") cites.push({
			type: "group",
			group: cite.group
		});
		else if (cite.desk && typeof cite.desk === "object") cites.push({
			type: "desk",
			flag: cite.desk.flag,
			where: cite.desk.where
		});
		else if (cite.bait && typeof cite.bait === "object") cites.push({
			type: "bait",
			group: cite.bait.group,
			nest: cite.bait.graph,
			where: cite.bait.where
		});
	}
	return cites;
}
function formatModelName(modelString) {
	if (!modelString) return "AI";
	const modelName = modelString.includes("/") ? modelString.split("/")[1] : modelString;
	const modelMappings = {
		"claude-opus-4-5": "Claude Opus 4.5",
		"claude-sonnet-4-5": "Claude Sonnet 4.5",
		"claude-sonnet-3-5": "Claude Sonnet 3.5",
		"gpt-4o": "GPT-4o",
		"gpt-4-turbo": "GPT-4 Turbo",
		"gpt-4": "GPT-4",
		"gemini-2.0-flash": "Gemini 2.0 Flash",
		"gemini-pro": "Gemini Pro"
	};
	if (modelMappings[modelName]) return modelMappings[modelName];
	return modelName.replace(/-/g, " ").split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
function isBotMentioned(messageText, botShipName, nickname) {
	if (!messageText || !botShipName) return false;
	if (/@all\b/i.test(messageText)) return true;
	const escapedShip = normalizeShip(botShipName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	if (new RegExp(`(^|\\s)${escapedShip}(?=\\s|$)`, "i").test(messageText)) return true;
	if (nickname) {
		const escapedNickname = nickname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		if (new RegExp(`(^|\\s)${escapedNickname}(?=\\s|$|[,!?.])`, "i").test(messageText)) return true;
	}
	return false;
}
/**
* Strip bot ship mention from message text for command detection.
* "~bot-ship /status" → "/status"
*/
function stripBotMention(messageText, botShipName) {
	if (!messageText || !botShipName) return messageText;
	return messageText.replace(normalizeShip(botShipName), "").trim();
}
function isDmAllowed(senderShip, allowlist) {
	if (!allowlist || allowlist.length === 0) return false;
	const normalizedSender = normalizeShip(senderShip);
	return allowlist.map((ship) => normalizeShip(ship)).some((ship) => ship === normalizedSender);
}
/**
* Check if a group invite from a ship should be auto-accepted.
*
* SECURITY: Fail-safe to deny. If allowlist is empty or undefined,
* ALL invites are rejected - even if autoAcceptGroupInvites is enabled.
* This prevents misconfigured bots from accepting malicious invites.
*/
function isGroupInviteAllowed(inviterShip, allowlist) {
	if (!allowlist || allowlist.length === 0) return false;
	const normalizedInviter = normalizeShip(inviterShip);
	return allowlist.map((ship) => normalizeShip(ship)).some((ship) => ship === normalizedInviter);
}
/**
* Resolve quoted/cited content only after the caller has passed authorization.
* Unauthorized paths must keep raw text and must not trigger cross-channel cite fetches.
*/
async function resolveAuthorizedMessageText(params) {
	const { rawText, content, authorizedForCites, resolveAllCites } = params;
	if (!authorizedForCites) return rawText;
	return await resolveAllCites(content) + rawText;
}
const asRecord = asNullableObjectRecord;
const formatErrorMessage = formatErrorMessage$1;
const readString = readStringField;
function asNullableObjectRecord(value) {
	return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function readStringField(record, field) {
	const value = record?.[field];
	return typeof value === "string" ? value : void 0;
}
function renderInlineItem(item, options) {
	if (typeof item === "string") return item;
	const record = asRecord(item);
	if (!record) return "";
	const ship = readString(record, "ship");
	if (ship) return ship;
	if ("sect" in record) {
		const sect = record.sect;
		if (typeof sect === "string") return `@${sect || "all"}`;
		if (sect === null) return "@all";
	}
	if (options?.allowBreak && "break" in record) return "\n";
	const inlineCode = readString(record, "inline-code");
	if (inlineCode) return `\`${inlineCode}\``;
	const code = readString(record, "code");
	if (code) return `\`${code}\``;
	const link = asRecord(record.link);
	const linkHref = link ? readString(link, "href") : void 0;
	if (link && linkHref) {
		const linkContent = readString(link, "content");
		return options?.linkMode === "href" ? linkHref : linkContent || linkHref;
	}
	if (Array.isArray(record.bold)) return `**${extractInlineText(record.bold)}**`;
	if (Array.isArray(record.italics)) return `*${extractInlineText(record.italics)}*`;
	if (Array.isArray(record.strike)) return `~~${extractInlineText(record.strike)}~~`;
	if (options?.allowBlockquote && Array.isArray(record.blockquote)) return `> ${extractInlineText(record.blockquote)}`;
	return "";
}
function extractInlineText(items) {
	return items.map((item) => renderInlineItem(item)).join("");
}
function extractMessageText(content) {
	if (!content || !Array.isArray(content)) return "";
	return content.map((verse) => {
		const verseRecord = asRecord(verse);
		if (!verseRecord) return "";
		if (Array.isArray(verseRecord.inline)) return verseRecord.inline.map((item) => renderInlineItem(item, {
			linkMode: "href",
			allowBreak: true,
			allowBlockquote: true
		})).join("");
		const block = asRecord(verseRecord.block);
		if (block) {
			const image = asRecord(block.image);
			if (image) {
				const imageSrc = readString(image, "src");
				if (imageSrc) {
					const altText = readString(image, "alt");
					return `\n${imageSrc}${altText ? ` (${altText})` : ""}\n`;
				}
			}
			const codeBlock = asRecord(block.code);
			if (codeBlock) return `\n\`\`\`${readString(codeBlock, "lang") ?? ""}\n${readString(codeBlock, "code") ?? ""}\n\`\`\`\n`;
			const header = asRecord(block.header);
			if (header) return `\n## ${(Array.isArray(header.content) ? header.content : []).map((item) => typeof item === "string" ? item : "").join("") || ""}\n`;
			const cite = asRecord(block.cite);
			if (cite) {
				const chanCite = asRecord(cite.chan);
				if (chanCite) {
					const nest = readString(chanCite, "nest");
					const whereMatch = readString(chanCite, "where")?.match(/\/msg\/(~[a-z-]+)\/(.+)/);
					if (whereMatch) {
						const [, author, _postId] = whereMatch;
						return `\n> [quoted: ${author} in ${nest}]\n`;
					}
					return `\n> [quoted from ${nest}]\n`;
				}
				const group = readString(cite, "group");
				if (group) return `\n> [ref: group ${group}]\n`;
				const desk = asRecord(cite.desk);
				if (desk) {
					const flag = readString(desk, "flag");
					if (flag) return `\n> [ref: ${flag}]\n`;
				}
				const bait = asRecord(cite.bait);
				if (bait) {
					const graph = readString(bait, "graph");
					const groupName = readString(bait, "group");
					if (graph && groupName) return `\n> [ref: ${graph} in ${groupName}]\n`;
				}
				return `\n> [quoted message]\n`;
			}
		}
		return "";
	}).join("\n").trim();
}
function isSummarizationRequest(messageText) {
	return [
		/summarize\s+(this\s+)?(channel|chat|conversation)/i,
		/what\s+did\s+i\s+miss/i,
		/catch\s+me\s+up/i,
		/channel\s+summary/i,
		/tldr/i
	].some((pattern) => pattern.test(messageText));
}
//#endregion
//#region extensions/tlon/src/monitor/cites.ts
function createTlonCitationResolver(params) {
	const { api, runtime } = params;
	const resolveCiteContent = async (cite) => {
		if (cite.type !== "chan" || !cite.nest || !cite.postId) return null;
		try {
			const scryPath = `/channels/v4/${cite.nest}/posts/post/${cite.postId}.json`;
			runtime.log?.(`[tlon] Fetching cited post: ${scryPath}`);
			const essay = asRecord(asRecord(await api.scry(scryPath))?.essay);
			if (essay?.content) return extractMessageText(essay.content) || null;
			return null;
		} catch (err) {
			runtime.log?.(`[tlon] Failed to fetch cited post: ${String(err)}`);
			return null;
		}
	};
	const resolveAllCites = async (content) => {
		const cites = extractCites(content);
		if (cites.length === 0) return "";
		const resolved = [];
		for (const cite of cites) {
			const text = await resolveCiteContent(cite);
			if (text) resolved.push(`> ${cite.author || "unknown"} wrote: ${text}`);
		}
		return resolved.length > 0 ? `${resolved.join("\n")}\n\n` : "";
	};
	return {
		resolveCiteContent,
		resolveAllCites
	};
}
//#endregion
//#region extensions/tlon/src/monitor/discovery.ts
/**
* Fetch groups-ui init data, returning channels and foreigns.
* This is a single scry that provides both channel discovery and pending invites.
*/
async function fetchInitData(api, runtime) {
	try {
		runtime.log?.("[tlon] Fetching groups-ui init data...");
		const initData = asRecord(await api.scry("/groups-ui/v6/init.json"));
		const channels = [];
		const groups = asRecord(initData?.groups);
		if (groups) for (const groupData of Object.values(groups)) {
			const groupChannels = asRecord(asRecord(groupData)?.channels);
			if (groupChannels) {
				for (const channelNest of Object.keys(groupChannels)) if (channelNest.startsWith("chat/")) channels.push(channelNest);
			}
		}
		if (channels.length > 0) runtime.log?.(`[tlon] Auto-discovered ${channels.length} chat channel(s)`);
		else runtime.log?.("[tlon] No chat channels found via auto-discovery");
		const foreignsValue = asRecord(initData?.foreigns);
		const foreigns = foreignsValue ? foreignsValue : null;
		if (foreigns) {
			const pendingCount = Object.values(foreigns).filter((f) => f.invites?.some((i) => i.valid)).length;
			if (pendingCount > 0) runtime.log?.(`[tlon] Found ${pendingCount} pending group invite(s)`);
		}
		return {
			channels,
			foreigns
		};
	} catch (error) {
		runtime.log?.(`[tlon] Init data fetch failed: ${formatErrorMessage(error)}`);
		return {
			channels: [],
			foreigns: null
		};
	}
}
async function fetchAllChannels(api, runtime) {
	const { channels } = await fetchInitData(api, runtime);
	return channels;
}
//#endregion
//#region extensions/tlon/src/monitor/history.ts
/**
* Format a number as @ud (with dots every 3 digits from the right)
* e.g., 170141184507799509469114119040828178432 -> 170.141.184.507.799.509.469.114.119.040.828.178.432
*/
function formatUd(id) {
	const reversed = String(id).replace(/\./g, "").split("").toReversed();
	const chunks = [];
	for (let i = 0; i < reversed.length; i += 3) chunks.push(reversed.slice(i, i + 3).toReversed().join(""));
	return chunks.toReversed().join(".");
}
function createHistoryEntryFromMemo(params) {
	const { memo, seal, fallbackId } = params;
	return {
		author: typeof memo?.author === "string" ? memo.author : "unknown",
		content: extractMessageText(memo?.content || []),
		timestamp: typeof memo?.sent === "number" ? memo.sent : Date.now(),
		id: typeof seal?.id === "string" ? seal.id : typeof fallbackId === "string" ? fallbackId : void 0
	};
}
const messageCache = /* @__PURE__ */ new Map();
const MAX_CACHED_MESSAGES = 100;
function cacheMessage(channelNest, message) {
	if (!messageCache.has(channelNest)) messageCache.set(channelNest, []);
	const cache = messageCache.get(channelNest);
	if (!cache) return;
	cache.unshift(message);
	if (cache.length > MAX_CACHED_MESSAGES) cache.pop();
}
async function fetchChannelHistory(api, channelNest, count = 50, runtime) {
	try {
		const scryPath = `/channels/v4/${channelNest}/posts/newest/${count}/outline.json`;
		runtime?.log?.(`[tlon] Fetching history: ${scryPath}`);
		const data = await api.scry(scryPath);
		if (!data) return [];
		let posts = [];
		if (Array.isArray(data)) posts = data;
		else {
			const dataRecord = asRecord(data);
			const postMap = asRecord(dataRecord?.posts);
			if (postMap) posts = Object.values(postMap);
			else if (dataRecord) posts = Object.values(dataRecord);
		}
		const messages = posts.map((item) => {
			const itemRecord = asRecord(item);
			const replyPostSet = asRecord(asRecord(itemRecord?.["r-post"])?.set);
			const essay = asRecord(itemRecord?.essay) ?? asRecord(replyPostSet?.essay);
			const seal = asRecord(itemRecord?.seal) ?? asRecord(replyPostSet?.seal);
			return {
				author: typeof essay?.author === "string" ? essay.author : "unknown",
				content: extractMessageText(essay?.content || []),
				timestamp: typeof essay?.sent === "number" ? essay.sent : Date.now(),
				id: typeof seal?.id === "string" ? seal.id : void 0
			};
		}).filter((msg) => msg.content);
		runtime?.log?.(`[tlon] Extracted ${messages.length} messages from history`);
		return messages;
	} catch (error) {
		runtime?.log?.(`[tlon] Error fetching channel history: ${formatErrorMessage(error)}`);
		return [];
	}
}
async function getChannelHistory(api, channelNest, count = 50, runtime) {
	const cache = messageCache.get(channelNest) ?? [];
	if (cache.length >= count) {
		runtime?.log?.(`[tlon] Using cached messages (${cache.length} available)`);
		return cache.slice(0, count);
	}
	runtime?.log?.(`[tlon] Cache has ${cache.length} messages, need ${count}, fetching from scry...`);
	return await fetchChannelHistory(api, channelNest, count, runtime);
}
/**
* Fetch thread/reply history for a specific parent post.
* Used to get context when entering a thread conversation.
*/
async function fetchThreadHistory(api, channelNest, parentId, count = 50, runtime) {
	try {
		const formattedParentId = formatUd(parentId);
		runtime?.log?.(`[tlon] Thread history - parentId: ${parentId} -> formatted: ${formattedParentId}`);
		const scryPath = `/channels/v4/${channelNest}/posts/post/id/${formattedParentId}/replies/newest/${count}.json`;
		runtime?.log?.(`[tlon] Fetching thread history: ${scryPath}`);
		const data = await api.scry(scryPath);
		if (!data) {
			runtime?.log?.(`[tlon] No thread history data returned`);
			return [];
		}
		let replies = [];
		if (Array.isArray(data)) replies = data;
		else {
			const dataRecord = asRecord(data);
			const replyValue = dataRecord?.replies;
			if (Array.isArray(replyValue)) replies = replyValue;
			else if (typeof replyValue === "object" && replyValue) replies = Object.values(replyValue);
			else if (dataRecord) replies = Object.values(dataRecord);
		}
		const messages = replies.map((item) => {
			const itemRecord = asRecord(item);
			const replySet = asRecord(asRecord(itemRecord?.["r-reply"])?.set);
			return createHistoryEntryFromMemo({
				memo: asRecord(itemRecord?.memo) ?? asRecord(replySet?.memo) ?? itemRecord,
				seal: asRecord(itemRecord?.seal) ?? asRecord(replySet?.seal),
				fallbackId: itemRecord?.id
			});
		}).filter((msg) => msg.content);
		runtime?.log?.(`[tlon] Extracted ${messages.length} thread replies from history`);
		return messages;
	} catch (error) {
		runtime?.log?.(`[tlon] Error fetching thread history: ${formatErrorMessage(error)}`);
		try {
			const altPath = `/channels/v4/${channelNest}/posts/post/id/${formatUd(parentId)}.json`;
			runtime?.log?.(`[tlon] Trying alternate path: ${altPath}`);
			const data = asRecord(await api.scry(altPath));
			const dataMeta = asRecord(asRecord(data?.seal)?.meta);
			const repliesValue = data?.replies;
			if (typeof dataMeta?.replyCount === "number" && dataMeta.replyCount > 0 && repliesValue) {
				const messages = (Array.isArray(repliesValue) ? repliesValue : Object.values(repliesValue)).map((reply) => {
					const replyRecord = asRecord(reply);
					return createHistoryEntryFromMemo({
						memo: asRecord(replyRecord?.memo),
						seal: asRecord(replyRecord?.seal)
					});
				}).filter((msg) => msg.content);
				runtime?.log?.(`[tlon] Extracted ${messages.length} replies from post data`);
				return messages;
			}
		} catch (altError) {
			runtime?.log?.(`[tlon] Alternate path also failed: ${formatErrorMessage(altError)}`);
		}
		return [];
	}
}
//#endregion
//#region extensions/tlon/src/monitor/media.ts
const MAX_IMAGES_PER_MESSAGE = 8;
const TLON_MEDIA_DOWNLOAD_IDLE_TIMEOUT_MS = 3e4;
/**
* Extract image blocks from Tlon message content.
* Returns array of image URLs found in the message.
*/
function extractImageBlocks(content) {
	if (!content || !Array.isArray(content)) return [];
	const images = [];
	for (const verse of content) if (verse?.block?.image?.src) {
		images.push({
			url: verse.block.image.src,
			alt: verse.block.image.alt
		});
		if (images.length >= MAX_IMAGES_PER_MESSAGE) break;
	}
	return images;
}
/**
* Download a media file from URL to local storage.
* Returns the local path where the file was saved.
*/
async function downloadMedia(url, mediaDir) {
	try {
		const parsedUrl = new URL(url);
		if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
			console.warn(`[tlon-media] Rejected non-http(s) URL: ${url}`);
			return null;
		}
		const fetched = await fetchRemoteMedia({
			url,
			maxBytes: MAX_IMAGE_BYTES,
			readIdleTimeoutMs: TLON_MEDIA_DOWNLOAD_IDLE_TIMEOUT_MS,
			ssrfPolicy: /* @__PURE__ */ getDefaultSsrFPolicy(),
			requestInit: { method: "GET" }
		});
		if (!mediaDir) {
			const saved = await saveMediaBuffer(fetched.buffer, fetched.contentType, "inbound", MAX_IMAGE_BYTES, fetched.fileName);
			return {
				localPath: saved.path,
				contentType: saved.contentType ?? fetched.contentType ?? "application/octet-stream",
				originalUrl: url
			};
		}
		await mkdir(mediaDir, { recursive: true });
		const ext = getExtensionFromFileName(fetched.fileName) || getExtensionFromContentType(fetched.contentType ?? "") || getExtensionFromUrl(url) || "bin";
		const localPath = path$1.join(mediaDir, `${randomUUID()}.${ext}`);
		await writeFile(localPath, fetched.buffer);
		return {
			localPath,
			contentType: fetched.contentType ?? "application/octet-stream",
			originalUrl: url
		};
	} catch (error) {
		console.error(`[tlon-media] Error downloading ${url}: ${formatErrorMessage$1(error)}`);
		return null;
	}
}
function getExtensionFromFileName(fileName) {
	if (!fileName) return null;
	return path$1.extname(fileName).replace(/^\./, "") || null;
}
function getExtensionFromContentType(contentType) {
	return {
		"image/jpeg": "jpg",
		"image/jpg": "jpg",
		"image/png": "png",
		"image/gif": "gif",
		"image/webp": "webp",
		"image/svg+xml": "svg",
		"video/mp4": "mp4",
		"video/webm": "webm",
		"audio/mpeg": "mp3",
		"audio/ogg": "ogg"
	}[contentType.split(";")[0].trim()] ?? null;
}
function getExtensionFromUrl(url) {
	try {
		const match = new URL(url).pathname.match(/\.([a-z0-9]+)$/i);
		return match ? normalizeLowercaseStringOrEmpty$1(match[1]) : null;
	} catch {
		return null;
	}
}
/**
* Download all images from a message and return attachment metadata.
* Format matches Enclawed's expected attachment structure.
*/
async function downloadMessageImages(content, mediaDir) {
	const images = extractImageBlocks(content);
	if (images.length === 0) return [];
	const attachments = [];
	for (const image of images) {
		const downloaded = await downloadMedia(image.url, mediaDir);
		if (downloaded) attachments.push({
			path: downloaded.localPath,
			contentType: downloaded.contentType
		});
	}
	return attachments;
}
//#endregion
//#region extensions/tlon/src/monitor/processed-messages.ts
function createProcessedMessageTracker(limit = 2e3) {
	const dedupe = createDedupeCache({
		ttlMs: 0,
		maxSize: limit
	});
	const inFlight = /* @__PURE__ */ new Set();
	const claim = (id) => {
		const trimmed = id?.trim();
		if (!trimmed) return { kind: "claimed" };
		if (inFlight.has(trimmed) || dedupe.peek(trimmed)) return { kind: "duplicate" };
		inFlight.add(trimmed);
		return { kind: "claimed" };
	};
	const commit = (id) => {
		const trimmed = id?.trim();
		if (!trimmed) return;
		inFlight.delete(trimmed);
		dedupe.check(trimmed);
	};
	const release = (id) => {
		const trimmed = id?.trim();
		if (!trimmed) return;
		inFlight.delete(trimmed);
	};
	const mark = (id) => {
		if (claim(id).kind === "duplicate") return false;
		commit(id);
		return true;
	};
	const has = (id) => {
		const trimmed = id?.trim();
		if (!trimmed) return false;
		return dedupe.peek(trimmed);
	};
	return {
		claim,
		commit,
		release,
		mark,
		has,
		size: () => dedupe.size()
	};
}
async function runWithProcessedMessageClaim(params) {
	const claim = params.tracker.claim(params.id);
	if (claim.kind === "duplicate") return claim;
	try {
		const value = await params.task();
		params.tracker.commit(params.id);
		return {
			kind: "processed",
			value
		};
	} catch (error) {
		params.tracker.release(params.id);
		throw error;
	}
}
//#endregion
//#region extensions/tlon/src/monitor/settings-helpers.ts
function buildTlonSettingsMigrations(account, currentSettings) {
	return [
		{
			key: "dmAllowlist",
			fileValue: account.dmAllowlist,
			settingsValue: currentSettings.dmAllowlist
		},
		{
			key: "groupInviteAllowlist",
			fileValue: account.groupInviteAllowlist,
			settingsValue: currentSettings.groupInviteAllowlist
		},
		{
			key: "groupChannels",
			fileValue: account.groupChannels,
			settingsValue: currentSettings.groupChannels
		},
		{
			key: "defaultAuthorizedShips",
			fileValue: account.defaultAuthorizedShips,
			settingsValue: currentSettings.defaultAuthorizedShips
		},
		{
			key: "autoDiscoverChannels",
			fileValue: account.autoDiscoverChannels,
			settingsValue: currentSettings.autoDiscoverChannels
		},
		{
			key: "autoAcceptDmInvites",
			fileValue: account.autoAcceptDmInvites,
			settingsValue: currentSettings.autoAcceptDmInvites
		},
		{
			key: "autoAcceptGroupInvites",
			fileValue: account.autoAcceptGroupInvites,
			settingsValue: currentSettings.autoAcceptGroupInvites
		},
		{
			key: "showModelSig",
			fileValue: account.showModelSignature,
			settingsValue: currentSettings.showModelSig
		}
	];
}
function shouldMigrateTlonSetting(fileValue, settingsValue) {
	return (Array.isArray(fileValue) ? fileValue.length > 0 : fileValue != null) && !(settingsValue != null);
}
function applyTlonSettingsOverrides(params) {
	let effectiveDmAllowlist = params.account.dmAllowlist;
	let effectiveShowModelSig = params.account.showModelSignature ?? false;
	let effectiveAutoAcceptDmInvites = params.account.autoAcceptDmInvites ?? false;
	let effectiveAutoAcceptGroupInvites = params.account.autoAcceptGroupInvites ?? false;
	let effectiveGroupInviteAllowlist = params.account.groupInviteAllowlist;
	let effectiveAutoDiscoverChannels = params.account.autoDiscoverChannels ?? false;
	let effectiveOwnerShip = params.account.ownerShip ? normalizeShip(params.account.ownerShip) : null;
	let pendingApprovals = [];
	if (params.currentSettings.defaultAuthorizedShips?.length) params.log?.(`[tlon] Using defaultAuthorizedShips from settings store: ${params.currentSettings.defaultAuthorizedShips.join(", ")}`);
	if (params.currentSettings.autoDiscoverChannels !== void 0) {
		effectiveAutoDiscoverChannels = params.currentSettings.autoDiscoverChannels;
		params.log?.(`[tlon] Using autoDiscoverChannels from settings store: ${effectiveAutoDiscoverChannels}`);
	}
	if (params.currentSettings.dmAllowlist !== void 0) {
		effectiveDmAllowlist = params.currentSettings.dmAllowlist;
		params.log?.(`[tlon] Using dmAllowlist from settings store: ${effectiveDmAllowlist.join(", ")}`);
	}
	if (params.currentSettings.showModelSig !== void 0) effectiveShowModelSig = params.currentSettings.showModelSig;
	if (params.currentSettings.autoAcceptDmInvites !== void 0) {
		effectiveAutoAcceptDmInvites = params.currentSettings.autoAcceptDmInvites;
		params.log?.(`[tlon] Using autoAcceptDmInvites from settings store: ${effectiveAutoAcceptDmInvites}`);
	}
	if (params.currentSettings.autoAcceptGroupInvites !== void 0) {
		effectiveAutoAcceptGroupInvites = params.currentSettings.autoAcceptGroupInvites;
		params.log?.(`[tlon] Using autoAcceptGroupInvites from settings store: ${effectiveAutoAcceptGroupInvites}`);
	}
	if (params.currentSettings.groupInviteAllowlist !== void 0) {
		effectiveGroupInviteAllowlist = params.currentSettings.groupInviteAllowlist;
		params.log?.(`[tlon] Using groupInviteAllowlist from settings store: ${effectiveGroupInviteAllowlist.join(", ")}`);
	}
	if (params.currentSettings.ownerShip) {
		effectiveOwnerShip = normalizeShip(params.currentSettings.ownerShip);
		params.log?.(`[tlon] Using ownerShip from settings store: ${effectiveOwnerShip}`);
	}
	if (params.currentSettings.pendingApprovals?.length) {
		pendingApprovals = params.currentSettings.pendingApprovals;
		params.log?.(`[tlon] Loaded ${pendingApprovals.length} pending approval(s) from settings`);
	}
	return {
		effectiveDmAllowlist,
		effectiveShowModelSig,
		effectiveAutoAcceptDmInvites,
		effectiveAutoAcceptGroupInvites,
		effectiveGroupInviteAllowlist,
		effectiveAutoDiscoverChannels,
		effectiveOwnerShip,
		pendingApprovals,
		currentSettings: params.currentSettings
	};
}
function mergeUniqueStrings(base, next) {
	if (!next?.length) return [...base];
	const merged = [...base];
	for (const value of next) if (!merged.includes(value)) merged.push(value);
	return merged;
}
//#endregion
//#region extensions/tlon/src/monitor/index.ts
function readNumber(record, key) {
	const value = record?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
async function monitorTlonProvider(opts = {}) {
	const core = getTlonRuntime();
	const cfg = core.config.current();
	if (cfg.channels?.tlon?.enabled === false) return;
	const logger = core.logging.getChildLogger({ module: "tlon-auto-reply" });
	const runtime = opts.runtime ?? createLoggerBackedRuntime({ logger });
	const account = resolveTlonAccount(cfg, opts.accountId ?? void 0);
	if (!account.enabled) return;
	if (!account.configured || !account.ship || !account.url || !account.code) throw new Error("Tlon account not configured (ship/url/code required)");
	const botShipName = normalizeShip(account.ship);
	runtime.log?.(`[tlon] Starting monitor for ${botShipName}`);
	const ssrfPolicy = ssrfPolicyFromDangerouslyAllowPrivateNetwork(account.dangerouslyAllowPrivateNetwork);
	const accountUrl = account.url;
	const accountCode = account.code;
	async function authenticateWithRetry(maxAttempts = 10) {
		for (let attempt = 1;; attempt++) {
			if (opts.abortSignal?.aborted) throw new Error("Aborted while waiting to authenticate");
			try {
				runtime.log?.(`[tlon] Attempting authentication to ${accountUrl}...`);
				return await authenticate(accountUrl, accountCode, { ssrfPolicy });
			} catch (error) {
				runtime.error?.(`[tlon] Failed to authenticate (attempt ${attempt}): ${formatErrorMessage(error)}`);
				if (attempt >= maxAttempts) throw error;
				const delay = Math.min(3e4, 1e3 * 2 ** (attempt - 1));
				runtime.log?.(`[tlon] Retrying authentication in ${delay}ms...`);
				await new Promise((resolve, reject) => {
					const timer = setTimeout(resolve, delay);
					if (opts.abortSignal) {
						const onAbort = () => {
							clearTimeout(timer);
							reject(/* @__PURE__ */ new Error("Aborted"));
						};
						opts.abortSignal.addEventListener("abort", onAbort, { once: true });
					}
				});
			}
		}
	}
	let api = null;
	const cookie = await authenticateWithRetry();
	api = new UrbitSSEClient(account.url, cookie, {
		ship: botShipName,
		ssrfPolicy,
		logger: {
			log: (message) => runtime.log?.(message),
			error: (message) => runtime.error?.(message)
		},
		onReconnect: async (client) => {
			runtime.log?.("[tlon] Re-authenticating on SSE reconnect...");
			const newCookie = await authenticateWithRetry(5);
			client.updateCookie(newCookie);
			runtime.log?.("[tlon] Re-authentication successful");
		}
	});
	const processedTracker = createProcessedMessageTracker(2e3);
	let groupChannels = [];
	let botNickname = null;
	const settingsManager = createSettingsManager(api, {
		log: (msg) => runtime.log?.(msg),
		error: (msg) => runtime.error?.(msg)
	});
	let effectiveDmAllowlist = account.dmAllowlist;
	let effectiveShowModelSig = account.showModelSignature ?? false;
	let effectiveAutoAcceptDmInvites = account.autoAcceptDmInvites ?? false;
	let effectiveAutoAcceptGroupInvites = account.autoAcceptGroupInvites ?? false;
	let effectiveGroupInviteAllowlist = account.groupInviteAllowlist;
	let effectiveAutoDiscoverChannels = account.autoDiscoverChannels ?? false;
	let effectiveOwnerShip = account.ownerShip ? normalizeShip(account.ownerShip) : null;
	let pendingApprovals = [];
	let currentSettings = {};
	const participatedThreads = /* @__PURE__ */ new Set();
	const dmSendersBySession = /* @__PURE__ */ new Map();
	let sharedSessionWarningSent = false;
	try {
		const selfProfile = await api.scry("/contacts/v1/self.json");
		if (selfProfile && typeof selfProfile === "object") {
			botNickname = selfProfile.nickname?.value || null;
			if (botNickname) runtime.log?.(`[tlon] Bot nickname: ${botNickname}`);
		}
	} catch (error) {
		runtime.log?.(`[tlon] Could not fetch nickname: ${formatErrorMessage(error)}`);
	}
	let initForeigns = null;
	async function migrateConfigToSettings() {
		const migrations = buildTlonSettingsMigrations(account, currentSettings);
		for (const { key, fileValue, settingsValue } of migrations) if (shouldMigrateTlonSetting(fileValue, settingsValue)) try {
			await api.poke({
				app: "settings",
				mark: "settings-event",
				json: { "put-entry": {
					"bucket-key": "tlon",
					"entry-key": key,
					value: fileValue,
					desk: "moltbot"
				} }
			});
			runtime.log?.(`[tlon] Migrated ${key} from config to settings store`);
		} catch (err) {
			runtime.log?.(`[tlon] Failed to migrate ${key}: ${String(err)}`);
		}
	}
	try {
		currentSettings = await settingsManager.load();
		await migrateConfigToSettings();
		({effectiveDmAllowlist, effectiveShowModelSig, effectiveAutoAcceptDmInvites, effectiveAutoAcceptGroupInvites, effectiveGroupInviteAllowlist, effectiveAutoDiscoverChannels, effectiveOwnerShip, pendingApprovals, currentSettings} = applyTlonSettingsOverrides({
			account,
			currentSettings,
			log: (message) => runtime.log?.(message)
		}));
	} catch (err) {
		runtime.log?.(`[tlon] Settings store not available, using file config: ${String(err)}`);
	}
	if (effectiveAutoDiscoverChannels) try {
		const initData = await fetchInitData(api, runtime);
		if (initData.channels.length > 0) groupChannels = initData.channels;
		initForeigns = initData.foreigns;
	} catch (error) {
		runtime.error?.(`[tlon] Auto-discovery failed: ${formatErrorMessage(error)}`);
	}
	if (account.groupChannels.length > 0) {
		groupChannels = mergeUniqueStrings(groupChannels, account.groupChannels);
		runtime.log?.(`[tlon] Added ${account.groupChannels.length} manual groupChannels to monitoring`);
	}
	groupChannels = mergeUniqueStrings(groupChannels, currentSettings.groupChannels);
	if (groupChannels.length > 0) runtime.log?.(`[tlon] Monitoring ${groupChannels.length} group channel(s): ${groupChannels.join(", ")}`);
	else runtime.log?.("[tlon] No group channels to monitor (DMs only)");
	function isOwner(ship) {
		if (!effectiveOwnerShip) return false;
		return normalizeShip(ship) === effectiveOwnerShip;
	}
	/**
	* Extract the DM partner ship from the 'whom' field.
	* This is the canonical source for DM routing (more reliable than essay.author).
	* Returns empty string if whom doesn't contain a valid patp-like value.
	*/
	function extractDmPartnerShip(whom) {
		const normalized = normalizeShip(typeof whom === "string" ? whom : whom && typeof whom === "object" && "ship" in whom && typeof whom.ship === "string" ? whom.ship : "");
		return /^~?[a-z-]+$/i.test(normalized) ? normalized : "";
	}
	const processMessage = async (params) => {
		const { messageId, senderShip, isGroup, channelNest, hostShip: _hostShip, channelName: _channelName, timestamp, parentId, isThreadReply, messageContent } = params;
		const groupChannel = channelNest;
		let messageText = params.messageText;
		let attachments = [];
		if (messageContent) try {
			attachments = await downloadMessageImages(messageContent);
			if (attachments.length > 0) runtime.log?.(`[tlon] Downloaded ${attachments.length} image(s) from message`);
		} catch (error) {
			runtime.log?.(`[tlon] Failed to download images: ${formatErrorMessage(error)}`);
		}
		if (isThreadReply && parentId && groupChannel) try {
			const threadHistory = await fetchThreadHistory(api, groupChannel, parentId, 20, runtime);
			if (threadHistory.length > 0) {
				const threadContext = threadHistory.slice(-10).map((msg) => `${msg.author}: ${msg.content}`).join("\n");
				messageText = `${`[Thread conversation - ${threadHistory.length} previous replies. You are participating in this thread. Only respond if relevant or helpful - you don't need to reply to every message.]`}\n\n[Previous messages]\n${threadContext}\n\n[Current message]\n${messageText}`;
				runtime?.log?.(`[tlon] Added thread context (${threadHistory.length} replies) to message`);
			}
		} catch (error) {
			runtime?.log?.(`[tlon] Could not fetch thread context: ${formatErrorMessage(error)}`);
		}
		if (isGroup && groupChannel && isSummarizationRequest(messageText)) try {
			const history = await getChannelHistory(api, groupChannel, 50, runtime);
			if (history.length === 0) {
				const noHistoryMsg = "I couldn't fetch any messages for this channel. It might be empty or there might be a permissions issue.";
				if (isGroup) {
					const parsed = parseChannelNest(groupChannel);
					if (parsed) await sendGroupMessage({
						api,
						fromShip: botShipName,
						hostShip: parsed.hostShip,
						channelName: parsed.channelName,
						text: noHistoryMsg
					});
				} else await sendDm({
					api,
					fromShip: botShipName,
					toShip: senderShip,
					text: noHistoryMsg
				});
				return;
			}
			const historyText = history.map((msg) => `[${new Date(msg.timestamp).toLocaleString()}] ${msg.author}: ${msg.content}`).join("\n");
			messageText = `Please summarize this channel conversation (${history.length} recent messages):\n\n${historyText}\n\nProvide a concise summary highlighting:
1. Main topics discussed
2. Key decisions or conclusions
3. Action items if any
4. Notable participants`;
		} catch (error) {
			const errorMsg = `Sorry, I encountered an error while fetching the channel history: ${formatErrorMessage(error)}`;
			if (isGroup && groupChannel) {
				const parsed = parseChannelNest(groupChannel);
				if (parsed) await sendGroupMessage({
					api,
					fromShip: botShipName,
					hostShip: parsed.hostShip,
					channelName: parsed.channelName,
					text: errorMsg
				});
			} else await sendDm({
				api,
				fromShip: botShipName,
				toShip: senderShip,
				text: errorMsg
			});
			return;
		}
		const route = core.channel.routing.resolveAgentRoute({
			cfg,
			channel: "tlon",
			accountId: opts.accountId ?? void 0,
			peer: {
				kind: isGroup ? "group" : "direct",
				id: isGroup ? groupChannel ?? senderShip : senderShip
			}
		});
		if (!isGroup) {
			const sessionKey = route.sessionKey;
			if (!dmSendersBySession.has(sessionKey)) dmSendersBySession.set(sessionKey, /* @__PURE__ */ new Set());
			const senders = dmSendersBySession.get(sessionKey);
			if (senders.size > 0 && !senders.has(senderShip)) {
				runtime.log?.("[tlon] ⚠️ SECURITY: Multiple users sharing DM session. Configure \"session.dmScope: per-channel-peer\" in Enclawed config.");
				if (!sharedSessionWarningSent && effectiveOwnerShip) {
					sharedSessionWarningSent = true;
					sendDm({
						api,
						fromShip: botShipName,
						toShip: effectiveOwnerShip,
						text: "⚠️ Security Warning: Multiple users are sharing a DM session with this bot. This can leak conversation context between users.\n\nFix: Add to your Enclawed config:\nsession:\n  dmScope: \"per-channel-peer\"\n\nDocs: https://github.com/enclawed/enclawed-oss/blob/main/docs/concepts/session.md#secure-dm-mode"
					}).catch((err) => runtime.error?.(`[tlon] Failed to send security warning to owner: ${err}`));
				}
			}
			senders.add(senderShip);
		}
		const senderRole = isOwner(senderShip) ? "owner" : "user";
		const fromLabel = isGroup ? `${senderShip} [${senderRole}] in ${channelNest}` : `${senderShip} [${senderRole}]`;
		const shouldComputeAuth = core.channel.commands.shouldComputeCommandAuthorized(messageText, cfg);
		let commandAuthorized = false;
		if (shouldComputeAuth) {
			const useAccessGroups = cfg.commands?.useAccessGroups !== false;
			const senderIsOwner = isOwner(senderShip);
			commandAuthorized = core.channel.commands.resolveCommandAuthorizedFromAuthorizers({
				useAccessGroups,
				authorizers: [{
					configured: Boolean(effectiveOwnerShip),
					allowed: senderIsOwner
				}]
			});
			if (!commandAuthorized) console.log(`[tlon] Command attempt denied: ${senderShip} is not owner (owner=${effectiveOwnerShip ?? "not configured"})`);
		}
		let bodyWithAttachments = messageText;
		if (attachments.length > 0) bodyWithAttachments = attachments.map((a) => `[media attached: ${a.path} (${a.contentType}) | ${a.path}]`).join("\n") + "\n" + messageText;
		const body = core.channel.reply.formatAgentEnvelope({
			channel: "Tlon",
			from: fromLabel,
			timestamp,
			body: bodyWithAttachments
		});
		const commandBody = isGroup ? stripBotMention(messageText, botShipName) : messageText;
		const tlonConversationId = isGroup ? groupChannel ?? channelNest ?? senderShip : senderShip;
		const rawTurnMessage = {
			messageId,
			messageText,
			timestamp
		};
		const ctxPayload = core.channel.turn.buildContext({
			channel: "tlon",
			accountId: route.accountId,
			messageId,
			timestamp,
			from: isGroup ? `tlon:group:${groupChannel}` : `tlon:${senderShip}`,
			sender: {
				id: senderShip,
				name: senderShip,
				roles: [senderRole]
			},
			conversation: {
				kind: isGroup ? "group" : "direct",
				id: tlonConversationId,
				label: fromLabel,
				routePeer: {
					kind: isGroup ? "group" : "direct",
					id: tlonConversationId
				}
			},
			route: {
				agentId: route.agentId,
				accountId: route.accountId,
				routeSessionKey: route.sessionKey
			},
			reply: {
				to: `tlon:${botShipName}`,
				originatingTo: `tlon:${isGroup ? groupChannel : botShipName}`,
				replyToId: parentId ?? void 0
			},
			message: {
				body,
				bodyForAgent: commandBody,
				rawBody: messageText,
				commandBody,
				envelopeFrom: fromLabel
			},
			extra: {
				GroupSubject: void 0,
				SenderRole: senderRole,
				CommandAuthorized: commandAuthorized,
				CommandSource: "text",
				...attachments.length > 0 && { Attachments: attachments },
				...parentId && { ThreadId: parentId }
			}
		});
		const dispatchStartTime = Date.now();
		const responsePrefix = core.channel.reply.resolveEffectiveMessagesConfig(cfg, route.agentId).responsePrefix;
		const humanDelay = core.channel.reply.resolveHumanDelayConfig(cfg, route.agentId);
		const storePath = core.channel.session.resolveStorePath(cfg.session?.store, { agentId: route.agentId });
		await core.channel.turn.run({
			channel: "tlon",
			accountId: route.accountId,
			raw: rawTurnMessage,
			adapter: {
				ingest: (raw) => ({
					id: raw.messageId,
					timestamp: raw.timestamp,
					rawText: raw.messageText,
					textForAgent: commandBody,
					textForCommands: commandBody,
					raw
				}),
				resolveTurn: () => ({
					cfg,
					channel: "tlon",
					accountId: route.accountId,
					agentId: route.agentId,
					routeSessionKey: route.sessionKey,
					storePath,
					ctxPayload,
					recordInboundSession: core.channel.session.recordInboundSession,
					dispatchReplyWithBufferedBlockDispatcher: core.channel.reply.dispatchReplyWithBufferedBlockDispatcher,
					delivery: {
						deliver: async (payload) => {
							let replyText = payload.text;
							if (!replyText) return;
							if (effectiveShowModelSig) {
								const extPayload = payload;
								const defaultModel = cfg.agents?.defaults?.model;
								const modelInfo = extPayload.metadata?.model || extPayload.model || (typeof defaultModel === "string" ? defaultModel : defaultModel?.primary);
								replyText = `${replyText}\n\n_[Generated by ${formatModelName(modelInfo)}]_`;
							}
							if (isGroup && groupChannel) {
								const parsed = parseChannelNest(groupChannel);
								if (!parsed) return;
								await sendGroupMessage({
									api,
									fromShip: botShipName,
									hostShip: parsed.hostShip,
									channelName: parsed.channelName,
									text: replyText,
									replyToId: parentId ?? void 0
								});
								if (parentId) {
									participatedThreads.add(parentId);
									runtime.log?.(`[tlon] Now tracking thread for future replies: ${parentId}`);
								}
							} else await sendDm({
								api,
								fromShip: botShipName,
								toShip: senderShip,
								text: replyText
							});
						},
						onError: (err, info) => {
							const dispatchDuration = Date.now() - dispatchStartTime;
							runtime.error?.(`[tlon] ${info.kind} reply failed after ${dispatchDuration}ms: ${String(err)}`);
						}
					},
					dispatcherOptions: {
						responsePrefix,
						humanDelay
					},
					record: { onRecordError: (err) => {
						runtime.error?.(`[tlon] failed updating session meta: ${String(err)}`);
					} }
				})
			}
		});
	};
	const watchedChannels = new Set(groupChannels);
	const refreshWatchedChannels = async () => {
		const discoveredChannels = await fetchAllChannels(api, runtime);
		let newCount = 0;
		for (const channelNest of discoveredChannels) if (!watchedChannels.has(channelNest)) {
			watchedChannels.add(channelNest);
			newCount++;
		}
		return newCount;
	};
	const { resolveAllCites } = createTlonCitationResolver({
		api: { scry: (path) => api.scry(path) },
		runtime
	});
	const { queueApprovalRequest, handleApprovalResponse, handleAdminCommand } = createTlonApprovalRuntime({
		api: {
			poke: (payload) => api.poke(payload),
			scry: (path) => api.scry(path)
		},
		runtime,
		botShipName,
		getPendingApprovals: () => pendingApprovals,
		setPendingApprovals: (approvals) => {
			pendingApprovals = approvals;
		},
		getCurrentSettings: () => currentSettings,
		setCurrentSettings: (settings) => {
			currentSettings = settings;
		},
		getEffectiveDmAllowlist: () => effectiveDmAllowlist,
		setEffectiveDmAllowlist: (ships) => {
			effectiveDmAllowlist = ships;
		},
		getEffectiveOwnerShip: () => effectiveOwnerShip,
		processApprovedMessage: async (approval) => {
			if (!approval.originalMessage) return;
			if (approval.type === "dm") {
				await processMessage({
					messageId: approval.originalMessage.messageId,
					senderShip: approval.requestingShip,
					messageText: approval.originalMessage.messageText,
					messageContent: approval.originalMessage.messageContent,
					isGroup: false,
					timestamp: approval.originalMessage.timestamp
				});
				return;
			}
			if (approval.type === "channel" && approval.channelNest) {
				const parsedChannel = parseChannelNest(approval.channelNest);
				await processMessage({
					messageId: approval.originalMessage.messageId,
					senderShip: approval.requestingShip,
					messageText: approval.originalMessage.messageText,
					messageContent: approval.originalMessage.messageContent,
					isGroup: true,
					channelNest: approval.channelNest,
					hostShip: parsedChannel?.hostShip,
					channelName: parsedChannel?.channelName,
					timestamp: approval.originalMessage.timestamp,
					parentId: approval.originalMessage.parentId,
					isThreadReply: approval.originalMessage.isThreadReply
				});
			}
		},
		refreshWatchedChannels
	});
	const handleChannelsFirehose = async (event) => {
		try {
			const eventRecord = asRecord(event);
			const nest = readString(eventRecord, "nest");
			if (!nest) return;
			if (!watchedChannels.has(nest)) return;
			const response = asRecord(eventRecord?.response);
			if (!response) return;
			const post = asRecord(response.post);
			const rPost = asRecord(post?.["r-post"]);
			const set = asRecord(rPost?.set);
			const reply = asRecord(rPost?.reply);
			const replySet = asRecord(asRecord(reply?.["r-reply"])?.set);
			const essay = asRecord(set?.essay);
			const memo = asRecord(replySet?.memo);
			if (!essay && !memo) return;
			const content = memo ?? essay;
			if (!content) return;
			const isThreadReply = Boolean(memo);
			const messageId = isThreadReply ? readString(reply, "id") : readString(post, "id");
			if (!messageId) return;
			if ((await runWithProcessedMessageClaim({
				tracker: processedTracker,
				id: messageId,
				task: async () => {
					const senderShip = normalizeShip(readString(content, "author") ?? "");
					if (!senderShip || senderShip === botShipName) return;
					const rawText = extractMessageText(content.content);
					if (!rawText.trim()) return;
					const contentBody = content.content;
					const sentAt = readNumber(content, "sent") ?? Date.now();
					cacheMessage(nest, {
						author: senderShip,
						content: rawText,
						timestamp: sentAt,
						id: messageId
					});
					const seal = isThreadReply ? asRecord(replySet?.seal) : asRecord(set?.seal);
					const parentId = readString(seal, "parent-id") ?? readString(seal, "parent") ?? null;
					const mentioned = isBotMentioned(rawText, botShipName, botNickname ?? void 0);
					const inParticipatedThread = isThreadReply && parentId && participatedThreads.has(parentId);
					if (!mentioned && !inParticipatedThread) return;
					if (inParticipatedThread && !mentioned) runtime.log?.(`[tlon] Responding to thread we participated in (no mention): ${parentId}`);
					if (isOwner(senderShip)) runtime.log?.(`[tlon] Owner ${senderShip} is always allowed in channels`);
					else {
						const { mode, allowedShips } = resolveChannelAuthorization(cfg, nest, currentSettings);
						if (mode === "restricted") {
							if (!allowedShips.map(normalizeShip).includes(senderShip)) {
								if (effectiveOwnerShip) await queueApprovalRequest(createPendingApproval({
									type: "channel",
									requestingShip: senderShip,
									channelNest: nest,
									messagePreview: rawText.slice(0, 100),
									originalMessage: {
										messageId: messageId ?? "",
										messageText: rawText,
										messageContent: contentBody,
										timestamp: sentAt,
										parentId: parentId ?? void 0,
										isThreadReply
									}
								}));
								else runtime.log?.(`[tlon] Access denied: ${senderShip} in ${nest} (allowed: ${allowedShips.join(", ")})`);
								return;
							}
						}
					}
					const messageText = await resolveAuthorizedMessageText({
						rawText,
						content: contentBody,
						authorizedForCites: true,
						resolveAllCites
					});
					const parsed = parseChannelNest(nest);
					await processMessage({
						messageId: messageId ?? "",
						senderShip,
						messageText,
						messageContent: contentBody,
						isGroup: true,
						channelNest: nest,
						hostShip: parsed?.hostShip,
						channelName: parsed?.channelName,
						timestamp: sentAt,
						parentId,
						isThreadReply
					});
				}
			})).kind === "duplicate") return;
		} catch (error) {
			runtime.error?.(`[tlon] Error handling channel firehose event: ${formatErrorMessage(error)}`);
		}
	};
	const processedDmInvites = /* @__PURE__ */ new Set();
	const handleChatFirehose = async (event) => {
		try {
			if (Array.isArray(event)) {
				for (const invite of event) {
					const ship = normalizeShip(invite.ship || "");
					if (!ship || processedDmInvites.has(ship)) continue;
					if (isOwner(ship)) {
						try {
							await api.poke({
								app: "chat",
								mark: "chat-dm-rsvp",
								json: {
									ship,
									ok: true
								}
							});
							processedDmInvites.add(ship);
							runtime.log?.(`[tlon] Auto-accepted DM invite from owner ${ship}`);
						} catch (err) {
							runtime.error?.(`[tlon] Failed to auto-accept DM from owner: ${String(err)}`);
						}
						continue;
					}
					if (effectiveAutoAcceptDmInvites && isDmAllowed(ship, effectiveDmAllowlist)) {
						try {
							await api.poke({
								app: "chat",
								mark: "chat-dm-rsvp",
								json: {
									ship,
									ok: true
								}
							});
							processedDmInvites.add(ship);
							runtime.log?.(`[tlon] Auto-accepted DM invite from ${ship}`);
						} catch (err) {
							runtime.error?.(`[tlon] Failed to auto-accept DM from ${ship}: ${String(err)}`);
						}
						continue;
					}
					if (effectiveOwnerShip && !isDmAllowed(ship, effectiveDmAllowlist)) {
						await queueApprovalRequest(createPendingApproval({
							type: "dm",
							requestingShip: ship,
							messagePreview: "(DM invite - no message yet)"
						}));
						processedDmInvites.add(ship);
					}
				}
				return;
			}
			const eventRecord = asRecord(event);
			if (!eventRecord) return;
			const whom = eventRecord.whom;
			const messageId = readString(eventRecord, "id");
			const response = asRecord(eventRecord.response);
			if (!messageId || !response) return;
			const essay = asRecord(asRecord(response.add)?.essay);
			if (!essay) return;
			if ((await runWithProcessedMessageClaim({
				tracker: processedTracker,
				id: messageId,
				task: async () => {
					const authorShip = normalizeShip(readString(essay, "author") ?? "");
					const partnerShip = extractDmPartnerShip(whom);
					const senderShip = partnerShip || authorShip;
					if (authorShip === botShipName) return;
					if (!senderShip || senderShip === botShipName) return;
					if (authorShip && partnerShip && authorShip !== partnerShip) runtime.log?.(`[tlon] DM ship mismatch (author=${authorShip}, partner=${partnerShip}) - routing to partner`);
					const rawText = extractMessageText(essay.content);
					if (!rawText.trim()) return;
					const messageText = rawText;
					if (isOwner(senderShip) && isApprovalResponse(messageText)) {
						if (await handleApprovalResponse(messageText)) {
							runtime.log?.(`[tlon] Processed approval response from owner: ${messageText}`);
							return;
						}
					}
					if (isOwner(senderShip) && isAdminCommand(messageText)) {
						if (await handleAdminCommand(messageText)) {
							runtime.log?.(`[tlon] Processed admin command from owner: ${messageText}`);
							return;
						}
					}
					if (isOwner(senderShip)) {
						const resolvedMessageText = await resolveAuthorizedMessageText({
							rawText,
							content: essay.content,
							authorizedForCites: true,
							resolveAllCites
						});
						runtime.log?.(`[tlon] Processing DM from owner ${senderShip}`);
						await processMessage({
							messageId: messageId ?? "",
							senderShip,
							messageText: resolvedMessageText,
							messageContent: essay.content,
							isGroup: false,
							timestamp: readNumber(essay, "sent") ?? Date.now()
						});
						return;
					}
					if (!isDmAllowed(senderShip, effectiveDmAllowlist)) {
						if (effectiveOwnerShip) await queueApprovalRequest(createPendingApproval({
							type: "dm",
							requestingShip: senderShip,
							messagePreview: messageText.slice(0, 100),
							originalMessage: {
								messageId: messageId ?? "",
								messageText,
								messageContent: essay.content,
								timestamp: readNumber(essay, "sent") ?? Date.now()
							}
						}));
						else runtime.log?.(`[tlon] Blocked DM from ${senderShip}: not in allowlist`);
						return;
					}
					await processMessage({
						messageText: await resolveAuthorizedMessageText({
							rawText,
							content: essay.content,
							authorizedForCites: true,
							resolveAllCites
						}),
						messageId: messageId ?? "",
						senderShip,
						messageContent: essay.content,
						isGroup: false,
						timestamp: readNumber(essay, "sent") ?? Date.now()
					});
				}
			})).kind === "duplicate") return;
		} catch (error) {
			runtime.error?.(`[tlon] Error handling chat firehose event: ${formatErrorMessage(error)}`);
		}
	};
	try {
		runtime.log?.("[tlon] Subscribing to firehose updates...");
		await api.subscribe({
			app: "channels",
			path: "/v2",
			event: handleChannelsFirehose,
			err: (error) => {
				runtime.error?.(`[tlon] Channels firehose error: ${String(error)}`);
			},
			quit: () => {
				runtime.log?.("[tlon] Channels firehose subscription ended");
			}
		});
		runtime.log?.("[tlon] Subscribed to channels firehose (/v2)");
		await api.subscribe({
			app: "chat",
			path: "/v3",
			event: handleChatFirehose,
			err: (error) => {
				runtime.error?.(`[tlon] Chat firehose error: ${String(error)}`);
			},
			quit: () => {
				runtime.log?.("[tlon] Chat firehose subscription ended");
			}
		});
		runtime.log?.("[tlon] Subscribed to chat firehose (/v3)");
		await api.subscribe({
			app: "contacts",
			path: "/v1/news",
			event: (event) => {
				try {
					const eventRecord = asRecord(event);
					if (eventRecord?.self) {
						const nickname = asRecord(asRecord(asRecord(eventRecord.self)?.contact)?.nickname);
						if (nickname && "value" in nickname) {
							const newNickname = readString(nickname, "value") ?? null;
							if (newNickname !== botNickname) {
								botNickname = newNickname;
								runtime.log?.(`[tlon] Nickname updated: ${botNickname}`);
							}
						}
					}
				} catch (error) {
					runtime.error?.(`[tlon] Error handling contacts event: ${formatErrorMessage(error)}`);
				}
			},
			err: (error) => {
				runtime.error?.(`[tlon] Contacts subscription error: ${String(error)}`);
			},
			quit: () => {
				runtime.log?.("[tlon] Contacts subscription ended");
			}
		});
		runtime.log?.("[tlon] Subscribed to contacts updates (/v1/news)");
		settingsManager.onChange((newSettings) => {
			currentSettings = newSettings;
			if (newSettings.groupChannels?.length) {
				const newChannels = newSettings.groupChannels;
				for (const ch of newChannels) if (!watchedChannels.has(ch)) {
					watchedChannels.add(ch);
					runtime.log?.(`[tlon] Settings: now watching channel ${ch}`);
				}
			}
			({effectiveDmAllowlist, effectiveShowModelSig, effectiveAutoAcceptDmInvites, effectiveAutoAcceptGroupInvites, effectiveGroupInviteAllowlist, effectiveAutoDiscoverChannels, effectiveOwnerShip, pendingApprovals} = applyTlonSettingsOverrides({
				account,
				currentSettings: newSettings,
				log: (message) => runtime.log?.(message)
			}));
		});
		try {
			await settingsManager.startSubscription();
		} catch (err) {
			runtime.log?.(`[tlon] Settings subscription not available: ${String(err)}`);
		}
		try {
			await api.subscribe({
				app: "groups",
				path: "/groups/ui",
				event: async (event) => {
					try {
						const eventRecord = asRecord(event);
						if (eventRecord) {
							const channels = asRecord(eventRecord.channels);
							if (channels) for (const [channelNest, _channelData] of Object.entries(channels)) {
								if (!channelNest.startsWith("chat/")) continue;
								if (!watchedChannels.has(channelNest)) {
									watchedChannels.add(channelNest);
									runtime.log?.(`[tlon] Auto-detected new channel (invite accepted): ${channelNest}`);
									if (effectiveAutoAcceptGroupInvites) try {
										const currentChannels = currentSettings.groupChannels || [];
										if (!currentChannels.includes(channelNest)) {
											const updatedChannels = [...currentChannels, channelNest];
											await api.poke({
												app: "settings",
												mark: "settings-event",
												json: { "put-entry": {
													"bucket-key": "tlon",
													"entry-key": "groupChannels",
													value: updatedChannels,
													desk: "moltbot"
												} }
											});
											runtime.log?.(`[tlon] Persisted ${channelNest} to settings store`);
										}
									} catch (err) {
										runtime.error?.(`[tlon] Failed to persist channel to settings: ${String(err)}`);
									}
								}
							}
							const join = asRecord(eventRecord.join);
							if (join) {
								const joinChannels = Array.isArray(join.channels) ? join.channels : [];
								if (joinChannels.length > 0) for (const channelNest of joinChannels) {
									if (typeof channelNest !== "string") continue;
									if (!channelNest.startsWith("chat/")) continue;
									if (!watchedChannels.has(channelNest)) {
										watchedChannels.add(channelNest);
										runtime.log?.(`[tlon] Auto-detected joined channel: ${channelNest}`);
										if (effectiveAutoAcceptGroupInvites) try {
											const currentChannels = currentSettings.groupChannels || [];
											if (!currentChannels.includes(channelNest)) {
												const updatedChannels = [...currentChannels, channelNest];
												await api.poke({
													app: "settings",
													mark: "settings-event",
													json: { "put-entry": {
														"bucket-key": "tlon",
														"entry-key": "groupChannels",
														value: updatedChannels,
														desk: "moltbot"
													} }
												});
												runtime.log?.(`[tlon] Persisted ${channelNest} to settings store`);
											}
										} catch (err) {
											runtime.error?.(`[tlon] Failed to persist channel to settings: ${String(err)}`);
										}
									}
								}
							}
						}
					} catch (error) {
						runtime.error?.(`[tlon] Error handling groups-ui event: ${formatErrorMessage(error)}`);
					}
				},
				err: (error) => {
					runtime.error?.(`[tlon] Groups-ui subscription error: ${String(error)}`);
				},
				quit: () => {
					runtime.log?.("[tlon] Groups-ui subscription ended");
				}
			});
			runtime.log?.("[tlon] Subscribed to groups-ui for real-time channel detection");
		} catch (err) {
			runtime.log?.(`[tlon] Groups-ui subscription failed (will rely on polling): ${String(err)}`);
		}
		{
			const processedGroupInvites = /* @__PURE__ */ new Set();
			const processPendingInvites = async (foreigns) => {
				if (!foreigns || typeof foreigns !== "object") return;
				for (const [groupFlag, foreign] of Object.entries(foreigns)) {
					if (processedGroupInvites.has(groupFlag)) continue;
					if (!foreign.invites || foreign.invites.length === 0) continue;
					const validInvite = foreign.invites.find((inv) => inv.valid);
					if (!validInvite) continue;
					const inviterShip = validInvite.from;
					if (isOwner(inviterShip)) {
						try {
							await api.poke({
								app: "groups",
								mark: "group-join",
								json: {
									flag: groupFlag,
									"join-all": true
								}
							});
							processedGroupInvites.add(groupFlag);
							runtime.log?.(`[tlon] Auto-accepted group invite from owner: ${groupFlag}`);
						} catch (err) {
							runtime.error?.(`[tlon] Failed to accept group invite from owner: ${String(err)}`);
						}
						continue;
					}
					if (!effectiveAutoAcceptGroupInvites) {
						if (effectiveOwnerShip) {
							await queueApprovalRequest(createPendingApproval({
								type: "group",
								requestingShip: inviterShip,
								groupFlag
							}));
							processedGroupInvites.add(groupFlag);
						}
						continue;
					}
					if (!isGroupInviteAllowed(inviterShip, effectiveGroupInviteAllowlist)) {
						if (effectiveOwnerShip) {
							await queueApprovalRequest(createPendingApproval({
								type: "group",
								requestingShip: inviterShip,
								groupFlag
							}));
							processedGroupInvites.add(groupFlag);
						} else {
							runtime.log?.(`[tlon] Rejected group invite from ${inviterShip} (not in groupInviteAllowlist): ${groupFlag}`);
							processedGroupInvites.add(groupFlag);
						}
						continue;
					}
					try {
						await api.poke({
							app: "groups",
							mark: "group-join",
							json: {
								flag: groupFlag,
								"join-all": true
							}
						});
						processedGroupInvites.add(groupFlag);
						runtime.log?.(`[tlon] Auto-accepted group invite: ${groupFlag} (from ${validInvite.from})`);
					} catch (err) {
						runtime.error?.(`[tlon] Failed to auto-accept group ${groupFlag}: ${String(err)}`);
					}
				}
			};
			if (initForeigns) await processPendingInvites(initForeigns);
			try {
				await api.subscribe({
					app: "groups",
					path: "/v1/foreigns",
					event: (data) => {
						(async () => {
							try {
								await processPendingInvites(data);
							} catch (error) {
								runtime.error?.(`[tlon] Error handling foreigns event: ${formatErrorMessage(error)}`);
							}
						})();
					},
					err: (error) => {
						runtime.error?.(`[tlon] Foreigns subscription error: ${String(error)}`);
					},
					quit: () => {
						runtime.log?.("[tlon] Foreigns subscription ended");
					}
				});
				runtime.log?.("[tlon] Subscribed to foreigns (/v1/foreigns) for auto-accepting group invites");
			} catch (err) {
				runtime.log?.(`[tlon] Foreigns subscription failed: ${String(err)}`);
			}
		}
		if (effectiveAutoDiscoverChannels) {
			const discoveredChannels = await fetchAllChannels(api, runtime);
			for (const channelNest of discoveredChannels) watchedChannels.add(channelNest);
			runtime.log?.(`[tlon] Watching ${watchedChannels.size} channel(s)`);
		}
		for (const channelNest of watchedChannels) runtime.log?.(`[tlon] Watching channel: ${channelNest}`);
		runtime.log?.("[tlon] All subscriptions registered, connecting to SSE stream...");
		await api.connect();
		runtime.log?.("[tlon] Connected! Firehose subscriptions active");
		const pollInterval = setInterval(async () => {
			if (!opts.abortSignal?.aborted) try {
				if (effectiveAutoDiscoverChannels) {
					const discoveredChannels = await fetchAllChannels(api, runtime);
					for (const channelNest of discoveredChannels) if (!watchedChannels.has(channelNest)) {
						watchedChannels.add(channelNest);
						runtime.log?.(`[tlon] Now watching new channel: ${channelNest}`);
					}
				}
			} catch (error) {
				runtime.error?.(`[tlon] Channel refresh error: ${formatErrorMessage(error)}`);
			}
		}, 120 * 1e3);
		if (opts.abortSignal) {
			const signal = opts.abortSignal;
			await new Promise((resolve) => {
				signal.addEventListener("abort", () => {
					clearInterval(pollInterval);
					resolve(null);
				}, { once: true });
			});
		} else await new Promise(() => {});
	} finally {
		try {
			await api?.close();
		} catch (error) {
			runtime.error?.(`[tlon] Cleanup error: ${formatErrorMessage(error)}`);
		}
	}
}
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/collect-stream-body.js
var collectBody$1;
var init_collect_stream_body = __esmMin((() => {
	init_serde();
	collectBody$1 = async (streamBody = new Uint8Array(), context) => {
		if (streamBody instanceof Uint8Array) return Uint8ArrayBlobAdapter.mutate(streamBody);
		if (!streamBody) return Uint8ArrayBlobAdapter.mutate(new Uint8Array());
		const fromContext = context.streamCollector(streamBody);
		return Uint8ArrayBlobAdapter.mutate(await fromContext);
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/extended-encode-uri-component.js
function extendedEncodeURIComponent(str) {
	if (/^[\w.~-]+$/.test(str)) return str;
	return encodeURIComponent(str).replace(/[!'()*]/g, function(c) {
		return "%" + c.charCodeAt(0).toString(16).toUpperCase();
	});
}
var init_extended_encode_uri_component = __esmMin((() => {}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/HttpBindingNormalizedSchema.js
var HTTP_BINDINGS, HttpBindingNormalizedSchema, buildHttpBindings, buildPathSegments, buildHttpOperationBindings, EMPTY_BINDINGS, getHttpOperationBindings, createBodySchema;
var init_HttpBindingNormalizedSchema = __esmMin((() => {
	init_schema();
	init_serde();
	HTTP_BINDINGS = Symbol.for("@smithy/schema-x");
	HttpBindingNormalizedSchema = class HttpBindingNormalizedSchema extends NormalizedSchema {
		static identity = Symbol.for("@smithy/HttpBindingNormalizedSchema");
		identity = HttpBindingNormalizedSchema.identity;
		bindings;
		constructor(schema) {
			super(schema);
		}
		static of(schema) {
			const ns = NormalizedSchema.of(schema);
			if (ns.identity === HttpBindingNormalizedSchema.identity) return ns;
			const schemaCache = ns.isMemberSchema() ? ns : ns.getSchema();
			const cache = typeof schemaCache === "object" && schemaCache !== null ? schemaCache : ns;
			return cache[HTTP_BINDINGS] ??= new HttpBindingNormalizedSchema(ns);
		}
		getHttpBindingLocation(traits) {
			if (traits.httpPayload) return 36;
			if (traits.httpLabel) return 33;
			if (traits.httpHeader) return 38;
			if (typeof traits.httpPrefixHeaders === "string") return 39;
			if (traits.httpQuery) return 34;
			if (traits.httpQueryParams) return 35;
			if (traits.httpResponseCode) return 37;
			return 32;
		}
		getHttpBindingValue(location, traits, nested = false) {
			const raw = this.getSchema();
			const type = typeof raw === "number" ? raw & 255 : this.isListSchema() ? 64 : 255;
			const slot = location & 7;
			const media = traits.mediaType ? traits.mediaType === "application/json" || traits.mediaType.endsWith("+json") ? 2 : 1 : 0;
			const stream = traits.streaming || type === 42 ? this.isStructSchema() ? 2 : 1 : 0;
			const timestamp = type >= 4 && type <= 7 ? slot >= 6 ? 2 : slot > 0 && slot < 4 ? 1 : 0 : 0;
			let flags = type | media << 8 | (traits.idempotencyToken ? 1 : 0) << 10 | stream << 11 | (traits.sparse ? 1 : 0) << 13 | timestamp << 14 | (traits.hostLabel ? 1 : 0) << 17 | (location === 36 && typeof raw !== "object" ? 1 : 0) << 18;
			const category = type & 192;
			const collectionValue = slot & 2 && (category === 64 || !nested && slot & 1) ? this.getHttpBindingCollectionValue(location, traits) : void 0;
			const valueType = (collectionValue?.[1] ?? 0) & 255;
			flags |= (slot >= 6 && (valueType === 4 || valueType === 6) ? 1 : 0) << 16;
			return [
				this,
				flags,
				collectionValue
			];
		}
		getHttpBindingCollectionValue(location, traits = this.getMergedTraits()) {
			const valueSchema = HttpBindingNormalizedSchema.of(this.getValueSchema());
			return valueSchema.getHttpBindingValue(location, {
				...valueSchema.getMergedTraits(),
				...traits
			}, true);
		}
		getHttpBindings() {
			const source = this.getSchema();
			return typeof source !== "object" || source === null ? EMPTY_BINDINGS : this.bindings ??= buildHttpBindings(this);
		}
	};
	buildHttpBindings = (schema) => {
		const bodyMemberNames = [];
		const bodyMemberSchemas = [];
		const requestBodyMemberNames = [];
		const requestBodyMemberSchemas = [];
		const memberBindings = [];
		const byName = {};
		const headers = {};
		const prefixHeaders = [];
		const responseBindings = {
			headers,
			prefixHeaders
		};
		const bindings = {
			request: {
				memberBindings,
				byName
			},
			response: {
				bodyMemberNames,
				bindings: responseBindings
			}
		};
		const { request, response } = bindings;
		for (const [name, member] of schema.structIterator()) {
			const bindingSchema = HttpBindingNormalizedSchema.of(member);
			const traits = bindingSchema.getMergedTraits();
			const location = bindingSchema.getHttpBindingLocation(traits);
			const wireName = traits.httpHeader?.toLowerCase() ?? traits.httpPrefixHeaders?.toLowerCase() ?? traits.httpQuery;
			const value = bindingSchema.getHttpBindingValue(location, traits);
			const binding = [
				name,
				value,
				location,
				wireName
			];
			if (name === "__proto__") writeKey$1(byName);
			byName[name] = binding;
			if (value[1] >> 10 & 1) request.hasIdempotency = true;
			memberBindings.push(binding);
			const slot = location & 7;
			if (slot === 0) {
				requestBodyMemberNames.push(name);
				requestBodyMemberSchemas.push(member);
			}
			if ((slot & 4) === 0) {
				bodyMemberNames.push(name);
				bodyMemberSchemas.push(member);
			} else if ((slot & 6) === 4) if (slot & 1) responseBindings.statusCode = binding;
			else {
				responseBindings.payload = binding;
				const type = value[1] & 255;
				request.contentTypeInstruction = traits.mediaType ?? (type === 0 ? "text/plain" : type === 21 || type === 42 ? "application/octet-stream" : null);
			}
			else if (slot & 1) {
				request.hasPrefixHeaders = true;
				prefixHeaders.push(binding);
			} else {
				if (wireName === "__proto__") writeKey$1(headers);
				headers[wireName] = binding;
			}
		}
		if (request.contentTypeInstruction === void 0 && requestBodyMemberNames.length) request.contentTypeInstruction = null;
		request.syntheticBodySchema = createBodySchema(schema, requestBodyMemberNames, requestBodyMemberSchemas);
		response.syntheticBodySchema = createBodySchema(schema, bodyMemberNames, bodyMemberSchemas);
		return bindings;
	};
	buildPathSegments = (path) => {
		const segments = [];
		let offset = 0;
		for (const match of path.matchAll(/\{([^{}+]+)(\+)?\}/g)) {
			if (match.index > offset) segments.push([path.slice(offset, match.index), 0]);
			segments.push([match[1], match[2] ? 2 : 1]);
			offset = match.index + match[0].length;
		}
		if (segments.length && offset < path.length) segments.push([path.slice(offset), 0]);
		return segments.length ? segments : void 0;
	};
	buildHttpOperationBindings = (schema) => {
		const { http, endpoint } = translateTraits(schema.traits ?? {});
		const [path, search] = http?.[1].split("?") ?? [];
		return [
			http?.[0],
			path,
			search ? [...new URLSearchParams(search)] : [],
			path ? buildPathSegments(path) : void 0,
			endpoint?.[0]
		];
	};
	EMPTY_BINDINGS = {
		request: {
			memberBindings: [],
			byName: {}
		},
		response: {
			bodyMemberNames: [],
			bindings: {
				headers: {},
				prefixHeaders: []
			}
		}
	};
	getHttpOperationBindings = (schema) => schema[HTTP_BINDINGS] ??= buildHttpOperationBindings(schema);
	createBodySchema = (schema, memberNames, memberSchemas) => {
		if (!memberNames.length) return;
		const source = schema.getSchema();
		const body = [
			3,
			source[1],
			source[2],
			schema.getMergedTraits(),
			memberNames,
			memberSchemas
		];
		const required = source[6];
		const bodyRequired = required && memberNames.reduce((count, name) => count + (source[4].indexOf(name) < required ? 1 : 0), 0);
		if (bodyRequired) body[6] = bodyRequired;
		return body;
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/SerdeContext.js
var SerdeContext;
var init_SerdeContext = __esmMin((() => {
	SerdeContext = class {
		serdeContext;
		setSerdeContext(serdeContext) {
			this.serdeContext = serdeContext;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/HttpProtocol.js
var HttpProtocol;
var init_HttpProtocol = __esmMin((() => {
	init_transport();
	init_schema();
	init_SerdeContext();
	init_HttpBindingNormalizedSchema();
	HttpProtocol = class extends SerdeContext {
		options;
		compositeErrorRegistry;
		constructor(options) {
			super();
			this.options = options;
			this.compositeErrorRegistry = new TypeRegistry(options.defaultNamespace);
			for (const etr of options.errorTypeRegistries ?? []) this.compositeErrorRegistry.copyFrom(etr);
		}
		getRequestType() {
			return HttpRequest;
		}
		getResponseType() {
			return HttpResponse;
		}
		setSerdeContext(serdeContext) {
			this.serdeContext = serdeContext;
			this.serializer.setSerdeContext(serdeContext);
			this.deserializer.setSerdeContext(serdeContext);
			if (this.getPayloadCodec()) this.getPayloadCodec().setSerdeContext(serdeContext);
		}
		updateServiceEndpoint(request, endpoint) {
			if ("url" in endpoint) {
				request.protocol = endpoint.url.protocol;
				request.hostname = endpoint.url.hostname;
				request.port = endpoint.url.port ? Number(endpoint.url.port) : void 0;
				request.path = endpoint.url.pathname;
				request.fragment = endpoint.url.hash || void 0;
				request.username = endpoint.url.username || void 0;
				request.password = endpoint.url.password || void 0;
				if (!request.query) request.query = {};
				for (const [k, v] of endpoint.url.searchParams.entries()) request.query[k] = v;
				if (endpoint.headers) for (const name in endpoint.headers) {
					if (!hasOwn$1(endpoint.headers, name)) continue;
					request.headers[name] = endpoint.headers[name].join(", ");
				}
				return request;
			} else {
				request.protocol = endpoint.protocol;
				request.hostname = endpoint.hostname;
				request.port = endpoint.port ? Number(endpoint.port) : void 0;
				request.path = endpoint.path;
				request.query = { ...endpoint.query };
				if (endpoint.headers) for (const name in endpoint.headers) {
					if (!hasOwn$1(endpoint.headers, name)) continue;
					request.headers[name] = endpoint.headers[name];
				}
				return request;
			}
		}
		setHostPrefix(request, operationSchema, input, operation = getHttpOperationBindings(operationSchema)) {
			if (this.serdeContext?.disableHostPrefix) return;
			const hostPrefix = operation[4];
			if (typeof hostPrefix !== "string") return;
			let resolvedHostPrefix = hostPrefix;
			for (const [name, [, flags]] of HttpBindingNormalizedSchema.of(operationSchema.input).getHttpBindings().request.memberBindings) {
				if (!(flags >> 17 & 1)) continue;
				const replacement = input[name];
				if (typeof replacement !== "string") throw new Error(`@smithy/core/schema - ${name} in input must be a string as hostLabel.`);
				resolvedHostPrefix = resolvedHostPrefix.replace(`{${name}}`, replacement);
			}
			request.hostname = resolvedHostPrefix + request.hostname;
			if (!isValidHostname(request.hostname)) throw new Error(`[${request.hostname}] is not a valid hostname.`);
		}
		deserializeMetadata(output) {
			return {
				httpStatusCode: output.statusCode,
				requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
				extendedRequestId: output.headers["x-amz-id-2"],
				cfId: output.headers["x-amz-cf-id"]
			};
		}
		resolveError(name, namespaces, registries) {
			const defaultErrorSchema = [
				-3,
				"",
				"Error",
				0,
				[],
				[],
				0
			];
			let schema;
			for (const registry of registries) for (const ns of namespaces) try {
				if (ns === "*") schema = registry.getSchema(name);
				else schema = registry.getSchema(ns + "#" + name);
				const errorCtor = registry.getErrorCtor(schema);
				if (errorCtor) return [
					schema,
					errorCtor,
					"modeled"
				];
				else {
					const syntheticErrorSchema = registry.getBaseException();
					if (syntheticErrorSchema) {
						const syntheticErrorCtor = registry.getErrorCtor(syntheticErrorSchema);
						if (syntheticErrorCtor) return [
							schema,
							syntheticErrorCtor,
							"synthetic"
						];
					}
				}
			} catch (ignored) {}
			for (const registry of registries) {
				const syntheticErrorSchema = registry.getBaseException();
				if (syntheticErrorSchema) {
					const syntheticErrorCtor = registry.getErrorCtor(syntheticErrorSchema);
					if (syntheticErrorCtor) return [
						syntheticErrorSchema,
						syntheticErrorCtor,
						"synthetic"
					];
				}
			}
			return [
				defaultErrorSchema,
				Error,
				"native"
			];
		}
		async serializeEventStream({ eventStream, requestSchema, initialRequest }) {
			return (await this.loadEventStreamCapability()).serializeEventStream({
				eventStream,
				requestSchema,
				initialRequest
			});
		}
		async deserializeEventStream({ response, responseSchema, initialResponseContainer }) {
			return (await this.loadEventStreamCapability()).deserializeEventStream({
				response,
				responseSchema,
				initialResponseContainer
			});
		}
		async loadEventStreamCapability() {
			const { EventStreamSerde, eventStreamSerdeProvider } = await import("./event-streams-nBM310Eh.js");
			return new EventStreamSerde({
				marshaller: this.resolveEventStreamMarshaller(eventStreamSerdeProvider),
				serializer: this.serializer,
				deserializer: this.deserializer,
				serdeContext: this.serdeContext,
				defaultContentType: this.getDefaultContentType(),
				compositeErrorRegistry: this.compositeErrorRegistry
			});
		}
		getDefaultContentType() {
			throw new Error(`@smithy/core/protocols - ${this.constructor.name} getDefaultContentType() implementation missing.`);
		}
		async deserializeHttpMessage(schema, context, response, arg4, arg5) {
			return [];
		}
		getEventStreamMarshaller() {
			const context = this.serdeContext;
			if (!context.eventStreamMarshaller) throw new Error("@smithy/core - HttpProtocol: eventStreamMarshaller missing in serdeContext.");
			return context.eventStreamMarshaller;
		}
		resolveEventStreamMarshaller(importedProvider) {
			const context = this.serdeContext;
			if (context.eventStreamMarshaller) return context.eventStreamMarshaller;
			return importedProvider(this.serdeContext);
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/HttpBindingProtocol.js
var HttpBindingProtocol;
var init_HttpBindingProtocol = __esmMin((() => {
	init_transport();
	init_serde();
	init_HttpBindingNormalizedSchema();
	init_HttpProtocol();
	init_collect_stream_body();
	init_extended_encode_uri_component();
	HttpBindingProtocol = class extends HttpProtocol {
		async serializeRequest(operationSchema, _input, context) {
			const input = _input && typeof _input === "object" ? _input : {};
			const query = {};
			const headers = {};
			const endpoint = await context.endpoint();
			const ns = HttpBindingNormalizedSchema.of(operationSchema?.input);
			const bindings = ns.getHttpBindings().request;
			const operation = getHttpOperationBindings(operationSchema);
			const request = new HttpRequest({
				query,
				headers
			});
			if (endpoint) {
				this.updateServiceEndpoint(request, endpoint);
				this.setHostPrefix(request, operationSchema, input, operation);
				const [method, path, staticQuery] = operation;
				if (method) {
					request.method = method;
					request.path = request.path === "/" ? path : request.path + path;
					for (const [key, value] of staticQuery) query[key] = value;
				}
			}
			request.query = query;
			const eventStream = this.serializeHttpBindings(input, request, bindings, operation);
			if (eventStream) request.body = await this.serializeEventStream({
				eventStream,
				requestSchema: ns
			});
			return request;
		}
		serializeHttpBindings(input, request, bindings, operation) {
			const serializer = this.serializer;
			const directSerializer = typeof serializer.writeCodec === "function" ? serializer : void 0;
			const query = request.query;
			const headers = request.headers;
			const bodySchema = bindings.syntheticBodySchema;
			let hasBodyValue = false;
			let payload;
			let eventStream;
			let labels;
			const names = Object.getOwnPropertyNames(input);
			const prototype = Object.getPrototypeOf(input);
			const sparse = (prototype === Object.prototype || prototype === null) && !bindings.hasIdempotency && !bindings.hasPrefixHeaders && names.length * 2 < bindings.memberBindings.length;
			const length = sparse ? names.length : bindings.memberBindings.length;
			for (let i = 0; i < length; ++i) {
				const binding = sparse ? hasOwn$1(bindings.byName, names[i]) ? bindings.byName[names[i]] : void 0 : bindings.memberBindings[i];
				if (!binding) continue;
				const value = binding[1];
				const memberName = binding[0];
				const memberNs = value[0];
				const flags = value[1];
				const collectionValue = value[2];
				const location = binding[2];
				const wireName = binding[3];
				const inputMemberValue = input[memberName];
				if (inputMemberValue == null && !(flags >> 10 & 1)) continue;
				if (location === 36) {
					const stream = flags >> 11 & 3;
					if (stream) if (stream === 2) eventStream = inputMemberValue || void 0;
					else payload = inputMemberValue;
					else {
						if (directSerializer) directSerializer.writeCodec(memberNs, inputMemberValue);
						else serializer.write(memberNs, inputMemberValue);
						payload = serializer.flush();
					}
				} else if (location === 33 || location === 38) {
					const serialized = this.serializeHttpValue(value, inputMemberValue, location, directSerializer);
					if (location === 33) (labels ??= Object.create(null))[memberName] = serialized;
					else headers[wireName] = serialized;
				} else if (location === 39) for (const key in inputMemberValue) {
					if (!hasOwn$1(inputMemberValue, key)) continue;
					const amalgam = wireName + key;
					headers[amalgam.toLowerCase()] = this.serializeHttpValue(collectionValue, inputMemberValue[key], 38, directSerializer, directSerializer ? collectionValue[0] : [collectionValue[0], { httpHeader: amalgam }]);
				}
				else if ((location & 62) === 34) this.serializeQuery(value, inputMemberValue, wireName, query, directSerializer);
				else hasBodyValue = true;
			}
			const operationPath = operation[1];
			const pathSegments = operation[3];
			if (operationPath && pathSegments && request.path.endsWith(operationPath)) request.path = request.path.slice(0, -operationPath.length) + this.serializePath(pathSegments, labels, bindings);
			if (hasBodyValue && bodySchema) {
				if (directSerializer) directSerializer.writeCodec(bodySchema, input);
				else serializer.write(bodySchema, input);
				payload = serializer.flush();
			}
			request.body = payload;
			return eventStream;
		}
		serializeQuery(value, data, wireName, query, directSerializer) {
			const [ns, flags, collectionValue] = value;
			const traits = directSerializer ? void 0 : ns.getMergedTraits();
			if (wireName === void 0) {
				for (const key in data) {
					if (!hasOwn$1(data, key) || key in query) continue;
					if (!directSerializer) Object.assign(collectionValue[0].getMergedTraits(), {
						...traits,
						httpQuery: key,
						httpQueryParams: void 0
					});
					this.serializeQuery(collectionValue, data[key], key, query, directSerializer);
				}
				return;
			}
			if ((flags & 192) === 64) {
				const buffer = [];
				for (const item of data) {
					const serialized = this.serializeHttpValue(collectionValue, item, 34, directSerializer, directSerializer ? collectionValue[0] : [collectionValue[0], traits]);
					if (flags >> 13 & 1 || serialized !== void 0) buffer.push(serialized);
				}
				query[wireName] = buffer;
			} else query[wireName] = this.serializeHttpValue(value, data, 34, directSerializer, directSerializer ? ns : [ns, traits]);
		}
		serializeHttpValue(value, data, location, directSerializer, schema = value[0]) {
			const flags = value[1];
			const type = flags & 255;
			if (directSerializer && !(flags & 1792) && (type <= 2 || type === 17 || type === 19)) return String(data);
			if (directSerializer) directSerializer.writeHttpBinding(value, data, location);
			else this.serializer.write(schema, data);
			return this.serializer.flush();
		}
		serializePath(segments, labels, bindings) {
			let path = "";
			for (const [value, kind] of segments) {
				if (kind === 0) {
					path += value;
					continue;
				}
				const replacement = labels?.[value];
				if (replacement === void 0) {
					if (hasOwn$1(bindings.byName, value) && bindings.byName[value][2] === 33) throw new Error(`No value provided for input HTTP label: ${value}.`);
					path += `{${value}${kind === 2 ? "+" : ""}}`;
				} else path += kind === 2 ? replacement.split("/").map(extendedEncodeURIComponent).join("/") : extendedEncodeURIComponent(replacement);
			}
			return path;
		}
		async deserializeResponse(operationSchema, context, response) {
			const deserializer = this.deserializer;
			const directDeserializer = typeof deserializer.readCodec === "function" ? deserializer : void 0;
			const ns = HttpBindingNormalizedSchema.of(operationSchema.output);
			const responseBindings = ns.getHttpBindings().response;
			const dataObject = {};
			if (response.statusCode >= 300) {
				const bytes = await collectBody$1(response.body, context);
				if (bytes.byteLength > 0) Object.assign(dataObject, await deserializer.read(15, bytes));
				await this.handleError(operationSchema, context, response, dataObject, this.deserializeMetadata(response));
				throw new Error("@smithy/core/protocols - HTTP Protocol error handler failed to throw.");
			}
			const nonHttpBindingMembers = await this.deserializeHttpMessage(ns, context, response, dataObject);
			if (nonHttpBindingMembers.length) {
				const bytes = await collectBody$1(response.body, context);
				if (bytes.byteLength > 0) {
					const dataFromBody = await (directDeserializer ? directDeserializer.readCodec(responseBindings.syntheticBodySchema, bytes) : deserializer.read(responseBindings.syntheticBodySchema, bytes));
					for (const member of nonHttpBindingMembers) if (dataFromBody[member] != null) dataObject[member] = dataFromBody[member];
				}
			} else if (!responseBindings.bindings.payload) await collectBody$1(response.body, context);
			dataObject.$metadata = this.deserializeMetadata(response);
			return dataObject;
		}
		async deserializeHttpMessage(schema, context, response, arg4, arg5) {
			const dataObject = arg4 instanceof Set ? arg5 : arg4;
			const deserializer = this.deserializer;
			const directDeserializer = typeof deserializer.readCodec === "function" ? deserializer : void 0;
			const ns = HttpBindingNormalizedSchema.of(schema);
			const { bodyMemberNames, bindings: { payload, statusCode, headers: responseHeaders, prefixHeaders } } = ns.getHttpBindings().response;
			const headers = response.headers;
			if (payload) {
				const [memberName, value] = payload;
				const [memberSchema, flags] = value;
				const stream = flags >> 11 & 3;
				if (stream) if (stream === 2) dataObject[memberName] = await this.deserializeEventStream({
					response,
					responseSchema: ns
				});
				else dataObject[memberName] = sdkStreamMixin(response.body);
				else if (response.body) {
					const bytes = await collectBody$1(response.body, context);
					if (bytes.byteLength > 0) dataObject[memberName] = await (directDeserializer ? directDeserializer.readPayload(value, bytes) : deserializer.read(memberSchema, bytes));
				}
			}
			for (const header in headers) {
				if (!hasOwn$1(headers, header)) continue;
				const lower = header.toLowerCase();
				const headerValue = headers[header];
				if (lower !== header) {
					delete headers[header];
					headers[lower] = headerValue;
				}
				const binding = hasOwn$1(responseHeaders, lower) ? responseHeaders[lower] : void 0;
				if (!binding) continue;
				const [memberName, [memberSchema, flags, collectionValue], , wireName] = binding;
				if (collectionValue) {
					const sections = flags >> 16 & 1 ? splitEvery(headerValue, ",", 2) : splitHeader(headerValue);
					const list = [];
					for (const section of sections) list.push(directDeserializer ? directDeserializer.readHttpBinding(collectionValue, section.trim(), 38) : await deserializer.read([collectionValue[0], { httpHeader: wireName }], section.trim()));
					dataObject[memberName] = list;
				} else dataObject[memberName] = directDeserializer ? directDeserializer.readHttpBinding(binding[1], headerValue, 38) : await deserializer.read(memberSchema, headerValue);
			}
			for (const [memberName, [, , collectionValue], , wireName] of prefixHeaders) {
				dataObject[memberName] = {};
				for (const header in headers) {
					if (!hasOwn$1(headers, header)) continue;
					if (!header.startsWith(wireName)) continue;
					const headerValue = headers[header];
					dataObject[memberName][header.slice(wireName.length)] = directDeserializer ? directDeserializer.readHttpBinding(collectionValue, headerValue, 38) : await deserializer.read([collectionValue[0], { httpHeader: header }], headerValue);
				}
			}
			if (statusCode) dataObject[statusCode[0]] = response.statusCode;
			return bodyMemberNames;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/RpcProtocol.js
var RpcProtocol;
var init_RpcProtocol = __esmMin((() => {
	init_transport();
	init_schema();
	init_HttpProtocol();
	init_collect_stream_body();
	RpcProtocol = class extends HttpProtocol {
		async serializeRequest(operationSchema, _input, context) {
			const serializer = this.serializer;
			const query = {};
			const headers = {};
			const endpoint = await context.endpoint();
			const ns = NormalizedSchema.of(operationSchema?.input);
			const schema = ns.getSchema();
			let payload;
			const input = _input && typeof _input === "object" ? _input : {};
			const request = new HttpRequest({
				protocol: "",
				hostname: "",
				port: void 0,
				path: "/",
				fragment: void 0,
				query,
				headers,
				body: void 0
			});
			if (endpoint) {
				this.updateServiceEndpoint(request, endpoint);
				this.setHostPrefix(request, operationSchema, input);
			}
			if (input) {
				const eventStreamMember = ns.getEventStreamMember();
				if (eventStreamMember) {
					if (input[eventStreamMember]) {
						const initialRequest = {};
						for (const [memberName] of ns.structIterator()) if (memberName !== eventStreamMember && input[memberName] != null) initialRequest[memberName] = input[memberName];
						payload = await this.serializeEventStream({
							eventStream: input[eventStreamMember],
							requestSchema: ns,
							initialRequest
						});
					}
				} else {
					serializer.write(schema, input);
					payload = serializer.flush();
				}
			}
			request.headers = Object.assign(request.headers, headers);
			request.query = query;
			request.body = payload;
			request.method = "POST";
			return request;
		}
		async deserializeResponse(operationSchema, context, response) {
			const deserializer = this.deserializer;
			const ns = NormalizedSchema.of(operationSchema.output);
			const dataObject = {};
			if (this.isErrorResponse(response.statusCode)) {
				const bytes = await collectBody$1(response.body, context);
				if (bytes.byteLength > 0) Object.assign(dataObject, await deserializer.read(15, bytes));
				await this.handleError(operationSchema, context, response, dataObject, this.deserializeMetadata(response));
				throw new Error("@smithy/core/protocols - RPC Protocol error handler failed to throw.");
			}
			for (const header in response.headers) {
				if (!hasOwn$1(response.headers, header)) continue;
				const value = response.headers[header];
				delete response.headers[header];
				response.headers[header.toLowerCase()] = value;
			}
			const eventStreamMember = ns.getEventStreamMember();
			if (eventStreamMember) dataObject[eventStreamMember] = await this.deserializeEventStream({
				response,
				responseSchema: ns,
				initialResponseContainer: dataObject
			});
			else {
				const bytes = await collectBody$1(response.body, context);
				if (bytes.byteLength > 0) Object.assign(dataObject, await deserializer.read(ns, bytes));
			}
			dataObject.$metadata = this.deserializeMetadata(response);
			return dataObject;
		}
		isErrorResponse(statusCode) {
			return statusCode >= 300;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/AbstractRpcV2Protocol.js
var AbstractRpcV2Protocol;
var init_AbstractRpcV2Protocol = __esmMin((() => {
	init_schema();
	init_transport();
	init_RpcProtocol();
	AbstractRpcV2Protocol = class extends RpcProtocol {
		constructor({ defaultNamespace, errorTypeRegistries }) {
			super({
				defaultNamespace,
				errorTypeRegistries
			});
		}
		async serializeRequest(operationSchema, input, context) {
			const request = await super.serializeRequest(operationSchema, input, context);
			Object.assign(request.headers, {
				"content-type": this.getDefaultContentType(),
				"smithy-protocol": this.getSmithyProtocolHeaderValue(),
				accept: this.getDefaultContentType()
			});
			if (deref(operationSchema.input) === "unit") {
				delete request.body;
				delete request.headers["content-type"];
			} else this.applyEmptyBody(request);
			const { service, operation } = getSmithyContext(context);
			const path = `/service/${service}/operation/${operation}`;
			if (request.path.endsWith("/")) request.path += path.slice(1);
			else request.path += path;
			return request;
		}
		isErrorResponse(statusCode) {
			return statusCode !== 200;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/resolve-path.js
var resolvedPath;
var init_resolve_path = __esmMin((() => {
	init_extended_encode_uri_component();
	resolvedPath = (resolvedPath, input, memberName, labelValueProvider, uriLabel, isGreedyLabel) => {
		if (input != null && input[memberName] !== void 0) {
			const labelValue = labelValueProvider();
			if (labelValue == null || labelValue.length <= 0) throw new Error("Empty value provided for input HTTP label: " + memberName + ".");
			resolvedPath = resolvedPath.replace(uriLabel, isGreedyLabel ? labelValue.split("/").map((segment) => extendedEncodeURIComponent(segment)).join("/") : extendedEncodeURIComponent(labelValue));
		} else throw new Error("No value provided for input HTTP label: " + memberName + ".");
		return resolvedPath;
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/requestBuilder.js
function requestBuilder(input, context) {
	return new RequestBuilder(input, context);
}
var RequestBuilder;
var init_requestBuilder = __esmMin((() => {
	init_transport();
	init_resolve_path();
	RequestBuilder = class {
		input;
		context;
		query = {};
		method = "";
		headers = {};
		path = "";
		body = null;
		hostname = "";
		resolvePathStack = [];
		constructor(input, context) {
			this.input = input;
			this.context = context;
		}
		async build() {
			const { hostname, protocol = "https", port, path: basePath } = await this.context.endpoint();
			this.path = basePath;
			for (const resolvePath of this.resolvePathStack) resolvePath(this.path);
			return new HttpRequest({
				protocol,
				hostname: this.hostname || hostname,
				port,
				method: this.method,
				path: this.path,
				query: this.query,
				body: this.body,
				headers: this.headers
			});
		}
		hn(hostname) {
			this.hostname = hostname;
			return this;
		}
		bp(uriLabel) {
			this.resolvePathStack.push((basePath) => {
				this.path = `${basePath?.endsWith("/") ? basePath.slice(0, -1) : basePath || ""}` + uriLabel;
			});
			return this;
		}
		p(memberName, labelValueProvider, uriLabel, isGreedyLabel) {
			this.resolvePathStack.push((path) => {
				this.path = resolvedPath(path, this.input, memberName, labelValueProvider, uriLabel, isGreedyLabel);
			});
			return this;
		}
		h(headers) {
			this.headers = headers;
			return this;
		}
		q(query) {
			this.query = query;
			return this;
		}
		b(body) {
			this.body = body;
			return this;
		}
		m(method) {
			this.method = method;
			return this;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/serde/FromStringShapeDeserializer.js
var FromStringShapeDeserializer;
var init_FromStringShapeDeserializer = __esmMin((() => {
	init_serde();
	init_HttpBindingNormalizedSchema();
	init_SerdeContext();
	FromStringShapeDeserializer = class extends SerdeContext {
		settings;
		constructor(settings) {
			super();
			this.settings = settings;
		}
		read(_schema, data) {
			const ns = HttpBindingNormalizedSchema.of(_schema);
			const traits = ns.getMergedTraits();
			const location = ns.getHttpBindingLocation(traits);
			return this.readHttpBinding(ns.getHttpBindingValue(location, traits), data, location);
		}
		readHttpBinding([ns, flags, collectionValue], data, location) {
			const schema = flags & 255;
			if ((schema & 192) === 64) {
				collectionValue ??= ns.getHttpBindingCollectionValue(location);
				return splitHeader(data).map((item) => this.readHttpBinding(collectionValue, item, location));
			}
			switch (schema) {
				case 21:
				case 42: return (this.serdeContext?.base64Decoder ?? fromBase64)(data);
				case 4:
				case 5:
				case 6:
				case 7: {
					const bindingFormat = this.settings.httpBindings ? flags >> 14 & 3 : 0;
					switch (this.settings.timestampFormat.useTrait && schema > 4 ? schema : bindingFormat ? bindingFormat + 4 : this.settings.timestampFormat.default) {
						case 5: return _parseRfc3339DateTimeWithOffset(data);
						case 6: return _parseRfc7231DateTime(data);
						case 7: return _parseEpochTimestamp(data);
						default:
							console.warn("Missing timestamp format, parsing value with Date constructor:", data);
							return new Date(data);
					}
				}
				case 0: {
					const media = flags >> 8 & 3;
					if (!media) return data;
					let intermediateValue = data;
					if ((location & 6) === 6) intermediateValue = (this.serdeContext?.utf8Encoder ?? toUtf8)((this.serdeContext?.base64Decoder ?? fromBase64)(intermediateValue));
					return media === 2 ? LazyJsonString.from(intermediateValue) : intermediateValue;
				}
				case 1: return Number(data);
				case 2: return data.toLowerCase() === "true";
				case 17: return BigInt(data);
				case 19: return new NumericValue(data, "bigDecimal");
				default: return data;
			}
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/serde/HttpInterceptingShapeDeserializer.js
var HttpInterceptingShapeDeserializer;
var init_HttpInterceptingShapeDeserializer = __esmMin((() => {
	init_serde();
	init_HttpBindingNormalizedSchema();
	init_SerdeContext();
	init_FromStringShapeDeserializer();
	HttpInterceptingShapeDeserializer = class extends SerdeContext {
		codecDeserializer;
		stringDeserializer;
		constructor(codecDeserializer, codecSettings) {
			super();
			this.codecDeserializer = codecDeserializer;
			this.stringDeserializer = new FromStringShapeDeserializer(codecSettings);
		}
		setSerdeContext(serdeContext) {
			this.stringDeserializer.setSerdeContext(serdeContext);
			this.codecDeserializer.setSerdeContext(serdeContext);
			this.serdeContext = serdeContext;
		}
		read(schema, data) {
			const ns = HttpBindingNormalizedSchema.of(schema);
			const traits = ns.getMergedTraits();
			if (traits.httpHeader || traits.httpResponseCode) {
				const value = ns.getHttpBindingValue(38, traits);
				return this.readHttpBinding(value, data, 38);
			}
			if (traits.httpPayload) return this.readPayload(ns.getHttpBindingValue(36, traits), data);
			return this.readCodec(ns, data);
		}
		readHttpBinding(binding, data, location) {
			const value = typeof data === "string" ? data : (this.serdeContext?.utf8Encoder ?? toUtf8)(data);
			return this.stringDeserializer.readHttpBinding(binding, value, location);
		}
		readPayload([schema, flags], data) {
			const type = flags & 255;
			if (type === 21 || type === 42) return typeof data === "string" ? (this.serdeContext?.utf8Decoder ?? fromUtf8)(data) : data;
			if (type === 0) return typeof data === "string" ? data : (this.serdeContext?.utf8Encoder ?? toUtf8)(data);
			return this.readCodec(schema, data);
		}
		readCodec(schema, data) {
			return this.codecDeserializer.read(schema, data);
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/serde/ToStringShapeSerializer.js
var ToStringShapeSerializer;
var init_ToStringShapeSerializer = __esmMin((() => {
	init_serde();
	init_HttpBindingNormalizedSchema();
	init_SerdeContext();
	ToStringShapeSerializer = class extends SerdeContext {
		settings;
		stringBuffer = "";
		constructor(settings) {
			super();
			this.settings = settings;
		}
		write(schema, value) {
			const ns = HttpBindingNormalizedSchema.of(schema);
			const traits = ns.getMergedTraits();
			const location = ns.getHttpBindingLocation(traits);
			this.writeHttpBinding(ns.getHttpBindingValue(location, traits), value, location);
		}
		writeHttpBinding([ns, flags, collectionValue], value, location) {
			const schema = flags & 255;
			switch (typeof value) {
				case "object":
					if (value === null) {
						this.stringBuffer = "null";
						return;
					}
					if (schema >= 4 && schema <= 7) {
						if (!(value instanceof Date)) throw new Error(`@smithy/core/protocols - received non-Date value ${value} when schema expected Date in ${ns.getName(true)}`);
						const bindingFormat = this.settings.httpBindings ? flags >> 14 & 3 : 0;
						switch (this.settings.timestampFormat.useTrait && schema > 4 ? schema : bindingFormat ? bindingFormat + 4 : this.settings.timestampFormat.default) {
							case 5:
								this.stringBuffer = value.toISOString().replace(".000Z", "Z");
								break;
							case 6:
								this.stringBuffer = dateToUtcString(value);
								break;
							case 7:
								this.stringBuffer = String(value.getTime() / 1e3);
								break;
							default:
								console.warn("Missing timestamp format, using epoch seconds", value);
								this.stringBuffer = String(value.getTime() / 1e3);
						}
						return;
					}
					if ((schema === 21 || schema === 42) && "byteLength" in value) {
						this.stringBuffer = (this.serdeContext?.base64Encoder ?? toBase64)(value);
						return;
					}
					if ((schema & 192) === 64 && Array.isArray(value)) {
						collectionValue ??= ns.getHttpBindingCollectionValue(location);
						const valueSchemaType = collectionValue[1] & 255;
						const isTimestamp = valueSchemaType >= 4 && valueSchemaType <= 7;
						let buffer = "";
						for (const item of value) {
							this.writeHttpBinding(collectionValue, item, location);
							const headerItem = this.flush();
							if (buffer) buffer += ", ";
							buffer += isTimestamp ? headerItem : quoteHeader(headerItem);
						}
						this.stringBuffer = buffer;
						return;
					}
					this.stringBuffer = JSON.stringify(value, null, 2);
					break;
				case "string":
					const media = flags >> 8 & 3;
					let intermediateValue = value;
					if (media === 2) intermediateValue = LazyJsonString.from(intermediateValue);
					if (media && (location & 6) === 6) {
						this.stringBuffer = (this.serdeContext?.base64Encoder ?? toBase64)(intermediateValue.toString());
						return;
					}
					this.stringBuffer = value;
					break;
				default: this.stringBuffer = flags >> 10 & 1 ? generateIdempotencyToken() : String(value);
			}
		}
		flush() {
			const buffer = this.stringBuffer;
			this.stringBuffer = "";
			return buffer;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/serde/HttpInterceptingShapeSerializer.js
var HttpInterceptingShapeSerializer;
var init_HttpInterceptingShapeSerializer = __esmMin((() => {
	init_HttpBindingNormalizedSchema();
	init_ToStringShapeSerializer();
	HttpInterceptingShapeSerializer = class {
		codecSerializer;
		stringSerializer;
		buffer;
		constructor(codecSerializer, codecSettings, stringSerializer = new ToStringShapeSerializer(codecSettings)) {
			this.codecSerializer = codecSerializer;
			this.stringSerializer = stringSerializer;
		}
		setSerdeContext(serdeContext) {
			this.codecSerializer.setSerdeContext(serdeContext);
			this.stringSerializer.setSerdeContext(serdeContext);
		}
		write(schema, value) {
			const ns = HttpBindingNormalizedSchema.of(schema);
			const traits = ns.getMergedTraits();
			if (traits.httpHeader || traits.httpLabel || traits.httpQuery) {
				const location = ns.getHttpBindingLocation(traits);
				this.writeHttpBinding(ns.getHttpBindingValue(location, traits), value, location);
				return;
			}
			this.writeCodec(ns, value);
		}
		writeHttpBinding(binding, value, location) {
			this.stringSerializer.writeHttpBinding(binding, value, location);
			this.buffer = this.stringSerializer.flush();
		}
		writeCodec(schema, value) {
			this.codecSerializer.write(schema, value);
		}
		flush() {
			if (this.buffer !== void 0) {
				const buffer = this.buffer;
				this.buffer = void 0;
				return buffer;
			}
			return this.codecSerializer.flush();
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/serde/determineTimestampFormat.js
function determineTimestampFormat(ns, settings) {
	if (settings.timestampFormat.useTrait) {
		const schema = ns.getSchema();
		if (schema === 5 || schema === 6 || schema === 7) return schema;
	}
	const { httpLabel, httpPrefixHeaders, httpHeader, httpQuery } = ns.getMergedTraits();
	return (settings.httpBindings ? typeof httpPrefixHeaders === "string" || Boolean(httpHeader) ? 6 : Boolean(httpQuery) || Boolean(httpLabel) ? 5 : void 0 : void 0) ?? settings.timestampFormat.default;
}
var init_determineTimestampFormat = __esmMin((() => {}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/protocol-http/Field.js
var import_dist_cjs$9, Field;
var init_Field = __esmMin((() => {
	import_dist_cjs$9 = require_dist_cjs$40();
	Field = class {
		name;
		kind;
		values;
		constructor({ name, kind = import_dist_cjs$9.FieldPosition.HEADER, values = [] }) {
			this.name = name;
			this.kind = kind;
			this.values = values;
		}
		add(value) {
			this.values.push(value);
		}
		set(values) {
			this.values = values;
		}
		remove(value) {
			this.values = this.values.filter((v) => v !== value);
		}
		toString() {
			return this.values.map((v) => v.includes(",") || v.includes(" ") ? `"${v}"` : v).join(", ");
		}
		get() {
			return this.values;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/protocol-http/Fields.js
var Fields;
var init_Fields = __esmMin((() => {
	Fields = class {
		entries = {};
		encoding;
		constructor({ fields = [], encoding = "utf-8" }) {
			fields.forEach(this.setField.bind(this));
			this.encoding = encoding;
		}
		setField(field) {
			this.entries[field.name.toLowerCase()] = field;
		}
		getField(name) {
			return this.entries[name.toLowerCase()];
		}
		removeField(name) {
			delete this.entries[name.toLowerCase()];
		}
		getByType(kind) {
			return Object.values(this.entries).filter((field) => field.kind === kind);
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/protocol-http/extensions/httpExtensionConfiguration.js
var getHttpHandlerExtensionConfiguration, resolveHttpHandlerRuntimeConfig;
var init_httpExtensionConfiguration = __esmMin((() => {
	getHttpHandlerExtensionConfiguration = (runtimeConfig) => {
		if (runtimeConfig.logger && runtimeConfig.logger.constructor?.name !== "NoOpLogger") runtimeConfig.requestHandler?.updateHttpClientConfig?.(Symbol.for("logger"), runtimeConfig.logger);
		if (runtimeConfig.defaultSocketTimeout) runtimeConfig.requestHandler?.updateHttpClientConfig?.(Symbol.for("@smithy/defaultSocketTimeout"), runtimeConfig.defaultSocketTimeout);
		return {
			setHttpHandler(handler) {
				runtimeConfig.requestHandler = handler;
			},
			httpHandler() {
				return runtimeConfig.requestHandler;
			},
			updateHttpClientConfig(key, value) {
				runtimeConfig.requestHandler?.updateHttpClientConfig(key, value);
			},
			httpHandlerConfigs() {
				return runtimeConfig.requestHandler.httpHandlerConfigs();
			}
		};
	};
	resolveHttpHandlerRuntimeConfig = (httpHandlerExtensionConfiguration) => {
		return { requestHandler: httpHandlerExtensionConfiguration.httpHandler() };
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/middleware-content-length/contentLengthMiddleware.js
function contentLengthMiddleware(bodyLengthChecker) {
	return (next) => async (args) => {
		const request = args.request;
		if (HttpRequest.isInstance(request)) {
			const { body, headers } = request;
			if (body && Object.keys(headers).map((str) => str.toLowerCase()).indexOf(CONTENT_LENGTH_HEADER$1) === -1) try {
				const length = bodyLengthChecker(body);
				if (length != null) request.headers = {
					...request.headers,
					[CONTENT_LENGTH_HEADER$1]: String(length)
				};
			} catch (ignored) {}
		}
		return next({
			...args,
			request
		});
	};
}
var CONTENT_LENGTH_HEADER$1, contentLengthMiddlewareOptions, getContentLengthPlugin;
var init_contentLengthMiddleware = __esmMin((() => {
	init_transport();
	CONTENT_LENGTH_HEADER$1 = "content-length";
	contentLengthMiddlewareOptions = {
		step: "build",
		tags: ["SET_CONTENT_LENGTH", "CONTENT_LENGTH"],
		name: "contentLengthMiddleware",
		override: true
	};
	getContentLengthPlugin = (options) => ({ applyToStack: (clientStack) => {
		clientStack.add(contentLengthMiddleware(options.bodyLengthChecker), contentLengthMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/util-uri-escape/escape-uri.js
var escapeUri, hexEncode;
var init_escape_uri = __esmMin((() => {
	escapeUri = (uri) => encodeURIComponent(uri).replace(/[!'()*]/g, hexEncode);
	hexEncode = (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`;
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/util-uri-escape/escape-uri-path.js
var escapeUriPath;
var init_escape_uri_path = __esmMin((() => {
	init_escape_uri();
	escapeUriPath = (uri) => uri.split("/").map(escapeUri).join("/");
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/querystring-builder/buildQueryString.js
function buildQueryString(query) {
	const parts = [];
	for (let key of Object.keys(query).sort()) {
		const value = query[key];
		key = escapeUri(key);
		if (Array.isArray(value)) for (let i = 0, iLen = value.length; i < iLen; i++) parts.push(`${key}=${escapeUri(value[i])}`);
		else {
			let qsEntry = key;
			if (value || typeof value === "string") qsEntry += `=${escapeUri(value)}`;
			parts.push(qsEntry);
		}
	}
	return parts.join("&");
}
var init_buildQueryString = __esmMin((() => {
	init_escape_uri();
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/ConfigurableSerdeContext.js
var SerdeContextConfig$1;
var init_ConfigurableSerdeContext$1 = __esmMin((() => {
	SerdeContextConfig$1 = class {
		serdeContext;
		setSerdeContext(serdeContext) {
			this.serdeContext = serdeContext;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/UnionSerde.js
var UnionSerde$1;
var init_UnionSerde$1 = __esmMin((() => {
	UnionSerde$1 = class {
		from;
		to;
		keys;
		constructor(from, to) {
			this.from = from;
			this.to = to;
			const keys = Object.keys(this.from);
			const set = new Set(keys);
			set.delete("__type");
			this.keys = set;
		}
		mark(key) {
			this.keys.delete(key);
		}
		hasUnknown() {
			return this.keys.size === 1 && Object.keys(this.to).length === 0;
		}
		writeUnknown() {
			if (this.hasUnknown()) {
				const k = this.keys.values().next().value;
				const v = this.from[k];
				this.to.$unknown = [k, v];
			}
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/json/detectBufferParsing.js
function detectBufferParsing() {
	if (canParseBuffer === void 0) try {
		if (typeof Buffer !== "function") canParseBuffer = false;
		else {
			const result = JSON.parse(Buffer.from([123, 125]));
			canParseBuffer = result !== null && typeof result === "object";
		}
	} catch {
		canParseBuffer = false;
	}
	return canParseBuffer;
}
var canParseBuffer;
var init_detectBufferParsing = __esmMin((() => {}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/json/jsonReviver.js
function jsonReviver(key, value, context) {
	if (context?.source) {
		const numericString = context.source;
		if (typeof value === "number") if (value <= Number.MAX_SAFE_INTEGER && value >= Number.MIN_SAFE_INTEGER) {
			if (isRepresentable(numericString, value)) return value;
			return new NumericValue(numericString, "bigDecimal");
		} else {
			if (isFractionalBigNumeric(numericString)) return new NumericValue(numericString, "bigDecimal");
			if (/[eE]/.test(numericString)) return expandExponentToBigInt(numericString);
			return BigInt(numericString);
		}
	}
	return value;
}
function isFractionalBigNumeric(s) {
	const dotIndex = s.indexOf(".");
	if (dotIndex === -1) return false;
	const eIndex = s.search(/[eE]/);
	if (eIndex === -1) return true;
	const fracDigits = eIndex - dotIndex - 1;
	return parseInt(s.slice(eIndex + 1), 10) < fracDigits;
}
function isRepresentable(numericString, value) {
	if (numericString === String(value)) return true;
	if (Object.is(value, -0)) return true;
	if (/[eE]/.test(numericString)) return expandToDecimal(numericString) === expandToDecimal(String(value));
	const normalized = numericString.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
	const canonical = String(value);
	if (normalized === canonical) return true;
	if (/[eE]/.test(canonical)) return normalized === expandToDecimal(canonical);
	return false;
}
function expandToDecimal(s) {
	const negative = s.startsWith("-");
	const abs = negative ? s.slice(1) : s;
	const eIndex = abs.search(/[eE]/);
	let result;
	if (eIndex === -1) result = abs;
	else {
		const exp = parseInt(abs.slice(eIndex + 1), 10);
		const mantissa = abs.slice(0, eIndex);
		const dotIndex = mantissa.indexOf(".");
		let digits;
		let intLen;
		if (dotIndex === -1) {
			digits = mantissa;
			intLen = mantissa.length;
		} else {
			digits = mantissa.slice(0, dotIndex) + mantissa.slice(dotIndex + 1);
			intLen = dotIndex;
		}
		digits = digits.replace(/0+$/, "") || "0";
		const newDotPos = intLen + exp;
		if (digits === "0") result = "0";
		else if (newDotPos <= 0) result = "0." + "0".repeat(-newDotPos) + digits;
		else if (newDotPos >= digits.length) result = digits + "0".repeat(newDotPos - digits.length);
		else result = digits.slice(0, newDotPos) + "." + digits.slice(newDotPos);
	}
	if (result.includes(".")) result = result.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
	return (negative ? "-" : "") + result;
}
function expandExponentToBigInt(s) {
	const eIndex = s.search(/[eE]/);
	const exp = parseInt(s.slice(eIndex + 1), 10);
	const negative = s.startsWith("-");
	const mantissa = s.slice(negative ? 1 : 0, eIndex);
	const dotIndex = mantissa.indexOf(".");
	let digits;
	let shift;
	if (dotIndex === -1) {
		digits = mantissa;
		shift = exp;
	} else {
		digits = mantissa.slice(0, dotIndex) + mantissa.slice(dotIndex + 1);
		shift = exp - (mantissa.length - dotIndex - 1);
	}
	digits = digits.replace(/0+$/, "") || "0";
	const result = BigInt(digits) * 10n ** BigInt(shift + (mantissa.replace(".", "").length - digits.length));
	return negative ? -result : result;
}
var init_jsonReviver = __esmMin((() => {
	init_serde();
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/json/needsReviver.js
function needsReviver(schema) {
	const ns = NormalizedSchema.of(schema);
	const raw = ns.getSchema();
	if (Array.isArray(raw) && ns.isStructSchema()) {
		if (REVIVER_SYMBOL in raw) return raw[REVIVER_SYMBOL];
		const result = _check(ns, /* @__PURE__ */ new Set());
		raw[REVIVER_SYMBOL] = result;
		return result;
	}
	return _check(ns, /* @__PURE__ */ new Set());
}
function _check(ns, seen) {
	const raw = ns.getSchema();
	if (seen.has(raw)) return false;
	seen.add(raw);
	if (ns.isBigIntegerSchema() || ns.isBigDecimalSchema()) return true;
	if (ns.isStructSchema()) {
		for (const [, memberSchema] of ns.structIterator()) if (_check(memberSchema, seen)) return true;
	} else if (ns.isListSchema() || ns.isMapSchema()) {
		if (_check(ns.getValueSchema(), seen)) return true;
	} else if (ns.isDocumentSchema()) return true;
	return false;
}
var REVIVER_SYMBOL;
var init_needsReviver = __esmMin((() => {
	init_schema();
	REVIVER_SYMBOL = Symbol.for("@aws-sdk/reviver");
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/common.js
var collectBodyString;
var init_common = __esmMin((() => {
	init_collect_stream_body();
	init_serde();
	collectBodyString = (streamBody, context) => collectBody$1(streamBody, context).then((body) => (context?.utf8Encoder ?? toUtf8)(body));
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/json/parseJsonBody.js
async function parseJsonBody(streamBody, context, schema) {
	let parsingInput;
	if (detectBufferParsing() && typeof streamBody?.[Symbol.asyncIterator] === "function") {
		const buffer = await collectBody$1(streamBody, context);
		if (typeof Buffer === "function") if (Buffer.isBuffer(buffer)) parsingInput = buffer;
		else parsingInput = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	}
	if (!parsingInput) parsingInput = await collectBodyString(streamBody, context);
	if (parsingInput.length === 0) return {};
	const reviver = schema && needsReviver(schema) ? jsonReviver : void 0;
	try {
		return JSON.parse(parsingInput, reviver);
	} catch (e) {
		if (e?.name === "SyntaxError") Object.defineProperty(e, "$responseBodyText", { value: typeof parsingInput === "string" ? parsingInput : parsingInput.toString("utf8") });
		throw e;
	}
}
var parseJsonErrorBody, findKey, sanitizeErrorCode, loadRestJsonErrorCode, loadJsonRpcErrorCode, loadSmithyRpcV2JsonErrorCode, loadErrorCode;
var init_parseJsonBody = __esmMin((() => {
	init_collect_stream_body();
	init_common();
	init_detectBufferParsing();
	init_jsonReviver();
	init_needsReviver();
	parseJsonErrorBody = async (errorBody, context) => {
		const value = await parseJsonBody(errorBody, context);
		value.message = value.message ?? value.Message;
		return value;
	};
	findKey = (object, key) => Object.keys(object).find((k) => k.toLowerCase() === key.toLowerCase());
	sanitizeErrorCode = (rawValue) => {
		let cleanValue = rawValue;
		if (typeof cleanValue === "number") cleanValue = cleanValue.toString();
		if (cleanValue.indexOf(",") >= 0) cleanValue = cleanValue.split(",")[0];
		if (cleanValue.indexOf(":") >= 0) cleanValue = cleanValue.split(":")[0];
		if (cleanValue.indexOf("#") >= 0) cleanValue = cleanValue.split("#")[1];
		return cleanValue;
	};
	loadRestJsonErrorCode = (output, data) => {
		return loadErrorCode(output, data, [
			"header",
			"code",
			"type"
		]);
	};
	loadJsonRpcErrorCode = (output, data, queryCompat = false) => {
		return loadErrorCode(output, data, queryCompat ? [
			"code",
			"header",
			"type"
		] : [
			"type",
			"code",
			"header"
		]);
	};
	loadSmithyRpcV2JsonErrorCode = (output, data) => {
		if (data?.__type !== void 0) {
			let cleanValue = data.__type;
			if (typeof cleanValue === "number") cleanValue = cleanValue.toString();
			if (cleanValue.indexOf(",") >= 0) cleanValue = cleanValue.split(",")[0];
			if (cleanValue.indexOf(":") >= 0) cleanValue = cleanValue.split(":")[0];
			return cleanValue;
		}
	};
	loadErrorCode = ({ headers }, data, order) => {
		while (order.length > 0) switch (order.shift()) {
			case "header":
				const headerKey = findKey(headers ?? {}, "x-amzn-errortype");
				if (headerKey !== void 0) return sanitizeErrorCode(headers[headerKey]);
				break;
			case "code":
				const codeKey = findKey(data ?? {}, "code");
				if (codeKey && data[codeKey] !== void 0) return sanitizeErrorCode(data[codeKey]);
				break;
			case "type":
				if (data?.__type !== void 0) return sanitizeErrorCode(data.__type);
				break;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/json/codec-v2/JsonShapeDeserializer2.js
var JsonShapeDeserializer2;
var init_JsonShapeDeserializer2 = __esmMin((() => {
	init_determineTimestampFormat();
	init_schema();
	init_serde();
	init_ConfigurableSerdeContext$1();
	init_UnionSerde$1();
	init_detectBufferParsing();
	init_jsonReviver();
	init_needsReviver();
	init_parseJsonBody();
	init_transport();
	JsonShapeDeserializer2 = class extends SerdeContextConfig$1 {
		settings;
		constructor(settings) {
			super();
			this.settings = settings;
		}
		async read(schema, data) {
			const reviver = needsReviver(schema) ? jsonReviver : void 0;
			let parsed;
			if (typeof data === "string") {
				if (data.length === 0) return {};
				parsed = JSON.parse(data, reviver);
			} else if (data instanceof Uint8Array && detectBufferParsing()) {
				if (data.byteLength === 0) return {};
				const buf = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
				parsed = JSON.parse(buf, reviver);
			} else parsed = await parseJsonBody(data, this.serdeContext, schema);
			return this._read(schema, parsed);
		}
		readObject(schema, data) {
			return this._read(schema, data);
		}
		_read(schema, value) {
			const isObject = value !== null && typeof value === "object";
			const ns = NormalizedSchema.of(schema);
			if (isObject) {
				if (ns.isStructSchema()) return this._readStruct(ns, value);
				if (Array.isArray(value) && ns.isListSchema()) {
					const listMember = ns.getValueSchema();
					if (this.needsTransform(listMember)) for (let i = 0; i < value.length; ++i) value[i] = this._read(listMember, value[i]);
					return value;
				}
				if (ns.isMapSchema()) {
					const mapMember = ns.getValueSchema();
					const map = value;
					if (this.needsTransform(mapMember)) for (const k in map) {
						if (!hasOwn$1(map, k)) continue;
						if (k === "__proto__") writeKey$1(map);
						map[k] = this._read(mapMember, map[k]);
					}
					return map;
				}
			}
			if (ns.isBlobSchema() && typeof value === "string") return fromBase64(value);
			const mediaType = ns.getMergedTraits().mediaType;
			if (ns.isStringSchema() && typeof value === "string" && mediaType) {
				if (mediaType === "application/json" || mediaType.endsWith("+json")) return LazyJsonString.from(value);
				return value;
			}
			if (ns.isTimestampSchema() && value != null) switch (determineTimestampFormat(ns, this.settings)) {
				case 5: return parseRfc3339DateTimeWithOffset(value);
				case 6: return parseRfc7231DateTime(value);
				case 7: return parseEpochTimestamp(value);
				default:
					console.warn("Missing timestamp format, parsing value with Date constructor:", value);
					return new Date(value);
			}
			if (ns.isBigIntegerSchema() && (typeof value === "number" || typeof value === "string")) return BigInt(value);
			if (ns.isBigDecimalSchema() && value != void 0) {
				if (value instanceof NumericValue) return value;
				const untyped = value;
				if (untyped.type === "bigDecimal" && "string" in untyped) return new NumericValue(untyped.string, untyped.type);
				return new NumericValue(String(value), "bigDecimal");
			}
			if (ns.isNumericSchema() && typeof value === "string") {
				switch (value) {
					case "Infinity": return Infinity;
					case "-Infinity": return -Infinity;
					case "NaN": return NaN;
				}
				return value;
			}
			if (ns.isDocumentSchema()) {
				if (isObject) if (Array.isArray(value)) for (let i = 0; i < value.length; ++i) {
					const v = value[i];
					if (!(v instanceof NumericValue)) value[i] = this._read(ns, v);
				}
				else {
					const doc = value;
					for (const k in doc) {
						if (!hasOwn$1(doc, k)) continue;
						if (k === "__proto__") writeKey$1(doc);
						const v = doc[k];
						if (!(v instanceof NumericValue)) doc[k] = this._read(ns, v);
					}
				}
			}
			return value;
		}
		_readStruct(ns, record) {
			const union = ns.isUnionSchema();
			const out = {};
			let nameMap;
			const hasType = typeof record.__type === "string";
			const { jsonName } = this.settings;
			if (jsonName && hasType) nameMap = {};
			let unionSerde;
			if (union) unionSerde = new UnionSerde$1(record, out);
			for (const [memberName, memberSchema] of ns.structIterator()) {
				let fromKey = memberName;
				if (jsonName) {
					fromKey = memberSchema.getMergedTraits().jsonName ?? fromKey;
					if (hasType) nameMap[fromKey] = memberName;
				}
				if (union) unionSerde.mark(fromKey);
				if (record[fromKey] != null) out[memberName] = this._read(memberSchema, record[fromKey]);
			}
			if (union) unionSerde.writeUnknown();
			else if (hasType) for (const k in record) {
				if (!hasOwn$1(record, k)) continue;
				const v = record[k];
				const t = jsonName ? nameMap[k] ?? k : k;
				if (!(t in out)) out[t] = v;
			}
			return out;
		}
		needsTransform(ns) {
			if (ns.isBlobSchema() || ns.isTimestampSchema() || ns.isBigIntegerSchema() || ns.isBigDecimalSchema() || ns.isNumericSchema()) return true;
			if (ns.isDocumentSchema() || ns.isStructSchema() || ns.isListSchema() || ns.isMapSchema()) return true;
			if (ns.isStringSchema() && ns.getMergedTraits().mediaType) return true;
			return false;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/json/codec-v2/JsonBytesStringAdapter.js
var JsonBytesStringAdapter, warned;
var init_JsonBytesStringAdapter = __esmMin((() => {
	init_serde();
	JsonBytesStringAdapter = class JsonBytesStringAdapter extends Uint8Array {
		string = null;
		static allocUnsafe(bytes) {
			if (typeof Buffer === "function") {
				const buffer = Buffer.allocUnsafe(bytes);
				return new JsonBytesStringAdapter(buffer.buffer, buffer.byteOffset, buffer.byteLength);
			}
			return new JsonBytesStringAdapter(bytes);
		}
		toString() {
			return this.s();
		}
		valueOf() {
			return this.s();
		}
		includes(searchString, position) {
			if (typeof searchString === "string") return this.s().includes(searchString, position);
			return Uint8Array.prototype.includes.call(this, searchString, position);
		}
		indexOf(searchString, position) {
			if (typeof searchString === "string") return this.s().indexOf(searchString, position);
			return Uint8Array.prototype.indexOf.call(this, searchString, position);
		}
		lastIndexOf(searchString, position) {
			if (typeof searchString === "string") return this.s().lastIndexOf(searchString, position);
			const fn = Uint8Array.prototype.lastIndexOf;
			if (position !== void 0) return fn.call(this, searchString, position);
			return fn.call(this, searchString);
		}
		startsWith(searchString, position) {
			return this.s().startsWith(searchString, position);
		}
		endsWith(searchString, endPosition) {
			return this.s().endsWith(searchString, endPosition);
		}
		match(regexp) {
			return this.s().match(regexp);
		}
		replace(searchValue, replaceValue) {
			return this.s().replace(searchValue, replaceValue);
		}
		search(regexp) {
			return this.s().search(regexp);
		}
		split(separator, limit) {
			return this.s().split(separator, limit);
		}
		substring(start, end) {
			return this.s().substring(start, end);
		}
		trim() {
			return this.s().trim();
		}
		trimStart() {
			return this.s().trimStart();
		}
		trimEnd() {
			return this.s().trimEnd();
		}
		charAt(pos) {
			return this.s().charAt(pos);
		}
		charCodeAt(index) {
			return this.s().charCodeAt(index);
		}
		padStart(maxLength, fillString) {
			return this.s().padStart(maxLength, fillString);
		}
		padEnd(maxLength, fillString) {
			return this.s().padEnd(maxLength, fillString);
		}
		repeat(count) {
			return this.s().repeat(count);
		}
		toUpperCase() {
			return this.s().toUpperCase();
		}
		toLowerCase() {
			return this.s().toLowerCase();
		}
		s() {
			if (this.string == null) {
				const n = Date.now();
				if (n > warned + 6e4) {
					console.warn("@aws-sdk/core/protocols - WARN - JsonCodec2: you have called a string method on a Uint8Array request body. It has been automatically converted to string. In a future version this will throw an error.");
					warned = n;
				}
				this.string = toUtf8(this);
			}
			return this.string;
		}
	};
	warned = 0;
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/json/codec-v2/JsonShapeSerializer2.js
function alloc(size) {
	return JsonBytesStringAdapter.allocUnsafe(size);
}
var encoder, OPEN_BRACE, CLOSE_BRACE, OPEN_BRACKET, CLOSE_BRACKET, QUOTE, COLON, COMMA, BACKSLASH, TRUE, FALSE, NULL, ESCAPE_TABLE, INITIAL_BUFFER_SIZE, JsonShapeSerializer2;
var init_JsonShapeSerializer2 = __esmMin((() => {
	init_determineTimestampFormat();
	init_schema();
	init_serde();
	init_ConfigurableSerdeContext$1();
	init_transport();
	init_JsonBytesStringAdapter();
	encoder = new TextEncoder();
	OPEN_BRACE = 123;
	CLOSE_BRACE = 125;
	OPEN_BRACKET = 91;
	CLOSE_BRACKET = 93;
	QUOTE = 34;
	COLON = 58;
	COMMA = 44;
	BACKSLASH = 92;
	TRUE = new Uint8Array([
		116,
		114,
		117,
		101
	]);
	FALSE = new Uint8Array([
		102,
		97,
		108,
		115,
		101
	]);
	NULL = new Uint8Array([
		110,
		117,
		108,
		108
	]);
	ESCAPE_TABLE = new Array(128).fill(null);
	ESCAPE_TABLE[8] = "b";
	ESCAPE_TABLE[9] = "t";
	ESCAPE_TABLE[10] = "n";
	ESCAPE_TABLE[12] = "f";
	ESCAPE_TABLE[13] = "r";
	ESCAPE_TABLE[34] = "\"";
	ESCAPE_TABLE[92] = "\\";
	for (let i = 0; i < 32; i++) if (ESCAPE_TABLE[i] === null) ESCAPE_TABLE[i] = "u00" + i.toString(16).padStart(2, "0");
	INITIAL_BUFFER_SIZE = 2048;
	JsonShapeSerializer2 = class JsonShapeSerializer2 extends SerdeContextConfig$1 {
		settings;
		json;
		i = 0;
		rootSchema;
		rawValue;
		passthrough = false;
		constructor(settings) {
			super();
			this.settings = settings;
			this.json = alloc(INITIAL_BUFFER_SIZE);
		}
		write(schema, value) {
			this.i = 0;
			this.rawValue = value;
			this.rootSchema = NormalizedSchema.of(schema);
			this.passthrough = this.rootSchema.isBlobSchema() || this.rootSchema.isStringSchema();
			if (!this.passthrough) this.writeValue(this.rootSchema, value, void 0);
		}
		writeDiscriminatedDocument(schema, value) {
			this.i = 0;
			this.rootSchema = NormalizedSchema.of(schema);
			const ns = this.rootSchema;
			if (ns.isStructSchema() && value != null && typeof value === "object") {
				this.writeValue(ns, value, void 0);
				const prefix = `"__type":"${ns.getName(true) ?? "Unknown"}",`;
				const z = prefix.length;
				this.ensure(z);
				this.json.copyWithin(1 + z, 1, this.i);
				encoder.encodeInto(prefix, this.json.subarray(1));
				this.i += z;
			} else this.writeValue(ns, value, void 0);
		}
		flush() {
			this.rootSchema = void 0;
			const finalPosition = this.i;
			this.i = 0;
			const raw = this.rawValue;
			this.rawValue = void 0;
			if (finalPosition === 0) return raw;
			const result = this.json.subarray(0, finalPosition);
			this.json = alloc(INITIAL_BUFFER_SIZE);
			return result;
		}
		ensure(byteCount) {
			const { i, json } = this;
			if (i + byteCount > json.length) {
				let newSize = json.length * 2;
				while (newSize < i + byteCount) newSize *= 2;
				const next = alloc(newSize);
				next.set(this.json);
				this.json = next;
			}
		}
		writeAscii(s) {
			const z = s.length;
			this.ensure(z);
			let { i, json } = this;
			for (let j = 0; j < z; ++j) {
				json[i] = s.charCodeAt(j);
				i += 1;
			}
			this.i = i;
		}
		writeAsciiQuoted(s) {
			const z = s.length;
			this.ensure(z + 4);
			let { json, i } = this;
			json[i++] = QUOTE;
			for (let j = 0; j < z; ++j) json[i++] = s.charCodeAt(j);
			json[i++] = QUOTE;
			this.i = i;
		}
		writeJsonString(s) {
			const z = s.length;
			this.ensure(z * 3 + 2);
			this.json[this.i++] = QUOTE;
			for (let j = 0; j < z; ++j) {
				const c = s.charCodeAt(j);
				if (c > 34 && c < 92) this.json[this.i++] = c;
				else if (c < 128) {
					const esc = ESCAPE_TABLE[c];
					if (esc !== null) {
						this.ensure(esc.length + 1 + (z - j - 1) * 3 + 1);
						this.json[this.i++] = BACKSLASH;
						for (let k = 0; k < esc.length; k++) this.json[this.i++] = esc.charCodeAt(k);
					} else this.json[this.i++] = c;
				} else if (c >= 55296 && c <= 56319) {
					const next = j + 1 < z ? s.charCodeAt(j + 1) : 0;
					if (next >= 56320 && next <= 57343) {
						this.ensure(4);
						const { written } = encoder.encodeInto(s.substring(j, j + 2), this.json.subarray(this.i));
						this.i += written;
						++j;
					} else {
						this.ensure(6 + (z - j - 1) * 3 + 1);
						this.writeUnicodeEscape(c);
					}
				} else if (c >= 56320 && c <= 57343) {
					this.ensure(6 + (z - j - 1) * 3 + 1);
					this.writeUnicodeEscape(c);
				} else {
					let { i, json } = this;
					if (c < 2048) {
						json[i++] = 192 | c >> 6;
						json[i++] = 128 | c & 63;
					} else {
						json[i++] = 224 | c >> 12;
						json[i++] = 128 | c >> 6 & 63;
						json[i++] = 128 | c & 63;
					}
					this.i = i;
				}
			}
			this.json[this.i++] = QUOTE;
		}
		writeUnicodeEscape(code) {
			let { json, i } = this;
			json[i++] = BACKSLASH;
			json[i++] = 117;
			const hex = code.toString(16).padStart(4, "0");
			for (let j = 0; j < 4; ++j) json[i++] = hex.charCodeAt(j);
			this.i = i;
		}
		static B64 = (() => {
			const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
			const table = new Uint8Array(64);
			for (let i = 0; i < 64; ++i) table[i] = chars.charCodeAt(i);
			return table;
		})();
		writeBase64(data) {
			const b64Len = Math.ceil(data.length / 3) * 4;
			this.ensure(b64Len + 2);
			const json = this.json;
			const B64 = JsonShapeSerializer2.B64;
			let i = this.i;
			json[i++] = QUOTE;
			const len = data.length;
			const remainder = len % 3;
			const mainLen = len - remainder;
			for (let j = 0; j < mainLen; j += 3) {
				const a = data[j];
				const b = data[j + 1];
				const c = data[j + 2];
				json[i++] = B64[a >> 2];
				json[i++] = B64[(a & 3) << 4 | b >> 4];
				json[i++] = B64[(b & 15) << 2 | c >> 6];
				json[i++] = B64[c & 63];
			}
			if (remainder === 2) {
				const a = data[mainLen];
				const b = data[mainLen + 1];
				json[i++] = B64[a >> 2];
				json[i++] = B64[(a & 3) << 4 | b >> 4];
				json[i++] = B64[(b & 15) << 2];
				json[i++] = 61;
			} else if (remainder === 1) {
				const a = data[mainLen];
				json[i++] = B64[a >> 2];
				json[i++] = B64[(a & 3) << 4];
				json[i++] = 61;
				json[i++] = 61;
			}
			json[i++] = QUOTE;
			this.i = i;
		}
		writeValue(schema, value, container) {
			if (value == null) {
				if (container?.isStructSchema()) {
					if (value === void 0) {
						if (NormalizedSchema.of(schema).isIdempotencyToken()) {
							this.writeAsciiQuoted(generateIdempotencyToken());
							return;
						}
					}
					return;
				}
				this.ensure(4);
				this.json.set(NULL, this.i);
				this.i += 4;
				return;
			}
			const ns = NormalizedSchema.of(schema);
			const isObject = typeof value === "object";
			if (ns.isStringSchema()) {
				const mediaType = ns.getMergedTraits().mediaType;
				if (mediaType) {
					if (mediaType === "application/json" || mediaType.endsWith("+json")) {
						this.writeJsonString(LazyJsonString.from(value).toString());
						return;
					}
				}
			}
			if (this.settings.bigNumberAsString && value != null && (ns.isBigIntegerSchema() || ns.isBigDecimalSchema())) {
				const asString = value instanceof NumericValue ? value.string : String(value);
				this.writeAsciiQuoted(asString);
				return;
			}
			if (isObject) {
				if (ns.isStructSchema()) {
					this.writeStruct(ns, value);
					return;
				}
				if (Array.isArray(value) && (ns.isListSchema() || ns.isDocumentSchema())) {
					this.writeList(ns, value, ns.isDocumentSchema());
					return;
				}
				if (ns.isMapSchema()) {
					this.writeMap(ns, value, false);
					return;
				}
				if (value instanceof Uint8Array && (ns.isBlobSchema() || ns.isDocumentSchema())) {
					this.writeBase64(value);
					return;
				}
				if (value instanceof Date && (ns.isTimestampSchema() || ns.isDocumentSchema())) {
					this.writeTimestamp(ns, value);
					return;
				}
				if (value instanceof NumericValue) {
					this.writeAscii(value.string);
					return;
				}
				if (ns.isDocumentSchema()) {
					if (Array.isArray(value)) this.writeList(ns, value, true);
					else this.writeMap(ns, value, true);
					return;
				}
				const json = JSON.stringify(value);
				this.writeAscii(json);
				return;
			}
			if (typeof value === "string") {
				if (ns.isBlobSchema()) {
					const b64 = (this.serdeContext?.base64Encoder ?? toBase64)(value);
					this.writeAsciiQuoted(b64);
					return;
				}
				this.writeJsonString(value);
				return;
			}
			if (typeof value === "number") {
				if (Math.abs(value) === Infinity || Number.isNaN(value)) {
					this.writeAsciiQuoted(String(value));
					return;
				}
				const numStr = String(value);
				this.writeAscii(numStr);
				return;
			}
			if (typeof value === "boolean") {
				this.ensure(5);
				let { i, json } = this;
				if (value) {
					json.set(TRUE, i);
					i += 4;
				} else {
					json.set(FALSE, i);
					i += 5;
				}
				this.i = i;
				return;
			}
			if (typeof value === "bigint") {
				this.writeAscii(value.toString());
				return;
			}
			this.writeAscii(String(value));
		}
		writeStruct(ns, value) {
			this.ensure(2);
			this.json[this.i++] = OPEN_BRACE;
			let wroteAny = false;
			const hasType = typeof value.__type === "string";
			let writtenKeys;
			if (hasType) writtenKeys = /* @__PURE__ */ new Set();
			for (const [memberName, memberSchema] of ns.structIterator()) {
				const item = value[memberName];
				if (item == null && !memberSchema.isIdempotencyToken()) continue;
				if (wroteAny) {
					this.ensure(1);
					this.json[this.i++] = COMMA;
				}
				wroteAny = true;
				const targetKey = this.settings.jsonName ? memberSchema.getMergedTraits().jsonName ?? memberName : memberName;
				if (writtenKeys) {
					writtenKeys.add(memberName);
					writtenKeys.add(targetKey);
				}
				this.writeAsciiQuoted(targetKey);
				this.json[this.i++] = COLON;
				this.writeValue(memberSchema, item, ns);
			}
			if (!wroteAny && ns.isUnionSchema()) {
				const { $unknown } = value;
				if (Array.isArray($unknown)) {
					const [k, v] = $unknown;
					this.writeAsciiQuoted(k);
					this.ensure(1);
					this.json[this.i++] = COLON;
					this.writeValue(15, v, ns);
				}
			} else if (hasType) for (const k in value) {
				if (writtenKeys.has(k)) continue;
				writtenKeys.add(k);
				const v = value[k];
				if (wroteAny) {
					this.ensure(1);
					this.json[this.i++] = COMMA;
				}
				wroteAny = true;
				this.writeAsciiQuoted(k);
				this.ensure(1);
				this.json[this.i++] = COLON;
				this.writeValue(15, v, void 0);
			}
			this.ensure(1);
			this.json[this.i++] = CLOSE_BRACE;
		}
		writeList(ns, value, isDocument) {
			const sparse = !!ns.getMergedTraits().sparse;
			const valueSchema = ns.getValueSchema();
			if (!isDocument) {
				if (valueSchema.isStringSchema() || valueSchema.isNumericSchema() || valueSchema.isBooleanSchema()) {
					let hasSpecials = false;
					for (let i = 0; i < value.length; ++i) {
						const v = value[i];
						if (Number.isNaN(v) || v === Infinity || v === -Infinity || v == null && !sparse) {
							hasSpecials = true;
							break;
						}
					}
					let json;
					if (!hasSpecials) json = JSON.stringify(value);
					else {
						const out = [];
						for (let i = 0; i < value.length; ++i) {
							const v = value[i];
							if (v == null && !sparse) continue;
							if (Number.isNaN(v) || v === Infinity || v === -Infinity) out.push(String(v));
							else out.push(v);
						}
						json = JSON.stringify(out);
					}
					this.ensure(json.length * 3);
					this.i += encoder.encodeInto(json, this.json.subarray(this.i)).written;
					return;
				}
			}
			this.ensure(2);
			this.json[this.i++] = OPEN_BRACKET;
			let wroteFirstItem = false;
			for (let i = 0; i < value.length; ++i) {
				const item = value[i];
				if (isDocument ? item === void 0 : item == null && !sparse) continue;
				if (wroteFirstItem) {
					this.ensure(1);
					this.json[this.i++] = COMMA;
				}
				this.writeValue(valueSchema, item, void 0);
				wroteFirstItem = true;
			}
			this.ensure(1);
			this.json[this.i++] = CLOSE_BRACKET;
		}
		writeMap(ns, value, isDocument) {
			const sparse = !!ns.getMergedTraits().sparse;
			const valueSchema = ns.getValueSchema();
			if (!isDocument) {
				if (valueSchema.isStringSchema() || valueSchema.isNumericSchema() || valueSchema.isBooleanSchema()) {
					let modifications;
					for (const k in value) {
						if (!hasOwn$1(value, k)) continue;
						const v = value[k];
						if (Number.isNaN(v) || v === Infinity || v === -Infinity) {
							(modifications ??= {})[k] = v;
							value[k] = String(v);
						} else if (v === null && !sparse) {
							(modifications ??= {})[k] = null;
							value[k] = void 0;
						}
					}
					const json = JSON.stringify(value);
					if (modifications) Object.assign(value, modifications);
					this.ensure(json.length * 3);
					this.i += encoder.encodeInto(json, this.json.subarray(this.i)).written;
					return;
				}
			}
			this.ensure(2);
			this.json[this.i++] = OPEN_BRACE;
			let first = true;
			for (const k in value) {
				if (!hasOwn$1(value, k)) continue;
				const v = value[k];
				if (isDocument ? v === void 0 : v == null && !sparse) continue;
				if (!first) {
					this.ensure(1);
					this.json[this.i++] = COMMA;
				}
				first = false;
				this.writeJsonString(k);
				this.ensure(1);
				this.json[this.i++] = COLON;
				this.writeValue(valueSchema, v, void 0);
			}
			this.ensure(1);
			this.json[this.i++] = CLOSE_BRACE;
		}
		writeTimestamp(ns, value) {
			switch (determineTimestampFormat(ns, this.settings)) {
				case 5: {
					const iso = value.toISOString().replace(".000Z", "Z");
					this.writeAsciiQuoted(iso);
					return;
				}
				case 6:
					this.writeAsciiQuoted(dateToUtcString(value));
					return;
				case 7: {
					const epochSecs = String(value.getTime() / 1e3);
					this.writeAscii(epochSecs);
					return;
				}
				default: {
					const epochSecs = String(value.getTime() / 1e3);
					this.writeAscii(epochSecs);
					return;
				}
			}
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/json/codec-v2/JsonCodec2.js
var JsonCodec2;
var init_JsonCodec2 = __esmMin((() => {
	init_ConfigurableSerdeContext$1();
	init_JsonShapeDeserializer2();
	init_JsonShapeSerializer2();
	JsonCodec2 = class extends SerdeContextConfig$1 {
		settings;
		constructor(settings) {
			super();
			this.settings = settings;
		}
		createSerializer() {
			const serializer = new JsonShapeSerializer2(this.settings);
			serializer.setSerdeContext(this.serdeContext);
			return serializer;
		}
		createDeserializer() {
			const deserializer = new JsonShapeDeserializer2(this.settings);
			deserializer.setSerdeContext(this.serdeContext);
			return deserializer;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/json/SmithyRpcV2JsonProtocol.js
var SmithyRpcV2JsonProtocol;
var init_SmithyRpcV2JsonProtocol = __esmMin((() => {
	init_AbstractRpcV2Protocol();
	init_schema();
	init_JsonCodec2();
	init_parseJsonBody();
	SmithyRpcV2JsonProtocol = class extends AbstractRpcV2Protocol {
		codec = new JsonCodec2({
			timestampFormat: {
				useTrait: false,
				default: 7
			},
			jsonName: false,
			bigNumberAsString: true
		});
		serializer = this.codec.createSerializer();
		deserializer = this.codec.createDeserializer();
		getShapeId() {
			return "smithy.protocols#rpcv2Json";
		}
		getPayloadCodec() {
			return this.codec;
		}
		getSmithyProtocolHeaderValue() {
			return "rpc-v2-json";
		}
		applyEmptyBody(request) {
			if (!request.body) request.body = "{}";
		}
		async handleError(operationSchema, context, response, dataObject, metadata) {
			const errorName = loadSmithyRpcV2JsonErrorCode(response, dataObject) ?? "Unknown";
			const errorMetadata = {
				$metadata: metadata,
				$fault: response.statusCode <= 500 ? "client" : "server"
			};
			let namespace = this.options.defaultNamespace;
			if (errorName.includes("#")) [namespace] = errorName.split("#");
			const registry = this.compositeErrorRegistry;
			const nsRegistry = TypeRegistry.for(namespace);
			registry.copyFrom(nsRegistry);
			let errorSchema;
			try {
				errorSchema = registry.getSchema(errorName);
			} catch (ignored) {
				if (dataObject.Message) dataObject.message = dataObject.Message;
				const syntheticRegistry = TypeRegistry.for("smithy.ts.sdk.synthetic." + namespace);
				registry.copyFrom(syntheticRegistry);
				const baseExceptionSchema = registry.getBaseException();
				if (baseExceptionSchema) {
					const ErrorCtor = registry.getErrorCtor(baseExceptionSchema);
					throw Object.assign(new ErrorCtor({ name: errorName }), errorMetadata, dataObject);
				}
				throw Object.assign(new Error(errorName), errorMetadata, dataObject);
			}
			const ns = NormalizedSchema.of(errorSchema);
			const ErrorCtor = registry.getErrorCtor(errorSchema);
			const message = dataObject.message ?? dataObject.Message ?? "Unknown";
			const exception = new ErrorCtor({});
			const output = {};
			const errorDeserializer = this.codec.createDeserializer();
			for (const [name, member] of ns.structIterator()) if (dataObject[name] != null) output[name] = errorDeserializer.readObject(member, dataObject[name]);
			throw Object.assign(exception, errorMetadata, {
				$fault: ns.getMergedTraits().error,
				message
			}, output);
		}
		getDefaultContentType() {
			return "application/json";
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/json/codec-v1/JsonShapeDeserializer.js
var JsonShapeDeserializer;
var init_JsonShapeDeserializer = __esmMin((() => {
	init_determineTimestampFormat();
	init_schema();
	init_serde();
	init_transport();
	init_ConfigurableSerdeContext$1();
	init_UnionSerde$1();
	init_jsonReviver();
	init_needsReviver();
	init_parseJsonBody();
	JsonShapeDeserializer = class extends SerdeContextConfig$1 {
		settings;
		constructor(settings) {
			super();
			this.settings = settings;
		}
		async read(schema, data) {
			const reviver = needsReviver(schema) ? jsonReviver : void 0;
			return this._read(schema, typeof data === "string" ? JSON.parse(data, reviver) : await parseJsonBody(data, this.serdeContext, schema));
		}
		readObject(schema, data) {
			return this._read(schema, data);
		}
		_read(schema, value) {
			const isObject = value !== null && typeof value === "object";
			const ns = NormalizedSchema.of(schema);
			if (isObject) {
				if (ns.isStructSchema()) {
					const record = value;
					const union = ns.isUnionSchema();
					const out = {};
					let nameMap = void 0;
					const { jsonName } = this.settings;
					if (jsonName) nameMap = {};
					let unionSerde;
					if (union) unionSerde = new UnionSerde$1(record, out);
					for (const [memberName, memberSchema] of ns.structIterator()) {
						let fromKey = memberName;
						if (jsonName) {
							fromKey = memberSchema.getMergedTraits().jsonName ?? fromKey;
							nameMap[fromKey] = memberName;
						}
						if (union) unionSerde.mark(fromKey);
						if (record[fromKey] != null) out[memberName] = this._read(memberSchema, record[fromKey]);
					}
					if (union) unionSerde.writeUnknown();
					else if (typeof record.__type === "string") for (const k in record) {
						if (!hasOwn$1(record, k)) continue;
						const v = record[k];
						const t = jsonName ? nameMap[k] ?? k : k;
						if (!(t in out)) out[t] = v;
					}
					return out;
				}
				if (Array.isArray(value) && ns.isListSchema()) {
					const listMember = ns.getValueSchema();
					const out = [];
					for (const item of value) out.push(this._read(listMember, item));
					return out;
				}
				if (ns.isMapSchema()) {
					const mapMember = ns.getValueSchema();
					const out = {};
					for (const _k in value) {
						if (!hasOwn$1(value, _k)) continue;
						if (_k === "__proto__") writeKey$1(out);
						out[_k] = this._read(mapMember, value[_k]);
					}
					return out;
				}
			}
			if (ns.isBlobSchema() && typeof value === "string") return fromBase64(value);
			const mediaType = ns.getMergedTraits().mediaType;
			if (ns.isStringSchema() && typeof value === "string" && mediaType) {
				if (mediaType === "application/json" || mediaType.endsWith("+json")) return LazyJsonString.from(value);
				return value;
			}
			if (ns.isTimestampSchema() && value != null) switch (determineTimestampFormat(ns, this.settings)) {
				case 5: return parseRfc3339DateTimeWithOffset(value);
				case 6: return parseRfc7231DateTime(value);
				case 7: return parseEpochTimestamp(value);
				default:
					console.warn("Missing timestamp format, parsing value with Date constructor:", value);
					return new Date(value);
			}
			if (ns.isBigIntegerSchema() && (typeof value === "number" || typeof value === "string")) return BigInt(value);
			if (ns.isBigDecimalSchema() && value != void 0) {
				if (value instanceof NumericValue) return value;
				const untyped = value;
				if (untyped.type === "bigDecimal" && "string" in untyped) return new NumericValue(untyped.string, untyped.type);
				return new NumericValue(String(value), "bigDecimal");
			}
			if (ns.isNumericSchema() && typeof value === "string") {
				switch (value) {
					case "Infinity": return Infinity;
					case "-Infinity": return -Infinity;
					case "NaN": return NaN;
				}
				return value;
			}
			if (ns.isDocumentSchema()) if (isObject) {
				const out = Array.isArray(value) ? [] : {};
				for (const k in value) {
					if (!hasOwn$1(value, k)) continue;
					if (k === "__proto__") writeKey$1(out);
					const v = value[k];
					if (v instanceof NumericValue) out[k] = v;
					else out[k] = this._read(ns, v);
				}
				return out;
			} else return structuredClone(value);
			return value;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/json/jsonReplacer.js
var NUMERIC_CONTROL_CHAR, JsonReplacer;
var init_jsonReplacer = __esmMin((() => {
	init_serde();
	NUMERIC_CONTROL_CHAR = String.fromCharCode(925);
	JsonReplacer = class {
		values = /* @__PURE__ */ new Map();
		counter = 0;
		stage = 0;
		createReplacer() {
			if (this.stage === 1) throw new Error("@aws-sdk/core/protocols - JsonReplacer already created.");
			if (this.stage === 2) throw new Error("@aws-sdk/core/protocols - JsonReplacer exhausted.");
			this.stage = 1;
			return (key, value) => {
				if (value instanceof NumericValue) {
					const v = `${NUMERIC_CONTROL_CHAR + "nv" + this.counter++}_` + value.string;
					this.values.set(`"${v}"`, value.string);
					return v;
				}
				if (typeof value === "bigint") {
					const s = value.toString();
					const v = `${NUMERIC_CONTROL_CHAR + "b" + this.counter++}_` + s;
					this.values.set(`"${v}"`, s);
					return v;
				}
				return value;
			};
		}
		replaceInJson(json) {
			if (this.stage === 0) throw new Error("@aws-sdk/core/protocols - JsonReplacer not created yet.");
			if (this.stage === 2) throw new Error("@aws-sdk/core/protocols - JsonReplacer exhausted.");
			this.stage = 2;
			if (this.counter === 0) return json;
			for (const [key, value] of this.values) json = json.replace(key, value);
			return json;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/json/codec-v1/JsonShapeSerializer.js
var JsonShapeSerializer;
var init_JsonShapeSerializer = __esmMin((() => {
	init_determineTimestampFormat();
	init_schema();
	init_serde();
	init_ConfigurableSerdeContext$1();
	init_jsonReplacer();
	init_transport();
	JsonShapeSerializer = class extends SerdeContextConfig$1 {
		settings;
		buffer;
		useReplacer = false;
		rootSchema;
		constructor(settings) {
			super();
			this.settings = settings;
		}
		write(schema, value) {
			this.rootSchema = NormalizedSchema.of(schema);
			this.buffer = this._write(this.rootSchema, value);
		}
		flush() {
			const { rootSchema, useReplacer } = this;
			this.rootSchema = void 0;
			this.useReplacer = false;
			if (rootSchema?.isStructSchema() || rootSchema?.isDocumentSchema()) {
				if (!useReplacer) return JSON.stringify(this.buffer);
				const replacer = new JsonReplacer();
				return replacer.replaceInJson(JSON.stringify(this.buffer, replacer.createReplacer(), 0));
			}
			return this.buffer;
		}
		writeDiscriminatedDocument(schema, value) {
			this.write(schema, value);
			if (typeof this.buffer === "object") this.buffer.__type = NormalizedSchema.of(schema).getName(true);
		}
		_write(schema, value, container) {
			const isObject = value !== null && typeof value === "object";
			const ns = NormalizedSchema.of(schema);
			if (isObject) {
				if (ns.isStructSchema()) {
					const record = value;
					const out = {};
					const { jsonName } = this.settings;
					let nameMap = void 0;
					if (jsonName) nameMap = {};
					let outCount = 0;
					for (const [memberName, memberSchema] of ns.structIterator()) {
						const serializableValue = this._write(memberSchema, record[memberName], ns);
						if (serializableValue !== void 0) {
							let targetKey = memberName;
							if (jsonName) {
								targetKey = memberSchema.getMergedTraits().jsonName ?? memberName;
								nameMap[memberName] = targetKey;
							}
							out[targetKey] = serializableValue;
							outCount++;
						}
					}
					if (ns.isUnionSchema() && outCount === 0) {
						const { $unknown } = record;
						if (Array.isArray($unknown)) {
							const [k, v] = $unknown;
							if (k === "__proto__") writeKey$1(out);
							out[k] = this._write(15, v);
						}
					} else if (typeof record.__type === "string") for (const k in record) {
						if (!hasOwn$1(record, k)) continue;
						const v = record[k];
						const targetKey = jsonName ? nameMap[k] ?? k : k;
						if (!(targetKey in out)) out[targetKey] = this._write(15, v);
					}
					return out;
				}
				if (Array.isArray(value) && ns.isListSchema()) {
					const listMember = ns.getValueSchema();
					const out = [];
					const sparse = !!ns.getMergedTraits().sparse;
					for (const item of value) if (sparse || item != null) out.push(this._write(listMember, item));
					return out;
				}
				if (ns.isMapSchema()) {
					const mapMember = ns.getValueSchema();
					const out = {};
					const sparse = !!ns.getMergedTraits().sparse;
					for (const _k in value) {
						if (!hasOwn$1(value, _k)) continue;
						const _v = value[_k];
						if (sparse || _v != null) {
							if (_k === "__proto__") writeKey$1(out);
							out[_k] = this._write(mapMember, _v);
						}
					}
					return out;
				}
				if (value instanceof Uint8Array && ns.isBlobSchema()) {
					if (ns === this.rootSchema) return value;
					return (this.serdeContext?.base64Encoder ?? toBase64)(value);
				}
				if (value instanceof Date && (ns.isTimestampSchema() || ns.isDocumentSchema())) switch (determineTimestampFormat(ns, this.settings)) {
					case 5: return value.toISOString().replace(".000Z", "Z");
					case 6: return dateToUtcString(value);
					case 7: return value.getTime() / 1e3;
					default:
						console.warn("Missing timestamp format, using epoch seconds", value);
						return value.getTime() / 1e3;
				}
				if (value instanceof NumericValue) this.useReplacer = true;
			}
			if (value === null && container?.isStructSchema()) return;
			if (ns.isStringSchema()) {
				if (typeof value === "undefined" && ns.isIdempotencyToken()) return generateIdempotencyToken();
				const mediaType = ns.getMergedTraits().mediaType;
				if (value != null && mediaType) {
					if (mediaType === "application/json" || mediaType.endsWith("+json")) return LazyJsonString.from(value);
				}
				return value;
			}
			if (typeof value === "number") {
				if (Math.abs(value) === Infinity || isNaN(value)) return String(value);
				return value;
			}
			if (typeof value === "string" && ns.isBlobSchema()) {
				if (ns === this.rootSchema) return value;
				return (this.serdeContext?.base64Encoder ?? toBase64)(value);
			}
			if (typeof value === "bigint") this.useReplacer = true;
			if (ns.isDocumentSchema()) if (isObject) {
				if (value instanceof Uint8Array) return (this.serdeContext?.base64Encoder ?? toBase64)(value);
				const out = Array.isArray(value) ? [] : {};
				for (const k in value) {
					if (!hasOwn$1(value, k)) continue;
					const v = value[k];
					if (k === "__proto__") writeKey$1(out);
					if (v instanceof NumericValue) {
						this.useReplacer = true;
						out[k] = v;
					} else out[k] = this._write(ns, v);
				}
				return out;
			} else return structuredClone(value);
			return value;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/json/codec-v1/JsonCodec.js
var JsonCodec;
var init_JsonCodec = __esmMin((() => {
	init_ConfigurableSerdeContext$1();
	init_JsonShapeDeserializer();
	init_JsonShapeSerializer();
	JsonCodec = class extends SerdeContextConfig$1 {
		settings;
		constructor(settings) {
			super();
			this.settings = settings;
		}
		createSerializer() {
			const serializer = new JsonShapeSerializer(this.settings);
			serializer.setSerdeContext(this.serdeContext);
			return serializer;
		}
		createDeserializer() {
			const deserializer = new JsonShapeDeserializer(this.settings);
			deserializer.setSerdeContext(this.serdeContext);
			return deserializer;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/protocols/index.js
var protocols_exports = /* @__PURE__ */ __exportAll({
	AbstractRpcV2Protocol: () => AbstractRpcV2Protocol,
	Field: () => Field,
	Fields: () => Fields,
	FromStringShapeDeserializer: () => FromStringShapeDeserializer,
	HttpBindingProtocol: () => HttpBindingProtocol,
	HttpInterceptingShapeDeserializer: () => HttpInterceptingShapeDeserializer,
	HttpInterceptingShapeSerializer: () => HttpInterceptingShapeSerializer,
	HttpProtocol: () => HttpProtocol,
	HttpRequest: () => HttpRequest,
	HttpResponse: () => HttpResponse,
	JsonCodec: () => JsonCodec,
	JsonCodec2: () => JsonCodec2,
	JsonShapeDeserializer: () => JsonShapeDeserializer,
	JsonShapeDeserializer2: () => JsonShapeDeserializer2,
	JsonShapeSerializer: () => JsonShapeSerializer,
	JsonShapeSerializer2: () => JsonShapeSerializer2,
	RequestBuilder: () => RequestBuilder,
	RpcProtocol: () => RpcProtocol,
	SerdeContext: () => SerdeContext,
	SmithyRpcV2JsonProtocol: () => SmithyRpcV2JsonProtocol,
	ToStringShapeSerializer: () => ToStringShapeSerializer,
	buildQueryString: () => buildQueryString,
	collectBody: () => collectBody$1,
	contentLengthMiddleware: () => contentLengthMiddleware,
	contentLengthMiddlewareOptions: () => contentLengthMiddlewareOptions,
	determineTimestampFormat: () => determineTimestampFormat,
	escapeUri: () => escapeUri,
	escapeUriPath: () => escapeUriPath,
	extendedEncodeURIComponent: () => extendedEncodeURIComponent,
	getContentLengthPlugin: () => getContentLengthPlugin,
	getHttpHandlerExtensionConfiguration: () => getHttpHandlerExtensionConfiguration,
	isValidHostname: () => isValidHostname,
	loadJsonRpcErrorCode: () => loadJsonRpcErrorCode,
	loadRestJsonErrorCode: () => loadRestJsonErrorCode,
	loadSmithyRpcV2JsonErrorCode: () => loadSmithyRpcV2JsonErrorCode,
	parseJsonBody: () => parseJsonBody,
	parseJsonErrorBody: () => parseJsonErrorBody,
	parseQueryString: () => parseQueryString,
	parseUrl: () => parseUrl,
	requestBuilder: () => requestBuilder,
	resolveHttpHandlerRuntimeConfig: () => resolveHttpHandlerRuntimeConfig,
	resolvedPath: () => resolvedPath
});
var init_protocols$1 = __esmMin((() => {
	init_collect_stream_body();
	init_extended_encode_uri_component();
	init_HttpBindingProtocol();
	init_HttpProtocol();
	init_RpcProtocol();
	init_AbstractRpcV2Protocol();
	init_requestBuilder();
	init_resolve_path();
	init_FromStringShapeDeserializer();
	init_HttpInterceptingShapeDeserializer();
	init_HttpInterceptingShapeSerializer();
	init_ToStringShapeSerializer();
	init_determineTimestampFormat();
	init_SerdeContext();
	init_Field();
	init_Fields();
	init_transport();
	init_httpExtensionConfiguration();
	init_contentLengthMiddleware();
	init_escape_uri();
	init_escape_uri_path();
	init_buildQueryString();
	init_SmithyRpcV2JsonProtocol();
	init_parseJsonBody();
	init_JsonCodec();
	init_JsonShapeSerializer();
	init_JsonShapeDeserializer();
	init_JsonCodec2();
	init_JsonShapeSerializer2();
	init_JsonShapeDeserializer2();
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-check-content-length-header/check-content-length-header.js
function checkContentLengthHeader() {
	return (next, context) => async (args) => {
		const { request } = args;
		if (HttpRequest.isInstance(request)) {
			if (!(CONTENT_LENGTH_HEADER in request.headers) && !(DECODED_CONTENT_LENGTH_HEADER in request.headers)) {
				const message = `Are you using a Stream of unknown length as the Body of a PutObject request? Consider using Upload instead from @aws-sdk/lib-storage.`;
				if (typeof context?.logger?.warn === "function" && !(context.logger instanceof NoOpLogger)) context.logger.warn(message);
				else console.warn(message);
			}
		}
		return next({ ...args });
	};
}
var CONTENT_LENGTH_HEADER, DECODED_CONTENT_LENGTH_HEADER, checkContentLengthHeaderMiddlewareOptions, getCheckContentLengthHeaderPlugin;
var init_check_content_length_header = __esmMin((() => {
	init_client$1();
	init_protocols$1();
	CONTENT_LENGTH_HEADER = "content-length";
	DECODED_CONTENT_LENGTH_HEADER = "x-amz-decoded-content-length";
	checkContentLengthHeaderMiddlewareOptions = {
		step: "finalizeRequest",
		tags: ["CHECK_CONTENT_LENGTH_HEADER"],
		name: "getCheckContentLengthHeaderPlugin",
		override: true
	};
	getCheckContentLengthHeaderPlugin = (unused) => ({ applyToStack: (clientStack) => {
		clientStack.add(checkContentLengthHeader(), checkContentLengthHeaderMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-region-redirect/region-redirect-endpoint-middleware.js
var regionRedirectEndpointMiddleware, regionRedirectEndpointMiddlewareOptions;
var init_region_redirect_endpoint_middleware = __esmMin((() => {
	regionRedirectEndpointMiddleware = (config) => {
		return (next, context) => async (args) => {
			const originalRegion = await config.region();
			const regionProviderRef = config.region;
			let unlock = () => {};
			if (context.__s3RegionRedirect) {
				Object.defineProperty(config, "region", {
					writable: false,
					value: async () => {
						return context.__s3RegionRedirect;
					}
				});
				unlock = () => Object.defineProperty(config, "region", {
					writable: true,
					value: regionProviderRef
				});
			}
			try {
				const result = await next(args);
				if (context.__s3RegionRedirect) {
					unlock();
					if (originalRegion !== await config.region()) throw new Error("Region was not restored following S3 region redirect.");
				}
				return result;
			} catch (e) {
				unlock();
				throw e;
			}
		};
	};
	regionRedirectEndpointMiddlewareOptions = {
		tags: ["REGION_REDIRECT", "S3"],
		name: "regionRedirectEndpointMiddleware",
		override: true,
		relation: "before",
		toMiddleware: "endpointV2Middleware"
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/emitWarningIfUnsupportedVersion.js
var state, emitWarningIfUnsupportedVersion;
var init_emitWarningIfUnsupportedVersion = __esmMin((() => {
	state = { warningEmitted: false };
	emitWarningIfUnsupportedVersion = (version) => {
		if (version && !state.warningEmitted) {
			if (process.env.AWS_SDK_JS_NODE_VERSION_SUPPORT_WARNING_DISABLED === "true") {
				state.warningEmitted = true;
				return;
			}
			const userMajorVersion = parseInt(version.substring(1, version.indexOf(".")));
			const vv = 22;
			if (userMajorVersion < vv) {
				state.warningEmitted = true;
				process.emitWarning(`NodeVersionSupportWarning: The AWS SDK for JavaScript (v3)
versions published after the first week of January 2027
will require node >=${vv}. You are running node ${version}.

To continue receiving updates to AWS services, bug fixes,
and security updates please upgrade to node >=${vv}.

More information can be found at: https://a.co/c895JFp`);
			}
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/longPollMiddleware.js
var longPollMiddleware, longPollMiddlewareOptions, getLongPollPlugin;
var init_longPollMiddleware = __esmMin((() => {
	longPollMiddleware = () => (next, context) => async (args) => {
		context.__retryLongPoll = true;
		return next(args);
	};
	longPollMiddlewareOptions = {
		name: "longPollMiddleware",
		tags: ["RETRY"],
		step: "initialize",
		override: true
	};
	getLongPollPlugin = (options) => ({ applyToStack: (clientStack) => {
		clientStack.add(longPollMiddleware(), longPollMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/setCredentialFeature.js
function setCredentialFeature(credentials, feature, value) {
	if (!credentials.$source) credentials.$source = {};
	credentials.$source[feature] = value;
	return credentials;
}
var init_setCredentialFeature = __esmMin((() => {}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/setFeature.js
function setFeature$1(context, feature, value) {
	if (!context.__aws_sdk_context) context.__aws_sdk_context = { features: {} };
	else if (!context.__aws_sdk_context.features) context.__aws_sdk_context.features = {};
	context.__aws_sdk_context.features[feature] = value;
}
var init_setFeature$1 = __esmMin((() => {}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/setTokenFeature.js
function setTokenFeature(token, feature, value) {
	if (!token.$source) token.$source = {};
	token.$source[feature] = value;
	return token;
}
var init_setTokenFeature = __esmMin((() => {}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/getDefaultSocketTimeout.js
var isDefaultSocketTimeoutEnabled, getDefaultSocketTimeout;
var init_getDefaultSocketTimeout = __esmMin((() => {
	isDefaultSocketTimeoutEnabled = () => typeof process === "object" && process?.env?.AWS_ENABLE_DEFAULT_SOCKET_TIMEOUT_2026 === "true";
	getDefaultSocketTimeout = (requestHandler, timeoutMs) => {
		if (!isDefaultSocketTimeoutEnabled()) return;
		if (typeof requestHandler?.handle === "function") return;
		return timeoutMs;
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/middleware-host-header/hostHeaderMiddleware.js
function resolveHostHeaderConfig(input) {
	return input;
}
var hostHeaderMiddleware, hostHeaderMiddlewareOptions, getHostHeaderPlugin;
var init_hostHeaderMiddleware = __esmMin((() => {
	init_protocols$1();
	hostHeaderMiddleware = (options) => (next) => async (args) => {
		if (!HttpRequest.isInstance(args.request)) return next(args);
		const { request } = args;
		const { handlerProtocol = "" } = options.requestHandler.metadata || {};
		if (handlerProtocol.indexOf("h2") >= 0 && !request.headers[":authority"]) {
			delete request.headers["host"];
			request.headers[":authority"] = request.hostname + (request.port ? ":" + request.port : "");
		} else if (!request.headers["host"]) {
			let host = request.hostname;
			if (request.port != null) host += `:${request.port}`;
			request.headers["host"] = host;
		}
		return next(args);
	};
	hostHeaderMiddlewareOptions = {
		name: "hostHeaderMiddleware",
		step: "build",
		priority: "low",
		tags: ["HOST"],
		override: true
	};
	getHostHeaderPlugin = (options) => ({ applyToStack: (clientStack) => {
		clientStack.add(hostHeaderMiddleware(options), hostHeaderMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/middleware-logger/loggerMiddleware.js
var loggerMiddleware, loggerMiddlewareOptions, getLoggerPlugin;
var init_loggerMiddleware = __esmMin((() => {
	init_client$1();
	loggerMiddleware = () => (next, context) => async (args) => {
		try {
			const response = await next(args);
			const { logger } = context;
			const isNoOpLogger = logger instanceof NoOpLogger;
			if (logger && !isNoOpLogger) {
				const { clientName, commandName, dynamoDbDocumentClientOptions = {} } = context;
				const { overrideInputFilterSensitiveLog, overrideOutputFilterSensitiveLog } = dynamoDbDocumentClientOptions;
				const inputFilterSensitiveLog = overrideInputFilterSensitiveLog ?? context.inputFilterSensitiveLog;
				const outputFilterSensitiveLog = overrideOutputFilterSensitiveLog ?? context.outputFilterSensitiveLog;
				const { $metadata, ...outputWithoutMetadata } = response.output;
				logger.info?.({
					clientName,
					commandName,
					input: inputFilterSensitiveLog(args.input),
					output: outputFilterSensitiveLog(outputWithoutMetadata),
					metadata: $metadata
				});
			}
			return response;
		} catch (error) {
			const { clientName, commandName, logger, dynamoDbDocumentClientOptions = {} } = context;
			const { overrideInputFilterSensitiveLog } = dynamoDbDocumentClientOptions;
			const inputFilterSensitiveLog = overrideInputFilterSensitiveLog ?? context.inputFilterSensitiveLog;
			logger?.error?.({
				clientName,
				commandName,
				input: inputFilterSensitiveLog(args.input),
				error,
				metadata: error.$metadata
			});
			throw error;
		}
	};
	loggerMiddlewareOptions = {
		name: "loggerMiddleware",
		tags: ["LOGGER"],
		step: "initialize",
		override: true
	};
	getLoggerPlugin = (options) => ({ applyToStack: (clientStack) => {
		clientStack.add(loggerMiddleware(), loggerMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/middleware-recursion-detection/configuration.js
var recursionDetectionMiddlewareOptions;
var init_configuration$1 = __esmMin((() => {
	recursionDetectionMiddlewareOptions = {
		step: "build",
		tags: ["RECURSION_DETECTION", "TRACE_CONTEXT_PROPAGATION"],
		name: "recursionDetectionMiddleware",
		override: true,
		priority: "low"
	};
}));
//#endregion
//#region node_modules/@aws/lambda-invoke-store/dist-es/invoke-store.js
var PROTECTED_KEYS, NO_GLOBAL_AWS_LAMBDA, InvokeStoreBase, InvokeStoreSingle, InvokeStoreMulti, InvokeStore;
var init_invoke_store = __esmMin((() => {
	PROTECTED_KEYS = {
		REQUEST_ID: Symbol.for("_AWS_LAMBDA_REQUEST_ID"),
		X_RAY_TRACE_ID: Symbol.for("_AWS_LAMBDA_X_RAY_TRACE_ID"),
		TENANT_ID: Symbol.for("_AWS_LAMBDA_TENANT_ID"),
		TRACEPARENT: Symbol.for("_AWS_LAMBDA_TRACEPARENT"),
		TRACESTATE: Symbol.for("_AWS_LAMBDA_TRACESTATE"),
		BAGGAGE: Symbol.for("_AWS_LAMBDA_BAGGAGE")
	};
	NO_GLOBAL_AWS_LAMBDA = ["true", "1"].includes(process.env?.AWS_LAMBDA_NODEJS_NO_GLOBAL_AWSLAMBDA ?? "");
	if (!NO_GLOBAL_AWS_LAMBDA) globalThis.awslambda = globalThis.awslambda || {};
	InvokeStoreBase = class {
		static PROTECTED_KEYS = PROTECTED_KEYS;
		isProtectedKey(key) {
			return Object.values(PROTECTED_KEYS).includes(key);
		}
		getRequestId() {
			return this.get(PROTECTED_KEYS.REQUEST_ID) ?? "-";
		}
		getXRayTraceId() {
			return this.get(PROTECTED_KEYS.X_RAY_TRACE_ID);
		}
		getTenantId() {
			return this.get(PROTECTED_KEYS.TENANT_ID);
		}
		getTraceparent() {
			return this.get(PROTECTED_KEYS.TRACEPARENT);
		}
		getTracestate() {
			return this.get(PROTECTED_KEYS.TRACESTATE);
		}
		getBaggage() {
			return this.get(PROTECTED_KEYS.BAGGAGE);
		}
	};
	InvokeStoreSingle = class extends InvokeStoreBase {
		currentContext;
		getContext() {
			return this.currentContext;
		}
		hasContext() {
			return this.currentContext !== void 0;
		}
		get(key) {
			return this.currentContext?.[key];
		}
		set(key, value) {
			if (this.isProtectedKey(key)) throw new Error(`Cannot modify protected Lambda context field: ${String(key)}`);
			this.currentContext = this.currentContext || {};
			this.currentContext[key] = value;
		}
		run(context, fn) {
			this.currentContext = context;
			return fn();
		}
	};
	InvokeStoreMulti = class InvokeStoreMulti extends InvokeStoreBase {
		als;
		static async create() {
			const instance = new InvokeStoreMulti();
			instance.als = new (await (import("node:async_hooks"))).AsyncLocalStorage();
			return instance;
		}
		getContext() {
			return this.als.getStore();
		}
		hasContext() {
			return this.als.getStore() !== void 0;
		}
		get(key) {
			return this.als.getStore()?.[key];
		}
		set(key, value) {
			if (this.isProtectedKey(key)) throw new Error(`Cannot modify protected Lambda context field: ${String(key)}`);
			const store = this.als.getStore();
			if (!store) throw new Error("No context available");
			store[key] = value;
		}
		run(context, fn) {
			return this.als.run(context, fn);
		}
	};
	(function(InvokeStore) {
		let instance = null;
		async function getInstanceAsync(forceInvokeStoreMulti) {
			if (!instance) instance = (async () => {
				const newInstance = forceInvokeStoreMulti === true || "AWS_LAMBDA_MAX_CONCURRENCY" in process.env ? await InvokeStoreMulti.create() : new InvokeStoreSingle();
				if (!NO_GLOBAL_AWS_LAMBDA && globalThis.awslambda?.InvokeStore) return globalThis.awslambda.InvokeStore;
				else if (!NO_GLOBAL_AWS_LAMBDA && globalThis.awslambda) {
					globalThis.awslambda.InvokeStore = newInstance;
					return newInstance;
				} else return newInstance;
			})();
			return instance;
		}
		InvokeStore.getInstanceAsync = getInstanceAsync;
		InvokeStore._testing = process.env.AWS_LAMBDA_BENCHMARK_MODE === "1" ? { reset: () => {
			instance = null;
			if (globalThis.awslambda?.InvokeStore) delete globalThis.awslambda.InvokeStore;
			globalThis.awslambda = { InvokeStore: void 0 };
		} } : void 0;
	})(InvokeStore || (InvokeStore = {}));
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/middleware-recursion-detection/recursionDetectionMiddleware.js
function sanitizeTraceHeaders(headers) {
	for (const header of Object.keys(headers)) {
		const lower = header.toLowerCase();
		if (header !== lower && (lower === TRACEPARENT || lower === TRACESTATE || lower === BAGGAGE)) {
			headers[lower] = headers[header];
			delete headers[header];
		}
	}
}
var AWS_LAMBDA_FUNCTION_NAME, _X_AMZN_TRACE_ID, X_AMZN_TRACE_ID, TRACEPARENT, TRACESTATE, BAGGAGE, recursionDetectionMiddleware;
var init_recursionDetectionMiddleware = __esmMin((() => {
	init_invoke_store();
	init_protocols$1();
	AWS_LAMBDA_FUNCTION_NAME = "AWS_LAMBDA_FUNCTION_NAME";
	_X_AMZN_TRACE_ID = "_X_AMZN_TRACE_ID";
	X_AMZN_TRACE_ID = "X-Amzn-Trace-Id";
	TRACEPARENT = "traceparent";
	TRACESTATE = "tracestate";
	BAGGAGE = "baggage";
	recursionDetectionMiddleware = () => (next) => async (args) => {
		const { request } = args;
		if (!HttpRequest.isInstance(request)) return next(args);
		let invokeStore;
		{
			const traceIdHeader = Object.keys(request.headers ?? {}).find((h) => h.toLowerCase() === X_AMZN_TRACE_ID.toLowerCase()) ?? X_AMZN_TRACE_ID;
			if (!request.headers.hasOwnProperty(traceIdHeader)) {
				const functionName = process.env[AWS_LAMBDA_FUNCTION_NAME];
				const traceIdFromEnv = process.env[_X_AMZN_TRACE_ID];
				invokeStore ??= await InvokeStore.getInstanceAsync();
				const traceId = invokeStore?.getXRayTraceId() ?? traceIdFromEnv;
				const nonEmptyString = (str) => typeof str === "string" && str.length > 0;
				if (nonEmptyString(functionName) && nonEmptyString(traceId)) request.headers[X_AMZN_TRACE_ID] = traceId;
			}
		}
		sanitizeTraceHeaders(request.headers);
		if (!request.headers[TRACEPARENT]) {
			const traceparent = (invokeStore ??= await InvokeStore.getInstanceAsync())?.getTraceparent?.();
			if (traceparent) {
				request.headers[TRACEPARENT] = traceparent;
				const tracestate = invokeStore?.getTracestate?.();
				if (tracestate) request.headers[TRACESTATE] = tracestate;
				const baggage = invokeStore?.getBaggage?.();
				if (baggage) request.headers[BAGGAGE] = baggage;
			}
		}
		return next(args);
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/middleware-recursion-detection/getRecursionDetectionPlugin.js
var getRecursionDetectionPlugin;
var init_getRecursionDetectionPlugin = __esmMin((() => {
	init_configuration$1();
	init_recursionDetectionMiddleware();
	getRecursionDetectionPlugin = (options) => ({ applyToStack: (clientStack) => {
		clientStack.add(recursionDetectionMiddleware(), recursionDetectionMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/legacy-root-exports/middleware-http-auth-scheme/resolveAuthOptions.js
var resolveAuthOptions;
var init_resolveAuthOptions = __esmMin((() => {
	resolveAuthOptions = (candidateAuthOptions, authSchemePreference) => {
		if (!authSchemePreference || authSchemePreference.length === 0) return candidateAuthOptions;
		const preferredAuthOptions = [];
		for (const preferredSchemeName of authSchemePreference) for (const candidateAuthOption of candidateAuthOptions) if (candidateAuthOption.schemeId.split("#")[1] === preferredSchemeName) preferredAuthOptions.push(candidateAuthOption);
		for (const candidateAuthOption of candidateAuthOptions) if (!preferredAuthOptions.find(({ schemeId }) => schemeId === candidateAuthOption.schemeId)) preferredAuthOptions.push(candidateAuthOption);
		return preferredAuthOptions;
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/legacy-root-exports/middleware-http-auth-scheme/httpAuthSchemeMiddleware.js
function convertHttpAuthSchemesToMap(httpAuthSchemes) {
	const map = /* @__PURE__ */ new Map();
	for (const scheme of httpAuthSchemes) map.set(scheme.schemeId, scheme);
	return map;
}
var httpAuthSchemeMiddleware;
var init_httpAuthSchemeMiddleware = __esmMin((() => {
	init_transport();
	init_resolveAuthOptions();
	httpAuthSchemeMiddleware = (config, mwOptions) => (next, context) => async (args) => {
		const resolvedOptions = resolveAuthOptions(config.httpAuthSchemeProvider(await mwOptions.httpAuthSchemeParametersProvider(config, context, args.input)), config.authSchemePreference ? await config.authSchemePreference() : []);
		const authSchemes = convertHttpAuthSchemesToMap(config.httpAuthSchemes);
		const smithyContext = getSmithyContext(context);
		const failureReasons = [];
		for (const option of resolvedOptions) {
			const scheme = authSchemes.get(option.schemeId);
			if (!scheme) {
				failureReasons.push(`HttpAuthScheme \`${option.schemeId}\` was not enabled for this service.`);
				continue;
			}
			const identityProvider = scheme.identityProvider(await mwOptions.identityProviderConfigProvider(config));
			if (!identityProvider) {
				failureReasons.push(`HttpAuthScheme \`${option.schemeId}\` did not have an IdentityProvider configured.`);
				continue;
			}
			const { identityProperties = {}, signingProperties = {} } = option.propertiesExtractor?.(config, context) || {};
			option.identityProperties = Object.assign(option.identityProperties || {}, identityProperties);
			option.signingProperties = Object.assign(option.signingProperties || {}, signingProperties);
			smithyContext.selectedHttpAuthScheme = {
				httpAuthOption: option,
				identity: await identityProvider(option.identityProperties),
				signer: scheme.signer
			};
			break;
		}
		if (!smithyContext.selectedHttpAuthScheme) throw new Error(failureReasons.join("\n"));
		return next(args);
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/legacy-root-exports/middleware-http-auth-scheme/getHttpAuthSchemeEndpointRuleSetPlugin.js
var httpAuthSchemeEndpointRuleSetMiddlewareOptions, getHttpAuthSchemeEndpointRuleSetPlugin;
var init_getHttpAuthSchemeEndpointRuleSetPlugin = __esmMin((() => {
	init_httpAuthSchemeMiddleware();
	httpAuthSchemeEndpointRuleSetMiddlewareOptions = {
		step: "serialize",
		tags: ["HTTP_AUTH_SCHEME"],
		name: "httpAuthSchemeMiddleware",
		override: true,
		relation: "before",
		toMiddleware: "endpointV2Middleware"
	};
	getHttpAuthSchemeEndpointRuleSetPlugin = (config, { httpAuthSchemeParametersProvider, identityProviderConfigProvider }) => ({ applyToStack: (clientStack) => {
		clientStack.addRelativeTo(httpAuthSchemeMiddleware(config, {
			httpAuthSchemeParametersProvider,
			identityProviderConfigProvider
		}), httpAuthSchemeEndpointRuleSetMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/legacy-root-exports/middleware-http-auth-scheme/getHttpAuthSchemePlugin.js
var httpAuthSchemeMiddlewareOptions, getHttpAuthSchemePlugin;
var init_getHttpAuthSchemePlugin = __esmMin((() => {
	init_httpAuthSchemeMiddleware();
	httpAuthSchemeMiddlewareOptions = {
		step: "serialize",
		tags: ["HTTP_AUTH_SCHEME"],
		name: "httpAuthSchemeMiddleware",
		override: true,
		relation: "before",
		toMiddleware: "serializerMiddleware"
	};
	getHttpAuthSchemePlugin = (config, { httpAuthSchemeParametersProvider, identityProviderConfigProvider }) => ({ applyToStack: (clientStack) => {
		clientStack.addRelativeTo(httpAuthSchemeMiddleware(config, {
			httpAuthSchemeParametersProvider,
			identityProviderConfigProvider
		}), httpAuthSchemeMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/legacy-root-exports/middleware-http-auth-scheme/index.js
var init_middleware_http_auth_scheme = __esmMin((() => {
	init_httpAuthSchemeMiddleware();
	init_getHttpAuthSchemeEndpointRuleSetPlugin();
	init_getHttpAuthSchemePlugin();
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/legacy-root-exports/middleware-http-signing/httpSigningMiddleware.js
var defaultErrorHandler$1, defaultSuccessHandler$1, httpSigningMiddleware;
var init_httpSigningMiddleware = __esmMin((() => {
	init_protocols$1();
	init_transport();
	defaultErrorHandler$1 = (signingProperties) => (error) => {
		throw error;
	};
	defaultSuccessHandler$1 = (httpResponse, signingProperties) => {};
	httpSigningMiddleware = (config) => (next, context) => async (args) => {
		if (!HttpRequest.isInstance(args.request)) return next(args);
		const scheme = getSmithyContext(context).selectedHttpAuthScheme;
		if (!scheme) throw new Error(`No HttpAuthScheme was selected: unable to sign request`);
		const { httpAuthOption: { signingProperties = {} }, identity, signer } = scheme;
		const output = await next({
			...args,
			request: await signer.sign(args.request, identity, signingProperties)
		}).catch((signer.errorHandler || defaultErrorHandler$1)(signingProperties));
		(signer.successHandler || defaultSuccessHandler$1)(output.response, signingProperties);
		return output;
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/legacy-root-exports/middleware-http-signing/getHttpSigningMiddleware.js
var httpSigningMiddlewareOptions, getHttpSigningPlugin;
var init_getHttpSigningMiddleware = __esmMin((() => {
	init_httpSigningMiddleware();
	httpSigningMiddlewareOptions = {
		step: "finalizeRequest",
		tags: ["HTTP_SIGNING"],
		name: "httpSigningMiddleware",
		aliases: [
			"apiKeyMiddleware",
			"tokenMiddleware",
			"awsAuthMiddleware"
		],
		override: true,
		relation: "after",
		toMiddleware: "retryMiddleware"
	};
	getHttpSigningPlugin = (config) => ({ applyToStack: (clientStack) => {
		clientStack.addRelativeTo(httpSigningMiddleware(config), httpSigningMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/legacy-root-exports/middleware-http-signing/index.js
var init_middleware_http_signing = __esmMin((() => {
	init_httpSigningMiddleware();
	init_getHttpSigningMiddleware();
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/normalizeProvider.js
var normalizeProvider;
var init_normalizeProvider = __esmMin((() => {
	normalizeProvider = (input) => {
		if (typeof input === "function") return input;
		const promisified = Promise.resolve(input);
		return () => promisified;
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/legacy-root-exports/pagination/createPaginator.js
function createPaginator(ClientCtor, CommandCtor, inputTokenName, outputTokenName, pageSizeTokenName) {
	return async function* paginateOperation(config, input, ...additionalArguments) {
		const _input = input;
		let token = config.startingToken ?? _input[inputTokenName];
		let hasNext = true;
		let page;
		while (hasNext) {
			_input[inputTokenName] = token;
			if (pageSizeTokenName) _input[pageSizeTokenName] = _input[pageSizeTokenName] ?? config.pageSize;
			if (config.client instanceof ClientCtor) page = await makePagedClientRequest(CommandCtor, config.client, input, config.withCommand, ...additionalArguments);
			else throw new Error(`Invalid client, expected instance of ${ClientCtor.name}`);
			yield page;
			const prevToken = token;
			token = get(page, outputTokenName);
			hasNext = !!(token && (!config.stopOnSameToken || token !== prevToken));
		}
		return void 0;
	};
}
var makePagedClientRequest, get;
var init_createPaginator = __esmMin((() => {
	makePagedClientRequest = async (CommandCtor, client, input, withCommand = (_) => _, ...args) => {
		let command = new CommandCtor(input);
		command = withCommand(command) ?? command;
		return await client.send(command, ...args);
	};
	get = (fromObject, path) => {
		let cursor = fromObject;
		const pathComponents = path.split(".");
		for (const step of pathComponents) {
			if (!cursor || typeof cursor !== "object") return;
			cursor = cursor[step];
		}
		return cursor;
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/setFeature.js
function setFeature(context, feature, value) {
	if (!context.__smithy_context) context.__smithy_context = { features: {} };
	else if (!context.__smithy_context.features) context.__smithy_context.features = {};
	context.__smithy_context.features[feature] = value;
}
var init_setFeature = __esmMin((() => {}));
//#endregion
//#region node_modules/@smithy/core/dist-es/legacy-root-exports/util-identity-and-auth/DefaultIdentityProviderConfig.js
var DefaultIdentityProviderConfig;
var init_DefaultIdentityProviderConfig = __esmMin((() => {
	init_transport();
	DefaultIdentityProviderConfig = class {
		authSchemes = /* @__PURE__ */ new Map();
		constructor(config) {
			for (const key in config) {
				if (!hasOwn$1(config, key)) continue;
				const value = config[key];
				if (value !== void 0) this.authSchemes.set(key, value);
			}
		}
		getIdentityProvider(schemeId) {
			return this.authSchemes.get(schemeId);
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/legacy-root-exports/util-identity-and-auth/httpAuthSchemes/httpApiKeyAuth.js
var import_dist_cjs$8, HttpApiKeyAuthSigner;
var init_httpApiKeyAuth = __esmMin((() => {
	init_protocols$1();
	import_dist_cjs$8 = require_dist_cjs$40();
	HttpApiKeyAuthSigner = class {
		async sign(httpRequest, identity, signingProperties) {
			if (!signingProperties) throw new Error("request could not be signed with `apiKey` since the `name` and `in` signer properties are missing");
			if (!signingProperties.name) throw new Error("request could not be signed with `apiKey` since the `name` signer property is missing");
			if (!signingProperties.in) throw new Error("request could not be signed with `apiKey` since the `in` signer property is missing");
			if (!identity.apiKey) throw new Error("request could not be signed with `apiKey` since the `apiKey` is not defined");
			const clonedRequest = HttpRequest.clone(httpRequest);
			if (signingProperties.in === import_dist_cjs$8.HttpApiKeyAuthLocation.QUERY) clonedRequest.query[signingProperties.name] = identity.apiKey;
			else if (signingProperties.in === import_dist_cjs$8.HttpApiKeyAuthLocation.HEADER) clonedRequest.headers[signingProperties.name] = signingProperties.scheme ? `${signingProperties.scheme} ${identity.apiKey}` : identity.apiKey;
			else throw new Error("request can only be signed with `apiKey` locations `query` or `header`, but found: `" + signingProperties.in + "`");
			return clonedRequest;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/legacy-root-exports/util-identity-and-auth/httpAuthSchemes/httpBearerAuth.js
var HttpBearerAuthSigner;
var init_httpBearerAuth = __esmMin((() => {
	init_protocols$1();
	HttpBearerAuthSigner = class {
		async sign(httpRequest, identity, signingProperties) {
			const clonedRequest = HttpRequest.clone(httpRequest);
			if (!identity.token) throw new Error("request could not be signed with `token` since the `token` is not defined");
			clonedRequest.headers["Authorization"] = `Bearer ${identity.token}`;
			return clonedRequest;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/legacy-root-exports/util-identity-and-auth/httpAuthSchemes/noAuth.js
var NoAuthSigner;
var init_noAuth = __esmMin((() => {
	NoAuthSigner = class {
		async sign(httpRequest, identity, signingProperties) {
			return httpRequest;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/legacy-root-exports/util-identity-and-auth/httpAuthSchemes/index.js
var init_httpAuthSchemes$1 = __esmMin((() => {
	init_httpApiKeyAuth();
	init_httpBearerAuth();
	init_noAuth();
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/legacy-root-exports/util-identity-and-auth/memoizeIdentityProvider.js
var createIsIdentityExpiredFunction, EXPIRATION_MS, isIdentityExpired, doesIdentityRequireRefresh, memoizeIdentityProvider;
var init_memoizeIdentityProvider = __esmMin((() => {
	createIsIdentityExpiredFunction = (expirationMs) => function isIdentityExpired(identity) {
		return doesIdentityRequireRefresh(identity) && identity.expiration.getTime() - Date.now() < expirationMs;
	};
	EXPIRATION_MS = 3e5;
	isIdentityExpired = createIsIdentityExpiredFunction(EXPIRATION_MS);
	doesIdentityRequireRefresh = (identity) => identity.expiration !== void 0;
	memoizeIdentityProvider = (provider, isExpired, requiresRefresh) => {
		if (provider === void 0) return;
		const normalizedProvider = typeof provider !== "function" ? async () => Promise.resolve(provider) : provider;
		let resolved;
		let pending;
		let hasResult;
		let isConstant = false;
		const coalesceProvider = async (options) => {
			if (!pending) pending = normalizedProvider(options);
			try {
				resolved = await pending;
				hasResult = true;
				isConstant = false;
			} finally {
				pending = void 0;
			}
			return resolved;
		};
		if (isExpired === void 0) return async (options) => {
			if (!hasResult || options?.forceRefresh) resolved = await coalesceProvider(options);
			return resolved;
		};
		return async (options) => {
			if (!hasResult || options?.forceRefresh) resolved = await coalesceProvider(options);
			if (isConstant) return resolved;
			if (!requiresRefresh(resolved)) {
				isConstant = true;
				return resolved;
			}
			if (isExpired(resolved)) {
				await coalesceProvider(options);
				return resolved;
			}
			return resolved;
		};
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/legacy-root-exports/util-identity-and-auth/index.js
var init_util_identity_and_auth = __esmMin((() => {
	init_DefaultIdentityProviderConfig();
	init_httpAuthSchemes$1();
	init_memoizeIdentityProvider();
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/index.js
var dist_es_exports$1 = /* @__PURE__ */ __exportAll({
	DefaultIdentityProviderConfig: () => DefaultIdentityProviderConfig,
	EXPIRATION_MS: () => EXPIRATION_MS,
	HttpApiKeyAuthSigner: () => HttpApiKeyAuthSigner,
	HttpBearerAuthSigner: () => HttpBearerAuthSigner,
	NoAuthSigner: () => NoAuthSigner,
	createIsIdentityExpiredFunction: () => createIsIdentityExpiredFunction,
	createPaginator: () => createPaginator,
	doesIdentityRequireRefresh: () => doesIdentityRequireRefresh,
	getHttpAuthSchemeEndpointRuleSetPlugin: () => getHttpAuthSchemeEndpointRuleSetPlugin,
	getHttpAuthSchemePlugin: () => getHttpAuthSchemePlugin,
	getHttpSigningPlugin: () => getHttpSigningPlugin,
	getSmithyContext: () => getSmithyContext,
	httpAuthSchemeEndpointRuleSetMiddlewareOptions: () => httpAuthSchemeEndpointRuleSetMiddlewareOptions,
	httpAuthSchemeMiddleware: () => httpAuthSchemeMiddleware,
	httpAuthSchemeMiddlewareOptions: () => httpAuthSchemeMiddlewareOptions,
	httpSigningMiddleware: () => httpSigningMiddleware,
	httpSigningMiddlewareOptions: () => httpSigningMiddlewareOptions,
	isIdentityExpired: () => isIdentityExpired,
	memoizeIdentityProvider: () => memoizeIdentityProvider,
	normalizeProvider: () => normalizeProvider,
	requestBuilder: () => requestBuilder,
	setFeature: () => setFeature
});
var init_dist_es$1 = __esmMin((() => {
	init_transport();
	init_middleware_http_auth_scheme();
	init_middleware_http_signing();
	init_normalizeProvider();
	init_createPaginator();
	init_protocols$1();
	init_setFeature();
	init_util_identity_and_auth();
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/middleware-user-agent/configurations.js
function isValidUserAgentAppId(appId) {
	if (appId === void 0) return true;
	return typeof appId === "string" && appId.length <= 50;
}
function resolveUserAgentConfig(input) {
	const normalizedAppIdProvider = normalizeProvider(input.userAgentAppId ?? void 0);
	const { customUserAgent } = input;
	return Object.assign(input, {
		customUserAgent: typeof customUserAgent === "string" ? [[customUserAgent]] : customUserAgent,
		userAgentAppId: async () => {
			const appId = await normalizedAppIdProvider();
			if (!isValidUserAgentAppId(appId)) {
				const logger = input.logger?.constructor?.name === "NoOpLogger" || !input.logger ? console : input.logger;
				if (typeof appId !== "string") logger?.warn("userAgentAppId must be a string or undefined.");
				else if (appId.length > 50) logger?.warn("The provided userAgentAppId exceeds the maximum length of 50 characters.");
			}
			return appId;
		}
	});
}
var init_configurations$2 = __esmMin((() => {
	init_dist_es$1();
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/util-endpoints/lib/aws/partitions.js
var partitionsInfo;
var init_partitions = __esmMin((() => {
	partitionsInfo = {
		"partitions": [
			{
				"id": "aws",
				"outputs": {
					"dnsSuffix": "amazonaws.com",
					"dualStackDnsSuffix": "api.aws",
					"implicitGlobalRegion": "us-east-1",
					"name": "aws",
					"supportsDualStack": true,
					"supportsFIPS": true
				},
				"regionRegex": "^(us|eu|ap|sa|ca|me|af|il|mx)\\-\\w+\\-\\d+$",
				"regions": {
					"af-south-1": { "description": "Africa (Cape Town)" },
					"ap-east-1": { "description": "Asia Pacific (Hong Kong)" },
					"ap-east-2": { "description": "Asia Pacific (Taipei)" },
					"ap-northeast-1": { "description": "Asia Pacific (Tokyo)" },
					"ap-northeast-2": { "description": "Asia Pacific (Seoul)" },
					"ap-northeast-3": { "description": "Asia Pacific (Osaka)" },
					"ap-south-1": { "description": "Asia Pacific (Mumbai)" },
					"ap-south-2": { "description": "Asia Pacific (Hyderabad)" },
					"ap-southeast-1": { "description": "Asia Pacific (Singapore)" },
					"ap-southeast-2": { "description": "Asia Pacific (Sydney)" },
					"ap-southeast-3": { "description": "Asia Pacific (Jakarta)" },
					"ap-southeast-4": { "description": "Asia Pacific (Melbourne)" },
					"ap-southeast-5": { "description": "Asia Pacific (Malaysia)" },
					"ap-southeast-6": { "description": "Asia Pacific (New Zealand)" },
					"ap-southeast-7": { "description": "Asia Pacific (Thailand)" },
					"aws-global": { "description": "aws global region" },
					"ca-central-1": { "description": "Canada (Central)" },
					"ca-west-1": { "description": "Canada West (Calgary)" },
					"eu-central-1": { "description": "Europe (Frankfurt)" },
					"eu-central-2": { "description": "Europe (Zurich)" },
					"eu-north-1": { "description": "Europe (Stockholm)" },
					"eu-south-1": { "description": "Europe (Milan)" },
					"eu-south-2": { "description": "Europe (Spain)" },
					"eu-west-1": { "description": "Europe (Ireland)" },
					"eu-west-2": { "description": "Europe (London)" },
					"eu-west-3": { "description": "Europe (Paris)" },
					"il-central-1": { "description": "Israel (Tel Aviv)" },
					"me-central-1": { "description": "Middle East (UAE)" },
					"me-south-1": { "description": "Middle East (Bahrain)" },
					"me-west-1": { "description": "Middle East (Saudi Arabia)" },
					"mx-central-1": { "description": "Mexico (Central)" },
					"sa-east-1": { "description": "South America (Sao Paulo)" },
					"sa-west-1": { "description": "South America (Chile)" },
					"us-east-1": { "description": "US East (N. Virginia)" },
					"us-east-2": { "description": "US East (Ohio)" },
					"us-west-1": { "description": "US West (N. California)" },
					"us-west-2": { "description": "US West (Oregon)" }
				}
			},
			{
				"id": "aws-cn",
				"outputs": {
					"dnsSuffix": "amazonaws.com.cn",
					"dualStackDnsSuffix": "api.amazonwebservices.com.cn",
					"implicitGlobalRegion": "cn-northwest-1",
					"name": "aws-cn",
					"supportsDualStack": true,
					"supportsFIPS": true
				},
				"regionRegex": "^cn\\-\\w+\\-\\d+$",
				"regions": {
					"aws-cn-global": { "description": "aws-cn global region" },
					"cn-north-1": { "description": "China (Beijing)" },
					"cn-northwest-1": { "description": "China (Ningxia)" }
				}
			},
			{
				"id": "aws-eusc",
				"outputs": {
					"dnsSuffix": "amazonaws.eu",
					"dualStackDnsSuffix": "api.amazonwebservices.eu",
					"implicitGlobalRegion": "eusc-de-east-1",
					"name": "aws-eusc",
					"supportsDualStack": true,
					"supportsFIPS": true
				},
				"regionRegex": "^eusc\\-(de)\\-\\w+\\-\\d+$",
				"regions": { "eusc-de-east-1": { "description": "AWS European Sovereign Cloud (Germany)" } }
			},
			{
				"id": "aws-iso",
				"outputs": {
					"dnsSuffix": "c2s.ic.gov",
					"dualStackDnsSuffix": "api.aws.ic.gov",
					"implicitGlobalRegion": "us-iso-east-1",
					"name": "aws-iso",
					"supportsDualStack": true,
					"supportsFIPS": true
				},
				"regionRegex": "^us\\-iso\\-\\w+\\-\\d+$",
				"regions": {
					"aws-iso-global": { "description": "aws-iso global region" },
					"us-iso-east-1": { "description": "US ISO East" },
					"us-iso-west-1": { "description": "US ISO WEST" }
				}
			},
			{
				"id": "aws-iso-b",
				"outputs": {
					"dnsSuffix": "sc2s.sgov.gov",
					"dualStackDnsSuffix": "api.aws.scloud",
					"implicitGlobalRegion": "us-isob-east-1",
					"name": "aws-iso-b",
					"supportsDualStack": true,
					"supportsFIPS": true
				},
				"regionRegex": "^us\\-isob\\-\\w+\\-\\d+$",
				"regions": {
					"aws-iso-b-global": { "description": "aws-iso-b global region" },
					"us-isob-east-1": { "description": "US ISOB East (Ohio)" },
					"us-isob-west-1": { "description": "US ISOB West" }
				}
			},
			{
				"id": "aws-iso-e",
				"outputs": {
					"dnsSuffix": "cloud.adc-e.uk",
					"dualStackDnsSuffix": "api.cloud-aws.adc-e.uk",
					"implicitGlobalRegion": "eu-isoe-west-1",
					"name": "aws-iso-e",
					"supportsDualStack": true,
					"supportsFIPS": true
				},
				"regionRegex": "^eu\\-isoe\\-\\w+\\-\\d+$",
				"regions": {
					"aws-iso-e-global": { "description": "aws-iso-e global region" },
					"eu-isoe-west-1": { "description": "EU ISOE West" }
				}
			},
			{
				"id": "aws-iso-f",
				"outputs": {
					"dnsSuffix": "csp.hci.ic.gov",
					"dualStackDnsSuffix": "api.aws.hci.ic.gov",
					"implicitGlobalRegion": "us-isof-south-1",
					"name": "aws-iso-f",
					"supportsDualStack": true,
					"supportsFIPS": true
				},
				"regionRegex": "^us\\-isof\\-\\w+\\-\\d+$",
				"regions": {
					"aws-iso-f-global": { "description": "aws-iso-f global region" },
					"us-isof-east-1": { "description": "US ISOF EAST" },
					"us-isof-south-1": { "description": "US ISOF SOUTH" }
				}
			},
			{
				"id": "aws-us-gov",
				"outputs": {
					"dnsSuffix": "amazonaws.com",
					"dualStackDnsSuffix": "api.aws",
					"implicitGlobalRegion": "us-gov-west-1",
					"name": "aws-us-gov",
					"supportsDualStack": true,
					"supportsFIPS": true
				},
				"regionRegex": "^us\\-gov\\-\\w+\\-\\d+$",
				"regions": {
					"aws-us-gov-global": { "description": "aws-us-gov global region" },
					"us-gov-east-1": { "description": "AWS GovCloud (US-East)" },
					"us-gov-west-1": { "description": "AWS GovCloud (US-West)" }
				}
			}
		],
		"version": "1.1"
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/util-endpoints/lib/aws/partition.js
var selectedPartitionsInfo, selectedUserAgentPrefix, partition, setPartitionInfo, useDefaultPartitionInfo, getUserAgentPrefix;
var init_partition = __esmMin((() => {
	init_partitions();
	selectedPartitionsInfo = partitionsInfo;
	selectedUserAgentPrefix = "";
	partition = (value) => {
		const { partitions } = selectedPartitionsInfo;
		for (const partition of partitions) {
			const { regions, outputs } = partition;
			for (const [region, regionData] of Object.entries(regions)) if (region === value) return {
				...outputs,
				...regionData
			};
		}
		for (const partition of partitions) {
			const { regionRegex, outputs } = partition;
			if (new RegExp(regionRegex).test(value)) return { ...outputs };
		}
		const DEFAULT_PARTITION = partitions.find((partition) => partition.id === "aws");
		if (!DEFAULT_PARTITION) throw new Error("Provided region was not found in the partition array or regex, and default partition with id 'aws' doesn't exist.");
		return { ...DEFAULT_PARTITION.outputs };
	};
	setPartitionInfo = (partitionsInfo, userAgentPrefix = "") => {
		selectedPartitionsInfo = partitionsInfo;
		selectedUserAgentPrefix = userAgentPrefix;
	};
	useDefaultPartitionInfo = () => {
		setPartitionInfo(partitionsInfo, "");
	};
	getUserAgentPrefix = () => selectedUserAgentPrefix;
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/middleware-retry/isStreamingPayload/isStreamingPayload.js
var isStreamingPayload;
var init_isStreamingPayload = __esmMin((() => {
	isStreamingPayload = (request) => request?.body instanceof Readable || typeof ReadableStream !== "undefined" && request?.body instanceof ReadableStream;
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/service-error-classification/constants.js
var CLOCK_SKEW_ERROR_CODES, THROTTLING_ERROR_CODES, TRANSIENT_ERROR_CODES, TRANSIENT_ERROR_STATUS_CODES, NODEJS_TIMEOUT_ERROR_CODES, NODEJS_NETWORK_ERROR_CODES;
var init_constants$4 = __esmMin((() => {
	CLOCK_SKEW_ERROR_CODES = [
		"AccessDeniedException",
		"AuthFailure",
		"InvalidSignatureException",
		"RequestExpired",
		"RequestInTheFuture",
		"RequestTimeTooSkewed",
		"SignatureDoesNotMatch"
	];
	THROTTLING_ERROR_CODES = [
		"BandwidthLimitExceeded",
		"EC2ThrottledException",
		"LimitExceededException",
		"PriorRequestNotComplete",
		"ProvisionedThroughputExceededException",
		"RequestLimitExceeded",
		"RequestThrottled",
		"RequestThrottledException",
		"SlowDown",
		"ThrottledException",
		"Throttling",
		"ThrottlingException",
		"TooManyRequestsException",
		"TransactionInProgressException"
	];
	TRANSIENT_ERROR_CODES = [
		"TimeoutError",
		"RequestTimeout",
		"RequestTimeoutException"
	];
	TRANSIENT_ERROR_STATUS_CODES = [
		500,
		502,
		503,
		504
	];
	NODEJS_TIMEOUT_ERROR_CODES = [
		"ECONNRESET",
		"ECONNREFUSED",
		"EPIPE",
		"ETIMEDOUT"
	];
	NODEJS_NETWORK_ERROR_CODES = [
		"EHOSTUNREACH",
		"ENETUNREACH",
		"ENOTFOUND",
		"EAI_AGAIN"
	];
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/service-error-classification/service-error-classification.js
function isNodeJsHttp2TransientError(error) {
	return error.code === "ERR_HTTP2_STREAM_ERROR" && error.message.includes("NGHTTP2_REFUSED_STREAM");
}
var isRetryableByTrait, isClockSkewError, isClockSkewCorrectedError, isBrowserNetworkError, isThrottlingError, isTransientError, isServerError;
var init_service_error_classification = __esmMin((() => {
	init_constants$4();
	isRetryableByTrait = (error) => error?.$retryable !== void 0;
	isClockSkewError = (error) => CLOCK_SKEW_ERROR_CODES.includes(error.name);
	isClockSkewCorrectedError = (error) => error.$metadata?.clockSkewCorrected;
	isBrowserNetworkError = (error) => {
		const errorMessages = new Set([
			"Failed to fetch",
			"NetworkError when attempting to fetch resource",
			"The Internet connection appears to be offline",
			"Load failed",
			"Network request failed"
		]);
		if (!(error && error instanceof TypeError)) return false;
		return errorMessages.has(error.message);
	};
	isThrottlingError = (error) => error.$metadata?.httpStatusCode === 429 || THROTTLING_ERROR_CODES.includes(error.name) || error.$retryable?.throttling == true;
	isTransientError = (error, depth = 0) => error?.name !== "AbortError" && (isRetryableByTrait(error) || isClockSkewCorrectedError(error) || error.name === "InvalidSignatureException" && error.message?.includes("Signature expired") || TRANSIENT_ERROR_CODES.includes(error.name) || NODEJS_TIMEOUT_ERROR_CODES.includes(error?.code || "") || NODEJS_NETWORK_ERROR_CODES.includes(error?.code || "") || TRANSIENT_ERROR_STATUS_CODES.includes(error.$metadata?.httpStatusCode || 0) || isBrowserNetworkError(error) || isNodeJsHttp2TransientError(error) || error.cause !== void 0 && depth <= 10 && isTransientError(error.cause, depth + 1));
	isServerError = (error) => {
		if (error.$metadata?.httpStatusCode !== void 0) {
			const statusCode = error.$metadata.httpStatusCode;
			if (500 <= statusCode && statusCode <= 599 && !isTransientError(error)) return true;
			return false;
		}
		return false;
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/util-retry/race.js
var race, createAbortError, isAbortError;
var init_race = __esmMin((() => {
	race = (promise, signal) => {
		if (!signal) return promise;
		let cleanup = () => {};
		const aborted = new Promise((_, reject) => {
			const handler = () => reject(createAbortError());
			if (signal.aborted) handler();
			else if (typeof signal.addEventListener === "function") {
				signal.addEventListener("abort", handler, { once: true });
				cleanup = () => signal.removeEventListener("abort", handler);
			} else signal.onabort = handler;
		});
		return Promise.race([promise, aborted]).finally(cleanup);
	};
	createAbortError = () => Object.assign(/* @__PURE__ */ new Error("Request aborted"), { name: "AbortError" });
	isAbortError = (error) => typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/util-retry/constants.js
var MAXIMUM_RETRY_DELAY, INVOCATION_ID_HEADER, REQUEST_HEADER;
var init_constants$3 = __esmMin((() => {
	MAXIMUM_RETRY_DELAY = 20 * 1e3;
	INVOCATION_ID_HEADER = "amz-sdk-invocation-id";
	REQUEST_HEADER = "amz-sdk-request";
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/middleware-retry/parseRetryAfterHeader.js
function parseRetryAfterHeader(response, logger) {
	if (!HttpResponse.isInstance(response)) return;
	for (const header in response.headers) {
		if (!hasOwn$1(response.headers, header)) continue;
		const h = header.toLowerCase();
		if (h === "retry-after") {
			const retryAfter = response.headers[header];
			let retryAfterSeconds = NaN;
			if (retryAfter.endsWith("GMT")) try {
				retryAfterSeconds = (parseRfc7231DateTime(retryAfter).getTime() - Date.now()) / 1e3;
			} catch (e) {
				logger?.trace?.("Failed to parse retry-after header");
				logger?.trace?.(e);
			}
			else if (retryAfter.match(/ GMT, ((\d+)|(\d+\.\d+))$/)) retryAfterSeconds = Number(retryAfter.match(/ GMT, ([\d.]+)$/)?.[1]);
			else if (retryAfter.match(/^((\d+)|(\d+\.\d+))$/)) retryAfterSeconds = Number(retryAfter);
			else if (Date.parse(retryAfter) >= Date.now()) retryAfterSeconds = (Date.parse(retryAfter) - Date.now()) / 1e3;
			if (isNaN(retryAfterSeconds)) return;
			return new Date(Date.now() + retryAfterSeconds * 1e3);
		} else if (h === "x-amz-retry-after") {
			const v = response.headers[header];
			const backoffMilliseconds = Number(v);
			if (isNaN(backoffMilliseconds)) {
				logger?.trace?.(`Failed to parse x-amz-retry-after=${v}`);
				return;
			}
			return new Date(Date.now() + backoffMilliseconds);
		}
	}
}
function getRetryAfterHint(response, logger) {
	return parseRetryAfterHeader(response, logger);
}
var init_parseRetryAfterHeader = __esmMin((() => {
	init_transport();
	init_protocols$1();
	init_serde();
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/middleware-retry/util.js
var asSdkError;
var init_util$1 = __esmMin((() => {
	asSdkError = (error) => {
		if (error instanceof Error) return error;
		if (error instanceof Object) return Object.assign(/* @__PURE__ */ new Error(), error);
		if (typeof error === "string") return new Error(error);
		return /* @__PURE__ */ new Error(`AWS SDK error wrapper for ${error}`);
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/middleware-retry/retryMiddleware.js
function bindRetryMiddleware(isStreamingPayload) {
	return (options) => (next, context) => async (args) => {
		let retryStrategy = await options.retryStrategy();
		const maxAttempts = await options.maxAttempts();
		const abortSignal = context[import_dist_cjs$7.SMITHY_CONTEXT_KEY]?.abortSignal;
		if (isRetryStrategyV2(retryStrategy)) {
			retryStrategy = retryStrategy;
			const retryTokenScope = (context["partition_id"] ?? "") + (context.__retryLongPoll ? ":longpoll" : "");
			let retryToken = await race(retryStrategy.acquireInitialRetryToken(retryTokenScope), abortSignal);
			let lastError = /* @__PURE__ */ new Error();
			let attempts = 0;
			let totalRetryDelay = 0;
			const { request } = args;
			const isRequest = HttpRequest.isInstance(request);
			if (isRequest) request.headers[INVOCATION_ID_HEADER] = v4();
			while (true) try {
				if (isRequest) request.headers[REQUEST_HEADER] = `attempt=${attempts + 1}; max=${maxAttempts}`;
				const { response, output } = await next(args);
				retryStrategy.recordSuccess(retryToken);
				output.$metadata.attempts = attempts + 1;
				output.$metadata.totalRetryDelay = totalRetryDelay;
				return {
					response,
					output
				};
			} catch (e) {
				const retryErrorInfo = getRetryErrorInfo(e, options.logger);
				lastError = asSdkError(e);
				if (isRequest && isStreamingPayload(request)) {
					(context.logger instanceof NoOpLogger ? console : context.logger)?.warn("An error was encountered in a non-retryable streaming request.");
					throw lastError;
				}
				try {
					retryToken = await race(retryStrategy.refreshRetryTokenForRetry(retryToken, retryErrorInfo), abortSignal);
				} catch (refreshError) {
					if (abortSignal?.aborted && isAbortError(refreshError)) throw refreshError;
					if (!lastError.$metadata) lastError.$metadata = {};
					lastError.$metadata.attempts = attempts + 1;
					lastError.$metadata.totalRetryDelay = totalRetryDelay;
					throw lastError;
				}
				attempts = retryToken.getRetryCount();
				const delay = retryToken.getRetryDelay();
				totalRetryDelay += (retryToken?.$retryLog?.acquisitionDelay ?? 0) + delay;
				if (delay > 0) await race(new Promise((resolve) => setTimeout(resolve, delay)), abortSignal);
			}
		} else {
			retryStrategy = retryStrategy;
			if (retryStrategy?.mode) context.userAgent = [...context.userAgent || [], ["cfg/retry-mode", retryStrategy.mode]];
			return retryStrategy.retry(next, args);
		}
	};
}
function bindGetRetryPlugin(isStreamingPayload) {
	const retryMiddleware = bindRetryMiddleware(isStreamingPayload);
	return (options) => ({ applyToStack: (clientStack) => {
		clientStack.add(retryMiddleware(options), retryMiddlewareOptions);
	} });
}
var import_dist_cjs$7, isRetryStrategyV2, getRetryErrorInfo, getRetryErrorType, retryMiddlewareOptions;
var init_retryMiddleware = __esmMin((() => {
	init_client$1();
	init_protocols$1();
	init_serde();
	import_dist_cjs$7 = require_dist_cjs$40();
	init_service_error_classification();
	init_race();
	init_constants$3();
	init_parseRetryAfterHeader();
	init_util$1();
	isRetryStrategyV2 = (retryStrategy) => typeof retryStrategy.acquireInitialRetryToken !== "undefined" && typeof retryStrategy.refreshRetryTokenForRetry !== "undefined" && typeof retryStrategy.recordSuccess !== "undefined";
	getRetryErrorInfo = (error, logger) => {
		const errorInfo = {
			error,
			errorType: getRetryErrorType(error)
		};
		const retryAfterHint = parseRetryAfterHeader(error.$response, logger);
		if (retryAfterHint) errorInfo.retryAfterHint = retryAfterHint;
		return errorInfo;
	};
	getRetryErrorType = (error) => {
		if (isThrottlingError(error)) return "THROTTLING";
		if (isTransientError(error)) return "TRANSIENT";
		if (isServerError(error)) return "SERVER_ERROR";
		return "CLIENT_ERROR";
	};
	retryMiddlewareOptions = {
		name: "retryMiddleware",
		tags: ["RETRY"],
		step: "finalizeRequest",
		priority: "high",
		override: true
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/util-retry/DefaultRateLimiter.js
var DefaultRateLimiter;
var init_DefaultRateLimiter = __esmMin((() => {
	init_service_error_classification();
	DefaultRateLimiter = class DefaultRateLimiter {
		static setTimeoutFn = (fn, delay) => setTimeout(fn, delay);
		beta;
		minCapacity;
		minFillRate;
		scaleConstant;
		smooth;
		enabled = false;
		availableTokens = 0;
		lastMaxRate = 0;
		measuredTxRate = 0;
		requestCount = 0;
		fillRate;
		lastThrottleTime;
		lastTimestamp = 0;
		lastTxRateBucket;
		maxCapacity;
		timeWindow = 0;
		constructor(options) {
			this.beta = options?.beta ?? .7;
			this.minCapacity = options?.minCapacity ?? 1;
			this.minFillRate = options?.minFillRate ?? .5;
			this.scaleConstant = options?.scaleConstant ?? .4;
			this.smooth = options?.smooth ?? .8;
			this.lastThrottleTime = this.getCurrentTimeInSeconds();
			this.lastTxRateBucket = Math.floor(this.getCurrentTimeInSeconds());
			this.fillRate = this.minFillRate;
			this.maxCapacity = this.minCapacity;
		}
		async getSendToken() {
			return this.acquireTokenBucket(1);
		}
		updateClientSendingRate(response) {
			let calculatedRate;
			this.updateMeasuredRate();
			const retryErrorInfo = response;
			if (retryErrorInfo?.errorType === "THROTTLING" || isThrottlingError(retryErrorInfo?.error ?? response)) {
				const rateToUse = !this.enabled ? this.measuredTxRate : Math.min(this.measuredTxRate, this.fillRate);
				this.lastMaxRate = rateToUse;
				this.calculateTimeWindow();
				this.lastThrottleTime = this.getCurrentTimeInSeconds();
				calculatedRate = this.cubicThrottle(rateToUse);
				this.enableTokenBucket();
			} else {
				this.calculateTimeWindow();
				calculatedRate = this.cubicSuccess(this.getCurrentTimeInSeconds());
			}
			const newRate = Math.min(calculatedRate, 2 * this.measuredTxRate);
			this.updateTokenBucketRate(newRate);
		}
		getCurrentTimeInSeconds() {
			return Date.now() / 1e3;
		}
		async acquireTokenBucket(amount) {
			if (!this.enabled) return;
			this.refillTokenBucket();
			while (amount > this.availableTokens) {
				const delay = (amount - this.availableTokens) / this.fillRate * 1e3;
				await new Promise((resolve) => DefaultRateLimiter.setTimeoutFn(resolve, delay));
				this.refillTokenBucket();
			}
			this.availableTokens = this.availableTokens - amount;
		}
		refillTokenBucket() {
			const timestamp = this.getCurrentTimeInSeconds();
			if (!this.lastTimestamp) {
				this.lastTimestamp = timestamp;
				return;
			}
			const fillAmount = (timestamp - this.lastTimestamp) * this.fillRate;
			this.availableTokens = Math.min(this.maxCapacity, this.availableTokens + fillAmount);
			this.lastTimestamp = timestamp;
		}
		calculateTimeWindow() {
			this.timeWindow = this.getPrecise(Math.pow(this.lastMaxRate * (1 - this.beta) / this.scaleConstant, 1 / 3));
		}
		cubicThrottle(rateToUse) {
			return this.getPrecise(rateToUse * this.beta);
		}
		cubicSuccess(timestamp) {
			return this.getPrecise(this.scaleConstant * Math.pow(timestamp - this.lastThrottleTime - this.timeWindow, 3) + this.lastMaxRate);
		}
		enableTokenBucket() {
			this.enabled = true;
		}
		updateTokenBucketRate(newRate) {
			this.refillTokenBucket();
			this.fillRate = Math.max(newRate, this.minFillRate);
			this.maxCapacity = Math.max(newRate, this.minCapacity);
			this.availableTokens = Math.min(this.availableTokens, this.maxCapacity);
		}
		updateMeasuredRate() {
			const t = this.getCurrentTimeInSeconds();
			const timeBucket = Math.floor(t * 2) / 2;
			this.requestCount++;
			if (timeBucket > this.lastTxRateBucket) {
				const currentRate = this.requestCount / (timeBucket - this.lastTxRateBucket);
				this.measuredTxRate = this.getPrecise(currentRate * this.smooth + this.measuredTxRate * (1 - this.smooth));
				this.requestCount = 0;
				this.lastTxRateBucket = timeBucket;
			}
		}
		getPrecise(num) {
			return parseFloat(num.toFixed(8));
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/util-retry/retries-2026-config.js
var Retry;
var init_retries_2026_config = __esmMin((() => {
	Retry = class {
		static v2026 = true;
		static delay() {
			return 50;
		}
		static throttlingDelay() {
			return 1e3;
		}
		static cost() {
			return 14;
		}
		static throttlingCost() {
			return 5;
		}
		static modifiedCostType() {
			return "THROTTLING";
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/util-retry/DefaultRetryBackoffStrategy.js
var DefaultRetryBackoffStrategy;
var init_DefaultRetryBackoffStrategy = __esmMin((() => {
	init_constants$3();
	init_retries_2026_config();
	DefaultRetryBackoffStrategy = class {
		x = Retry.delay();
		computeNextBackoffDelay(i) {
			const t_i = Math.random() * Math.min(this.x * 2 ** i, MAXIMUM_RETRY_DELAY);
			return Math.floor(t_i);
		}
		setDelayBase(delay) {
			this.x = delay;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/util-retry/DefaultRetryToken.js
var DefaultRetryToken;
var init_DefaultRetryToken = __esmMin((() => {
	init_constants$3();
	DefaultRetryToken = class {
		delay;
		count;
		cost;
		longPoll;
		$retryLog = { acquisitionDelay: 0 };
		constructor(delay, count, cost, longPoll) {
			this.delay = delay;
			this.count = count;
			this.cost = cost;
			this.longPoll = longPoll;
		}
		getRetryCount() {
			return this.count;
		}
		getRetryDelay() {
			return Math.min(MAXIMUM_RETRY_DELAY, this.delay);
		}
		getRetryCost() {
			return this.cost;
		}
		isLongPoll() {
			return this.longPoll;
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/util-retry/config.js
var RETRY_MODES, DEFAULT_RETRY_MODE;
var init_config = __esmMin((() => {
	(function(RETRY_MODES) {
		RETRY_MODES["STANDARD"] = "standard";
		RETRY_MODES["ADAPTIVE"] = "adaptive";
	})(RETRY_MODES || (RETRY_MODES = {}));
	DEFAULT_RETRY_MODE = RETRY_MODES.STANDARD;
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/util-retry/StandardRetryStrategy.js
var refusal, StandardRetryStrategy$1;
var init_StandardRetryStrategy$1 = __esmMin((() => {
	init_DefaultRetryBackoffStrategy();
	init_DefaultRetryToken();
	init_config();
	init_constants$3();
	init_retries_2026_config();
	refusal = {
		incompatible: 1,
		attempts: 2,
		capacity: 3
	};
	StandardRetryStrategy$1 = class {
		mode = RETRY_MODES.STANDARD;
		retryBackoffStrategy;
		capacity = 500;
		maxAttemptsProvider;
		baseDelay;
		constructor(arg1) {
			if (typeof arg1 === "number") this.maxAttemptsProvider = async () => arg1;
			else if (typeof arg1 === "function") this.maxAttemptsProvider = arg1;
			else if (arg1 && typeof arg1 === "object") {
				this.maxAttemptsProvider = async () => arg1.maxAttempts;
				this.baseDelay = arg1.baseDelay;
				this.retryBackoffStrategy = arg1.backoff;
			}
			this.maxAttemptsProvider ??= async () => 3;
			this.baseDelay ??= Retry.delay();
			this.retryBackoffStrategy ??= new DefaultRetryBackoffStrategy();
		}
		async acquireInitialRetryToken(retryTokenScope) {
			return new DefaultRetryToken(Retry.delay(), 0, void 0, retryTokenScope.includes(":longpoll"));
		}
		async refreshRetryTokenForRetry(token, errorInfo) {
			const maxAttempts = await this.getMaxAttempts();
			const retryCode = this.retryCode(token, errorInfo, maxAttempts);
			const shouldRetry = retryCode === 0;
			const isLongPoll = token.isLongPoll?.();
			if (shouldRetry || isLongPoll) {
				const errorType = errorInfo.errorType;
				this.retryBackoffStrategy.setDelayBase(errorType === "THROTTLING" ? Retry.throttlingDelay() : this.baseDelay);
				const delayFromErrorType = this.retryBackoffStrategy.computeNextBackoffDelay(token.getRetryCount());
				let retryDelay = delayFromErrorType;
				if (errorInfo.retryAfterHint instanceof Date) retryDelay = Math.max(delayFromErrorType, Math.min(errorInfo.retryAfterHint.getTime() - Date.now(), delayFromErrorType + 5e3));
				if (!shouldRetry) {
					const longPollBackoff = retryCode === refusal.capacity && isLongPoll ? retryDelay : 0;
					if (longPollBackoff > 0) await new Promise((r) => setTimeout(r, longPollBackoff));
				} else {
					const capacityCost = this.getCapacityCost(errorType);
					this.capacity -= capacityCost;
					const nextToken = new DefaultRetryToken(0, token.getRetryCount() + 1, capacityCost, token.isLongPoll?.() ?? false);
					await new Promise((r) => setTimeout(r, retryDelay));
					nextToken.$retryLog.acquisitionDelay = retryDelay;
					return nextToken;
				}
			}
			throw new Error("No retry token available");
		}
		recordSuccess(token) {
			this.capacity = Math.min(500, this.capacity + (token.getRetryCost() ?? 1));
		}
		getCapacity() {
			return this.capacity;
		}
		async maxAttempts() {
			return this.maxAttemptsProvider();
		}
		async getMaxAttempts() {
			try {
				return await this.maxAttemptsProvider();
			} catch (ignored) {
				console.warn(`Max attempts provider could not resolve. Using default of 3`);
				return 3;
			}
		}
		retryCode(tokenToRenew, errorInfo, maxAttempts) {
			const attempts = tokenToRenew.getRetryCount() + 1;
			const retryableStatus = this.isRetryableError(errorInfo.errorType) ? 0 : refusal.incompatible;
			const attemptStatus = attempts < maxAttempts ? 0 : refusal.attempts;
			const capacityStatus = this.capacity >= this.getCapacityCost(errorInfo.errorType) ? 0 : refusal.capacity;
			return retryableStatus || attemptStatus || capacityStatus;
		}
		getCapacityCost(errorType) {
			return errorType === Retry.modifiedCostType() ? Retry.throttlingCost() : Retry.cost();
		}
		isRetryableError(errorType) {
			return errorType === "THROTTLING" || errorType === "TRANSIENT";
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/util-retry/AdaptiveRetryStrategy.js
var AdaptiveRetryStrategy$1;
var init_AdaptiveRetryStrategy$1 = __esmMin((() => {
	init_DefaultRateLimiter();
	init_StandardRetryStrategy$1();
	init_config();
	AdaptiveRetryStrategy$1 = class {
		mode = RETRY_MODES.ADAPTIVE;
		rateLimiter;
		standardRetryStrategy;
		constructor(maxAttemptsProvider, options) {
			const { rateLimiter } = options ?? {};
			this.rateLimiter = rateLimiter ?? new DefaultRateLimiter();
			this.standardRetryStrategy = options ? new StandardRetryStrategy$1({
				maxAttempts: typeof maxAttemptsProvider === "number" ? maxAttemptsProvider : 3,
				...options
			}) : new StandardRetryStrategy$1(maxAttemptsProvider);
		}
		async acquireInitialRetryToken(retryTokenScope) {
			const token = await this.standardRetryStrategy.acquireInitialRetryToken(retryTokenScope);
			await this.rateLimiter.getSendToken();
			return token;
		}
		async refreshRetryTokenForRetry(tokenToRenew, errorInfo) {
			this.rateLimiter.updateClientSendingRate(errorInfo);
			const token = await this.standardRetryStrategy.refreshRetryTokenForRetry(tokenToRenew, errorInfo);
			await this.rateLimiter.getSendToken();
			return token;
		}
		recordSuccess(token) {
			this.rateLimiter.updateClientSendingRate({});
			this.standardRetryStrategy.recordSuccess(token);
		}
		async maxAttemptsProvider() {
			return this.standardRetryStrategy.maxAttempts();
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/util-retry/ConfiguredRetryStrategy.js
var ConfiguredRetryStrategy;
var init_ConfiguredRetryStrategy = __esmMin((() => {
	init_StandardRetryStrategy$1();
	init_retries_2026_config();
	ConfiguredRetryStrategy = class extends StandardRetryStrategy$1 {
		computeNextBackoffDelay;
		constructor(maxAttempts, computeNextBackoffDelay = Retry.delay()) {
			super(typeof maxAttempts === "function" ? maxAttempts : async () => maxAttempts);
			if (typeof computeNextBackoffDelay === "number") this.computeNextBackoffDelay = () => computeNextBackoffDelay;
			else this.computeNextBackoffDelay = computeNextBackoffDelay;
			this.retryBackoffStrategy.computeNextBackoffDelay = (completedAttempt) => {
				const nextAttempt = completedAttempt + 1;
				return this.computeNextBackoffDelay(nextAttempt);
			};
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/middleware-retry/retry-pre-sra-deprecated/defaultRetryQuota.js
var getDefaultRetryQuota;
var init_defaultRetryQuota = __esmMin((() => {
	init_constants$3();
	getDefaultRetryQuota = (initialRetryTokens, options) => {
		const MAX_CAPACITY = initialRetryTokens;
		const noRetryIncrement = options?.noRetryIncrement ?? 1;
		const retryCost = options?.retryCost ?? 5;
		const timeoutRetryCost = options?.timeoutRetryCost ?? 10;
		let availableCapacity = initialRetryTokens;
		const getCapacityAmount = (error) => error.name === "TimeoutError" ? timeoutRetryCost : retryCost;
		const hasRetryTokens = (error) => getCapacityAmount(error) <= availableCapacity;
		const retrieveRetryTokens = (error) => {
			if (!hasRetryTokens(error)) throw new Error("No retry token available");
			const capacityAmount = getCapacityAmount(error);
			availableCapacity -= capacityAmount;
			return capacityAmount;
		};
		const releaseRetryTokens = (capacityReleaseAmount) => {
			availableCapacity += capacityReleaseAmount ?? noRetryIncrement;
			availableCapacity = Math.min(availableCapacity, MAX_CAPACITY);
		};
		return Object.freeze({
			hasRetryTokens,
			retrieveRetryTokens,
			releaseRetryTokens
		});
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/middleware-retry/retry-pre-sra-deprecated/delayDecider.js
var defaultDelayDecider;
var init_delayDecider = __esmMin((() => {
	init_constants$3();
	defaultDelayDecider = (delayBase, attempts) => Math.floor(Math.min(MAXIMUM_RETRY_DELAY, Math.random() * 2 ** attempts * delayBase));
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/middleware-retry/retry-pre-sra-deprecated/retryDecider.js
var defaultRetryDecider;
var init_retryDecider = __esmMin((() => {
	init_service_error_classification();
	defaultRetryDecider = (error) => {
		if (!error) return false;
		return isRetryableByTrait(error) || isClockSkewError(error) || isThrottlingError(error) || isTransientError(error);
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/middleware-retry/retry-pre-sra-deprecated/StandardRetryStrategy.js
var StandardRetryStrategy, getDelayFromRetryAfterHeader;
var init_StandardRetryStrategy = __esmMin((() => {
	init_protocols$1();
	init_serde();
	init_service_error_classification();
	init_config();
	init_constants$3();
	init_util$1();
	init_defaultRetryQuota();
	init_delayDecider();
	init_retryDecider();
	StandardRetryStrategy = class {
		maxAttemptsProvider;
		retryDecider;
		delayDecider;
		retryQuota;
		mode = RETRY_MODES.STANDARD;
		constructor(maxAttemptsProvider, options) {
			this.maxAttemptsProvider = maxAttemptsProvider;
			this.retryDecider = options?.retryDecider ?? defaultRetryDecider;
			this.delayDecider = options?.delayDecider ?? defaultDelayDecider;
			this.retryQuota = options?.retryQuota ?? getDefaultRetryQuota(500);
		}
		shouldRetry(error, attempts, maxAttempts) {
			return attempts < maxAttempts && this.retryDecider(error) && this.retryQuota.hasRetryTokens(error);
		}
		async getMaxAttempts() {
			let maxAttempts;
			try {
				maxAttempts = await this.maxAttemptsProvider();
			} catch (ignored) {
				maxAttempts = 3;
			}
			return maxAttempts;
		}
		async retry(next, args, options) {
			let retryTokenAmount;
			let attempts = 0;
			let totalDelay = 0;
			const maxAttempts = await this.getMaxAttempts();
			const { request } = args;
			if (HttpRequest.isInstance(request)) request.headers[INVOCATION_ID_HEADER] = v4();
			while (true) try {
				if (HttpRequest.isInstance(request)) request.headers[REQUEST_HEADER] = `attempt=${attempts + 1}; max=${maxAttempts}`;
				if (options?.beforeRequest) await options.beforeRequest();
				const { response, output } = await next(args);
				if (options?.afterRequest) options.afterRequest(response);
				this.retryQuota.releaseRetryTokens(retryTokenAmount);
				output.$metadata.attempts = attempts + 1;
				output.$metadata.totalRetryDelay = totalDelay;
				return {
					response,
					output
				};
			} catch (e) {
				const err = asSdkError(e);
				attempts++;
				if (this.shouldRetry(err, attempts, maxAttempts)) {
					retryTokenAmount = this.retryQuota.retrieveRetryTokens(err);
					const delayFromDecider = this.delayDecider(isThrottlingError(err) ? 500 : 100, attempts);
					const delayFromResponse = getDelayFromRetryAfterHeader(err.$response);
					const delay = Math.max(delayFromResponse || 0, delayFromDecider);
					totalDelay += delay;
					await new Promise((resolve) => setTimeout(resolve, delay));
					continue;
				}
				if (!err.$metadata) err.$metadata = {};
				err.$metadata.attempts = attempts;
				err.$metadata.totalRetryDelay = totalDelay;
				throw err;
			}
		}
	};
	getDelayFromRetryAfterHeader = (response) => {
		if (!HttpResponse.isInstance(response)) return;
		const retryAfterHeaderName = Object.keys(response.headers).find((key) => key.toLowerCase() === "retry-after");
		if (!retryAfterHeaderName) return;
		const retryAfter = response.headers[retryAfterHeaderName];
		const retryAfterSeconds = Number(retryAfter);
		if (!Number.isNaN(retryAfterSeconds)) return Math.min(retryAfterSeconds * 1e3, 2e4);
		const retryAfterDate = new Date(retryAfter);
		return Math.min(retryAfterDate.getTime() - Date.now(), 2e4);
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/middleware-retry/retry-pre-sra-deprecated/AdaptiveRetryStrategy.js
var AdaptiveRetryStrategy;
var init_AdaptiveRetryStrategy = __esmMin((() => {
	init_DefaultRateLimiter();
	init_config();
	init_StandardRetryStrategy();
	AdaptiveRetryStrategy = class extends StandardRetryStrategy {
		rateLimiter;
		constructor(maxAttemptsProvider, options) {
			const { rateLimiter, ...superOptions } = options ?? {};
			super(maxAttemptsProvider, superOptions);
			this.rateLimiter = rateLimiter ?? new DefaultRateLimiter();
			this.mode = RETRY_MODES.ADAPTIVE;
		}
		async retry(next, args) {
			return super.retry(next, args, {
				beforeRequest: async () => {
					return this.rateLimiter.getSendToken();
				},
				afterRequest: (response) => {
					this.rateLimiter.updateClientSendingRate(response);
				}
			});
		}
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/middleware-retry/configurations.js
var ENV_MAX_ATTEMPTS, CONFIG_MAX_ATTEMPTS, NODE_MAX_ATTEMPT_CONFIG_OPTIONS, resolveRetryConfig, ENV_RETRY_MODE, CONFIG_RETRY_MODE, NODE_RETRY_MODE_CONFIG_OPTIONS;
var init_configurations$1 = __esmMin((() => {
	init_client$1();
	init_AdaptiveRetryStrategy$1();
	init_StandardRetryStrategy$1();
	init_config();
	init_retries_2026_config();
	ENV_MAX_ATTEMPTS = "AWS_MAX_ATTEMPTS";
	CONFIG_MAX_ATTEMPTS = "max_attempts";
	NODE_MAX_ATTEMPT_CONFIG_OPTIONS = {
		environmentVariableSelector: (env) => {
			const value = env[ENV_MAX_ATTEMPTS];
			if (!value) return;
			const maxAttempt = parseInt(value);
			if (Number.isNaN(maxAttempt)) throw new Error(`Environment variable ${ENV_MAX_ATTEMPTS} mast be a number, got "${value}"`);
			return maxAttempt;
		},
		configFileSelector: (profile) => {
			const value = profile[CONFIG_MAX_ATTEMPTS];
			if (!value) return;
			const maxAttempt = parseInt(value);
			if (Number.isNaN(maxAttempt)) throw new Error(`Shared config file entry ${CONFIG_MAX_ATTEMPTS} mast be a number, got "${value}"`);
			return maxAttempt;
		},
		default: 3
	};
	resolveRetryConfig = (input, defaults) => {
		const { retryStrategy, retryMode } = input;
		const { defaultMaxAttempts = 3, defaultBaseDelay = Retry.delay() } = defaults ?? {};
		const maxAttemptsProvider = normalizeProvider$1(input.maxAttempts ?? defaultMaxAttempts);
		let controller = retryStrategy ? Promise.resolve(retryStrategy) : void 0;
		const getDefault = async () => {
			const maxAttempts = await maxAttemptsProvider();
			if (await normalizeProvider$1(retryMode)() === RETRY_MODES.ADAPTIVE) return new AdaptiveRetryStrategy$1(maxAttemptsProvider, {
				maxAttempts,
				baseDelay: defaultBaseDelay
			});
			return new StandardRetryStrategy$1({
				maxAttempts,
				baseDelay: defaultBaseDelay
			});
		};
		return Object.assign(input, {
			maxAttempts: maxAttemptsProvider,
			retryStrategy: () => controller ??= getDefault()
		});
	};
	ENV_RETRY_MODE = "AWS_RETRY_MODE";
	CONFIG_RETRY_MODE = "retry_mode";
	NODE_RETRY_MODE_CONFIG_OPTIONS = {
		environmentVariableSelector: (env) => env[ENV_RETRY_MODE],
		configFileSelector: (profile) => profile[CONFIG_RETRY_MODE],
		default: DEFAULT_RETRY_MODE
	};
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/middleware-retry/omitRetryHeadersMiddleware.js
var omitRetryHeadersMiddleware, omitRetryHeadersMiddlewareOptions, getOmitRetryHeadersPlugin;
var init_omitRetryHeadersMiddleware = __esmMin((() => {
	init_protocols$1();
	init_constants$3();
	omitRetryHeadersMiddleware = () => (next) => async (args) => {
		const { request } = args;
		if (HttpRequest.isInstance(request)) {
			delete request.headers[INVOCATION_ID_HEADER];
			delete request.headers[REQUEST_HEADER];
		}
		return next(args);
	};
	omitRetryHeadersMiddlewareOptions = {
		name: "omitRetryHeadersMiddleware",
		tags: [
			"RETRY",
			"HEADERS",
			"OMIT_RETRY_HEADERS"
		],
		relation: "before",
		toMiddleware: "awsAuthMiddleware",
		override: true
	};
	getOmitRetryHeadersPlugin = (options) => ({ applyToStack: (clientStack) => {
		clientStack.addRelativeTo(omitRetryHeadersMiddleware(), omitRetryHeadersMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@smithy/core/dist-es/submodules/retry/index.js
var retry_exports = /* @__PURE__ */ __exportAll({
	AdaptiveRetryStrategy: () => AdaptiveRetryStrategy$1,
	CONFIG_MAX_ATTEMPTS: () => CONFIG_MAX_ATTEMPTS,
	CONFIG_RETRY_MODE: () => CONFIG_RETRY_MODE,
	ConfiguredRetryStrategy: () => ConfiguredRetryStrategy,
	DEFAULT_MAX_ATTEMPTS: () => 3,
	DEFAULT_RETRY_DELAY_BASE: () => 100,
	DEFAULT_RETRY_MODE: () => DEFAULT_RETRY_MODE,
	DefaultRateLimiter: () => DefaultRateLimiter,
	DeprecatedAdaptiveRetryStrategy: () => AdaptiveRetryStrategy,
	DeprecatedStandardRetryStrategy: () => StandardRetryStrategy,
	ENV_MAX_ATTEMPTS: () => ENV_MAX_ATTEMPTS,
	ENV_RETRY_MODE: () => ENV_RETRY_MODE,
	INITIAL_RETRY_TOKENS: () => 500,
	INVOCATION_ID_HEADER: () => INVOCATION_ID_HEADER,
	MAXIMUM_RETRY_DELAY: () => MAXIMUM_RETRY_DELAY,
	NODE_MAX_ATTEMPT_CONFIG_OPTIONS: () => NODE_MAX_ATTEMPT_CONFIG_OPTIONS,
	NODE_RETRY_MODE_CONFIG_OPTIONS: () => NODE_RETRY_MODE_CONFIG_OPTIONS,
	NO_RETRY_INCREMENT: () => 1,
	REQUEST_HEADER: () => REQUEST_HEADER,
	RETRY_COST: () => 5,
	RETRY_MODES: () => RETRY_MODES,
	Retry: () => Retry,
	StandardRetryStrategy: () => StandardRetryStrategy$1,
	THROTTLING_RETRY_DELAY_BASE: () => 500,
	TIMEOUT_RETRY_COST: () => 10,
	defaultDelayDecider: () => defaultDelayDecider,
	defaultRetryDecider: () => defaultRetryDecider,
	getOmitRetryHeadersPlugin: () => getOmitRetryHeadersPlugin,
	getRetryAfterHint: () => getRetryAfterHint,
	getRetryPlugin: () => getRetryPlugin,
	isBrowserNetworkError: () => isBrowserNetworkError,
	isClockSkewCorrectedError: () => isClockSkewCorrectedError,
	isClockSkewError: () => isClockSkewError,
	isNodeJsHttp2TransientError: () => isNodeJsHttp2TransientError,
	isRetryableByTrait: () => isRetryableByTrait,
	isServerError: () => isServerError,
	isThrottlingError: () => isThrottlingError,
	isTransientError: () => isTransientError,
	omitRetryHeadersMiddleware: () => omitRetryHeadersMiddleware,
	omitRetryHeadersMiddlewareOptions: () => omitRetryHeadersMiddlewareOptions,
	resolveRetryConfig: () => resolveRetryConfig,
	retryMiddleware: () => retryMiddleware,
	retryMiddlewareOptions: () => retryMiddlewareOptions
});
var retryMiddleware, getRetryPlugin;
var init_retry = __esmMin((() => {
	init_isStreamingPayload();
	init_retryMiddleware();
	init_service_error_classification();
	init_AdaptiveRetryStrategy$1();
	init_ConfiguredRetryStrategy();
	init_DefaultRateLimiter();
	init_StandardRetryStrategy$1();
	init_config();
	init_constants$3();
	init_retries_2026_config();
	init_AdaptiveRetryStrategy();
	init_StandardRetryStrategy();
	init_delayDecider();
	init_retryDecider();
	init_configurations$1();
	init_omitRetryHeadersMiddleware();
	init_parseRetryAfterHeader();
	retryMiddleware = bindRetryMiddleware(isStreamingPayload);
	getRetryPlugin = bindGetRetryPlugin(isStreamingPayload);
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/middleware-user-agent/check-features.js
async function checkFeatures(context, config, args) {
	if (args.request?.headers?.["smithy-protocol"] === "rpc-v2-cbor") setFeature$1(context, "PROTOCOL_RPC_V2_CBOR", "M");
	if (typeof config.retryStrategy === "function") {
		const retryStrategy = await config.retryStrategy();
		if (typeof retryStrategy.mode === "string") switch (retryStrategy.mode) {
			case RETRY_MODES.ADAPTIVE:
				setFeature$1(context, "RETRY_MODE_ADAPTIVE", "F");
				break;
			case RETRY_MODES.STANDARD:
				setFeature$1(context, "RETRY_MODE_STANDARD", "E");
				break;
		}
	}
	if (typeof config.accountIdEndpointMode === "function") {
		const endpointV2 = context.endpointV2;
		if (String(endpointV2?.url?.hostname).match(ACCOUNT_ID_ENDPOINT_REGEX)) setFeature$1(context, "ACCOUNT_ID_ENDPOINT", "O");
		switch (await config.accountIdEndpointMode?.()) {
			case "disabled":
				setFeature$1(context, "ACCOUNT_ID_MODE_DISABLED", "Q");
				break;
			case "preferred":
				setFeature$1(context, "ACCOUNT_ID_MODE_PREFERRED", "P");
				break;
			case "required":
				setFeature$1(context, "ACCOUNT_ID_MODE_REQUIRED", "R");
				break;
		}
	}
	const identity = context.__smithy_context?.selectedHttpAuthScheme?.identity;
	if (identity?.$source) {
		const credentials = identity;
		if (credentials.accountId) setFeature$1(context, "RESOLVED_ACCOUNT_ID", "T");
		for (const [key, value] of Object.entries(credentials.$source ?? {})) setFeature$1(context, key, value);
	}
}
var ACCOUNT_ID_ENDPOINT_REGEX;
var init_check_features = __esmMin((() => {
	init_retry();
	init_setFeature$1();
	ACCOUNT_ID_ENDPOINT_REGEX = /\d{12}\.ddb/;
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/middleware-user-agent/constants.js
var USER_AGENT, X_AMZ_USER_AGENT, UA_NAME_ESCAPE_REGEX, UA_VALUE_ESCAPE_REGEX;
var init_constants$2 = __esmMin((() => {
	USER_AGENT = "user-agent";
	X_AMZ_USER_AGENT = "x-amz-user-agent";
	UA_NAME_ESCAPE_REGEX = /[^!$%&'*+\-.^_`|~\w]/g;
	UA_VALUE_ESCAPE_REGEX = /[^!$%&'*+\-.^_`|~\w#]/g;
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/middleware-user-agent/encode-features.js
function encodeFeatures(features) {
	let buffer = "";
	for (const key in features) {
		const val = features[key];
		if (buffer.length + val.length + 1 <= BYTE_LIMIT) {
			if (buffer.length) buffer += "," + val;
			else buffer += val;
			continue;
		}
		break;
	}
	return buffer;
}
var BYTE_LIMIT;
var init_encode_features = __esmMin((() => {
	BYTE_LIMIT = 1024;
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/middleware-user-agent/user-agent-middleware.js
var userAgentMiddleware, escapeUserAgent, getUserAgentMiddlewareOptions, getUserAgentPlugin;
var init_user_agent_middleware = __esmMin((() => {
	init_protocols$1();
	init_partition();
	init_check_features();
	init_constants$2();
	init_encode_features();
	userAgentMiddleware = (options) => (next, context) => async (args) => {
		const { request } = args;
		if (!HttpRequest.isInstance(request)) return next(args);
		const { headers } = request;
		const userAgent = context?.userAgent?.map(escapeUserAgent) || [];
		const defaultUserAgent = (await options.defaultUserAgentProvider()).map(escapeUserAgent);
		await checkFeatures(context, options, args);
		const awsContext = context;
		defaultUserAgent.push(`m/${encodeFeatures(Object.assign({}, context.__smithy_context?.features, awsContext.__aws_sdk_context?.features))}`);
		const customUserAgent = options?.customUserAgent?.map(escapeUserAgent) || [];
		const appId = await options.userAgentAppId();
		if (appId) defaultUserAgent.push(escapeUserAgent([`app`, `${appId}`]));
		const prefix = getUserAgentPrefix();
		const sdkUserAgentValue = (prefix ? [prefix] : []).concat([
			...defaultUserAgent,
			...userAgent,
			...customUserAgent
		]).join(" ");
		const normalUAValue = [...defaultUserAgent.filter((section) => section.startsWith("aws-sdk-")), ...customUserAgent].join(" ");
		if (options.runtime !== "browser") {
			if (normalUAValue) headers[X_AMZ_USER_AGENT] = headers["x-amz-user-agent"] ? `${headers[USER_AGENT]} ${normalUAValue}` : normalUAValue;
			headers[USER_AGENT] = sdkUserAgentValue;
		} else headers[X_AMZ_USER_AGENT] = sdkUserAgentValue;
		return next({
			...args,
			request
		});
	};
	escapeUserAgent = (userAgentPair) => {
		const name = userAgentPair[0].split("/").map((part) => part.replace(UA_NAME_ESCAPE_REGEX, "-")).join("/");
		const version = userAgentPair[1]?.replace(UA_VALUE_ESCAPE_REGEX, "-");
		const prefixSeparatorIndex = name.indexOf("/");
		const prefix = name.substring(0, prefixSeparatorIndex);
		let uaName = name.substring(prefixSeparatorIndex + 1);
		if (prefix === "api") uaName = uaName.toLowerCase();
		return [
			prefix,
			uaName,
			version
		].filter((item) => item && item.length > 0).reduce((acc, item, index) => {
			switch (index) {
				case 0: return item;
				case 1: return `${acc}/${item}`;
				default: return `${acc}#${item}`;
			}
		}, "");
	};
	getUserAgentMiddlewareOptions = {
		name: "getUserAgentMiddleware",
		step: "build",
		priority: "low",
		tags: ["SET_USER_AGENT", "USER_AGENT"],
		override: true
	};
	getUserAgentPlugin = (config) => ({ applyToStack: (clientStack) => {
		clientStack.add(userAgentMiddleware(config), getUserAgentMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/util-user-agent-node/getRuntimeUserAgentPair.js
var getRuntimeUserAgentPair;
var init_getRuntimeUserAgentPair = __esmMin((() => {
	getRuntimeUserAgentPair = () => {
		for (const runtime of [
			"deno",
			"bun",
			"llrt"
		]) if (versions[runtime]) return [`md/${runtime}`, versions[runtime]];
		return ["md/nodejs", versions.node];
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/util-user-agent-node/crt-availability.js
var crtAvailability;
var init_crt_availability = __esmMin((() => {
	crtAvailability = { isCrtAvailable: false };
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/util-user-agent-node/is-crt-available.js
var isCrtAvailable;
var init_is_crt_available = __esmMin((() => {
	init_crt_availability();
	isCrtAvailable = () => {
		if (crtAvailability.isCrtAvailable) return ["md/crt-avail"];
		return null;
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/util-user-agent-node/defaultUserAgent.js
var createDefaultUserAgentProvider, defaultUserAgent;
var init_defaultUserAgent$1 = __esmMin((() => {
	init_getRuntimeUserAgentPair();
	init_is_crt_available();
	init_crt_availability();
	createDefaultUserAgentProvider = ({ serviceId, clientVersion }) => {
		const runtimeUserAgentPair = getRuntimeUserAgentPair();
		return async (config) => {
			const sections = [
				["aws-sdk-js", clientVersion],
				["ua", "2.1"],
				[`os/${platform()}`, release()],
				["lang/js"],
				runtimeUserAgentPair
			];
			const crtAvailable = isCrtAvailable();
			if (crtAvailable) sections.push(crtAvailable);
			if (serviceId) sections.push([`api/${serviceId}`, clientVersion]);
			if (env.AWS_EXECUTION_ENV) sections.push([`exec-env/${env.AWS_EXECUTION_ENV}`]);
			const appId = await config?.userAgentAppId?.();
			return appId ? [...sections, [`app/${appId}`]] : [...sections];
		};
	};
	defaultUserAgent = createDefaultUserAgentProvider;
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/util-user-agent-node/nodeAppIdConfigOptions.js
var UA_APP_ID_ENV_NAME, UA_APP_ID_INI_NAME, UA_APP_ID_INI_NAME_DEPRECATED, NODE_APP_ID_CONFIG_OPTIONS;
var init_nodeAppIdConfigOptions = __esmMin((() => {
	init_configurations$2();
	UA_APP_ID_ENV_NAME = "AWS_SDK_UA_APP_ID";
	UA_APP_ID_INI_NAME = "sdk_ua_app_id";
	UA_APP_ID_INI_NAME_DEPRECATED = "sdk-ua-app-id";
	NODE_APP_ID_CONFIG_OPTIONS = {
		environmentVariableSelector: (env) => env[UA_APP_ID_ENV_NAME],
		configFileSelector: (profile) => profile["sdk_ua_app_id"] ?? profile[UA_APP_ID_INI_NAME_DEPRECATED],
		default: void 0
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/util-user-agent-browser/createUserAgentStringParsingProvider.js
var createUserAgentStringParsingProvider;
var init_createUserAgentStringParsingProvider = __esmMin((() => {
	createUserAgentStringParsingProvider = ({ serviceId, clientVersion }) => async (config) => {
		const module = await import("./bowser-B9s_0EVI.js");
		const parse = module.parse ?? module.default.parse ?? (() => "");
		const parsedUA = typeof window !== "undefined" && window?.navigator?.userAgent ? parse(window.navigator.userAgent) : void 0;
		const sections = [
			["aws-sdk-js", clientVersion],
			["ua", "2.1"],
			[`os/${parsedUA?.os?.name || "other"}`, parsedUA?.os?.version],
			["lang/js"],
			["md/browser", `${parsedUA?.browser?.name ?? "unknown"}_${parsedUA?.browser?.version ?? "unknown"}`]
		];
		if (serviceId) sections.push([`api/${serviceId}`, clientVersion]);
		const appId = await config?.userAgentAppId?.();
		if (appId) sections.push([`app/${appId}`]);
		return sections;
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/util-user-agent-browser/defaultUserAgent.js
var fallback;
var init_defaultUserAgent = __esmMin((() => {
	fallback = {
		os(ua) {
			if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
			if (/Macintosh|Mac OS X/.test(ua)) return "macOS";
			if (/Windows NT/.test(ua)) return "Windows";
			if (/Android/.test(ua)) return "Android";
			if (/Linux/.test(ua)) return "Linux";
		},
		browser(ua) {
			if (/EdgiOS|EdgA|Edg\//.test(ua)) return "Microsoft Edge";
			if (/Firefox\//.test(ua)) return "Firefox";
			if (/Chrome\//.test(ua)) return "Chrome";
			if (/Safari\//.test(ua)) return "Safari";
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/util-endpoints/lib/isIpAddress.js
var init_isIpAddress = __esmMin((() => {
	init_endpoints();
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/util-endpoints/lib/aws/isVirtualHostableS3Bucket.js
var isVirtualHostableS3Bucket;
var init_isVirtualHostableS3Bucket = __esmMin((() => {
	init_endpoints();
	init_isIpAddress();
	isVirtualHostableS3Bucket = (value, allowSubDomains = false) => {
		if (allowSubDomains) {
			for (const label of value.split(".")) if (!isVirtualHostableS3Bucket(label)) return false;
			return true;
		}
		if (!isValidHostLabel(value)) return false;
		if (value.length < 3 || value.length > 63) return false;
		if (value !== value.toLowerCase()) return false;
		if (isIpAddress(value)) return false;
		return true;
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/util-endpoints/lib/aws/parseArn.js
var ARN_DELIMITER, RESOURCE_DELIMITER, parseArn;
var init_parseArn = __esmMin((() => {
	ARN_DELIMITER = ":";
	RESOURCE_DELIMITER = "/";
	parseArn = (value) => {
		const segments = value.split(ARN_DELIMITER);
		if (segments.length < 6) return null;
		const [arn, partition, service, region, accountId, ...resourcePath] = segments;
		if (arn !== "arn" || partition === "" || service === "" || resourcePath.join(ARN_DELIMITER) === "") return null;
		return {
			partition,
			service,
			region,
			accountId,
			resourceId: resourcePath.map((resource) => resource.split(RESOURCE_DELIMITER)).flat()
		};
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/util-endpoints/aws.js
var awsEndpointFunctions;
var init_aws = __esmMin((() => {
	init_endpoints();
	init_isVirtualHostableS3Bucket();
	init_parseArn();
	init_partition();
	awsEndpointFunctions = {
		isVirtualHostableS3Bucket,
		parseArn,
		partition
	};
	customEndpointFunctions.aws = awsEndpointFunctions;
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/util-endpoints/resolveEndpoint.js
var init_resolveEndpoint = __esmMin((() => {
	init_endpoints();
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/util-endpoints/resolveDefaultAwsRegionalEndpointsConfig.js
var resolveDefaultAwsRegionalEndpointsConfig, toEndpointV1;
var init_resolveDefaultAwsRegionalEndpointsConfig = __esmMin((() => {
	init_protocols$1();
	resolveDefaultAwsRegionalEndpointsConfig = (input) => {
		if (typeof input.endpointProvider !== "function") throw new Error("@aws-sdk/util-endpoint - endpointProvider and endpoint missing in config for this client.");
		const { endpoint } = input;
		if (endpoint === void 0) input.endpoint = async () => {
			return toEndpointV1(input.endpointProvider({
				Region: typeof input.region === "function" ? await input.region() : input.region,
				UseDualStack: typeof input.useDualstackEndpoint === "function" ? await input.useDualstackEndpoint() : input.useDualstackEndpoint,
				UseFIPS: typeof input.useFipsEndpoint === "function" ? await input.useFipsEndpoint() : input.useFipsEndpoint,
				Endpoint: void 0
			}, { logger: input.logger }));
		};
		return input;
	};
	toEndpointV1 = (endpoint) => parseUrl(endpoint.url);
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/util-endpoints/types/EndpointError.js
var init_EndpointError = __esmMin((() => {
	init_endpoints();
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/region-config-resolver/awsRegionConfig.js
var init_awsRegionConfig = __esmMin((() => {
	init_config$1();
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/region-config-resolver/stsRegionDefaultResolver.js
function stsRegionDefaultResolver(loaderConfig = {}) {
	return loadConfig({
		...NODE_REGION_CONFIG_OPTIONS,
		async default() {
			if (!warning.silence) console.warn("@aws-sdk - WARN - default STS region of us-east-1 used. See @aws-sdk/credential-providers README and set a region explicitly.");
			return "us-east-1";
		}
	}, {
		...NODE_REGION_CONFIG_FILE_OPTIONS,
		...loaderConfig
	});
}
var warning;
var init_stsRegionDefaultResolver = __esmMin((() => {
	init_config$1();
	warning = { silence: false };
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/region-config-resolver/extensions.js
var getAwsRegionExtensionConfiguration, resolveAwsRegionExtensionConfiguration;
var init_extensions = __esmMin((() => {
	getAwsRegionExtensionConfiguration = (runtimeConfig) => {
		return {
			setRegion(region) {
				runtimeConfig.region = region;
			},
			region() {
				return runtimeConfig.region;
			}
		};
	};
	resolveAwsRegionExtensionConfiguration = (awsRegionExtensionConfiguration) => {
		return { region: awsRegionExtensionConfiguration.region() };
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/client/index.js
var client_exports = /* @__PURE__ */ __exportAll({
	DEFAULT_UA_APP_ID: () => void 0,
	EndpointError: () => EndpointError,
	NODE_APP_ID_CONFIG_OPTIONS: () => NODE_APP_ID_CONFIG_OPTIONS,
	NODE_REGION_CONFIG_FILE_OPTIONS: () => NODE_REGION_CONFIG_FILE_OPTIONS,
	NODE_REGION_CONFIG_OPTIONS: () => NODE_REGION_CONFIG_OPTIONS,
	REGION_ENV_NAME: () => REGION_ENV_NAME,
	REGION_INI_NAME: () => REGION_INI_NAME,
	UA_APP_ID_ENV_NAME: () => UA_APP_ID_ENV_NAME,
	UA_APP_ID_INI_NAME: () => UA_APP_ID_INI_NAME,
	awsEndpointFunctions: () => awsEndpointFunctions,
	createDefaultUserAgentProvider: () => createDefaultUserAgentProvider,
	createUserAgentStringParsingProvider: () => createUserAgentStringParsingProvider,
	crtAvailability: () => crtAvailability,
	defaultUserAgent: () => defaultUserAgent,
	emitWarningIfUnsupportedVersion: () => emitWarningIfUnsupportedVersion,
	fallback: () => fallback,
	getAwsRegionExtensionConfiguration: () => getAwsRegionExtensionConfiguration,
	getDefaultSocketTimeout: () => getDefaultSocketTimeout,
	getHostHeaderPlugin: () => getHostHeaderPlugin,
	getLoggerPlugin: () => getLoggerPlugin,
	getLongPollPlugin: () => getLongPollPlugin,
	getRecursionDetectionPlugin: () => getRecursionDetectionPlugin,
	getUserAgentMiddlewareOptions: () => getUserAgentMiddlewareOptions,
	getUserAgentPlugin: () => getUserAgentPlugin,
	getUserAgentPrefix: () => getUserAgentPrefix,
	hostHeaderMiddleware: () => hostHeaderMiddleware,
	hostHeaderMiddlewareOptions: () => hostHeaderMiddlewareOptions,
	isIpAddress: () => isIpAddress,
	isVirtualHostableS3Bucket: () => isVirtualHostableS3Bucket,
	loggerMiddleware: () => loggerMiddleware,
	loggerMiddlewareOptions: () => loggerMiddlewareOptions,
	parseArn: () => parseArn,
	partition: () => partition,
	recursionDetectionMiddleware: () => recursionDetectionMiddleware,
	recursionDetectionMiddlewareOptions: () => recursionDetectionMiddlewareOptions,
	resolveAwsRegionExtensionConfiguration: () => resolveAwsRegionExtensionConfiguration,
	resolveDefaultAwsRegionalEndpointsConfig: () => resolveDefaultAwsRegionalEndpointsConfig,
	resolveEndpoint: () => resolveEndpoint,
	resolveHostHeaderConfig: () => resolveHostHeaderConfig,
	resolveRegionConfig: () => resolveRegionConfig,
	resolveUserAgentConfig: () => resolveUserAgentConfig,
	setCredentialFeature: () => setCredentialFeature,
	setFeature: () => setFeature$1,
	setPartitionInfo: () => setPartitionInfo,
	setTokenFeature: () => setTokenFeature,
	state: () => state,
	stsRegionDefaultResolver: () => stsRegionDefaultResolver,
	stsRegionWarning: () => warning,
	toEndpointV1: () => toEndpointV1,
	useDefaultPartitionInfo: () => useDefaultPartitionInfo,
	userAgentMiddleware: () => userAgentMiddleware
});
var init_client = __esmMin((() => {
	init_emitWarningIfUnsupportedVersion();
	init_longPollMiddleware();
	init_setCredentialFeature();
	init_setFeature$1();
	init_setTokenFeature();
	init_getDefaultSocketTimeout();
	init_hostHeaderMiddleware();
	init_loggerMiddleware();
	init_configuration$1();
	init_getRecursionDetectionPlugin();
	init_recursionDetectionMiddleware();
	init_configurations$2();
	init_user_agent_middleware();
	init_defaultUserAgent$1();
	init_nodeAppIdConfigOptions();
	init_defaultUserAgent();
	init_createUserAgentStringParsingProvider();
	init_aws();
	init_resolveEndpoint();
	init_resolveDefaultAwsRegionalEndpointsConfig();
	init_isIpAddress();
	init_isVirtualHostableS3Bucket();
	init_parseArn();
	init_partition();
	init_EndpointError();
	init_awsRegionConfig();
	init_stsRegionDefaultResolver();
	init_extensions();
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-region-redirect/region-redirect-middleware.js
function regionRedirectMiddleware(clientConfig) {
	return (next, context) => async (args) => {
		try {
			return await next(args);
		} catch (err) {
			if (clientConfig.followRegionRedirects) {
				const statusCode = err?.$metadata?.httpStatusCode;
				const isHeadBucket = context.commandName === "HeadBucketCommand";
				const bucketRegionHeader = err?.$response?.headers?.["x-amz-bucket-region"];
				if (bucketRegionHeader) {
					if (statusCode === 301 || statusCode === 400 && (err?.name === "IllegalLocationConstraintException" || isHeadBucket)) {
						try {
							const actualRegion = bucketRegionHeader;
							context.logger?.debug(`Redirecting from ${await clientConfig.region()} to ${actualRegion}`);
							context.__s3RegionRedirect = actualRegion;
							setFeature$1(context, "S3_REGION_REDIRECT", "Ah");
						} catch (e) {
							throw new Error("Region redirect failed: " + e);
						}
						return next(args);
					}
				}
			}
			throw err;
		}
	};
}
var regionRedirectMiddlewareOptions, getRegionRedirectMiddlewarePlugin;
var init_region_redirect_middleware = __esmMin((() => {
	init_client();
	init_region_redirect_endpoint_middleware();
	regionRedirectMiddlewareOptions = {
		step: "initialize",
		tags: ["REGION_REDIRECT", "S3"],
		name: "regionRedirectMiddleware",
		override: true
	};
	getRegionRedirectMiddlewarePlugin = (clientConfig) => ({ applyToStack: (clientStack) => {
		clientStack.add(regionRedirectMiddleware(clientConfig), regionRedirectMiddlewareOptions);
		clientStack.addRelativeTo(regionRedirectEndpointMiddleware(clientConfig), regionRedirectEndpointMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-s3-express/classes/S3ExpressIdentityCache.js
var S3ExpressIdentityCache;
var init_S3ExpressIdentityCache = __esmMin((() => {
	S3ExpressIdentityCache = class S3ExpressIdentityCache {
		data;
		lastPurgeTime = Date.now();
		static EXPIRED_CREDENTIAL_PURGE_INTERVAL_MS = 3e4;
		constructor(data = {}) {
			this.data = data;
		}
		get(key) {
			const entry = this.data[key];
			if (!entry) return;
			return entry;
		}
		set(key, entry) {
			this.data[key] = entry;
			return entry;
		}
		delete(key) {
			delete this.data[key];
		}
		clear() {
			this.data = {};
		}
		async purgeExpired() {
			const now = Date.now();
			if (this.lastPurgeTime + S3ExpressIdentityCache.EXPIRED_CREDENTIAL_PURGE_INTERVAL_MS > now) return;
			const data = this.data;
			for (const key in data) {
				const entry = data[key];
				if (!entry.isRefreshing) {
					const credential = await entry.identity;
					if (credential.expiration) {
						if (credential.expiration.getTime() < now && data[key] === entry) delete data[key];
					}
				}
			}
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-s3-express/classes/S3ExpressIdentityCacheEntry.js
var S3ExpressIdentityCacheEntry;
var init_S3ExpressIdentityCacheEntry = __esmMin((() => {
	S3ExpressIdentityCacheEntry = class {
		_identity;
		isRefreshing;
		accessed;
		constructor(_identity, isRefreshing = false, accessed = Date.now()) {
			this._identity = _identity;
			this.isRefreshing = isRefreshing;
			this.accessed = accessed;
		}
		get identity() {
			this.accessed = Date.now();
			return this._identity;
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-s3-express/classes/S3ExpressIdentityProviderImpl.js
var S3ExpressIdentityProviderImpl;
var init_S3ExpressIdentityProviderImpl = __esmMin((() => {
	init_S3ExpressIdentityCache();
	init_S3ExpressIdentityCacheEntry();
	S3ExpressIdentityProviderImpl = class S3ExpressIdentityProviderImpl {
		createSessionFn;
		cache;
		static REFRESH_WINDOW_MS = 6e4;
		accessKeyId;
		cacheGeneration = 0;
		constructor(createSessionFn, cache = new S3ExpressIdentityCache()) {
			this.createSessionFn = createSessionFn;
			this.cache = cache;
		}
		async getS3ExpressIdentity(awsIdentity, identityProperties) {
			const bucket = identityProperties.Bucket;
			const { cache } = this;
			if (awsIdentity.accessKeyId !== this.accessKeyId) {
				this.accessKeyId = awsIdentity.accessKeyId;
				this.cacheGeneration++;
				cache.clear();
			}
			const cacheGeneration = this.cacheGeneration;
			const entry = cache.get(bucket);
			if (entry) return entry.identity.then((identity) => {
				if ((identity.expiration?.getTime() ?? 0) < Date.now()) return cache.set(bucket, new S3ExpressIdentityCacheEntry(this.getIdentity(bucket))).identity;
				if ((identity.expiration?.getTime() ?? 0) < Date.now() + S3ExpressIdentityProviderImpl.REFRESH_WINDOW_MS && !entry.isRefreshing) {
					entry.isRefreshing = true;
					this.getIdentity(bucket).then((id) => {
						if (cacheGeneration === this.cacheGeneration) cache.set(bucket, new S3ExpressIdentityCacheEntry(Promise.resolve(id)));
					});
				}
				return identity;
			});
			return cache.set(bucket, new S3ExpressIdentityCacheEntry(this.getIdentity(bucket))).identity;
		}
		async getIdentity(bucket) {
			await this.cache.purgeExpired().catch((error) => {
				console.warn("Error while clearing expired entries in S3ExpressIdentityCache: \n" + error);
			});
			const session = await this.createSessionFn(bucket);
			if (!session.Credentials?.AccessKeyId || !session.Credentials?.SecretAccessKey) throw new Error("s3#createSession response credential missing AccessKeyId or SecretAccessKey.");
			return {
				accessKeyId: session.Credentials.AccessKeyId,
				secretAccessKey: session.Credentials.SecretAccessKey,
				sessionToken: session.Credentials.SessionToken,
				expiration: session.Credentials.Expiration ? new Date(session.Credentials.Expiration) : void 0
			};
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-s3-configuration/s3Configuration.js
var resolveS3Config;
var init_s3Configuration = __esmMin((() => {
	init_S3ExpressIdentityProviderImpl();
	resolveS3Config = (input, { session }) => {
		const [s3ClientProvider, CreateSessionCommandCtor] = session;
		const { forcePathStyle, useAccelerateEndpoint, disableMultiregionAccessPoints, followRegionRedirects, s3ExpressIdentityProvider, bucketEndpoint, expectContinueHeader } = input;
		return Object.assign(input, {
			forcePathStyle: forcePathStyle ?? false,
			useAccelerateEndpoint: useAccelerateEndpoint ?? false,
			disableMultiregionAccessPoints: disableMultiregionAccessPoints ?? false,
			followRegionRedirects: followRegionRedirects ?? false,
			s3ExpressIdentityProvider: s3ExpressIdentityProvider ?? new S3ExpressIdentityProviderImpl(async (key) => s3ClientProvider().send(new CreateSessionCommandCtor({ Bucket: key }))),
			bucketEndpoint: bucketEndpoint ?? false,
			expectContinueHeader: expectContinueHeader ?? 2097152
		});
	};
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-s3-expires/s3-expires-middleware.js
var s3ExpiresMiddleware, s3ExpiresMiddlewareOptions, getS3ExpiresMiddlewarePlugin;
var init_s3_expires_middleware = __esmMin((() => {
	init_protocols$1();
	init_serde();
	s3ExpiresMiddleware = (config) => {
		return (next, context) => async (args) => {
			const result = await next(args);
			const { response } = result;
			if (HttpResponse.isInstance(response)) {
				if (response.headers.expires) {
					response.headers.expiresstring = response.headers.expires;
					try {
						parseRfc7231DateTime(response.headers.expires);
					} catch (e) {
						context.logger?.warn(`AWS SDK Warning for ${context.clientName}::${context.commandName} response parsing (${response.headers.expires}): ${e}`);
						delete response.headers.expires;
					}
				}
			}
			return result;
		};
	};
	s3ExpiresMiddlewareOptions = {
		tags: ["S3"],
		name: "s3ExpiresMiddleware",
		override: true,
		relation: "after",
		toMiddleware: "deserializerMiddleware"
	};
	getS3ExpiresMiddlewarePlugin = (clientConfig) => ({ applyToStack: (clientStack) => {
		clientStack.addRelativeTo(s3ExpiresMiddleware(clientConfig), s3ExpiresMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@smithy/signature-v4/dist-cjs/index.js
var require_dist_cjs$39 = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { hasOwn, fromUtf8, fromHex, toHex, toUint8Array, writeKey, isArrayBuffer } = (init_serde(), __toCommonJS(serde_exports));
	const { normalizeProvider } = (init_client$1(), __toCommonJS(client_exports$1));
	const { escapeUri, HttpRequest } = (init_protocols$1(), __toCommonJS(protocols_exports));
	var HeaderFormatter = class {
		format(headers) {
			const chunks = [];
			for (const headerName in headers) {
				if (!hasOwn(headers, headerName)) continue;
				const bytes = fromUtf8(headerName);
				chunks.push(Uint8Array.from([bytes.byteLength]), bytes, this.formatHeaderValue(headers[headerName]));
			}
			const out = new Uint8Array(chunks.reduce((carry, bytes) => carry + bytes.byteLength, 0));
			let position = 0;
			for (const chunk of chunks) {
				out.set(chunk, position);
				position += chunk.byteLength;
			}
			return out;
		}
		formatHeaderValue(header) {
			switch (header.type) {
				case "boolean": return Uint8Array.from([header.value ? 0 : 1]);
				case "byte": return Uint8Array.from([2, header.value]);
				case "short":
					const shortView = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(3));
					shortView.setUint8(0, 3);
					shortView.setInt16(1, header.value, false);
					return new Uint8Array(shortView.buffer);
				case "integer":
					const intView = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(5));
					intView.setUint8(0, 4);
					intView.setInt32(1, header.value, false);
					return new Uint8Array(intView.buffer);
				case "long":
					const longBytes = new Uint8Array(9);
					longBytes[0] = 5;
					longBytes.set(header.value.bytes, 1);
					return longBytes;
				case "binary":
					const binView = new DataView(new ArrayBuffer(3 + header.value.byteLength));
					binView.setUint8(0, 6);
					binView.setUint16(1, header.value.byteLength, false);
					const binBytes = new Uint8Array(binView.buffer);
					binBytes.set(header.value, 3);
					return binBytes;
				case "string":
					const utf8Bytes = fromUtf8(header.value);
					const strView = new DataView(new ArrayBuffer(3 + utf8Bytes.byteLength));
					strView.setUint8(0, 7);
					strView.setUint16(1, utf8Bytes.byteLength, false);
					const strBytes = new Uint8Array(strView.buffer);
					strBytes.set(utf8Bytes, 3);
					return strBytes;
				case "timestamp":
					const tsBytes = new Uint8Array(9);
					tsBytes[0] = 8;
					tsBytes.set(Int64.fromNumber(header.value.valueOf()).bytes, 1);
					return tsBytes;
				case "uuid":
					if (!UUID_PATTERN.test(header.value)) throw new Error(`Invalid UUID received: ${header.value}`);
					const uuidBytes = new Uint8Array(17);
					uuidBytes[0] = 9;
					uuidBytes.set(fromHex(header.value.replace(/-/g, "")), 1);
					return uuidBytes;
			}
		}
	};
	var HEADER_VALUE_TYPE;
	(function(HEADER_VALUE_TYPE) {
		HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["boolTrue"] = 0] = "boolTrue";
		HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["boolFalse"] = 1] = "boolFalse";
		HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["byte"] = 2] = "byte";
		HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["short"] = 3] = "short";
		HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["integer"] = 4] = "integer";
		HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["long"] = 5] = "long";
		HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["byteArray"] = 6] = "byteArray";
		HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["string"] = 7] = "string";
		HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["timestamp"] = 8] = "timestamp";
		HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["uuid"] = 9] = "uuid";
	})(HEADER_VALUE_TYPE || (HEADER_VALUE_TYPE = {}));
	const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
	var Int64 = class Int64 {
		bytes;
		constructor(bytes) {
			this.bytes = bytes;
			if (bytes.byteLength !== 8) throw new Error("Int64 buffers must be exactly 8 bytes");
		}
		static fromNumber(number) {
			if (number > 0x8000000000000000 || number < -0x8000000000000000) throw new Error(`${number} is too large (or, if negative, too small) to represent as an Int64`);
			const bytes = new Uint8Array(8);
			for (let i = 7, remaining = Math.abs(Math.round(number)); i > -1 && remaining > 0; i--, remaining /= 256) bytes[i] = remaining;
			if (number < 0) negate(bytes);
			return new Int64(bytes);
		}
		valueOf() {
			const bytes = this.bytes.slice(0);
			const negative = bytes[0] & 128;
			if (negative) negate(bytes);
			return parseInt(toHex(bytes), 16) * (negative ? -1 : 1);
		}
		toString() {
			return String(this.valueOf());
		}
	};
	function negate(bytes) {
		for (let i = 0; i < 8; i++) bytes[i] ^= 255;
		for (let i = 7; i > -1; i--) {
			bytes[i]++;
			if (bytes[i] !== 0) break;
		}
	}
	const ALGORITHM_QUERY_PARAM = "X-Amz-Algorithm";
	const CREDENTIAL_QUERY_PARAM = "X-Amz-Credential";
	const AMZ_DATE_QUERY_PARAM = "X-Amz-Date";
	const SIGNED_HEADERS_QUERY_PARAM = "X-Amz-SignedHeaders";
	const EXPIRES_QUERY_PARAM = "X-Amz-Expires";
	const SIGNATURE_QUERY_PARAM = "X-Amz-Signature";
	const TOKEN_QUERY_PARAM = "X-Amz-Security-Token";
	const REGION_SET_PARAM = "X-Amz-Region-Set";
	const AUTH_HEADER = "authorization";
	const AMZ_DATE_HEADER = AMZ_DATE_QUERY_PARAM.toLowerCase();
	const DATE_HEADER = "date";
	const GENERATED_HEADERS = [
		AUTH_HEADER,
		AMZ_DATE_HEADER,
		DATE_HEADER
	];
	const SIGNATURE_HEADER = SIGNATURE_QUERY_PARAM.toLowerCase();
	const SHA256_HEADER = "x-amz-content-sha256";
	const TOKEN_HEADER = TOKEN_QUERY_PARAM.toLowerCase();
	const HOST_HEADER = "host";
	const ALWAYS_UNSIGNABLE_HEADERS = {
		authorization: true,
		"cache-control": true,
		connection: true,
		expect: true,
		from: true,
		"keep-alive": true,
		"max-forwards": true,
		pragma: true,
		referer: true,
		te: true,
		trailer: true,
		"transfer-encoding": true,
		upgrade: true,
		"user-agent": true,
		"x-amzn-trace-id": true
	};
	const PROXY_HEADER_PATTERN = /^proxy-/;
	const SEC_HEADER_PATTERN = /^sec-/;
	const UNSIGNABLE_PATTERNS = [/^proxy-/i, /^sec-/i];
	const ALGORITHM_IDENTIFIER = "AWS4-HMAC-SHA256";
	const ALGORITHM_IDENTIFIER_V4A = "AWS4-ECDSA-P256-SHA256";
	const EVENT_ALGORITHM_IDENTIFIER = "AWS4-HMAC-SHA256-PAYLOAD";
	const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
	const MAX_CACHE_SIZE = 50;
	const KEY_TYPE_IDENTIFIER = "aws4_request";
	const MAX_PRESIGNED_TTL = 3600 * 24 * 7;
	const getCanonicalQuery = ({ query = {} }) => {
		const keys = [];
		const serialized = {};
		for (const key in query) {
			if (!hasOwn(query, key)) continue;
			if (key.toLowerCase() === SIGNATURE_HEADER) continue;
			const encodedKey = escapeUri(key);
			keys.push(encodedKey);
			const value = query[key];
			if (typeof value === "string") serialized[encodedKey] = `${encodedKey}=${escapeUri(value)}`;
			else if (Array.isArray(value)) serialized[encodedKey] = value.slice(0).reduce((encoded, value) => encoded.concat([`${encodedKey}=${escapeUri(value)}`]), []).sort().join("&");
		}
		return keys.sort().map((key) => serialized[key]).filter((serialized) => serialized).join("&");
	};
	const iso8601 = (time) => toDate(time).toISOString().replace(/\.\d{3}Z$/, "Z");
	const toDate = (time) => {
		if (typeof time === "number") return /* @__PURE__ */ new Date(time * 1e3);
		if (typeof time === "string") {
			if (Number(time)) return /* @__PURE__ */ new Date(Number(time) * 1e3);
			return new Date(time);
		}
		return time;
	};
	var SignatureV4Base = class {
		service;
		regionProvider;
		credentialProvider;
		sha256;
		uriEscapePath;
		applyChecksum;
		constructor({ applyChecksum, credentials, region, service, sha256, uriEscapePath = true }) {
			this.service = service;
			this.sha256 = sha256;
			this.uriEscapePath = uriEscapePath;
			this.applyChecksum = typeof applyChecksum === "boolean" ? applyChecksum : true;
			this.regionProvider = normalizeProvider(region);
			this.credentialProvider = normalizeProvider(credentials);
		}
		createCanonicalRequest(request, canonicalHeaders, payloadHash) {
			const sortedHeaders = Object.keys(canonicalHeaders).sort();
			return `${request.method}
${this.getCanonicalPath(request)}
${getCanonicalQuery(request)}
${sortedHeaders.map((name) => `${name}:${canonicalHeaders[name]}`).join("\n")}

${sortedHeaders.join(";")}
${payloadHash}`;
		}
		async createStringToSign(longDate, credentialScope, canonicalRequest, algorithmIdentifier) {
			const hash = new this.sha256();
			hash.update(toUint8Array(canonicalRequest));
			return `${algorithmIdentifier}
${longDate}
${credentialScope}
${toHex(await hash.digest())}`;
		}
		getCanonicalPath({ path }) {
			if (this.uriEscapePath) {
				const normalizedPathSegments = [];
				for (const pathSegment of path.split("/")) {
					if (pathSegment?.length === 0) continue;
					if (pathSegment === ".") continue;
					if (pathSegment === "..") normalizedPathSegments.pop();
					else normalizedPathSegments.push(pathSegment);
				}
				return escapeUri(`${path?.startsWith("/") ? "/" : ""}${normalizedPathSegments.join("/")}${normalizedPathSegments.length > 0 && path?.endsWith("/") ? "/" : ""}`).replace(/%2F/g, "/");
			}
			return path;
		}
		validateResolvedCredentials(credentials) {
			if (typeof credentials !== "object" || typeof credentials.accessKeyId !== "string" || typeof credentials.secretAccessKey !== "string") throw new Error("Resolved credential object is not valid");
		}
		formatDate(now) {
			const longDate = iso8601(now).replace(/[-:]/g, "");
			return {
				longDate,
				shortDate: longDate.slice(0, 8)
			};
		}
		getCanonicalHeaderList(headers) {
			return Object.keys(headers).sort().join(";");
		}
	};
	const signingKeyCache = {};
	const cacheQueue = [];
	const createScope = (shortDate, region, service) => `${shortDate}/${region}/${service}/${KEY_TYPE_IDENTIFIER}`;
	const getSigningKey = async (sha256Constructor, credentials, shortDate, region, service) => {
		const cacheKey = `${shortDate}:${region}:${service}:${toHex(await hmac(sha256Constructor, credentials.secretAccessKey, credentials.accessKeyId))}:${credentials.sessionToken}`;
		if (cacheKey in signingKeyCache) return signingKeyCache[cacheKey];
		cacheQueue.push(cacheKey);
		while (cacheQueue.length > MAX_CACHE_SIZE) delete signingKeyCache[cacheQueue.shift()];
		let key = `AWS4${credentials.secretAccessKey}`;
		for (const signable of [
			shortDate,
			region,
			service,
			KEY_TYPE_IDENTIFIER
		]) key = await hmac(sha256Constructor, key, signable);
		return signingKeyCache[cacheKey] = key;
	};
	const clearCredentialCache = () => {
		cacheQueue.length = 0;
		Object.keys(signingKeyCache).forEach((cacheKey) => {
			delete signingKeyCache[cacheKey];
		});
	};
	const hmac = (ctor, secret, data) => {
		const hash = new ctor(secret);
		hash.update(toUint8Array(data));
		return hash.digest();
	};
	const getCanonicalHeaders = ({ headers }, unsignableHeaders, signableHeaders) => {
		const canonical = {};
		for (const headerName of Object.keys(headers).sort()) {
			if (headers[headerName] == void 0) continue;
			const canonicalHeaderName = headerName.toLowerCase();
			if (hasOwn(ALWAYS_UNSIGNABLE_HEADERS, canonicalHeaderName) || unsignableHeaders?.has(canonicalHeaderName) || PROXY_HEADER_PATTERN.test(canonicalHeaderName) || SEC_HEADER_PATTERN.test(canonicalHeaderName)) {
				if (!signableHeaders || signableHeaders && !signableHeaders.has(canonicalHeaderName)) continue;
			}
			if (canonicalHeaderName === "__proto__") writeKey(canonical);
			canonical[canonicalHeaderName] = headers[headerName].replace(/[\r\n]/g, " ").replace(/[ \t]+/g, " ").replace(/^ | $/g, "");
		}
		return canonical;
	};
	const getPayloadHash = async ({ headers, body }, hashConstructor) => {
		for (const headerName in headers) {
			if (!hasOwn(headers, headerName)) continue;
			if (headerName.toLowerCase() === SHA256_HEADER) return headers[headerName];
		}
		if (body == void 0) return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
		else if (typeof body === "string" || ArrayBuffer.isView(body) || isArrayBuffer(body)) {
			const hashCtor = new hashConstructor();
			hashCtor.update(toUint8Array(body));
			return toHex(await hashCtor.digest());
		}
		return UNSIGNED_PAYLOAD;
	};
	const hasHeader = (soughtHeader, headers) => {
		soughtHeader = soughtHeader.toLowerCase();
		for (const headerName in headers) {
			if (!hasOwn(headers, headerName)) continue;
			if (soughtHeader === headerName.toLowerCase()) return true;
		}
		return false;
	};
	const moveHeadersToQuery = (request, options = {}) => {
		const { headers, query = {} } = HttpRequest.clone(request);
		for (const name in headers) {
			if (!hasOwn(headers, name)) continue;
			const lname = name.toLowerCase();
			if (lname.slice(0, 6) === "x-amz-" && !options.unhoistableHeaders?.has(lname) || options.hoistableHeaders?.has(lname)) {
				query[name] = headers[name];
				delete headers[name];
			}
		}
		return {
			...request,
			headers,
			query
		};
	};
	const prepareRequest = (request) => {
		request = HttpRequest.clone(request);
		for (const headerName in request.headers) {
			if (!hasOwn(request.headers, headerName)) continue;
			if (GENERATED_HEADERS.indexOf(headerName.toLowerCase()) > -1) delete request.headers[headerName];
		}
		return request;
	};
	var SignatureV4 = class extends SignatureV4Base {
		headerFormatter = new HeaderFormatter();
		constructor({ applyChecksum, credentials, region, service, sha256, uriEscapePath = true }) {
			super({
				applyChecksum,
				credentials,
				region,
				service,
				sha256,
				uriEscapePath
			});
		}
		async presign(originalRequest, options = {}) {
			const { signingDate = /* @__PURE__ */ new Date(), expiresIn = 3600, unsignableHeaders, unhoistableHeaders, signableHeaders, hoistableHeaders, signingRegion, signingService } = options;
			const credentials = await this.credentialProvider();
			this.validateResolvedCredentials(credentials);
			const region = signingRegion ?? await this.regionProvider();
			const { longDate, shortDate } = this.formatDate(signingDate);
			if (expiresIn > MAX_PRESIGNED_TTL) return Promise.reject("Signature version 4 presigned URLs must have an expiration date less than one week in the future");
			const scope = createScope(shortDate, region, signingService ?? this.service);
			const request = moveHeadersToQuery(prepareRequest(originalRequest), {
				unhoistableHeaders,
				hoistableHeaders
			});
			if (credentials.sessionToken) request.query[TOKEN_QUERY_PARAM] = credentials.sessionToken;
			request.query[ALGORITHM_QUERY_PARAM] = ALGORITHM_IDENTIFIER;
			request.query[CREDENTIAL_QUERY_PARAM] = `${credentials.accessKeyId}/${scope}`;
			request.query[AMZ_DATE_QUERY_PARAM] = longDate;
			request.query[EXPIRES_QUERY_PARAM] = expiresIn.toString(10);
			const canonicalHeaders = getCanonicalHeaders(request, unsignableHeaders, signableHeaders);
			request.query[SIGNED_HEADERS_QUERY_PARAM] = this.getCanonicalHeaderList(canonicalHeaders);
			request.query[SIGNATURE_QUERY_PARAM] = await this.getSignature(longDate, scope, this.getSigningKey(credentials, region, shortDate, signingService), this.createCanonicalRequest(request, canonicalHeaders, await getPayloadHash(originalRequest, this.sha256)));
			return request;
		}
		async sign(toSign, options) {
			if (typeof toSign === "string") return this.signString(toSign, options);
			else if (toSign.headers && toSign.payload) return this.signEvent(toSign, options);
			else if (toSign.message) return this.signMessage(toSign, options);
			else return this.signRequest(toSign, options);
		}
		async signEvent({ headers, payload }, { signingDate = /* @__PURE__ */ new Date(), priorSignature, signingRegion, signingService, eventStreamCredentials }) {
			const region = signingRegion ?? await this.regionProvider();
			const { shortDate, longDate } = this.formatDate(signingDate);
			const scope = createScope(shortDate, region, signingService ?? this.service);
			const hashedPayload = await getPayloadHash({
				headers: {},
				body: payload
			}, this.sha256);
			const hash = new this.sha256();
			hash.update(headers);
			const stringToSign = [
				EVENT_ALGORITHM_IDENTIFIER,
				longDate,
				scope,
				priorSignature,
				toHex(await hash.digest()),
				hashedPayload
			].join("\n");
			return this.signString(stringToSign, {
				signingDate,
				signingRegion: region,
				signingService,
				eventStreamCredentials
			});
		}
		async signMessage(signableMessage, { signingDate = /* @__PURE__ */ new Date(), signingRegion, signingService, eventStreamCredentials }) {
			return this.signEvent({
				headers: this.headerFormatter.format(signableMessage.message.headers),
				payload: signableMessage.message.body
			}, {
				signingDate,
				signingRegion,
				signingService,
				priorSignature: signableMessage.priorSignature,
				eventStreamCredentials
			}).then((signature) => {
				return {
					message: signableMessage.message,
					signature
				};
			});
		}
		async signString(stringToSign, { signingDate = /* @__PURE__ */ new Date(), signingRegion, signingService, eventStreamCredentials } = {}) {
			const credentials = eventStreamCredentials ?? await this.credentialProvider();
			this.validateResolvedCredentials(credentials);
			const region = signingRegion ?? await this.regionProvider();
			const { shortDate } = this.formatDate(signingDate);
			const hash = new this.sha256(await this.getSigningKey(credentials, region, shortDate, signingService));
			hash.update(toUint8Array(stringToSign));
			return toHex(await hash.digest());
		}
		async signRequest(requestToSign, { signingDate = /* @__PURE__ */ new Date(), signableHeaders, unsignableHeaders, signingRegion, signingService } = {}) {
			const credentials = await this.credentialProvider();
			this.validateResolvedCredentials(credentials);
			const region = signingRegion ?? await this.regionProvider();
			const request = prepareRequest(requestToSign);
			const { longDate, shortDate } = this.formatDate(signingDate);
			const scope = createScope(shortDate, region, signingService ?? this.service);
			request.headers[AMZ_DATE_HEADER] = longDate;
			if (credentials.sessionToken) request.headers[TOKEN_HEADER] = credentials.sessionToken;
			const payloadHash = await getPayloadHash(request, this.sha256);
			if (!hasHeader(SHA256_HEADER, request.headers) && this.applyChecksum) request.headers[SHA256_HEADER] = payloadHash;
			const canonicalHeaders = getCanonicalHeaders(request, unsignableHeaders, signableHeaders);
			const signature = await this.getSignature(longDate, scope, this.getSigningKey(credentials, region, shortDate, signingService), this.createCanonicalRequest(request, canonicalHeaders, payloadHash));
			request.headers[AUTH_HEADER] = `${ALGORITHM_IDENTIFIER} Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${this.getCanonicalHeaderList(canonicalHeaders)}, Signature=${signature}`;
			return request;
		}
		async getSignature(longDate, credentialScope, keyPromise, canonicalRequest) {
			const stringToSign = await this.createStringToSign(longDate, credentialScope, canonicalRequest, ALGORITHM_IDENTIFIER);
			const hash = new this.sha256(await keyPromise);
			hash.update(toUint8Array(stringToSign));
			return toHex(await hash.digest());
		}
		getSigningKey(credentials, region, shortDate, service) {
			return getSigningKey(this.sha256, credentials, shortDate, region, service || this.service);
		}
	};
	const signatureV4aContainer = { SignatureV4a: null };
	exports.ALGORITHM_IDENTIFIER = ALGORITHM_IDENTIFIER;
	exports.ALGORITHM_IDENTIFIER_V4A = ALGORITHM_IDENTIFIER_V4A;
	exports.ALGORITHM_QUERY_PARAM = ALGORITHM_QUERY_PARAM;
	exports.ALWAYS_UNSIGNABLE_HEADERS = ALWAYS_UNSIGNABLE_HEADERS;
	exports.AMZ_DATE_HEADER = AMZ_DATE_HEADER;
	exports.AMZ_DATE_QUERY_PARAM = AMZ_DATE_QUERY_PARAM;
	exports.AUTH_HEADER = AUTH_HEADER;
	exports.CREDENTIAL_QUERY_PARAM = CREDENTIAL_QUERY_PARAM;
	exports.DATE_HEADER = DATE_HEADER;
	exports.EVENT_ALGORITHM_IDENTIFIER = EVENT_ALGORITHM_IDENTIFIER;
	exports.EXPIRES_QUERY_PARAM = EXPIRES_QUERY_PARAM;
	exports.GENERATED_HEADERS = GENERATED_HEADERS;
	exports.HOST_HEADER = HOST_HEADER;
	exports.KEY_TYPE_IDENTIFIER = KEY_TYPE_IDENTIFIER;
	exports.MAX_CACHE_SIZE = MAX_CACHE_SIZE;
	exports.MAX_PRESIGNED_TTL = MAX_PRESIGNED_TTL;
	exports.PROXY_HEADER_PATTERN = PROXY_HEADER_PATTERN;
	exports.REGION_SET_PARAM = REGION_SET_PARAM;
	exports.SEC_HEADER_PATTERN = SEC_HEADER_PATTERN;
	exports.SHA256_HEADER = SHA256_HEADER;
	exports.SIGNATURE_HEADER = SIGNATURE_HEADER;
	exports.SIGNATURE_QUERY_PARAM = SIGNATURE_QUERY_PARAM;
	exports.SIGNED_HEADERS_QUERY_PARAM = SIGNED_HEADERS_QUERY_PARAM;
	exports.SignatureV4 = SignatureV4;
	exports.SignatureV4Base = SignatureV4Base;
	exports.TOKEN_HEADER = TOKEN_HEADER;
	exports.TOKEN_QUERY_PARAM = TOKEN_QUERY_PARAM;
	exports.UNSIGNABLE_PATTERNS = UNSIGNABLE_PATTERNS;
	exports.UNSIGNED_PAYLOAD = UNSIGNED_PAYLOAD;
	exports.clearCredentialCache = clearCredentialCache;
	exports.createScope = createScope;
	exports.getCanonicalHeaders = getCanonicalHeaders;
	exports.getCanonicalQuery = getCanonicalQuery;
	exports.getPayloadHash = getPayloadHash;
	exports.getSigningKey = getSigningKey;
	exports.hasHeader = hasHeader;
	exports.moveHeadersToQuery = moveHeadersToQuery;
	exports.prepareRequest = prepareRequest;
	exports.signatureV4aContainer = signatureV4aContainer;
}));
//#endregion
//#region node_modules/@aws-sdk/signature-v4-multi-region/dist-cjs/index.js
var require_dist_cjs$38 = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { SignatureV4, signatureV4aContainer } = require_dist_cjs$39();
	const signatureV4CrtContainer = { CrtSignerV4: null };
	const SESSION_TOKEN_QUERY_PARAM = "X-Amz-S3session-Token";
	const SESSION_TOKEN_HEADER = SESSION_TOKEN_QUERY_PARAM.toLowerCase();
	var SignatureV4SignWithCredentials = class extends SignatureV4 {
		async signWithCredentials(requestToSign, credentials, options) {
			const credentialsWithoutSessionToken = getCredentialsWithoutSessionToken(credentials);
			requestToSign.headers[SESSION_TOKEN_HEADER] = credentials.sessionToken;
			const privateAccess = this;
			setSingleOverride(privateAccess, credentialsWithoutSessionToken);
			return privateAccess.signRequest(requestToSign, options ?? {});
		}
		async presignWithCredentials(requestToSign, credentials, options) {
			const credentialsWithoutSessionToken = getCredentialsWithoutSessionToken(credentials);
			delete requestToSign.headers[SESSION_TOKEN_HEADER];
			requestToSign.headers[SESSION_TOKEN_QUERY_PARAM] = credentials.sessionToken;
			requestToSign.query = requestToSign.query ?? {};
			requestToSign.query[SESSION_TOKEN_QUERY_PARAM] = credentials.sessionToken;
			setSingleOverride(this, credentialsWithoutSessionToken);
			return this.presign(requestToSign, options);
		}
	};
	function getCredentialsWithoutSessionToken(credentials) {
		return {
			accessKeyId: credentials.accessKeyId,
			secretAccessKey: credentials.secretAccessKey,
			expiration: credentials.expiration
		};
	}
	function setSingleOverride(privateAccess, credentialsWithoutSessionToken) {
		const currentCredentialProvider = privateAccess.credentialProvider;
		privateAccess.credentialProvider = () => {
			privateAccess.credentialProvider = currentCredentialProvider;
			return Promise.resolve(credentialsWithoutSessionToken);
		};
	}
	var SignatureV4MultiRegion = class {
		sigv4aSigner;
		sigv4Signer;
		signerOptions;
		static sigv4aDependency() {
			if (typeof signatureV4CrtContainer.CrtSignerV4 === "function") return "crt";
			else if (typeof signatureV4aContainer.SignatureV4a === "function") return "js";
			return "none";
		}
		constructor(options) {
			this.sigv4Signer = new SignatureV4SignWithCredentials(options);
			this.signerOptions = options;
		}
		async sign(requestToSign, options = {}) {
			if (options.signingRegion === "*") return this.getSigv4aSigner().sign(requestToSign, options);
			return this.sigv4Signer.sign(requestToSign, options);
		}
		async signWithCredentials(requestToSign, credentials, options = {}) {
			if (options.signingRegion === "*") {
				const signer = this.getSigv4aSigner();
				const CrtSignerV4 = signatureV4CrtContainer.CrtSignerV4;
				if (CrtSignerV4 && signer instanceof CrtSignerV4) return signer.signWithCredentials(requestToSign, credentials, options);
				else throw new Error("signWithCredentials with signingRegion '*' is only supported when using the CRT dependency @aws-sdk/signature-v4-crt. Please check whether you have installed the \"@aws-sdk/signature-v4-crt\" package explicitly. You must also register the package by calling [require(\"@aws-sdk/signature-v4-crt\");] or an ESM equivalent such as [import \"@aws-sdk/signature-v4-crt\";]. For more information please go to https://github.com/aws/aws-sdk-js-v3#functionality-requiring-aws-common-runtime-crt");
			}
			return this.sigv4Signer.signWithCredentials(requestToSign, credentials, options);
		}
		async presign(originalRequest, options = {}) {
			if (options.signingRegion === "*") {
				const signer = this.getSigv4aSigner();
				const CrtSignerV4 = signatureV4CrtContainer.CrtSignerV4;
				if (CrtSignerV4 && signer instanceof CrtSignerV4) return signer.presign(originalRequest, options);
				else throw new Error("presign with signingRegion '*' is only supported when using the CRT dependency @aws-sdk/signature-v4-crt. Please check whether you have installed the \"@aws-sdk/signature-v4-crt\" package explicitly. You must also register the package by calling [require(\"@aws-sdk/signature-v4-crt\");] or an ESM equivalent such as [import \"@aws-sdk/signature-v4-crt\";]. For more information please go to https://github.com/aws/aws-sdk-js-v3#functionality-requiring-aws-common-runtime-crt");
			}
			return this.sigv4Signer.presign(originalRequest, options);
		}
		async presignWithCredentials(originalRequest, credentials, options = {}) {
			if (options.signingRegion === "*") throw new Error("Method presignWithCredentials is not supported for [signingRegion=*].");
			return this.sigv4Signer.presignWithCredentials(originalRequest, credentials, options);
		}
		getSigv4aSigner() {
			if (!this.sigv4aSigner) {
				const CrtSignerV4 = signatureV4CrtContainer.CrtSignerV4;
				const JsSigV4aSigner = signatureV4aContainer.SignatureV4a;
				if (this.signerOptions.runtime === "node") {
					if (!CrtSignerV4 && !JsSigV4aSigner) throw new Error("Neither CRT nor JS SigV4a implementation is available. Please load either @aws-sdk/signature-v4-crt or @aws-sdk/signature-v4a. For more information please go to https://github.com/aws/aws-sdk-js-v3#functionality-requiring-aws-common-runtime-crt");
					if (CrtSignerV4 && typeof CrtSignerV4 === "function") this.sigv4aSigner = new CrtSignerV4({
						...this.signerOptions,
						signingAlgorithm: 1
					});
					else if (JsSigV4aSigner && typeof JsSigV4aSigner === "function") this.sigv4aSigner = new JsSigV4aSigner({ ...this.signerOptions });
					else throw new Error("Available SigV4a implementation is not a valid constructor. Please ensure you've properly imported @aws-sdk/signature-v4-crt or @aws-sdk/signature-v4a.For more information please go to https://github.com/aws/aws-sdk-js-v3#functionality-requiring-aws-common-runtime-crt");
				} else {
					if (!JsSigV4aSigner || typeof JsSigV4aSigner !== "function") throw new Error("JS SigV4a implementation is not available or not a valid constructor. Please check whether you have installed the @aws-sdk/signature-v4a package explicitly. The CRT implementation is not available for browsers. You must also register the package by calling [require('@aws-sdk/signature-v4a');] or an ESM equivalent such as [import '@aws-sdk/signature-v4a';]. For more information please go to https://github.com/aws/aws-sdk-js-v3#using-javascript-non-crt-implementation-of-sigv4a");
					this.sigv4aSigner = new JsSigV4aSigner({ ...this.signerOptions });
				}
			}
			return this.sigv4aSigner;
		}
	};
	exports.SignatureV4MultiRegion = SignatureV4MultiRegion;
	exports.SignatureV4SignWithCredentials = SignatureV4SignWithCredentials;
	exports.signatureV4CrtContainer = signatureV4CrtContainer;
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-s3-express/classes/SignatureV4S3Express.js
var import_dist_cjs$6, SignatureV4S3Express;
var init_SignatureV4S3Express = __esmMin((() => {
	import_dist_cjs$6 = require_dist_cjs$38();
	SignatureV4S3Express = class extends import_dist_cjs$6.SignatureV4SignWithCredentials {};
})), S3_EXPRESS_AUTH_SCHEME, SESSION_TOKEN_QUERY_PARAM, SESSION_TOKEN_HEADER, NODE_DISABLE_S3_EXPRESS_SESSION_AUTH_ENV_NAME, NODE_DISABLE_S3_EXPRESS_SESSION_AUTH_INI_NAME, NODE_DISABLE_S3_EXPRESS_SESSION_AUTH_OPTIONS;
var init_constants$1 = __esmMin((() => {
	init_config$1();
	S3_EXPRESS_AUTH_SCHEME = "sigv4-s3express";
	SESSION_TOKEN_QUERY_PARAM = "X-Amz-S3session-Token";
	SESSION_TOKEN_HEADER = SESSION_TOKEN_QUERY_PARAM.toLowerCase();
	NODE_DISABLE_S3_EXPRESS_SESSION_AUTH_ENV_NAME = "AWS_S3_DISABLE_EXPRESS_SESSION_AUTH";
	NODE_DISABLE_S3_EXPRESS_SESSION_AUTH_INI_NAME = "s3_disable_express_session_auth";
	NODE_DISABLE_S3_EXPRESS_SESSION_AUTH_OPTIONS = {
		environmentVariableSelector: (env) => booleanSelector(env, NODE_DISABLE_S3_EXPRESS_SESSION_AUTH_ENV_NAME, SelectorType$1.ENV),
		configFileSelector: (profile) => booleanSelector(profile, NODE_DISABLE_S3_EXPRESS_SESSION_AUTH_INI_NAME, SelectorType$1.CONFIG),
		default: false
	};
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-s3-express/functions/s3ExpressMiddleware.js
var s3ExpressMiddleware, s3ExpressMiddlewareOptions, getS3ExpressPlugin;
var init_s3ExpressMiddleware = __esmMin((() => {
	init_client();
	init_protocols$1();
	init_constants$1();
	s3ExpressMiddleware = (options) => {
		return (next, context) => async (args) => {
			if (context.endpointV2) {
				const endpoint = context.endpointV2;
				const isS3ExpressAuth = endpoint.properties?.authSchemes?.[0]?.name === S3_EXPRESS_AUTH_SCHEME;
				if (endpoint.properties?.backend === "S3Express" || endpoint.properties?.bucketType === "Directory") {
					setFeature$1(context, "S3_EXPRESS_BUCKET", "J");
					context.isS3ExpressBucket = true;
				}
				if (isS3ExpressAuth) {
					const requestBucket = args.input.Bucket;
					if (requestBucket) {
						const s3ExpressIdentity = await options.s3ExpressIdentityProvider.getS3ExpressIdentity(await options.credentials(), { Bucket: requestBucket });
						context.s3ExpressIdentity = s3ExpressIdentity;
						if (HttpRequest.isInstance(args.request) && s3ExpressIdentity.sessionToken) args.request.headers[SESSION_TOKEN_HEADER] = s3ExpressIdentity.sessionToken;
					}
				}
			}
			return next(args);
		};
	};
	s3ExpressMiddlewareOptions = {
		name: "s3ExpressMiddleware",
		step: "build",
		tags: ["S3", "S3_EXPRESS"],
		override: true
	};
	getS3ExpressPlugin = (options) => ({ applyToStack: (clientStack) => {
		clientStack.add(s3ExpressMiddleware(options), s3ExpressMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-s3-express/functions/signS3Express.js
var signS3Express;
var init_signS3Express = __esmMin((() => {
	signS3Express = async (s3ExpressIdentity, signingOptions, request, sigV4MultiRegionSigner) => {
		const signedRequest = await sigV4MultiRegionSigner.signWithCredentials(request, s3ExpressIdentity, {});
		if (signedRequest.headers["X-Amz-Security-Token"] || signedRequest.headers["x-amz-security-token"]) throw new Error("X-Amz-Security-Token must not be set for s3-express requests.");
		return signedRequest;
	};
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-s3-express/functions/s3ExpressHttpSigningMiddleware.js
var defaultErrorHandler, defaultSuccessHandler, s3ExpressHttpSigningMiddlewareOptions, s3ExpressHttpSigningMiddleware, getS3ExpressHttpSigningPlugin;
var init_s3ExpressHttpSigningMiddleware = __esmMin((() => {
	init_dist_es$1();
	init_client$1();
	init_protocols$1();
	init_signS3Express();
	defaultErrorHandler = (signingProperties) => (error) => {
		throw error;
	};
	defaultSuccessHandler = (httpResponse, signingProperties) => {};
	s3ExpressHttpSigningMiddlewareOptions = httpSigningMiddlewareOptions;
	s3ExpressHttpSigningMiddleware = (config) => (next, context) => async (args) => {
		if (!HttpRequest.isInstance(args.request)) return next(args);
		const scheme = getSmithyContext(context).selectedHttpAuthScheme;
		if (!scheme) throw new Error(`No HttpAuthScheme was selected: unable to sign request`);
		const { httpAuthOption: { signingProperties = {} }, identity, signer } = scheme;
		let request;
		if (context.s3ExpressIdentity) request = await signS3Express(context.s3ExpressIdentity, signingProperties, args.request, await config.signer());
		else request = await signer.sign(args.request, identity, signingProperties);
		const output = await next({
			...args,
			request
		}).catch((signer.errorHandler || defaultErrorHandler)(signingProperties));
		(signer.successHandler || defaultSuccessHandler)(output.response, signingProperties);
		return output;
	};
	getS3ExpressHttpSigningPlugin = (config) => ({ applyToStack: (clientStack) => {
		clientStack.addRelativeTo(s3ExpressHttpSigningMiddleware(config), httpSigningMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/to-stream/toStream.js
function toStream(bytes) {
	return Readable.from(Buffer.from(bytes));
}
var init_toStream = __esmMin((() => {}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-throw-200-exceptions/throw-200-exceptions.js
var THROW_IF_EMPTY_BODY, throw200ExceptionsMiddleware, collectBody, throw200ExceptionsMiddlewareOptions, getThrow200ExceptionsPlugin;
var init_throw_200_exceptions = __esmMin((() => {
	init_protocols$1();
	init_toStream();
	THROW_IF_EMPTY_BODY = {
		CopyObjectCommand: true,
		UploadPartCopyCommand: true,
		CompleteMultipartUploadCommand: true
	};
	throw200ExceptionsMiddleware = (config) => (next, context) => async (args) => {
		const result = await next(args);
		const { response } = result;
		if (!HttpResponse.isInstance(response)) return result;
		const { statusCode, body } = response;
		if (statusCode < 200 || statusCode >= 300) return result;
		const bodyBytes = await collectBody(body, config);
		response.body = toStream(bodyBytes);
		if (bodyBytes.length === 0 && THROW_IF_EMPTY_BODY[context.commandName]) {
			const err = /* @__PURE__ */ new Error("S3 aborted request");
			err.$metadata = { httpStatusCode: 503 };
			err.name = "InternalError";
			throw err;
		}
		const bodyStringTail = config.utf8Encoder(bodyBytes.subarray(bodyBytes.length - 16));
		if (bodyStringTail && bodyStringTail.endsWith("</Error>")) response.statusCode = 503;
		return result;
	};
	collectBody = (streamBody = new Uint8Array(), context) => {
		if (streamBody instanceof Uint8Array) return Promise.resolve(streamBody);
		return context.streamCollector(streamBody) || Promise.resolve(new Uint8Array());
	};
	throw200ExceptionsMiddlewareOptions = {
		relation: "after",
		toMiddleware: "deserializerMiddleware",
		tags: ["THROW_200_EXCEPTIONS", "S3"],
		name: "throw200ExceptionsMiddleware",
		override: true
	};
	getThrow200ExceptionsPlugin = (config) => ({ applyToStack: (clientStack) => {
		clientStack.addRelativeTo(throw200ExceptionsMiddleware(config), throw200ExceptionsMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/util/util-arn-parser/arn.js
var validate, parse$1, build;
var init_arn = __esmMin((() => {
	validate = (str) => typeof str === "string" && str.indexOf("arn:") === 0 && str.split(":").length >= 6;
	parse$1 = (arn) => {
		const segments = arn.split(":");
		if (segments.length < 6 || segments[0] !== "arn") throw new Error("Malformed ARN");
		const [, partition, service, region, accountId, ...resource] = segments;
		return {
			partition,
			service,
			region,
			accountId,
			resource: resource.join(":")
		};
	};
	build = (arnObject) => {
		const { partition = "aws", service, region, accountId, resource } = arnObject;
		if ([
			service,
			region,
			accountId,
			resource
		].some((segment) => typeof segment !== "string")) throw new Error("Input ARN object is invalid");
		return `arn:${partition}:${service}:${region}:${accountId}:${resource}`;
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/util/util-format-url/format-url.js
function formatUrl(request) {
	const { port, query } = request;
	let { protocol, path, hostname } = request;
	if (protocol && protocol.slice(-1) !== ":") protocol += ":";
	if (port) hostname += `:${port}`;
	if (path && path.charAt(0) !== "/") path = `/${path}`;
	let queryString = query ? buildQueryString(query) : "";
	if (queryString && queryString[0] !== "?") queryString = `?${queryString}`;
	let auth = "";
	if (request.username != null || request.password != null) auth = `${request.username ?? ""}:${request.password ?? ""}@`;
	let fragment = "";
	if (request.fragment) fragment = `#${request.fragment}`;
	return `${protocol}//${auth}${hostname}${path}${queryString}${fragment}`;
}
var init_format_url = __esmMin((() => {
	init_protocols$1();
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/util/hasOwn.js
function hasOwn(container, key) {
	return Object.prototype.hasOwnProperty.call(container, key);
}
var init_hasOwn = __esmMin((() => {}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/util/index.js
var util_exports = /* @__PURE__ */ __exportAll({
	build: () => build,
	formatUrl: () => formatUrl,
	hasOwn: () => hasOwn,
	parse: () => parse$1,
	validate: () => validate
});
var init_util = __esmMin((() => {
	init_arn();
	init_format_url();
	init_hasOwn();
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-region-redirect/bucket-endpoint-middleware.js
function bucketEndpointMiddleware$1(options) {
	return (next, context) => async (args) => {
		if (options.bucketEndpoint) {
			const endpoint = context.endpointV2;
			if (endpoint) {
				const bucket = args.input.Bucket;
				if (typeof bucket === "string") try {
					const bucketEndpointUrl = new URL(bucket);
					context.endpointV2 = {
						...endpoint,
						url: bucketEndpointUrl
					};
				} catch (e) {
					const warning = `@aws-sdk/middleware-sdk-s3: bucketEndpoint=true was set but Bucket=${bucket} could not be parsed as URL.`;
					if (context.logger?.constructor?.name === "NoOpLogger") console.warn(warning);
					else context.logger?.warn?.(warning);
					throw e;
				}
			}
		}
		return next(args);
	};
}
var bucketEndpointMiddlewareOptions$1;
var init_bucket_endpoint_middleware = __esmMin((() => {
	bucketEndpointMiddlewareOptions$1 = {
		name: "bucketEndpointMiddleware",
		override: true,
		relation: "after",
		toMiddleware: "endpointV2Middleware"
	};
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-validate-bucket-name/validate-bucket-name.js
function validateBucketNameMiddleware({ bucketEndpoint }) {
	return (next) => async (args) => {
		const { input: { Bucket } } = args;
		if (!bucketEndpoint && typeof Bucket === "string" && !validate(Bucket) && Bucket.indexOf("/") >= 0) {
			const err = /* @__PURE__ */ new Error(`Bucket name shouldn't contain '/', received '${Bucket}'`);
			err.name = "InvalidBucketName";
			throw err;
		}
		return next({ ...args });
	};
}
var validateBucketNameMiddlewareOptions, getValidateBucketNamePlugin;
var init_validate_bucket_name = __esmMin((() => {
	init_util();
	init_bucket_endpoint_middleware();
	validateBucketNameMiddlewareOptions = {
		step: "initialize",
		tags: ["VALIDATE_BUCKET_NAME"],
		name: "validateBucketNameMiddleware",
		override: true
	};
	getValidateBucketNamePlugin = (options) => ({ applyToStack: (clientStack) => {
		clientStack.add(validateBucketNameMiddleware(options), validateBucketNameMiddlewareOptions);
		clientStack.addRelativeTo(bucketEndpointMiddleware$1(options), bucketEndpointMiddlewareOptions$1);
	} });
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/protocols/ProtocolLib.js
var ProtocolLib;
var init_ProtocolLib = __esmMin((() => {
	init_client$1();
	init_schema();
	ProtocolLib = class {
		queryCompat;
		errorRegistry;
		constructor(queryCompat = false) {
			this.queryCompat = queryCompat;
		}
		resolveRestContentType(defaultContentType, inputSchema) {
			const members = inputSchema.getMemberSchemas();
			const httpPayloadMember = Object.values(members).find((m) => {
				return !!m.getMergedTraits().httpPayload;
			});
			if (httpPayloadMember) {
				const mediaType = httpPayloadMember.getMergedTraits().mediaType;
				if (mediaType) return mediaType;
				else if (httpPayloadMember.isStringSchema()) return "text/plain";
				else if (httpPayloadMember.isBlobSchema()) return "application/octet-stream";
				else return defaultContentType;
			} else if (!inputSchema.isUnitSchema()) {
				if (Object.values(members).find((m) => {
					const { httpQuery, httpQueryParams, httpHeader, httpLabel, httpPrefixHeaders } = m.getMergedTraits();
					return !httpQuery && !httpQueryParams && !httpHeader && !httpLabel && httpPrefixHeaders === void 0;
				})) return defaultContentType;
			}
		}
		async getErrorSchemaOrThrowBaseException(errorIdentifier, defaultNamespace, response, dataObject, metadata, getErrorSchema) {
			let errorName = errorIdentifier;
			if (errorIdentifier.includes("#")) [, errorName] = errorIdentifier.split("#");
			const errorMetadata = {
				$metadata: metadata,
				$fault: response.statusCode < 500 ? "client" : "server"
			};
			if (!this.errorRegistry) throw new Error("@aws-sdk/core/protocols - error handler not initialized.");
			try {
				return {
					errorSchema: getErrorSchema?.(this.errorRegistry, errorName) ?? this.errorRegistry.getSchema(errorIdentifier),
					errorMetadata
				};
			} catch (e) {
				dataObject.message = dataObject.message ?? dataObject.Message ?? "UnknownError";
				const synthetic = this.errorRegistry;
				const baseExceptionSchema = synthetic.getBaseException();
				if (baseExceptionSchema) {
					const ErrorCtor = synthetic.getErrorCtor(baseExceptionSchema) ?? Error;
					throw this.decorateServiceException(Object.assign(new ErrorCtor({ name: errorName }), errorMetadata), dataObject);
				}
				const d = dataObject;
				const message = d?.message ?? d?.Message ?? d?.Error?.Message ?? d?.Error?.message;
				throw this.decorateServiceException(Object.assign(new Error(message), { name: errorName }, errorMetadata), dataObject);
			}
		}
		compose(composite, errorIdentifier, defaultNamespace) {
			let namespace = defaultNamespace;
			if (errorIdentifier.includes("#")) [namespace] = errorIdentifier.split("#");
			const staticRegistry = TypeRegistry.for(namespace);
			const defaultSyntheticRegistry = TypeRegistry.for("smithy.ts.sdk.synthetic." + defaultNamespace);
			composite.copyFrom(staticRegistry);
			composite.copyFrom(defaultSyntheticRegistry);
			this.errorRegistry = composite;
		}
		decorateServiceException(exception, additions = {}) {
			if (this.queryCompat) {
				const msg = exception.Message ?? additions.Message;
				const error = decorateServiceException(exception, additions);
				if (msg) error.message = msg;
				const errorObj = error.Error ?? {};
				errorObj.Type = error.Error?.Type;
				errorObj.Code = error.Error?.Code;
				errorObj.Message = error.Error?.message ?? error.Error?.Message ?? msg;
				error.Error = errorObj;
				const reqId = error.$metadata.requestId;
				if (reqId) error.RequestId = reqId;
				return error;
			}
			return decorateServiceException(exception, additions);
		}
		setQueryCompatError(output, response) {
			const queryErrorHeader = response.headers?.["x-amzn-query-error"];
			if (output !== void 0 && queryErrorHeader != null) {
				const [Code, Type] = queryErrorHeader.split(";");
				const keys = Object.keys(output);
				const Error = {
					Code,
					Type
				};
				output.Code = Code;
				output.Type = Type;
				for (let i = 0; i < keys.length; i++) {
					const k = keys[i];
					Error[k === "message" ? "Message" : k] = output[k];
				}
				delete Error.__type;
				output.Error = Error;
			}
		}
		queryCompatOutput(queryCompatErrorData, errorData) {
			if (queryCompatErrorData.Error) errorData.Error = queryCompatErrorData.Error;
			if (queryCompatErrorData.Type) errorData.Type = queryCompatErrorData.Type;
			if (queryCompatErrorData.Code) errorData.Code = queryCompatErrorData.Code;
		}
		findQueryCompatibleError(registry, errorName) {
			try {
				return registry.getSchema(errorName);
			} catch (e) {
				return registry.find((schema) => NormalizedSchema.of(schema).getMergedTraits().awsQueryError?.[0] === errorName);
			}
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/xml-builder/dist-cjs/index.js
var require_dist_cjs$37 = /* @__PURE__ */ __commonJSMin(((exports) => {
	const ATTR_ESCAPE_RE = /[&<>"]/g;
	const ATTR_ESCAPE_MAP = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;"
	};
	function escapeAttribute(value) {
		return value.replace(ATTR_ESCAPE_RE, (ch) => ATTR_ESCAPE_MAP[ch]);
	}
	const ELEMENT_ESCAPE_RE = /[&"'<>\r\n\u0085\u2028]/g;
	const ELEMENT_ESCAPE_MAP = {
		"&": "&amp;",
		"\"": "&quot;",
		"'": "&apos;",
		"<": "&lt;",
		">": "&gt;",
		"\r": "&#x0D;",
		"\n": "&#x0A;",
		"": "&#x85;",
		"\u2028": "&#x2028;"
	};
	function escapeElement(value) {
		return value.replace(ELEMENT_ESCAPE_RE, (ch) => ELEMENT_ESCAPE_MAP[ch]);
	}
	var XmlText = class {
		value;
		constructor(value) {
			this.value = value;
		}
		toString() {
			return escapeElement("" + this.value);
		}
	};
	var XmlNode = class XmlNode {
		name;
		children;
		attributes = {};
		static of(name, childText, withName) {
			const node = new XmlNode(name);
			if (childText !== void 0) node.addChildNode(new XmlText(childText));
			if (withName !== void 0) node.withName(withName);
			return node;
		}
		constructor(name, children = []) {
			this.name = name;
			this.children = children;
		}
		withName(name) {
			this.name = name;
			return this;
		}
		addAttribute(name, value) {
			this.attributes[name] = value;
			return this;
		}
		addChildNode(child) {
			this.children.push(child);
			return this;
		}
		removeAttribute(name) {
			delete this.attributes[name];
			return this;
		}
		n(name) {
			this.name = name;
			return this;
		}
		c(child) {
			this.children.push(child);
			return this;
		}
		a(name, value) {
			if (value != null) this.attributes[name] = value;
			return this;
		}
		cc(input, field, withName = field) {
			if (input[field] != null) {
				const node = XmlNode.of(field, input[field]).withName(withName);
				this.c(node);
			}
		}
		l(input, listName, memberName, valueProvider) {
			if (input[listName] != null) valueProvider().map((node) => {
				node.withName(memberName);
				this.c(node);
			});
		}
		lc(input, listName, memberName, valueProvider) {
			if (input[listName] != null) {
				const nodes = valueProvider();
				const containerNode = new XmlNode(memberName);
				nodes.map((node) => {
					containerNode.c(node);
				});
				this.c(containerNode);
			}
		}
		toString() {
			const hasChildren = Boolean(this.children.length);
			let xmlText = `<${this.name}`;
			const attributes = this.attributes;
			for (const attributeName of Object.keys(attributes)) {
				const attribute = attributes[attributeName];
				if (attribute != null) xmlText += ` ${attributeName}="${escapeAttribute("" + attribute)}"`;
			}
			return xmlText += !hasChildren ? "/>" : `>${this.children.map((c) => c.toString()).join("")}</${this.name}>`;
		}
	};
	function writeKey(obj) {
		Object.defineProperty(obj, "__proto__", {
			value: void 0,
			writable: true,
			enumerable: true,
			configurable: true
		});
	}
	function parseXML(xml) {
		return new AwsXmlParser(xml).parse();
	}
	var AwsXmlParser = class AwsXmlParser {
		x;
		i = 0;
		z;
		constructor(x) {
			this.x = x;
			this.x = x.replace(/\r\n?/g, "\n");
			this.z = this.x.length;
		}
		parse() {
			const p = this;
			const { z } = p;
			while (p.i < z) {
				p.trim();
				if (p.i >= z) break;
				if (p.isNext("<?")) {
					p.readTo("?>");
					p.trim();
				} else if (p.isNext("<!--")) {
					p.readTo("-->");
					p.trim();
				} else if (p.isNext("<!DOCTYPE", false)) {
					p.skipDoctype();
					p.trim();
				} else if (p.x[p.i] === "<") {
					const root = p.parseTag();
					return { [root.tag]: root.value };
				} else throw new Error("@aws-sdk XML parse error: unexpected content.");
			}
			throw new Error("@aws-sdk XML parse error: no root element.");
		}
		isNext(s, caseSensitive = true) {
			const p = this;
			if (caseSensitive) return p.x.startsWith(s, p.i);
			return p.x.toLowerCase().startsWith(s.toLowerCase(), p.i);
		}
		readTo(stop) {
			const p = this;
			const _i = p.x.indexOf(stop, p.i);
			if (_i === -1) throw new Error(`@aws-sdk XML parse error: expected "${stop}" not found.`);
			const result = p.x.slice(p.i, _i);
			p.i = _i + stop.length;
			return result;
		}
		trim() {
			const p = this;
			while (p.i < p.z && " 	\r\n".includes(p.x[p.i])) ++p.i;
		}
		readAttrValue() {
			const p = this;
			const quote = p.x[p.i];
			++p.i;
			let value = "";
			while (p.i < p.z && p.x[p.i] !== quote) value += p.x[p.i++];
			++p.i;
			return p.decodeEntities(value);
		}
		parseTag() {
			const p = this;
			++p.i;
			let tag = "";
			while (p.i < p.z && !" 	\r\n>/".includes(p.x[p.i])) tag += p.x[p.i++];
			let hasAttrs = false;
			const attrs = {};
			while (p.i < p.z) {
				p.trim();
				if (">/".includes(p.x[p.i])) break;
				let name = "";
				while (p.i < p.z && !"= 	\r\n>/?".includes(p.x[p.i])) name += p.x[p.i++];
				p.trim();
				if (p.x[p.i] !== "=") break;
				++p.i;
				p.trim();
				if (name === "__proto__") writeKey(attrs);
				attrs[name] = p.readAttrValue();
				hasAttrs = true;
			}
			if (p.i >= p.z) throw new Error("@aws-sdk XML parse error: unexpected end of input.");
			if (p.x[p.i] === "/") {
				++p.i;
				if (p.i >= p.z || p.x[p.i] !== ">") throw new Error("@aws-sdk XML parse error: expected > at the end of self-closing tag.");
				++p.i;
				return {
					tag,
					value: hasAttrs ? attrs : ""
				};
			}
			if (p.x[p.i] !== ">") throw new Error("@aws-sdk XML parse error: expected > at the end of opening tag.");
			++p.i;
			const textParts = [];
			const childTags = [];
			let hasElementChild = false;
			while (p.i < p.z) {
				if (p.isNext("</")) break;
				if (p.x[p.i] === "<") if (p.isNext("<!--")) p.readTo("-->");
				else if (p.isNext("<![CDATA[")) {
					p.i += 9;
					textParts.push(p.readTo("]]>"));
				} else if (p.isNext("<?")) p.readTo("?>");
				else {
					hasElementChild = true;
					childTags.push(p.parseTag());
				}
				else {
					let text = "";
					while (p.i < p.z && p.x[p.i] !== "<") text += p.x[p.i++];
					textParts.push(p.decodeEntities(text));
				}
			}
			if (!p.isNext("</")) throw new Error(`@aws-sdk XML parse error: missing closing tag </${tag}>.`);
			p.i += 2;
			const closeTag = p.readTo(">").trim();
			if (closeTag !== tag) throw new Error(`@aws-sdk XML parse error: mismatched tags <${tag}> and </${closeTag}>.`);
			if (!hasAttrs && textParts.length === 0 && !hasElementChild) return {
				tag,
				value: ""
			};
			if (!hasAttrs && !hasElementChild) {
				const text = textParts.length === 1 ? textParts[0] : textParts.join("");
				if (text.trim() === "" && text.includes("\n")) return {
					tag,
					value: ""
				};
				return {
					tag,
					value: text
				};
			}
			const obj = {};
			for (const text of textParts) {
				if (text.trim() === "" && text.includes("\n")) continue;
				obj["#text"] = "#text" in obj ? obj["#text"] + text : text;
			}
			for (const child of childTags) {
				if (child.tag === "__proto__") writeKey(obj);
				if (child.tag in obj) if (Array.isArray(obj[child.tag])) obj[child.tag].push(child.value);
				else obj[child.tag] = [obj[child.tag], child.value];
				else obj[child.tag] = child.value;
			}
			for (const [k, v] of Object.entries(attrs)) {
				if (k === "__proto__") writeKey(obj);
				obj[k] = v;
			}
			return {
				tag,
				value: obj
			};
		}
		static ENTITIES = {
			amp: "&",
			lt: "<",
			gt: ">",
			quot: "\"",
			apos: "'"
		};
		skipDoctype() {
			const p = this;
			p.i += 9;
			let depth = 0;
			while (p.i < p.z) {
				const c = p.x[p.i];
				if (c === "[") ++depth;
				else if (c === "]") --depth;
				else if (c === ">" && depth === 0) {
					++p.i;
					return;
				}
				++p.i;
			}
			throw new Error("@aws-sdk XML parse error: unclosed DOCTYPE.");
		}
		decodeEntities(s) {
			return s.replace(/&(?:#x([0-9a-fA-F]{1,6})|#(\d{1,7})|([a-zA-Z][a-zA-Z0-9]{0,30}));/g, (_, hex, dec, named) => {
				if (hex) return String.fromCharCode(parseInt(hex, 16));
				if (dec) return String.fromCharCode(parseInt(dec, 10));
				return AwsXmlParser.ENTITIES[named] ?? "";
			});
		}
	};
	exports.XmlNode = XmlNode;
	exports.XmlText = XmlText;
	exports.parseXML = parseXML;
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/protocols/ConfigurableSerdeContext.js
var SerdeContextConfig;
var init_ConfigurableSerdeContext = __esmMin((() => {
	SerdeContextConfig = class {
		serdeContext;
		setSerdeContext(serdeContext) {
			this.serdeContext = serdeContext;
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/protocols/UnionSerde.js
var UnionSerde;
var init_UnionSerde = __esmMin((() => {
	UnionSerde = class {
		from;
		to;
		keys;
		constructor(from, to) {
			this.from = from;
			this.to = to;
			const keys = Object.keys(this.from);
			const set = new Set(keys);
			set.delete("__type");
			this.keys = set;
		}
		mark(key) {
			this.keys.delete(key);
		}
		hasUnknown() {
			return this.keys.size === 1 && Object.keys(this.to).length === 0;
		}
		writeUnknown() {
			if (this.hasUnknown()) {
				const k = this.keys.values().next().value;
				const v = this.from[k];
				this.to.$unknown = [k, v];
			}
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/protocols/writeKey.js
function writeKey(obj) {
	Object.defineProperty(obj, "__proto__", {
		value: void 0,
		writable: true,
		enumerable: true,
		configurable: true
	});
}
var init_writeKey = __esmMin((() => {}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/protocols/xml/XmlShapeDeserializer.js
var import_dist_cjs$5, XmlShapeDeserializer;
var init_XmlShapeDeserializer = __esmMin((() => {
	import_dist_cjs$5 = require_dist_cjs$37();
	init_client$1();
	init_protocols$1();
	init_schema();
	init_serde();
	init_ConfigurableSerdeContext();
	init_UnionSerde();
	init_writeKey();
	XmlShapeDeserializer = class extends SerdeContextConfig {
		settings;
		stringDeserializer;
		constructor(settings) {
			super();
			this.settings = settings;
			this.stringDeserializer = new FromStringShapeDeserializer(settings);
		}
		setSerdeContext(serdeContext) {
			this.serdeContext = serdeContext;
			this.stringDeserializer.setSerdeContext(serdeContext);
		}
		read(schema, bytes, key) {
			const ns = NormalizedSchema.of(schema);
			const memberSchemas = ns.getMemberSchemas();
			if (ns.isStructSchema() && ns.isMemberSchema() && !!Object.values(memberSchemas).find((memberNs) => {
				return !!memberNs.getMemberTraits().eventPayload;
			})) {
				const output = {};
				const memberName = Object.keys(memberSchemas)[0];
				if (memberSchemas[memberName].isBlobSchema()) output[memberName] = bytes;
				else output[memberName] = this.read(memberSchemas[memberName], bytes);
				return output;
			}
			const xmlString = (this.serdeContext?.utf8Encoder ?? toUtf8)(bytes);
			const parsedObject = this.parseXml(xmlString);
			return this.readSchema(schema, key ? parsedObject[key] : parsedObject);
		}
		readSchema(_schema, value) {
			const ns = NormalizedSchema.of(_schema);
			if (ns.isUnitSchema()) return;
			const traits = ns.getMergedTraits();
			if (ns.isListSchema() && !Array.isArray(value)) return this.readSchema(ns, [value]);
			if (value == null) return value;
			if (typeof value === "object") {
				const flat = !!traits.xmlFlattened;
				if (ns.isListSchema()) {
					const listValue = ns.getValueSchema();
					const buffer = [];
					const sourceKey = listValue.getMergedTraits().xmlName ?? "member";
					const source = flat ? value : (value[0] ?? value)[sourceKey];
					if (source == null) return buffer;
					const sourceArray = Array.isArray(source) ? source : [source];
					for (const v of sourceArray) buffer.push(this.readSchema(listValue, v));
					return buffer;
				}
				const buffer = {};
				if (ns.isMapSchema()) {
					const keyNs = ns.getKeySchema();
					const memberNs = ns.getValueSchema();
					let entries;
					if (flat) entries = Array.isArray(value) ? value : [value];
					else entries = Array.isArray(value.entry) ? value.entry : [value.entry];
					const keyProperty = keyNs.getMergedTraits().xmlName ?? "key";
					const valueProperty = memberNs.getMergedTraits().xmlName ?? "value";
					for (const entry of entries) {
						const key = entry[keyProperty];
						const value = entry[valueProperty];
						if (key === "__proto__") writeKey(buffer);
						buffer[key] = this.readSchema(memberNs, value);
					}
					return buffer;
				}
				if (ns.isStructSchema()) {
					const union = ns.isUnionSchema();
					let unionSerde;
					if (union) unionSerde = new UnionSerde(value, buffer);
					for (const [memberName, memberSchema] of ns.structIterator()) {
						const memberTraits = memberSchema.getMergedTraits();
						const xmlObjectKey = !memberTraits.httpPayload ? memberSchema.getMemberTraits().xmlName ?? memberName : memberTraits.xmlName ?? memberSchema.getName();
						if (union) unionSerde.mark(xmlObjectKey);
						if (value[xmlObjectKey] != null) buffer[memberName] = this.readSchema(memberSchema, value[xmlObjectKey]);
					}
					if (union) unionSerde.writeUnknown();
					return buffer;
				}
				if (ns.isDocumentSchema()) return value;
				throw new Error(`@aws-sdk/core/protocols - xml deserializer unhandled schema type for ${ns.getName(true)}`);
			}
			if (ns.isListSchema()) return [];
			if (ns.isMapSchema() || ns.isStructSchema()) return {};
			return this.stringDeserializer.read(ns, value);
		}
		parseXml(xml) {
			if (xml.length) {
				let parsedObj;
				try {
					parsedObj = (0, import_dist_cjs$5.parseXML)(xml);
				} catch (e) {
					if (e && typeof e === "object") Object.defineProperty(e, "$responseBodyText", { value: xml });
					throw e;
				}
				const textNodeName = "#text";
				const key = Object.keys(parsedObj)[0];
				const parsedObjToReturn = parsedObj[key];
				if (parsedObjToReturn[textNodeName]) {
					parsedObjToReturn[key] = parsedObjToReturn[textNodeName];
					delete parsedObjToReturn[textNodeName];
				}
				return getValueFromTextNode(parsedObjToReturn);
			}
			return {};
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/protocols/xml/parseXmlBody.js
var loadRestXmlErrorCode;
var init_parseXmlBody = __esmMin((() => {
	loadRestXmlErrorCode = (output, data) => {
		if (data?.Error?.Code !== void 0) return data.Error.Code;
		if (data?.Code !== void 0) return data.Code;
		if (output.statusCode == 404) return "NotFound";
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/protocols/xml/XmlShapeSerializer.js
var import_dist_cjs$4, XmlShapeSerializer;
var init_XmlShapeSerializer = __esmMin((() => {
	import_dist_cjs$4 = require_dist_cjs$37();
	init_protocols$1();
	init_schema();
	init_serde();
	init_ConfigurableSerdeContext();
	XmlShapeSerializer = class extends SerdeContextConfig {
		settings;
		stringBuffer;
		byteBuffer;
		buffer;
		constructor(settings) {
			super();
			this.settings = settings;
		}
		write(schema, value) {
			const ns = NormalizedSchema.of(schema);
			if (ns.isStringSchema() && typeof value === "string") this.stringBuffer = value;
			else if (ns.isBlobSchema()) this.byteBuffer = "byteLength" in value ? value : (this.serdeContext?.base64Decoder ?? fromBase64)(value);
			else {
				this.buffer = this.writeStruct(ns, value, void 0);
				const traits = ns.getMergedTraits();
				if (traits.httpPayload && !traits.xmlName) this.buffer.withName(ns.getName());
			}
		}
		flush() {
			if (this.byteBuffer !== void 0) {
				const bytes = this.byteBuffer;
				delete this.byteBuffer;
				return bytes;
			}
			if (this.stringBuffer !== void 0) {
				const str = this.stringBuffer;
				delete this.stringBuffer;
				return str;
			}
			const buffer = this.buffer;
			if (this.settings.xmlNamespace) {
				if (!buffer?.attributes?.["xmlns"]) buffer.addAttribute("xmlns", this.settings.xmlNamespace);
			}
			delete this.buffer;
			return buffer.toString();
		}
		writeStruct(ns, value, parentXmlns) {
			const traits = ns.getMergedTraits();
			const name = ns.isMemberSchema() && !traits.httpPayload ? ns.getMemberTraits().xmlName ?? ns.getMemberName() : traits.xmlName ?? ns.getName();
			if (!name || !ns.isStructSchema()) throw new Error(`@aws-sdk/core/protocols - xml serializer, cannot write struct with empty name or non-struct, schema=${ns.getName(true)}.`);
			const structXmlNode = import_dist_cjs$4.XmlNode.of(name);
			const [xmlnsAttr, xmlns] = this.getXmlnsAttribute(ns, parentXmlns);
			for (const [memberName, memberSchema] of ns.structIterator()) {
				const val = value[memberName];
				if (val != null || memberSchema.isIdempotencyToken()) {
					if (memberSchema.getMergedTraits().xmlAttribute) {
						structXmlNode.addAttribute(memberSchema.getMergedTraits().xmlName ?? memberName, this.writeSimple(memberSchema, val));
						continue;
					}
					if (memberSchema.isListSchema()) this.writeList(memberSchema, val, structXmlNode, xmlns);
					else if (memberSchema.isMapSchema()) this.writeMap(memberSchema, val, structXmlNode, xmlns);
					else if (memberSchema.isStructSchema()) structXmlNode.addChildNode(this.writeStruct(memberSchema, val, xmlns));
					else {
						const memberNode = import_dist_cjs$4.XmlNode.of(memberSchema.getMergedTraits().xmlName ?? memberSchema.getMemberName());
						this.writeSimpleInto(memberSchema, val, memberNode, xmlns);
						structXmlNode.addChildNode(memberNode);
					}
				}
			}
			const { $unknown } = value;
			if ($unknown && ns.isUnionSchema() && Array.isArray($unknown) && Object.keys(value).length === 1) {
				const [k, v] = $unknown;
				const node = import_dist_cjs$4.XmlNode.of(k);
				if (typeof v !== "string") if (value instanceof import_dist_cjs$4.XmlNode || value instanceof import_dist_cjs$4.XmlText) structXmlNode.addChildNode(value);
				else throw new Error("@aws-sdk - $unknown union member in XML requires value of type string, @aws-sdk/xml-builder::XmlNode or XmlText.");
				this.writeSimpleInto(0, v, node, xmlns);
				structXmlNode.addChildNode(node);
			}
			if (xmlns) structXmlNode.addAttribute(xmlnsAttr, xmlns);
			return structXmlNode;
		}
		writeList(listMember, array, container, parentXmlns) {
			if (!listMember.isMemberSchema()) throw new Error(`@aws-sdk/core/protocols - xml serializer, cannot write non-member list: ${listMember.getName(true)}`);
			const listTraits = listMember.getMergedTraits();
			const listValueSchema = listMember.getValueSchema();
			const listValueTraits = listValueSchema.getMergedTraits();
			const sparse = !!listValueTraits.sparse;
			const flat = !!listTraits.xmlFlattened;
			const [xmlnsAttr, xmlns] = this.getXmlnsAttribute(listMember, parentXmlns);
			const writeItem = (container, value) => {
				if (listValueSchema.isListSchema()) this.writeList(listValueSchema, Array.isArray(value) ? value : [value], container, xmlns);
				else if (listValueSchema.isMapSchema()) this.writeMap(listValueSchema, value, container, xmlns);
				else if (listValueSchema.isStructSchema()) {
					const struct = this.writeStruct(listValueSchema, value, xmlns);
					container.addChildNode(struct.withName(flat ? listTraits.xmlName ?? listMember.getMemberName() : listValueTraits.xmlName ?? "member"));
				} else {
					const listItemNode = import_dist_cjs$4.XmlNode.of(flat ? listTraits.xmlName ?? listMember.getMemberName() : listValueTraits.xmlName ?? "member");
					this.writeSimpleInto(listValueSchema, value, listItemNode, xmlns);
					container.addChildNode(listItemNode);
				}
			};
			if (flat) {
				for (const value of array) if (sparse || value != null) writeItem(container, value);
			} else {
				const listNode = import_dist_cjs$4.XmlNode.of(listTraits.xmlName ?? listMember.getMemberName());
				if (xmlns) listNode.addAttribute(xmlnsAttr, xmlns);
				for (const value of array) if (sparse || value != null) writeItem(listNode, value);
				container.addChildNode(listNode);
			}
		}
		writeMap(mapMember, map, container, parentXmlns, containerIsMap = false) {
			if (!mapMember.isMemberSchema()) throw new Error(`@aws-sdk/core/protocols - xml serializer, cannot write non-member map: ${mapMember.getName(true)}`);
			const mapTraits = mapMember.getMergedTraits();
			const mapKeySchema = mapMember.getKeySchema();
			const keyTag = mapKeySchema.getMergedTraits().xmlName ?? "key";
			const mapValueSchema = mapMember.getValueSchema();
			const mapValueTraits = mapValueSchema.getMergedTraits();
			const valueTag = mapValueTraits.xmlName ?? "value";
			const sparse = !!mapValueTraits.sparse;
			const flat = !!mapTraits.xmlFlattened;
			const [xmlnsAttr, xmlns] = this.getXmlnsAttribute(mapMember, parentXmlns);
			const addKeyValue = (entry, key, val) => {
				const keyNode = import_dist_cjs$4.XmlNode.of(keyTag, key);
				const [keyXmlnsAttr, keyXmlns] = this.getXmlnsAttribute(mapKeySchema, xmlns);
				if (keyXmlns) keyNode.addAttribute(keyXmlnsAttr, keyXmlns);
				entry.addChildNode(keyNode);
				let valueNode = import_dist_cjs$4.XmlNode.of(valueTag);
				if (mapValueSchema.isListSchema()) this.writeList(mapValueSchema, val, valueNode, xmlns);
				else if (mapValueSchema.isMapSchema()) this.writeMap(mapValueSchema, val, valueNode, xmlns, true);
				else if (mapValueSchema.isStructSchema()) valueNode = this.writeStruct(mapValueSchema, val, xmlns);
				else this.writeSimpleInto(mapValueSchema, val, valueNode, xmlns);
				entry.addChildNode(valueNode);
			};
			if (flat) for (const key in map) {
				const val = map[key];
				if (sparse || val != null) {
					const entry = import_dist_cjs$4.XmlNode.of(mapTraits.xmlName ?? mapMember.getMemberName());
					addKeyValue(entry, key, val);
					container.addChildNode(entry);
				}
			}
			else {
				let mapNode;
				if (!containerIsMap) {
					mapNode = import_dist_cjs$4.XmlNode.of(mapTraits.xmlName ?? mapMember.getMemberName());
					if (xmlns) mapNode.addAttribute(xmlnsAttr, xmlns);
					container.addChildNode(mapNode);
				}
				for (const key in map) {
					const val = map[key];
					if (sparse || val != null) {
						const entry = import_dist_cjs$4.XmlNode.of("entry");
						addKeyValue(entry, key, val);
						(containerIsMap ? container : mapNode).addChildNode(entry);
					}
				}
			}
		}
		writeSimple(_schema, value) {
			if (null === value) throw new Error("@aws-sdk/core/protocols - (XML serializer) cannot write null value.");
			const ns = NormalizedSchema.of(_schema);
			let nodeContents = null;
			if (value && typeof value === "object") if (ns.isBlobSchema()) nodeContents = (this.serdeContext?.base64Encoder ?? toBase64)(value);
			else if (ns.isTimestampSchema() && value instanceof Date) switch (determineTimestampFormat(ns, this.settings)) {
				case 5:
					nodeContents = value.toISOString().replace(".000Z", "Z");
					break;
				case 6:
					nodeContents = dateToUtcString(value);
					break;
				case 7:
					nodeContents = String(value.getTime() / 1e3);
					break;
				default:
					console.warn("Missing timestamp format, using http date", value);
					nodeContents = dateToUtcString(value);
					break;
			}
			else if (ns.isBigDecimalSchema() && value) {
				if (value instanceof NumericValue) return value.string;
				return String(value);
			} else if (ns.isMapSchema() || ns.isListSchema()) throw new Error("@aws-sdk/core/protocols - xml serializer, cannot call _write() on List/Map schema, call writeList or writeMap() instead.");
			else throw new Error(`@aws-sdk/core/protocols - xml serializer, unhandled schema type for object value and schema: ${ns.getName(true)}`);
			if (ns.isBooleanSchema() || ns.isNumericSchema() || ns.isBigIntegerSchema() || ns.isBigDecimalSchema()) nodeContents = String(value);
			if (ns.isStringSchema()) if (value === void 0 && ns.isIdempotencyToken()) nodeContents = generateIdempotencyToken();
			else nodeContents = String(value);
			if (nodeContents === null) throw new Error(`Unhandled schema-value pair ${ns.getName(true)}=${value}`);
			return nodeContents;
		}
		writeSimpleInto(_schema, value, into, parentXmlns) {
			const nodeContents = this.writeSimple(_schema, value);
			const ns = NormalizedSchema.of(_schema);
			const content = new import_dist_cjs$4.XmlText(nodeContents);
			const [xmlnsAttr, xmlns] = this.getXmlnsAttribute(ns, parentXmlns);
			if (xmlns) into.addAttribute(xmlnsAttr, xmlns);
			into.addChildNode(content);
		}
		getXmlnsAttribute(ns, parentXmlns) {
			const [prefix, xmlns] = ns.getMergedTraits().xmlNamespace ?? [];
			if (xmlns && xmlns !== parentXmlns) return [prefix ? `xmlns:${prefix}` : "xmlns", xmlns];
			return [void 0, void 0];
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/protocols/xml/XmlCodec.js
var XmlCodec;
var init_XmlCodec = __esmMin((() => {
	init_ConfigurableSerdeContext();
	init_XmlShapeDeserializer();
	init_XmlShapeSerializer();
	XmlCodec = class extends SerdeContextConfig {
		settings;
		constructor(settings) {
			super();
			this.settings = settings;
		}
		createSerializer() {
			const serializer = new XmlShapeSerializer(this.settings);
			serializer.setSerdeContext(this.serdeContext);
			return serializer;
		}
		createDeserializer() {
			const deserializer = new XmlShapeDeserializer(this.settings);
			deserializer.setSerdeContext(this.serdeContext);
			return deserializer;
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/protocols/xml/AwsRestXmlProtocol.js
var AwsRestXmlProtocol;
var init_AwsRestXmlProtocol = __esmMin((() => {
	init_protocols$1();
	init_schema();
	init_ProtocolLib();
	init_parseXmlBody();
	init_XmlCodec();
	AwsRestXmlProtocol = class extends HttpBindingProtocol {
		codec;
		serializer;
		deserializer;
		mixin = new ProtocolLib();
		constructor(options) {
			super(options);
			const settings = {
				timestampFormat: {
					useTrait: true,
					default: 5
				},
				httpBindings: true,
				xmlNamespace: options.xmlNamespace,
				serviceNamespace: options.defaultNamespace
			};
			this.codec = new XmlCodec(settings);
			this.serializer = new HttpInterceptingShapeSerializer(this.codec.createSerializer(), settings);
			this.deserializer = new HttpInterceptingShapeDeserializer(this.codec.createDeserializer(), settings);
		}
		getPayloadCodec() {
			return this.codec;
		}
		getShapeId() {
			return "aws.protocols#restXml";
		}
		async serializeRequest(operationSchema, input, context) {
			const request = await super.serializeRequest(operationSchema, input, context);
			const inputSchema = NormalizedSchema.of(operationSchema.input);
			if (!request.headers["content-type"]) {
				const contentType = this.mixin.resolveRestContentType(this.getDefaultContentType(), inputSchema);
				if (contentType) request.headers["content-type"] = contentType;
			}
			if (typeof request.body === "string" && request.headers["content-type"] === this.getDefaultContentType() && !request.body.startsWith("<?xml ") && !this.hasUnstructuredPayloadBinding(inputSchema)) request.body = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" + request.body;
			return request;
		}
		async deserializeResponse(operationSchema, context, response) {
			return super.deserializeResponse(operationSchema, context, response);
		}
		async handleError(operationSchema, context, response, dataObject, metadata) {
			const errorIdentifier = loadRestXmlErrorCode(response, dataObject) ?? "Unknown";
			this.mixin.compose(this.compositeErrorRegistry, errorIdentifier, this.options.defaultNamespace);
			if (dataObject.Error && typeof dataObject.Error === "object") for (const key of Object.keys(dataObject.Error)) {
				dataObject[key] = dataObject.Error[key];
				if (key.toLowerCase() === "message") dataObject.message = dataObject.Error[key];
			}
			if (dataObject.RequestId && !metadata.requestId) metadata.requestId = dataObject.RequestId;
			const { errorSchema, errorMetadata } = await this.mixin.getErrorSchemaOrThrowBaseException(errorIdentifier, this.options.defaultNamespace, response, dataObject, metadata);
			const ns = NormalizedSchema.of(errorSchema);
			const message = dataObject.Error?.message ?? dataObject.Error?.Message ?? dataObject.message ?? dataObject.Message ?? "UnknownError";
			const exception = new ((this.compositeErrorRegistry.getErrorCtor(errorSchema)) ?? Error)({});
			await this.deserializeHttpMessage(errorSchema, context, response, dataObject);
			const output = {};
			const errorDeserializer = this.codec.createDeserializer();
			for (const [name, member] of ns.structIterator()) {
				const target = member.getMergedTraits().xmlName ?? name;
				const value = dataObject.Error?.[target] ?? dataObject[target];
				output[name] = errorDeserializer.readSchema(member, value);
			}
			throw this.mixin.decorateServiceException(Object.assign(exception, errorMetadata, {
				$fault: ns.getMergedTraits().error,
				message
			}, output), dataObject);
		}
		getDefaultContentType() {
			return "application/xml";
		}
		hasUnstructuredPayloadBinding(ns) {
			for (const [, member] of ns.structIterator()) if (member.getMergedTraits().httpPayload) return !(member.isStructSchema() || member.isMapSchema() || member.isListSchema());
			return false;
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/protocols/index.js
var init_protocols = __esmMin((() => {
	init_AwsRestXmlProtocol();
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/protocol/S3RestXmlProtocol.js
var S3RestXmlProtocol;
var init_S3RestXmlProtocol = __esmMin((() => {
	init_protocols();
	init_schema();
	S3RestXmlProtocol = class extends AwsRestXmlProtocol {
		async serializeRequest(operationSchema, input, context) {
			const request = await super.serializeRequest(operationSchema, input, context);
			const ns = NormalizedSchema.of(operationSchema.input);
			const staticStructureSchema = ns.getSchema();
			let bucketMemberIndex = 0;
			const requiredMemberCount = staticStructureSchema[6] ?? 0;
			if (input && typeof input === "object") for (const [memberName, memberNs] of ns.structIterator()) {
				if (++bucketMemberIndex > requiredMemberCount) break;
				if (memberName === "Bucket") {
					if (!input.Bucket && memberNs.getMergedTraits().httpLabel) throw new Error(`No value provided for input HTTP label: Bucket.`);
					break;
				}
			}
			return request;
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/NodeDisableMultiregionAccessPointConfigOptions.js
var NODE_DISABLE_MULTIREGION_ACCESS_POINT_ENV_NAME, NODE_DISABLE_MULTIREGION_ACCESS_POINT_INI_NAME, NODE_DISABLE_MULTIREGION_ACCESS_POINT_CONFIG_OPTIONS;
var init_NodeDisableMultiregionAccessPointConfigOptions = __esmMin((() => {
	init_config$1();
	NODE_DISABLE_MULTIREGION_ACCESS_POINT_ENV_NAME = "AWS_S3_DISABLE_MULTIREGION_ACCESS_POINTS";
	NODE_DISABLE_MULTIREGION_ACCESS_POINT_INI_NAME = "s3_disable_multiregion_access_points";
	NODE_DISABLE_MULTIREGION_ACCESS_POINT_CONFIG_OPTIONS = {
		environmentVariableSelector: (env) => booleanSelector(env, NODE_DISABLE_MULTIREGION_ACCESS_POINT_ENV_NAME, SelectorType$1.ENV),
		configFileSelector: (profile) => booleanSelector(profile, NODE_DISABLE_MULTIREGION_ACCESS_POINT_INI_NAME, SelectorType$1.CONFIG),
		default: false
	};
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/NodeUseArnRegionConfigOptions.js
var NODE_USE_ARN_REGION_ENV_NAME, NODE_USE_ARN_REGION_INI_NAME, NODE_USE_ARN_REGION_CONFIG_OPTIONS;
var init_NodeUseArnRegionConfigOptions = __esmMin((() => {
	init_config$1();
	NODE_USE_ARN_REGION_ENV_NAME = "AWS_S3_USE_ARN_REGION";
	NODE_USE_ARN_REGION_INI_NAME = "s3_use_arn_region";
	NODE_USE_ARN_REGION_CONFIG_OPTIONS = {
		environmentVariableSelector: (env) => booleanSelector(env, NODE_USE_ARN_REGION_ENV_NAME, SelectorType$1.ENV),
		configFileSelector: (profile) => booleanSelector(profile, NODE_USE_ARN_REGION_INI_NAME, SelectorType$1.CONFIG),
		default: void 0
	};
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-bucket-endpoint/bucketHostnameUtils.js
var DOMAIN_PATTERN, IP_ADDRESS_PATTERN, DOTS_PATTERN, DOT_PATTERN, S3_HOSTNAME_PATTERN, S3_US_EAST_1_ALTNAME_PATTERN, AWS_PARTITION_SUFFIX, isBucketNameOptions, isDnsCompatibleBucketName, getRegionalSuffix, getSuffix, getSuffixForArnEndpoint, validateArnEndpointOptions, validateService, validateS3Service, validateOutpostService, validatePartition, validateRegion, validateRegionalClient, validateAccountId, validateDNSHostLabel, validateCustomEndpoint, getArnResources, validateNoDualstack, validateNoFIPS, validateMrapAlias;
var init_bucketHostnameUtils = __esmMin((() => {
	DOMAIN_PATTERN = /^[a-z0-9][a-z0-9\.\-]{1,61}[a-z0-9]$/;
	IP_ADDRESS_PATTERN = /(\d+\.){3}\d+/;
	DOTS_PATTERN = /\.\./;
	DOT_PATTERN = /\./;
	S3_HOSTNAME_PATTERN = /^(.+\.)?s3(-fips)?(\.dualstack)?[.-]([a-z0-9-]+)\./;
	S3_US_EAST_1_ALTNAME_PATTERN = /^s3(-external-1)?\.amazonaws\.com$/;
	AWS_PARTITION_SUFFIX = "amazonaws.com";
	isBucketNameOptions = (options) => typeof options.bucketName === "string";
	isDnsCompatibleBucketName = (bucketName) => DOMAIN_PATTERN.test(bucketName) && !IP_ADDRESS_PATTERN.test(bucketName) && !DOTS_PATTERN.test(bucketName);
	getRegionalSuffix = (hostname) => {
		const parts = hostname.match(S3_HOSTNAME_PATTERN);
		return [parts[4], hostname.replace(new RegExp(`^${parts[0]}`), "")];
	};
	getSuffix = (hostname) => S3_US_EAST_1_ALTNAME_PATTERN.test(hostname) ? ["us-east-1", AWS_PARTITION_SUFFIX] : getRegionalSuffix(hostname);
	getSuffixForArnEndpoint = (hostname) => S3_US_EAST_1_ALTNAME_PATTERN.test(hostname) ? [hostname.replace(`.${AWS_PARTITION_SUFFIX}`, ""), AWS_PARTITION_SUFFIX] : getRegionalSuffix(hostname);
	validateArnEndpointOptions = (options) => {
		if (options.pathStyleEndpoint) throw new Error("Path-style S3 endpoint is not supported when bucket is an ARN");
		if (options.accelerateEndpoint) throw new Error("Accelerate endpoint is not supported when bucket is an ARN");
		if (!options.tlsCompatible) throw new Error("HTTPS is required when bucket is an ARN");
	};
	validateService = (service) => {
		if (service !== "s3" && service !== "s3-outposts" && service !== "s3-object-lambda") throw new Error("Expect 's3' or 's3-outposts' or 's3-object-lambda' in ARN service component");
	};
	validateS3Service = (service) => {
		if (service !== "s3") throw new Error("Expect 's3' in Accesspoint ARN service component");
	};
	validateOutpostService = (service) => {
		if (service !== "s3-outposts") throw new Error("Expect 's3-posts' in Outpost ARN service component");
	};
	validatePartition = (partition, options) => {
		if (partition !== options.clientPartition) throw new Error(`Partition in ARN is incompatible, got "${partition}" but expected "${options.clientPartition}"`);
	};
	validateRegion = (region, options) => {};
	validateRegionalClient = (region) => {
		if (["s3-external-1", "aws-global"].includes(region)) throw new Error(`Client region ${region} is not regional`);
	};
	validateAccountId = (accountId) => {
		if (!/[0-9]{12}/.exec(accountId)) throw new Error("Access point ARN accountID does not match regex '[0-9]{12}'");
	};
	validateDNSHostLabel = (label, options = { tlsCompatible: true }) => {
		if (label.length >= 64 || !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(label) || /(\d+\.){3}\d+/.test(label) || /[.-]{2}/.test(label) || options?.tlsCompatible && DOT_PATTERN.test(label)) throw new Error(`Invalid DNS label ${label}`);
	};
	validateCustomEndpoint = (options) => {
		if (options.isCustomEndpoint) {
			if (options.dualstackEndpoint) throw new Error("Dualstack endpoint is not supported with custom endpoint");
			if (options.accelerateEndpoint) throw new Error("Accelerate endpoint is not supported with custom endpoint");
		}
	};
	getArnResources = (resource) => {
		const delimiter = resource.includes(":") ? ":" : "/";
		const [resourceType, ...rest] = resource.split(delimiter);
		if (resourceType === "accesspoint") {
			if (rest.length !== 1 || rest[0] === "") throw new Error(`Access Point ARN should have one resource accesspoint${delimiter}{accesspointname}`);
			return { accesspointName: rest[0] };
		} else if (resourceType === "outpost") {
			if (!rest[0] || rest[1] !== "accesspoint" || !rest[2] || rest.length !== 3) throw new Error(`Outpost ARN should have resource outpost${delimiter}{outpostId}${delimiter}accesspoint${delimiter}{accesspointName}`);
			const [outpostId, _, accesspointName] = rest;
			return {
				outpostId,
				accesspointName
			};
		} else throw new Error(`ARN resource should begin with 'accesspoint${delimiter}' or 'outpost${delimiter}'`);
	};
	validateNoDualstack = (dualstackEndpoint) => {};
	validateNoFIPS = (useFipsEndpoint) => {
		if (useFipsEndpoint) throw new Error(`FIPS region is not supported with Outpost.`);
	};
	validateMrapAlias = (name) => {
		try {
			name.split(".").forEach((label) => {
				validateDNSHostLabel(label);
			});
		} catch (e) {
			throw new Error(`"${name}" is not a DNS compatible name.`);
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-bucket-endpoint/bucketHostname.js
var bucketHostname, getEndpointFromBucketName, getEndpointFromArn, getEndpointFromObjectLambdaArn, getEndpointFromMRAPArn, getEndpointFromOutpostArn, getEndpointFromAccessPointArn;
var init_bucketHostname = __esmMin((() => {
	init_bucketHostnameUtils();
	bucketHostname = (options) => {
		validateCustomEndpoint(options);
		return isBucketNameOptions(options) ? getEndpointFromBucketName(options) : getEndpointFromArn(options);
	};
	getEndpointFromBucketName = ({ accelerateEndpoint = false, clientRegion: region, baseHostname, bucketName, dualstackEndpoint = false, fipsEndpoint = false, pathStyleEndpoint = false, tlsCompatible = true, isCustomEndpoint = false }) => {
		const [clientRegion, hostnameSuffix] = isCustomEndpoint ? [region, baseHostname] : getSuffix(baseHostname);
		if (pathStyleEndpoint || !isDnsCompatibleBucketName(bucketName) || tlsCompatible && DOT_PATTERN.test(bucketName)) return {
			bucketEndpoint: false,
			hostname: dualstackEndpoint ? `s3.dualstack.${clientRegion}.${hostnameSuffix}` : baseHostname
		};
		if (accelerateEndpoint) baseHostname = `s3-accelerate${dualstackEndpoint ? ".dualstack" : ""}.${hostnameSuffix}`;
		else if (dualstackEndpoint) baseHostname = `s3.dualstack.${clientRegion}.${hostnameSuffix}`;
		return {
			bucketEndpoint: true,
			hostname: `${bucketName}.${baseHostname}`
		};
	};
	getEndpointFromArn = (options) => {
		const { isCustomEndpoint, baseHostname, clientRegion } = options;
		const hostnameSuffix = isCustomEndpoint ? baseHostname : getSuffixForArnEndpoint(baseHostname)[1];
		const { pathStyleEndpoint, accelerateEndpoint = false, fipsEndpoint = false, tlsCompatible = true, bucketName, clientPartition = "aws" } = options;
		validateArnEndpointOptions({
			pathStyleEndpoint,
			accelerateEndpoint,
			tlsCompatible
		});
		const { service, partition, accountId, region, resource } = bucketName;
		validateService(service);
		validatePartition(partition, { clientPartition });
		validateAccountId(accountId);
		const { accesspointName, outpostId } = getArnResources(resource);
		if (service === "s3-object-lambda") return getEndpointFromObjectLambdaArn({
			...options,
			tlsCompatible,
			bucketName,
			accesspointName,
			hostnameSuffix
		});
		if (region === "") return getEndpointFromMRAPArn({
			...options,
			clientRegion,
			mrapAlias: accesspointName,
			hostnameSuffix
		});
		if (outpostId) return getEndpointFromOutpostArn({
			...options,
			clientRegion,
			outpostId,
			accesspointName,
			hostnameSuffix
		});
		return getEndpointFromAccessPointArn({
			...options,
			clientRegion,
			accesspointName,
			hostnameSuffix
		});
	};
	getEndpointFromObjectLambdaArn = ({ dualstackEndpoint = false, fipsEndpoint = false, tlsCompatible = true, useArnRegion, clientRegion, clientSigningRegion = clientRegion, accesspointName, bucketName, hostnameSuffix }) => {
		const { accountId, region, service } = bucketName;
		validateRegionalClient(clientRegion);
		const DNSHostLabel = `${accesspointName}-${accountId}`;
		validateDNSHostLabel(DNSHostLabel, { tlsCompatible });
		const endpointRegion = useArnRegion ? region : clientRegion;
		const signingRegion = useArnRegion ? region : clientSigningRegion;
		return {
			bucketEndpoint: true,
			hostname: `${DNSHostLabel}.${service}${fipsEndpoint ? "-fips" : ""}.${endpointRegion}.${hostnameSuffix}`,
			signingRegion,
			signingService: service
		};
	};
	getEndpointFromMRAPArn = ({ disableMultiregionAccessPoints, dualstackEndpoint = false, isCustomEndpoint, mrapAlias, hostnameSuffix }) => {
		if (disableMultiregionAccessPoints === true) throw new Error("SDK is attempting to use a MRAP ARN. Please enable to feature.");
		validateMrapAlias(mrapAlias);
		return {
			bucketEndpoint: true,
			hostname: `${mrapAlias}${isCustomEndpoint ? "" : `.accesspoint.s3-global`}.${hostnameSuffix}`,
			signingRegion: "*"
		};
	};
	getEndpointFromOutpostArn = ({ useArnRegion, clientRegion, clientSigningRegion = clientRegion, bucketName, outpostId, dualstackEndpoint = false, fipsEndpoint = false, tlsCompatible = true, accesspointName, isCustomEndpoint, hostnameSuffix }) => {
		validateRegionalClient(clientRegion);
		const DNSHostLabel = `${accesspointName}-${bucketName.accountId}`;
		validateDNSHostLabel(DNSHostLabel, { tlsCompatible });
		const endpointRegion = useArnRegion ? bucketName.region : clientRegion;
		const signingRegion = useArnRegion ? bucketName.region : clientSigningRegion;
		validateOutpostService(bucketName.service);
		validateDNSHostLabel(outpostId, { tlsCompatible });
		validateNoFIPS(fipsEndpoint);
		return {
			bucketEndpoint: true,
			hostname: `${`${DNSHostLabel}.${outpostId}`}${isCustomEndpoint ? "" : `.s3-outposts.${endpointRegion}`}.${hostnameSuffix}`,
			signingRegion,
			signingService: "s3-outposts"
		};
	};
	getEndpointFromAccessPointArn = ({ useArnRegion, clientRegion, clientSigningRegion = clientRegion, bucketName, dualstackEndpoint = false, fipsEndpoint = false, tlsCompatible = true, accesspointName, isCustomEndpoint, hostnameSuffix }) => {
		validateRegionalClient(clientRegion);
		const hostnamePrefix = `${accesspointName}-${bucketName.accountId}`;
		validateDNSHostLabel(hostnamePrefix, { tlsCompatible });
		const endpointRegion = useArnRegion ? bucketName.region : clientRegion;
		const signingRegion = useArnRegion ? bucketName.region : clientSigningRegion;
		validateS3Service(bucketName.service);
		return {
			bucketEndpoint: true,
			hostname: `${hostnamePrefix}${isCustomEndpoint ? "" : `.s3-accesspoint${fipsEndpoint ? "-fips" : ""}${dualstackEndpoint ? ".dualstack" : ""}.${endpointRegion}`}.${hostnameSuffix}`,
			signingRegion
		};
	};
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-bucket-endpoint/bucketEndpointMiddleware.js
var bucketEndpointMiddleware, bucketEndpointMiddlewareOptions, getBucketEndpointPlugin;
var init_bucketEndpointMiddleware = __esmMin((() => {
	init_util();
	init_protocols$1();
	init_bucketHostname();
	bucketEndpointMiddleware = (options) => (next, context) => async (args) => {
		const { Bucket: bucketName } = args.input;
		let replaceBucketInPath = options.bucketEndpoint;
		const request = args.request;
		if (HttpRequest.isInstance(request)) {
			if (options.bucketEndpoint) request.hostname = bucketName;
			else if (validate(bucketName)) {
				const bucketArn = parse$1(bucketName);
				const clientRegion = await options.region();
				const useDualstackEndpoint = await options.useDualstackEndpoint();
				const useFipsEndpoint = await options.useFipsEndpoint();
				const { partition, signingRegion = clientRegion } = await options.regionInfoProvider(clientRegion, {
					useDualstackEndpoint,
					useFipsEndpoint
				}) || {};
				const useArnRegion = await options.useArnRegion();
				const { hostname, bucketEndpoint, signingRegion: modifiedSigningRegion, signingService } = bucketHostname({
					bucketName: bucketArn,
					baseHostname: request.hostname,
					accelerateEndpoint: options.useAccelerateEndpoint,
					dualstackEndpoint: useDualstackEndpoint,
					fipsEndpoint: useFipsEndpoint,
					pathStyleEndpoint: options.forcePathStyle,
					tlsCompatible: request.protocol === "https:",
					useArnRegion,
					clientPartition: partition,
					clientSigningRegion: signingRegion,
					clientRegion,
					isCustomEndpoint: options.isCustomEndpoint,
					disableMultiregionAccessPoints: await options.disableMultiregionAccessPoints()
				});
				if (modifiedSigningRegion && modifiedSigningRegion !== signingRegion) context["signing_region"] = modifiedSigningRegion;
				if (signingService && signingService !== "s3") context["signing_service"] = signingService;
				request.hostname = hostname;
				replaceBucketInPath = bucketEndpoint;
			} else {
				const clientRegion = await options.region();
				const dualstackEndpoint = await options.useDualstackEndpoint();
				const fipsEndpoint = await options.useFipsEndpoint();
				const { hostname, bucketEndpoint } = bucketHostname({
					bucketName,
					clientRegion,
					baseHostname: request.hostname,
					accelerateEndpoint: options.useAccelerateEndpoint,
					dualstackEndpoint,
					fipsEndpoint,
					pathStyleEndpoint: options.forcePathStyle,
					tlsCompatible: request.protocol === "https:",
					isCustomEndpoint: options.isCustomEndpoint
				});
				request.hostname = hostname;
				replaceBucketInPath = bucketEndpoint;
			}
			if (replaceBucketInPath) {
				request.path = request.path.replace(/^(\/)?[^\/]+/, "");
				if (request.path === "") request.path = "/";
			}
		}
		return next({
			...args,
			request
		});
	};
	bucketEndpointMiddlewareOptions = {
		tags: ["BUCKET_ENDPOINT"],
		name: "bucketEndpointMiddleware",
		relation: "before",
		toMiddleware: "hostHeaderMiddleware",
		override: true
	};
	getBucketEndpointPlugin = (options) => ({ applyToStack: (clientStack) => {
		clientStack.addRelativeTo(bucketEndpointMiddleware(options), bucketEndpointMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-bucket-endpoint/configurations.js
function resolveBucketEndpointConfig(input) {
	const { bucketEndpoint = false, forcePathStyle = false, useAccelerateEndpoint = false, useArnRegion, disableMultiregionAccessPoints = false } = input;
	return Object.assign(input, {
		bucketEndpoint,
		forcePathStyle,
		useAccelerateEndpoint,
		useArnRegion: typeof useArnRegion === "function" ? useArnRegion : () => Promise.resolve(useArnRegion),
		disableMultiregionAccessPoints: typeof disableMultiregionAccessPoints === "function" ? disableMultiregionAccessPoints : () => Promise.resolve(disableMultiregionAccessPoints)
	});
}
var init_configurations = __esmMin((() => {}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-expect-continue/middleware-expect-continue.js
function addExpectContinueMiddleware(options) {
	return (next) => async (args) => {
		const { request } = args;
		if (options.expectContinueHeader !== false && HttpRequest.isInstance(request) && request.body && options.runtime === "node" && options.requestHandler?.constructor?.name !== "FetchHttpHandler") {
			let sendHeader = true;
			if (typeof options.expectContinueHeader === "number") try {
				sendHeader = (Number(request.headers?.["content-length"]) ?? options.bodyLengthChecker?.(request.body) ?? Infinity) >= options.expectContinueHeader;
			} catch (e) {}
			else sendHeader = !!options.expectContinueHeader;
			if (sendHeader) request.headers.Expect = "100-continue";
		}
		return next({
			...args,
			request
		});
	};
}
var addExpectContinueMiddlewareOptions, getAddExpectContinuePlugin;
var init_middleware_expect_continue = __esmMin((() => {
	init_protocols$1();
	addExpectContinueMiddlewareOptions = {
		step: "build",
		tags: ["SET_EXPECT_HEADER", "EXPECT_HEADER"],
		name: "addExpectContinueMiddleware",
		override: true
	};
	getAddExpectContinuePlugin = (options) => ({ applyToStack: (clientStack) => {
		clientStack.add(addExpectContinueMiddleware(options), addExpectContinueMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-location-constraint/middleware-location-constraint.js
function locationConstraintMiddleware(options) {
	return (next) => async (args) => {
		const { CreateBucketConfiguration } = args.input;
		const region = await options.region();
		if (!CreateBucketConfiguration?.LocationConstraint && !CreateBucketConfiguration?.Location) {
			if (region !== "us-east-1") {
				args.input.CreateBucketConfiguration = args.input.CreateBucketConfiguration ?? {};
				args.input.CreateBucketConfiguration.LocationConstraint = region;
			}
		}
		return next(args);
	};
}
var locationConstraintMiddlewareOptions, getLocationConstraintPlugin;
var init_middleware_location_constraint = __esmMin((() => {
	locationConstraintMiddlewareOptions = {
		step: "initialize",
		tags: ["LOCATION_CONSTRAINT", "CREATE_BUCKET_CONFIGURATION"],
		name: "locationConstraintMiddleware",
		override: true
	};
	getLocationConstraintPlugin = (config) => ({ applyToStack: (clientStack) => {
		clientStack.add(locationConstraintMiddleware(config), locationConstraintMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-location-constraint/configuration.js
function resolveLocationConstraintConfig(input) {
	return input;
}
var init_configuration = __esmMin((() => {}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-ssec/middleware-ssec.js
function ssecMiddleware(options) {
	return (next) => async (args) => {
		const input = { ...args.input };
		for (const prop of [{
			target: "SSECustomerKey",
			hash: "SSECustomerKeyMD5"
		}, {
			target: "CopySourceSSECustomerKey",
			hash: "CopySourceSSECustomerKeyMD5"
		}]) {
			const value = input[prop.target];
			if (value) {
				let valueForHash;
				if (typeof value === "string") if (isValidBase64EncodedSSECustomerKey(value, options)) valueForHash = options.base64Decoder(value);
				else {
					valueForHash = options.utf8Decoder(value);
					input[prop.target] = options.base64Encoder(valueForHash);
				}
				else {
					valueForHash = ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : new Uint8Array(value);
					input[prop.target] = options.base64Encoder(valueForHash);
				}
				const hash = new options.md5();
				hash.update(valueForHash);
				input[prop.hash] = options.base64Encoder(await hash.digest());
			}
		}
		return next({
			...args,
			input
		});
	};
}
function isValidBase64EncodedSSECustomerKey(str, options) {
	if (!/^(?:[A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(str)) return false;
	try {
		return options.base64Decoder(str).length === 32;
	} catch {
		return false;
	}
}
var ssecMiddlewareOptions, getSsecPlugin;
var init_middleware_ssec = __esmMin((() => {
	ssecMiddlewareOptions = {
		name: "ssecMiddleware",
		step: "initialize",
		tags: ["SSE"],
		override: true
	};
	getSsecPlugin = (config) => ({ applyToStack: (clientStack) => {
		clientStack.add(ssecMiddleware(config), ssecMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/index.js
var s3_exports = /* @__PURE__ */ __exportAll({
	NODE_DISABLE_MULTIREGION_ACCESS_POINT_CONFIG_OPTIONS: () => NODE_DISABLE_MULTIREGION_ACCESS_POINT_CONFIG_OPTIONS,
	NODE_DISABLE_MULTIREGION_ACCESS_POINT_ENV_NAME: () => NODE_DISABLE_MULTIREGION_ACCESS_POINT_ENV_NAME,
	NODE_DISABLE_MULTIREGION_ACCESS_POINT_INI_NAME: () => NODE_DISABLE_MULTIREGION_ACCESS_POINT_INI_NAME,
	NODE_DISABLE_S3_EXPRESS_SESSION_AUTH_OPTIONS: () => NODE_DISABLE_S3_EXPRESS_SESSION_AUTH_OPTIONS,
	NODE_USE_ARN_REGION_CONFIG_OPTIONS: () => NODE_USE_ARN_REGION_CONFIG_OPTIONS,
	NODE_USE_ARN_REGION_ENV_NAME: () => NODE_USE_ARN_REGION_ENV_NAME,
	NODE_USE_ARN_REGION_INI_NAME: () => NODE_USE_ARN_REGION_INI_NAME,
	S3ExpressIdentityCache: () => S3ExpressIdentityCache,
	S3ExpressIdentityCacheEntry: () => S3ExpressIdentityCacheEntry,
	S3ExpressIdentityProviderImpl: () => S3ExpressIdentityProviderImpl,
	S3RestXmlProtocol: () => S3RestXmlProtocol,
	SignatureV4S3Express: () => SignatureV4S3Express,
	addExpectContinueMiddleware: () => addExpectContinueMiddleware,
	addExpectContinueMiddlewareOptions: () => addExpectContinueMiddlewareOptions,
	bucketEndpointMiddleware: () => bucketEndpointMiddleware,
	bucketEndpointMiddlewareOptions: () => bucketEndpointMiddlewareOptions,
	bucketHostname: () => bucketHostname,
	checkContentLengthHeader: () => checkContentLengthHeader,
	checkContentLengthHeaderMiddlewareOptions: () => checkContentLengthHeaderMiddlewareOptions,
	getAddExpectContinuePlugin: () => getAddExpectContinuePlugin,
	getArnResources: () => getArnResources,
	getBucketEndpointPlugin: () => getBucketEndpointPlugin,
	getCheckContentLengthHeaderPlugin: () => getCheckContentLengthHeaderPlugin,
	getLocationConstraintPlugin: () => getLocationConstraintPlugin,
	getRegionRedirectMiddlewarePlugin: () => getRegionRedirectMiddlewarePlugin,
	getS3ExpiresMiddlewarePlugin: () => getS3ExpiresMiddlewarePlugin,
	getS3ExpressHttpSigningPlugin: () => getS3ExpressHttpSigningPlugin,
	getS3ExpressPlugin: () => getS3ExpressPlugin,
	getSsecPlugin: () => getSsecPlugin,
	getSuffixForArnEndpoint: () => getSuffixForArnEndpoint,
	getThrow200ExceptionsPlugin: () => getThrow200ExceptionsPlugin,
	getValidateBucketNamePlugin: () => getValidateBucketNamePlugin,
	isValidBase64EncodedSSECustomerKey: () => isValidBase64EncodedSSECustomerKey,
	locationConstraintMiddleware: () => locationConstraintMiddleware,
	locationConstraintMiddlewareOptions: () => locationConstraintMiddlewareOptions,
	regionRedirectEndpointMiddleware: () => regionRedirectEndpointMiddleware,
	regionRedirectEndpointMiddlewareOptions: () => regionRedirectEndpointMiddlewareOptions,
	regionRedirectMiddleware: () => regionRedirectMiddleware,
	regionRedirectMiddlewareOptions: () => regionRedirectMiddlewareOptions,
	resolveBucketEndpointConfig: () => resolveBucketEndpointConfig,
	resolveLocationConstraintConfig: () => resolveLocationConstraintConfig,
	resolveS3Config: () => resolveS3Config,
	s3ExpiresMiddleware: () => s3ExpiresMiddleware,
	s3ExpiresMiddlewareOptions: () => s3ExpiresMiddlewareOptions,
	s3ExpressHttpSigningMiddleware: () => s3ExpressHttpSigningMiddleware,
	s3ExpressHttpSigningMiddlewareOptions: () => s3ExpressHttpSigningMiddlewareOptions,
	s3ExpressMiddleware: () => s3ExpressMiddleware,
	s3ExpressMiddlewareOptions: () => s3ExpressMiddlewareOptions,
	ssecMiddleware: () => ssecMiddleware,
	ssecMiddlewareOptions: () => ssecMiddlewareOptions,
	throw200ExceptionsMiddleware: () => throw200ExceptionsMiddleware,
	throw200ExceptionsMiddlewareOptions: () => throw200ExceptionsMiddlewareOptions,
	validateAccountId: () => validateAccountId,
	validateBucketNameMiddleware: () => validateBucketNameMiddleware,
	validateBucketNameMiddlewareOptions: () => validateBucketNameMiddlewareOptions,
	validateDNSHostLabel: () => validateDNSHostLabel,
	validateNoDualstack: () => validateNoDualstack,
	validateNoFIPS: () => validateNoFIPS,
	validateOutpostService: () => validateOutpostService,
	validatePartition: () => validatePartition,
	validateRegion: () => validateRegion
});
var init_s3 = __esmMin((() => {
	init_check_content_length_header();
	init_region_redirect_endpoint_middleware();
	init_region_redirect_middleware();
	init_s3Configuration();
	init_s3_expires_middleware();
	init_S3ExpressIdentityCache();
	init_S3ExpressIdentityCacheEntry();
	init_S3ExpressIdentityProviderImpl();
	init_SignatureV4S3Express();
	init_constants$1();
	init_s3ExpressMiddleware();
	init_s3ExpressHttpSigningMiddleware();
	init_throw_200_exceptions();
	init_validate_bucket_name();
	init_S3RestXmlProtocol();
	init_NodeDisableMultiregionAccessPointConfigOptions();
	init_NodeUseArnRegionConfigOptions();
	init_bucketEndpointMiddleware();
	init_bucketHostname();
	init_configurations();
	init_bucketHostnameUtils();
	init_middleware_expect_continue();
	init_middleware_location_constraint();
	init_configuration();
	init_middleware_ssec();
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-expect-continue/dist-cjs/index.js
var require_dist_cjs$36 = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { addExpectContinueMiddleware, addExpectContinueMiddlewareOptions, getAddExpectContinuePlugin } = (init_s3(), __toCommonJS(s3_exports));
	exports.addExpectContinueMiddleware = addExpectContinueMiddleware;
	exports.addExpectContinueMiddlewareOptions = addExpectContinueMiddlewareOptions;
	exports.getAddExpectContinuePlugin = getAddExpectContinuePlugin;
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/constants.js
var RequestChecksumCalculation, DEFAULT_REQUEST_CHECKSUM_CALCULATION, ResponseChecksumValidation, DEFAULT_RESPONSE_CHECKSUM_VALIDATION, ChecksumAlgorithm, ChecksumLocation, DEFAULT_CHECKSUM_ALGORITHM;
var init_constants = __esmMin((() => {
	RequestChecksumCalculation = {
		WHEN_SUPPORTED: "WHEN_SUPPORTED",
		WHEN_REQUIRED: "WHEN_REQUIRED"
	};
	DEFAULT_REQUEST_CHECKSUM_CALCULATION = RequestChecksumCalculation.WHEN_SUPPORTED;
	ResponseChecksumValidation = {
		WHEN_SUPPORTED: "WHEN_SUPPORTED",
		WHEN_REQUIRED: "WHEN_REQUIRED"
	};
	DEFAULT_RESPONSE_CHECKSUM_VALIDATION = RequestChecksumCalculation.WHEN_SUPPORTED;
	(function(ChecksumAlgorithm) {
		ChecksumAlgorithm["MD5"] = "MD5";
		ChecksumAlgorithm["CRC32"] = "CRC32";
		ChecksumAlgorithm["CRC32C"] = "CRC32C";
		ChecksumAlgorithm["CRC64NVME"] = "CRC64NVME";
		ChecksumAlgorithm["SHA1"] = "SHA1";
		ChecksumAlgorithm["SHA256"] = "SHA256";
	})(ChecksumAlgorithm || (ChecksumAlgorithm = {}));
	(function(ChecksumLocation) {
		ChecksumLocation["HEADER"] = "header";
		ChecksumLocation["TRAILER"] = "trailer";
	})(ChecksumLocation || (ChecksumLocation = {}));
	DEFAULT_CHECKSUM_ALGORITHM = ChecksumAlgorithm.CRC32;
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/stringUnionSelector.js
var SelectorType, stringUnionSelector;
var init_stringUnionSelector = __esmMin((() => {
	(function(SelectorType) {
		SelectorType["ENV"] = "env";
		SelectorType["CONFIG"] = "shared config entry";
	})(SelectorType || (SelectorType = {}));
	stringUnionSelector = (obj, key, union, type) => {
		if (!(key in obj)) return;
		const value = obj[key].toUpperCase();
		if (!Object.values(union).includes(value)) throw new TypeError(`Cannot load ${type} '${key}'. Expected one of ${Object.values(union)}, got '${obj[key]}'.`);
		return value;
	};
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/NODE_REQUEST_CHECKSUM_CALCULATION_CONFIG_OPTIONS.js
var ENV_REQUEST_CHECKSUM_CALCULATION, CONFIG_REQUEST_CHECKSUM_CALCULATION, NODE_REQUEST_CHECKSUM_CALCULATION_CONFIG_OPTIONS;
var init_NODE_REQUEST_CHECKSUM_CALCULATION_CONFIG_OPTIONS = __esmMin((() => {
	init_constants();
	init_stringUnionSelector();
	ENV_REQUEST_CHECKSUM_CALCULATION = "AWS_REQUEST_CHECKSUM_CALCULATION";
	CONFIG_REQUEST_CHECKSUM_CALCULATION = "request_checksum_calculation";
	NODE_REQUEST_CHECKSUM_CALCULATION_CONFIG_OPTIONS = {
		environmentVariableSelector: (env) => stringUnionSelector(env, ENV_REQUEST_CHECKSUM_CALCULATION, RequestChecksumCalculation, SelectorType.ENV),
		configFileSelector: (profile) => stringUnionSelector(profile, CONFIG_REQUEST_CHECKSUM_CALCULATION, RequestChecksumCalculation, SelectorType.CONFIG),
		default: DEFAULT_REQUEST_CHECKSUM_CALCULATION
	};
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/NODE_RESPONSE_CHECKSUM_VALIDATION_CONFIG_OPTIONS.js
var ENV_RESPONSE_CHECKSUM_VALIDATION, CONFIG_RESPONSE_CHECKSUM_VALIDATION, NODE_RESPONSE_CHECKSUM_VALIDATION_CONFIG_OPTIONS;
var init_NODE_RESPONSE_CHECKSUM_VALIDATION_CONFIG_OPTIONS = __esmMin((() => {
	init_constants();
	init_stringUnionSelector();
	ENV_RESPONSE_CHECKSUM_VALIDATION = "AWS_RESPONSE_CHECKSUM_VALIDATION";
	CONFIG_RESPONSE_CHECKSUM_VALIDATION = "response_checksum_validation";
	NODE_RESPONSE_CHECKSUM_VALIDATION_CONFIG_OPTIONS = {
		environmentVariableSelector: (env) => stringUnionSelector(env, ENV_RESPONSE_CHECKSUM_VALIDATION, ResponseChecksumValidation, SelectorType.ENV),
		configFileSelector: (profile) => stringUnionSelector(profile, CONFIG_RESPONSE_CHECKSUM_VALIDATION, ResponseChecksumValidation, SelectorType.CONFIG),
		default: DEFAULT_RESPONSE_CHECKSUM_VALIDATION
	};
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/getChecksumAlgorithmForRequest.js
var getChecksumAlgorithmForRequest;
var init_getChecksumAlgorithmForRequest = __esmMin((() => {
	init_constants();
	getChecksumAlgorithmForRequest = (input, { requestChecksumRequired, requestAlgorithmMember, requestChecksumCalculation }) => {
		if (!requestAlgorithmMember) return requestChecksumCalculation === RequestChecksumCalculation.WHEN_SUPPORTED || requestChecksumRequired ? DEFAULT_CHECKSUM_ALGORITHM : void 0;
		if (!input[requestAlgorithmMember]) return;
		return input[requestAlgorithmMember];
	};
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/getChecksumLocationName.js
var getChecksumLocationName;
var init_getChecksumLocationName = __esmMin((() => {
	init_constants();
	getChecksumLocationName = (algorithm) => algorithm === ChecksumAlgorithm.MD5 ? "content-md5" : `x-amz-checksum-${algorithm.toLowerCase()}`;
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/hasHeader.js
var hasHeader;
var init_hasHeader = __esmMin((() => {
	hasHeader = (header, headers) => {
		const soughtHeader = header.toLowerCase();
		for (const headerName of Object.keys(headers)) if (soughtHeader === headerName.toLowerCase()) return true;
		return false;
	};
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/hasHeaderWithPrefix.js
var hasHeaderWithPrefix;
var init_hasHeaderWithPrefix = __esmMin((() => {
	hasHeaderWithPrefix = (headerPrefix, headers) => {
		const soughtHeaderPrefix = headerPrefix.toLowerCase();
		for (const headerName of Object.keys(headers)) if (headerName.toLowerCase().startsWith(soughtHeaderPrefix)) return true;
		return false;
	};
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/isStreaming.js
var isStreaming;
var init_isStreaming = __esmMin((() => {
	init_serde();
	isStreaming = (body) => body !== void 0 && typeof body !== "string" && !ArrayBuffer.isView(body) && !isArrayBuffer(body);
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/crc/crc32c/Crc32cJs.js
var T, Crc32cJs;
var init_Crc32cJs = __esmMin((() => {
	T = new Uint32Array(256);
	for (let i = 0; i < 256; ++i) {
		let c = i;
		for (let j = 0; j < 8; ++j) c = c & 1 ? 2197175160 ^ c >>> 1 : c >>> 1;
		T[i] = c >>> 0;
	}
	Crc32cJs = class {
		digestLength = 4;
		crc = 4294967295;
		update(data) {
			let crc = this.crc;
			for (let i = 0; i < data.length; ++i) crc = crc >>> 8 ^ T[(crc ^ data[i]) & 255];
			this.crc = crc;
		}
		async digest() {
			const value = (this.crc ^ 4294967295) >>> 0;
			const out = new Uint8Array(4);
			out[0] = value >>> 24;
			out[1] = value >>> 16 & 255;
			out[2] = value >>> 8 & 255;
			out[3] = value & 255;
			return out;
		}
		reset() {
			this.crc = 4294967295;
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/crc/crc32c/Crc32cNode.js
var Crc32cNode;
var init_Crc32cNode = __esmMin((() => {
	init_Crc32cJs();
	Crc32cNode = Crc32cJs;
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/crc/crc64-nvme/crc64-nvme-crt-container.js
var crc64NvmeCrtContainer;
var init_crc64_nvme_crt_container = __esmMin((() => {
	crc64NvmeCrtContainer = { CrtCrc64Nvme: null };
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/crc/crc64-nvme/Crc64NvmeJs.js
var generateCRC64NVMETable, CRC64_NVME_REVERSED_TABLE, t0, t1, t2, t3, t4, t5, t6, t7, ensureTablesInitialized, Crc64NvmeJs;
var init_Crc64NvmeJs = __esmMin((() => {
	generateCRC64NVMETable = () => {
		const sliceLength = 8;
		const tables = new Array(sliceLength);
		for (let slice = 0; slice < sliceLength; slice++) {
			const table = new Array(512);
			for (let i = 0; i < 256; i++) {
				let crc = BigInt(i);
				for (let j = 0; j < 8 * (slice + 1); j++) if (crc & 1n) crc = crc >> 1n ^ 11127430586519243189n;
				else crc = crc >> 1n;
				table[i * 2] = Number(crc >> 32n & 4294967295n);
				table[i * 2 + 1] = Number(crc & 4294967295n);
			}
			tables[slice] = new Uint32Array(table);
		}
		return tables;
	};
	ensureTablesInitialized = () => {
		if (!CRC64_NVME_REVERSED_TABLE) {
			CRC64_NVME_REVERSED_TABLE = generateCRC64NVMETable();
			[t0, t1, t2, t3, t4, t5, t6, t7] = CRC64_NVME_REVERSED_TABLE;
		}
	};
	Crc64NvmeJs = class {
		c1 = 0;
		c2 = 0;
		constructor() {
			ensureTablesInitialized();
			this.reset();
		}
		update(data) {
			const len = data.length;
			let i = 0;
			let crc1 = this.c1;
			let crc2 = this.c2;
			while (i + 8 <= len) {
				const idx0 = ((crc2 ^ data[i++]) & 255) << 1;
				const idx1 = ((crc2 >>> 8 ^ data[i++]) & 255) << 1;
				const idx2 = ((crc2 >>> 16 ^ data[i++]) & 255) << 1;
				const idx3 = ((crc2 >>> 24 ^ data[i++]) & 255) << 1;
				const idx4 = ((crc1 ^ data[i++]) & 255) << 1;
				const idx5 = ((crc1 >>> 8 ^ data[i++]) & 255) << 1;
				const idx6 = ((crc1 >>> 16 ^ data[i++]) & 255) << 1;
				const idx7 = ((crc1 >>> 24 ^ data[i++]) & 255) << 1;
				crc1 = t7[idx0] ^ t6[idx1] ^ t5[idx2] ^ t4[idx3] ^ t3[idx4] ^ t2[idx5] ^ t1[idx6] ^ t0[idx7];
				crc2 = t7[idx0 + 1] ^ t6[idx1 + 1] ^ t5[idx2 + 1] ^ t4[idx3 + 1] ^ t3[idx4 + 1] ^ t2[idx5 + 1] ^ t1[idx6 + 1] ^ t0[idx7 + 1];
			}
			while (i < len) {
				const idx = ((crc2 ^ data[i]) & 255) << 1;
				crc2 = (crc2 >>> 8 | (crc1 & 255) << 24) >>> 0;
				crc1 = crc1 >>> 8 ^ t0[idx];
				crc2 ^= t0[idx + 1];
				++i;
			}
			this.c1 = crc1;
			this.c2 = crc2;
		}
		async digest() {
			const c1 = this.c1 ^ 4294967295;
			const c2 = this.c2 ^ 4294967295;
			return new Uint8Array([
				c1 >>> 24,
				c1 >>> 16 & 255,
				c1 >>> 8 & 255,
				c1 & 255,
				c2 >>> 24,
				c2 >>> 16 & 255,
				c2 >>> 8 & 255,
				c2 & 255
			]);
		}
		reset() {
			this.c1 = 4294967295;
			this.c2 = 4294967295;
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/crc/crc64-nvme/Crc64Nvme.js
var Crc64Nvme;
var init_Crc64Nvme = __esmMin((() => {
	init_crc64_nvme_crt_container();
	init_Crc64NvmeJs();
	Crc64Nvme = class {
		impl;
		constructor() {
			const Crt = crc64NvmeCrtContainer.CrtCrc64Nvme;
			this.impl = Crt ? new Crt() : new Crc64NvmeJs();
		}
		update(data) {
			this.impl.update(data);
		}
		async digest() {
			return this.impl.digest();
		}
		reset() {
			this.impl.reset();
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/crc/index.js
var init_crc = __esmMin((() => {
	init_Crc32cNode();
	init_Crc64Nvme();
	init_checksum();
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/types.js
var CLIENT_SUPPORTED_ALGORITHMS, PRIORITY_ORDER_ALGORITHMS;
var init_types = __esmMin((() => {
	init_constants();
	CLIENT_SUPPORTED_ALGORITHMS = [
		ChecksumAlgorithm.CRC32,
		ChecksumAlgorithm.CRC32C,
		ChecksumAlgorithm.CRC64NVME,
		ChecksumAlgorithm.SHA1,
		ChecksumAlgorithm.SHA256
	];
	PRIORITY_ORDER_ALGORITHMS = [
		ChecksumAlgorithm.SHA256,
		ChecksumAlgorithm.SHA1,
		ChecksumAlgorithm.CRC32,
		ChecksumAlgorithm.CRC32C,
		ChecksumAlgorithm.CRC64NVME
	];
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/selectChecksumAlgorithmFunction.js
var selectChecksumAlgorithmFunction;
var init_selectChecksumAlgorithmFunction = __esmMin((() => {
	init_crc();
	init_constants();
	init_types();
	selectChecksumAlgorithmFunction = (checksumAlgorithm, config) => {
		const { checksumAlgorithms = {} } = config;
		switch (checksumAlgorithm) {
			case ChecksumAlgorithm.MD5: return checksumAlgorithms?.MD5 ?? config.md5;
			case ChecksumAlgorithm.CRC32: return checksumAlgorithms?.CRC32 ?? Crc32Node;
			case ChecksumAlgorithm.CRC32C: return checksumAlgorithms?.CRC32C ?? Crc32cNode;
			case ChecksumAlgorithm.CRC64NVME: return checksumAlgorithms?.CRC64NVME ?? Crc64Nvme;
			case ChecksumAlgorithm.SHA1: return checksumAlgorithms?.SHA1 ?? config.sha1;
			case ChecksumAlgorithm.SHA256: return checksumAlgorithms?.SHA256 ?? config.sha256;
			default:
				if (checksumAlgorithms?.[checksumAlgorithm]) return checksumAlgorithms[checksumAlgorithm];
				throw new Error(`The checksum algorithm "${checksumAlgorithm}" is not supported by the client. Select one of ${CLIENT_SUPPORTED_ALGORITHMS}, or provide an implementation to  the client constructor checksums field.`);
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/stringHasher.js
var stringHasher;
var init_stringHasher = __esmMin((() => {
	init_serde();
	stringHasher = (checksumAlgorithmFn, body) => {
		const hash = new checksumAlgorithmFn();
		hash.update(toUint8Array(body || ""));
		return hash.digest();
	};
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/flexibleChecksumsMiddleware.js
var flexibleChecksumsMiddlewareOptions, flexibleChecksumsMiddleware;
var init_flexibleChecksumsMiddleware = __esmMin((() => {
	init_client();
	init_protocols$1();
	init_serde();
	init_constants();
	init_getChecksumAlgorithmForRequest();
	init_getChecksumLocationName();
	init_hasHeader();
	init_hasHeaderWithPrefix();
	init_isStreaming();
	init_selectChecksumAlgorithmFunction();
	init_stringHasher();
	flexibleChecksumsMiddlewareOptions = {
		name: "flexibleChecksumsMiddleware",
		step: "build",
		tags: ["BODY_CHECKSUM"],
		override: true
	};
	flexibleChecksumsMiddleware = (config, middlewareConfig) => (next, context) => async (args) => {
		if (!HttpRequest.isInstance(args.request)) return next(args);
		if (hasHeaderWithPrefix("x-amz-checksum-", args.request.headers)) return next(args);
		const { request, input } = args;
		const { body: requestBody, headers } = request;
		const { base64Encoder, streamHasher } = config;
		const { requestChecksumRequired, requestAlgorithmMember } = middlewareConfig;
		const requestChecksumCalculation = await config.requestChecksumCalculation();
		const requestAlgorithmMemberName = requestAlgorithmMember?.name;
		const requestAlgorithmMemberHttpHeader = requestAlgorithmMember?.httpHeader;
		if (requestAlgorithmMemberName && !input[requestAlgorithmMemberName]) {
			if (requestChecksumCalculation === RequestChecksumCalculation.WHEN_SUPPORTED || requestChecksumRequired) {
				input[requestAlgorithmMemberName] = DEFAULT_CHECKSUM_ALGORITHM;
				if (requestAlgorithmMemberHttpHeader) headers[requestAlgorithmMemberHttpHeader] = DEFAULT_CHECKSUM_ALGORITHM;
			}
		}
		const checksumAlgorithm = getChecksumAlgorithmForRequest(input, {
			requestChecksumRequired,
			requestAlgorithmMember: requestAlgorithmMember?.name,
			requestChecksumCalculation
		});
		let updatedBody = requestBody;
		let updatedHeaders = headers;
		if (checksumAlgorithm) {
			switch (checksumAlgorithm) {
				case ChecksumAlgorithm.CRC32:
					setFeature$1(context, "FLEXIBLE_CHECKSUMS_REQ_CRC32", "U");
					break;
				case ChecksumAlgorithm.CRC32C:
					setFeature$1(context, "FLEXIBLE_CHECKSUMS_REQ_CRC32C", "V");
					break;
				case ChecksumAlgorithm.CRC64NVME:
					setFeature$1(context, "FLEXIBLE_CHECKSUMS_REQ_CRC64", "W");
					break;
				case ChecksumAlgorithm.SHA1:
					setFeature$1(context, "FLEXIBLE_CHECKSUMS_REQ_SHA1", "X");
					break;
				case ChecksumAlgorithm.SHA256:
					setFeature$1(context, "FLEXIBLE_CHECKSUMS_REQ_SHA256", "Y");
					break;
			}
			const checksumLocationName = getChecksumLocationName(checksumAlgorithm);
			const checksumAlgorithmFn = selectChecksumAlgorithmFunction(checksumAlgorithm, config);
			if (isStreaming(requestBody)) {
				const { getAwsChunkedEncodingStream, bodyLengthChecker } = config;
				updatedBody = getAwsChunkedEncodingStream(typeof config.requestStreamBufferSize === "number" && config.requestStreamBufferSize >= 8 * 1024 ? createBufferedReadable(requestBody, config.requestStreamBufferSize, context.logger) : requestBody, {
					base64Encoder,
					bodyLengthChecker,
					checksumLocationName,
					checksumAlgorithmFn,
					streamHasher
				});
				updatedHeaders = {
					...headers,
					"content-encoding": headers["content-encoding"] ? `${headers["content-encoding"]},aws-chunked` : "aws-chunked",
					"transfer-encoding": "chunked",
					"x-amz-decoded-content-length": headers["content-length"],
					"x-amz-content-sha256": "STREAMING-UNSIGNED-PAYLOAD-TRAILER",
					"x-amz-trailer": checksumLocationName
				};
				delete updatedHeaders["content-length"];
			} else if (!hasHeader(checksumLocationName, headers)) {
				const rawChecksum = await stringHasher(checksumAlgorithmFn, requestBody);
				updatedHeaders = {
					...headers,
					[checksumLocationName]: base64Encoder(rawChecksum)
				};
			}
		}
		try {
			return await next({
				...args,
				request: {
					...request,
					headers: updatedHeaders,
					body: updatedBody
				}
			});
		} catch (e) {
			if (e instanceof Error && e.name === "InvalidChunkSizeError") try {
				if (!e.message.endsWith(".")) e.message += ".";
				e.message += " Set [requestStreamBufferSize=number e.g. 65_536] in client constructor to instruct AWS SDK to buffer your input stream.";
			} catch (ignored) {}
			throw e;
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/flexibleChecksumsInputMiddleware.js
var flexibleChecksumsInputMiddlewareOptions, flexibleChecksumsInputMiddleware;
var init_flexibleChecksumsInputMiddleware = __esmMin((() => {
	init_client();
	init_constants();
	flexibleChecksumsInputMiddlewareOptions = {
		name: "flexibleChecksumsInputMiddleware",
		toMiddleware: "serializerMiddleware",
		relation: "before",
		tags: ["BODY_CHECKSUM"],
		override: true
	};
	flexibleChecksumsInputMiddleware = (config, middlewareConfig) => (next, context) => async (args) => {
		const input = args.input;
		const { requestValidationModeMember } = middlewareConfig;
		const requestChecksumCalculation = await config.requestChecksumCalculation();
		const responseChecksumValidation = await config.responseChecksumValidation();
		switch (requestChecksumCalculation) {
			case RequestChecksumCalculation.WHEN_REQUIRED:
				setFeature$1(context, "FLEXIBLE_CHECKSUMS_REQ_WHEN_REQUIRED", "a");
				break;
			case RequestChecksumCalculation.WHEN_SUPPORTED:
				setFeature$1(context, "FLEXIBLE_CHECKSUMS_REQ_WHEN_SUPPORTED", "Z");
				break;
		}
		switch (responseChecksumValidation) {
			case ResponseChecksumValidation.WHEN_REQUIRED:
				setFeature$1(context, "FLEXIBLE_CHECKSUMS_RES_WHEN_REQUIRED", "c");
				break;
			case ResponseChecksumValidation.WHEN_SUPPORTED:
				setFeature$1(context, "FLEXIBLE_CHECKSUMS_RES_WHEN_SUPPORTED", "b");
				break;
		}
		if (requestValidationModeMember && !input[requestValidationModeMember]) {
			if (responseChecksumValidation === ResponseChecksumValidation.WHEN_SUPPORTED) input[requestValidationModeMember] = "ENABLED";
		}
		return next(args);
	};
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/getChecksumAlgorithmListForResponse.js
var getChecksumAlgorithmListForResponse;
var init_getChecksumAlgorithmListForResponse = __esmMin((() => {
	init_types();
	getChecksumAlgorithmListForResponse = (responseAlgorithms = []) => {
		const validChecksumAlgorithms = [];
		let i = PRIORITY_ORDER_ALGORITHMS.length;
		for (const algorithm of responseAlgorithms) {
			const priority = PRIORITY_ORDER_ALGORITHMS.indexOf(algorithm);
			if (priority !== -1) validChecksumAlgorithms[priority] = algorithm;
			else validChecksumAlgorithms[i++] = algorithm;
		}
		return validChecksumAlgorithms.filter(Boolean);
	};
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/isChecksumWithPartNumber.js
var isChecksumWithPartNumber;
var init_isChecksumWithPartNumber = __esmMin((() => {
	isChecksumWithPartNumber = (checksum) => {
		const lastHyphenIndex = checksum.lastIndexOf("-");
		if (lastHyphenIndex !== -1) {
			const numberPart = checksum.slice(lastHyphenIndex + 1);
			if (!numberPart.startsWith("0")) {
				const number = parseInt(numberPart, 10);
				if (!isNaN(number) && number >= 1 && number <= 1e4) return true;
			}
		}
		return false;
	};
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/getChecksum.js
var getChecksum;
var init_getChecksum = __esmMin((() => {
	init_stringHasher();
	getChecksum = async (body, { checksumAlgorithmFn, base64Encoder }) => base64Encoder(await stringHasher(checksumAlgorithmFn, body));
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/validateChecksumFromResponse.js
var validateChecksumFromResponse;
var init_validateChecksumFromResponse = __esmMin((() => {
	init_serde();
	init_constants();
	init_getChecksum();
	init_getChecksumAlgorithmListForResponse();
	init_getChecksumLocationName();
	init_isStreaming();
	init_selectChecksumAlgorithmFunction();
	validateChecksumFromResponse = async (response, { config, responseAlgorithms, logger }) => {
		const checksumAlgorithms = getChecksumAlgorithmListForResponse(responseAlgorithms);
		const { body: responseBody, headers: responseHeaders } = response;
		for (const algorithm of checksumAlgorithms) {
			const responseHeader = getChecksumLocationName(algorithm);
			const checksumFromResponse = responseHeaders[responseHeader];
			if (checksumFromResponse) {
				let checksumAlgorithmFn;
				try {
					checksumAlgorithmFn = selectChecksumAlgorithmFunction(algorithm, config);
				} catch (error) {
					if (algorithm === ChecksumAlgorithm.CRC64NVME) {
						logger?.warn(`Skipping ${ChecksumAlgorithm.CRC64NVME} checksum validation: ${error.message}`);
						continue;
					}
					throw error;
				}
				const { base64Encoder } = config;
				if (isStreaming(responseBody)) {
					response.body = createChecksumStream({
						expectedChecksum: checksumFromResponse,
						checksumSourceLocation: responseHeader,
						checksum: new checksumAlgorithmFn(),
						source: responseBody,
						base64Encoder
					});
					return;
				}
				const checksum = await getChecksum(responseBody, {
					checksumAlgorithmFn,
					base64Encoder
				});
				if (checksum === checksumFromResponse) break;
				throw new Error(`Checksum mismatch: expected "${checksum}" but received "${checksumFromResponse}" in response header "${responseHeader}".`);
			}
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/flexibleChecksumsResponseMiddleware.js
var flexibleChecksumsResponseMiddlewareOptions, flexibleChecksumsResponseMiddleware;
var init_flexibleChecksumsResponseMiddleware = __esmMin((() => {
	init_protocols$1();
	init_getChecksumAlgorithmListForResponse();
	init_getChecksumLocationName();
	init_isChecksumWithPartNumber();
	init_validateChecksumFromResponse();
	flexibleChecksumsResponseMiddlewareOptions = {
		name: "flexibleChecksumsResponseMiddleware",
		toMiddleware: "deserializerMiddleware",
		relation: "after",
		tags: ["BODY_CHECKSUM"],
		override: true
	};
	flexibleChecksumsResponseMiddleware = (config, middlewareConfig) => (next, context) => async (args) => {
		if (!HttpRequest.isInstance(args.request)) return next(args);
		const input = args.input;
		const result = await next(args);
		const response = result.response;
		const { requestValidationModeMember, responseAlgorithms } = middlewareConfig;
		if (requestValidationModeMember && input[requestValidationModeMember] === "ENABLED") {
			const { clientName, commandName } = context;
			const customChecksumAlgorithms = Object.keys(config.checksumAlgorithms ?? {}).filter((algorithm) => {
				const responseHeader = getChecksumLocationName(algorithm);
				return response.headers[responseHeader] !== void 0;
			});
			const algoList = getChecksumAlgorithmListForResponse([...responseAlgorithms ?? [], ...customChecksumAlgorithms]);
			if (clientName === "S3Client" && commandName === "GetObjectCommand" && algoList.every((algorithm) => {
				const responseHeader = getChecksumLocationName(algorithm);
				const checksumFromResponse = response.headers[responseHeader];
				return !checksumFromResponse || isChecksumWithPartNumber(checksumFromResponse);
			})) return result;
			await validateChecksumFromResponse(response, {
				config,
				responseAlgorithms: algoList,
				logger: context.logger
			});
		}
		return result;
	};
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/getFlexibleChecksumsPlugin.js
var getFlexibleChecksumsPlugin;
var init_getFlexibleChecksumsPlugin = __esmMin((() => {
	init_flexibleChecksumsInputMiddleware();
	init_flexibleChecksumsMiddleware();
	init_flexibleChecksumsResponseMiddleware();
	getFlexibleChecksumsPlugin = (config, middlewareConfig) => ({ applyToStack: (clientStack) => {
		clientStack.add(flexibleChecksumsMiddleware(config, middlewareConfig), flexibleChecksumsMiddlewareOptions);
		clientStack.addRelativeTo(flexibleChecksumsInputMiddleware(config, middlewareConfig), flexibleChecksumsInputMiddlewareOptions);
		clientStack.addRelativeTo(flexibleChecksumsResponseMiddleware(config, middlewareConfig), flexibleChecksumsResponseMiddlewareOptions);
	} });
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/resolveFlexibleChecksumsConfig.js
var resolveFlexibleChecksumsConfig;
var init_resolveFlexibleChecksumsConfig = __esmMin((() => {
	init_client$1();
	init_constants();
	resolveFlexibleChecksumsConfig = (input) => {
		const { requestChecksumCalculation, responseChecksumValidation, requestStreamBufferSize } = input;
		return Object.assign(input, {
			requestChecksumCalculation: normalizeProvider$1(requestChecksumCalculation ?? DEFAULT_REQUEST_CHECKSUM_CALCULATION),
			responseChecksumValidation: normalizeProvider$1(responseChecksumValidation ?? DEFAULT_RESPONSE_CHECKSUM_VALIDATION),
			requestStreamBufferSize: Number(requestStreamBufferSize ?? 0),
			checksumAlgorithms: input.checksumAlgorithms ?? {}
		});
	};
}));
//#endregion
//#region node_modules/@aws-sdk/checksums/dist-es/submodules/flexible-checksums/index.js
var flexible_checksums_exports = /* @__PURE__ */ __exportAll({
	CONFIG_REQUEST_CHECKSUM_CALCULATION: () => CONFIG_REQUEST_CHECKSUM_CALCULATION,
	CONFIG_RESPONSE_CHECKSUM_VALIDATION: () => CONFIG_RESPONSE_CHECKSUM_VALIDATION,
	ChecksumAlgorithm: () => ChecksumAlgorithm,
	ChecksumLocation: () => ChecksumLocation,
	DEFAULT_CHECKSUM_ALGORITHM: () => DEFAULT_CHECKSUM_ALGORITHM,
	DEFAULT_REQUEST_CHECKSUM_CALCULATION: () => DEFAULT_REQUEST_CHECKSUM_CALCULATION,
	DEFAULT_RESPONSE_CHECKSUM_VALIDATION: () => DEFAULT_RESPONSE_CHECKSUM_VALIDATION,
	ENV_REQUEST_CHECKSUM_CALCULATION: () => ENV_REQUEST_CHECKSUM_CALCULATION,
	ENV_RESPONSE_CHECKSUM_VALIDATION: () => ENV_RESPONSE_CHECKSUM_VALIDATION,
	NODE_REQUEST_CHECKSUM_CALCULATION_CONFIG_OPTIONS: () => NODE_REQUEST_CHECKSUM_CALCULATION_CONFIG_OPTIONS,
	NODE_RESPONSE_CHECKSUM_VALIDATION_CONFIG_OPTIONS: () => NODE_RESPONSE_CHECKSUM_VALIDATION_CONFIG_OPTIONS,
	RequestChecksumCalculation: () => RequestChecksumCalculation,
	ResponseChecksumValidation: () => ResponseChecksumValidation,
	flexibleChecksumsMiddleware: () => flexibleChecksumsMiddleware,
	flexibleChecksumsMiddlewareOptions: () => flexibleChecksumsMiddlewareOptions,
	getFlexibleChecksumsPlugin: () => getFlexibleChecksumsPlugin,
	resolveFlexibleChecksumsConfig: () => resolveFlexibleChecksumsConfig
});
var init_flexible_checksums = __esmMin((() => {
	init_NODE_REQUEST_CHECKSUM_CALCULATION_CONFIG_OPTIONS();
	init_NODE_RESPONSE_CHECKSUM_VALIDATION_CONFIG_OPTIONS();
	init_constants();
	init_flexibleChecksumsMiddleware();
	init_getFlexibleChecksumsPlugin();
	init_resolveFlexibleChecksumsConfig();
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-flexible-checksums/dist-cjs/index.js
var require_dist_cjs$35 = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { CONFIG_REQUEST_CHECKSUM_CALCULATION, CONFIG_RESPONSE_CHECKSUM_VALIDATION, ChecksumAlgorithm, ChecksumLocation, DEFAULT_CHECKSUM_ALGORITHM, DEFAULT_REQUEST_CHECKSUM_CALCULATION, DEFAULT_RESPONSE_CHECKSUM_VALIDATION, ENV_REQUEST_CHECKSUM_CALCULATION, ENV_RESPONSE_CHECKSUM_VALIDATION, NODE_REQUEST_CHECKSUM_CALCULATION_CONFIG_OPTIONS, NODE_RESPONSE_CHECKSUM_VALIDATION_CONFIG_OPTIONS, RequestChecksumCalculation, ResponseChecksumValidation, flexibleChecksumsMiddleware, flexibleChecksumsMiddlewareOptions, getFlexibleChecksumsPlugin, resolveFlexibleChecksumsConfig } = (init_flexible_checksums(), __toCommonJS(flexible_checksums_exports));
	exports.CONFIG_REQUEST_CHECKSUM_CALCULATION = CONFIG_REQUEST_CHECKSUM_CALCULATION;
	exports.CONFIG_RESPONSE_CHECKSUM_VALIDATION = CONFIG_RESPONSE_CHECKSUM_VALIDATION;
	exports.ChecksumAlgorithm = ChecksumAlgorithm;
	exports.ChecksumLocation = ChecksumLocation;
	exports.DEFAULT_CHECKSUM_ALGORITHM = DEFAULT_CHECKSUM_ALGORITHM;
	exports.DEFAULT_REQUEST_CHECKSUM_CALCULATION = DEFAULT_REQUEST_CHECKSUM_CALCULATION;
	exports.DEFAULT_RESPONSE_CHECKSUM_VALIDATION = DEFAULT_RESPONSE_CHECKSUM_VALIDATION;
	exports.ENV_REQUEST_CHECKSUM_CALCULATION = ENV_REQUEST_CHECKSUM_CALCULATION;
	exports.ENV_RESPONSE_CHECKSUM_VALIDATION = ENV_RESPONSE_CHECKSUM_VALIDATION;
	exports.NODE_REQUEST_CHECKSUM_CALCULATION_CONFIG_OPTIONS = NODE_REQUEST_CHECKSUM_CALCULATION_CONFIG_OPTIONS;
	exports.NODE_RESPONSE_CHECKSUM_VALIDATION_CONFIG_OPTIONS = NODE_RESPONSE_CHECKSUM_VALIDATION_CONFIG_OPTIONS;
	exports.RequestChecksumCalculation = RequestChecksumCalculation;
	exports.ResponseChecksumValidation = ResponseChecksumValidation;
	exports.flexibleChecksumsMiddleware = flexibleChecksumsMiddleware;
	exports.flexibleChecksumsMiddlewareOptions = flexibleChecksumsMiddlewareOptions;
	exports.getFlexibleChecksumsPlugin = getFlexibleChecksumsPlugin;
	exports.resolveFlexibleChecksumsConfig = resolveFlexibleChecksumsConfig;
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-host-header/dist-cjs/index.js
var require_dist_cjs$34 = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { getHostHeaderPlugin, hostHeaderMiddleware, hostHeaderMiddlewareOptions, resolveHostHeaderConfig } = (init_client(), __toCommonJS(client_exports));
	exports.getHostHeaderPlugin = getHostHeaderPlugin;
	exports.hostHeaderMiddleware = hostHeaderMiddleware;
	exports.hostHeaderMiddlewareOptions = hostHeaderMiddlewareOptions;
	exports.resolveHostHeaderConfig = resolveHostHeaderConfig;
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-logger/dist-cjs/index.js
var require_dist_cjs$33 = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { getLoggerPlugin, loggerMiddleware, loggerMiddlewareOptions } = (init_client(), __toCommonJS(client_exports));
	exports.getLoggerPlugin = getLoggerPlugin;
	exports.loggerMiddleware = loggerMiddleware;
	exports.loggerMiddlewareOptions = loggerMiddlewareOptions;
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-recursion-detection/dist-cjs/index.js
var require_dist_cjs$32 = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { getRecursionDetectionPlugin, recursionDetectionMiddleware, recursionDetectionMiddlewareOptions } = (init_client(), __toCommonJS(client_exports));
	exports.getRecursionDetectionPlugin = getRecursionDetectionPlugin;
	exports.recursionDetectionMiddleware = recursionDetectionMiddleware;
	exports.recursionDetectionMiddlewareOptions = recursionDetectionMiddlewareOptions;
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-sdk-s3/dist-es/index.js
var dist_es_exports = /* @__PURE__ */ __exportAll({
	NODE_DISABLE_S3_EXPRESS_SESSION_AUTH_OPTIONS: () => NODE_DISABLE_S3_EXPRESS_SESSION_AUTH_OPTIONS,
	S3ExpressIdentityCache: () => S3ExpressIdentityCache,
	S3ExpressIdentityCacheEntry: () => S3ExpressIdentityCacheEntry,
	S3ExpressIdentityProviderImpl: () => S3ExpressIdentityProviderImpl,
	S3RestXmlProtocol: () => S3RestXmlProtocol,
	SignatureV4S3Express: () => SignatureV4S3Express,
	checkContentLengthHeader: () => checkContentLengthHeader,
	checkContentLengthHeaderMiddlewareOptions: () => checkContentLengthHeaderMiddlewareOptions,
	getCheckContentLengthHeaderPlugin: () => getCheckContentLengthHeaderPlugin,
	getRegionRedirectMiddlewarePlugin: () => getRegionRedirectMiddlewarePlugin,
	getS3ExpiresMiddlewarePlugin: () => getS3ExpiresMiddlewarePlugin,
	getS3ExpressHttpSigningPlugin: () => getS3ExpressHttpSigningPlugin,
	getS3ExpressPlugin: () => getS3ExpressPlugin,
	getThrow200ExceptionsPlugin: () => getThrow200ExceptionsPlugin,
	getValidateBucketNamePlugin: () => getValidateBucketNamePlugin,
	regionRedirectEndpointMiddleware: () => regionRedirectEndpointMiddleware,
	regionRedirectEndpointMiddlewareOptions: () => regionRedirectEndpointMiddlewareOptions,
	regionRedirectMiddleware: () => regionRedirectMiddleware,
	regionRedirectMiddlewareOptions: () => regionRedirectMiddlewareOptions,
	resolveS3Config: () => resolveS3Config,
	s3ExpiresMiddleware: () => s3ExpiresMiddleware,
	s3ExpiresMiddlewareOptions: () => s3ExpiresMiddlewareOptions,
	s3ExpressHttpSigningMiddleware: () => s3ExpressHttpSigningMiddleware,
	s3ExpressHttpSigningMiddlewareOptions: () => s3ExpressHttpSigningMiddlewareOptions,
	s3ExpressMiddleware: () => s3ExpressMiddleware,
	s3ExpressMiddlewareOptions: () => s3ExpressMiddlewareOptions,
	throw200ExceptionsMiddleware: () => throw200ExceptionsMiddleware,
	throw200ExceptionsMiddlewareOptions: () => throw200ExceptionsMiddlewareOptions,
	validateBucketNameMiddleware: () => validateBucketNameMiddleware,
	validateBucketNameMiddlewareOptions: () => validateBucketNameMiddlewareOptions
});
var init_dist_es = __esmMin((() => {
	init_s3();
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-user-agent/dist-cjs/index.js
var require_dist_cjs$31 = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { DEFAULT_UA_APP_ID, getUserAgentMiddlewareOptions, getUserAgentPlugin, resolveUserAgentConfig, userAgentMiddleware } = (init_client(), __toCommonJS(client_exports));
	exports.DEFAULT_UA_APP_ID = DEFAULT_UA_APP_ID;
	exports.getUserAgentMiddlewareOptions = getUserAgentMiddlewareOptions;
	exports.getUserAgentPlugin = getUserAgentPlugin;
	exports.resolveUserAgentConfig = resolveUserAgentConfig;
	exports.userAgentMiddleware = userAgentMiddleware;
}));
//#endregion
//#region node_modules/@smithy/config-resolver/dist-cjs/index.js
var require_dist_cjs$30 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.getRegionInfo = exports.resolveRegionConfig = exports.NODE_REGION_CONFIG_FILE_OPTIONS = exports.NODE_REGION_CONFIG_OPTIONS = exports.REGION_INI_NAME = exports.REGION_ENV_NAME = exports.resolveEndpointsConfig = exports.resolveCustomEndpointsConfig = exports.nodeFipsConfigSelectors = exports.NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS = exports.DEFAULT_USE_FIPS_ENDPOINT = exports.CONFIG_USE_FIPS_ENDPOINT = exports.ENV_USE_FIPS_ENDPOINT = exports.nodeDualstackConfigSelectors = exports.NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS = exports.DEFAULT_USE_DUALSTACK_ENDPOINT = exports.CONFIG_USE_DUALSTACK_ENDPOINT = exports.ENV_USE_DUALSTACK_ENDPOINT = void 0;
	var config_1 = (init_config$1(), __toCommonJS(config_exports));
	Object.defineProperty(exports, "ENV_USE_DUALSTACK_ENDPOINT", {
		enumerable: true,
		get: function() {
			return config_1.ENV_USE_DUALSTACK_ENDPOINT;
		}
	});
	Object.defineProperty(exports, "CONFIG_USE_DUALSTACK_ENDPOINT", {
		enumerable: true,
		get: function() {
			return config_1.CONFIG_USE_DUALSTACK_ENDPOINT;
		}
	});
	Object.defineProperty(exports, "DEFAULT_USE_DUALSTACK_ENDPOINT", {
		enumerable: true,
		get: function() {
			return config_1.DEFAULT_USE_DUALSTACK_ENDPOINT;
		}
	});
	Object.defineProperty(exports, "NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS", {
		enumerable: true,
		get: function() {
			return config_1.NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS;
		}
	});
	Object.defineProperty(exports, "nodeDualstackConfigSelectors", {
		enumerable: true,
		get: function() {
			return config_1.nodeDualstackConfigSelectors;
		}
	});
	Object.defineProperty(exports, "ENV_USE_FIPS_ENDPOINT", {
		enumerable: true,
		get: function() {
			return config_1.ENV_USE_FIPS_ENDPOINT;
		}
	});
	Object.defineProperty(exports, "CONFIG_USE_FIPS_ENDPOINT", {
		enumerable: true,
		get: function() {
			return config_1.CONFIG_USE_FIPS_ENDPOINT;
		}
	});
	Object.defineProperty(exports, "DEFAULT_USE_FIPS_ENDPOINT", {
		enumerable: true,
		get: function() {
			return config_1.DEFAULT_USE_FIPS_ENDPOINT;
		}
	});
	Object.defineProperty(exports, "NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS", {
		enumerable: true,
		get: function() {
			return config_1.NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS;
		}
	});
	Object.defineProperty(exports, "nodeFipsConfigSelectors", {
		enumerable: true,
		get: function() {
			return config_1.nodeFipsConfigSelectors;
		}
	});
	Object.defineProperty(exports, "resolveCustomEndpointsConfig", {
		enumerable: true,
		get: function() {
			return config_1.resolveCustomEndpointsConfig;
		}
	});
	Object.defineProperty(exports, "resolveEndpointsConfig", {
		enumerable: true,
		get: function() {
			return config_1.resolveEndpointsConfig;
		}
	});
	Object.defineProperty(exports, "REGION_ENV_NAME", {
		enumerable: true,
		get: function() {
			return config_1.REGION_ENV_NAME;
		}
	});
	Object.defineProperty(exports, "REGION_INI_NAME", {
		enumerable: true,
		get: function() {
			return config_1.REGION_INI_NAME;
		}
	});
	Object.defineProperty(exports, "NODE_REGION_CONFIG_OPTIONS", {
		enumerable: true,
		get: function() {
			return config_1.NODE_REGION_CONFIG_OPTIONS;
		}
	});
	Object.defineProperty(exports, "NODE_REGION_CONFIG_FILE_OPTIONS", {
		enumerable: true,
		get: function() {
			return config_1.NODE_REGION_CONFIG_FILE_OPTIONS;
		}
	});
	Object.defineProperty(exports, "resolveRegionConfig", {
		enumerable: true,
		get: function() {
			return config_1.resolveRegionConfig;
		}
	});
	Object.defineProperty(exports, "getRegionInfo", {
		enumerable: true,
		get: function() {
			return config_1.getRegionInfo;
		}
	});
}));
//#endregion
//#region node_modules/@smithy/eventstream-serde-config-resolver/dist-cjs/index.js
var require_dist_cjs$29 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.resolveEventStreamSerdeConfig = void 0;
	var event_streams_1 = (init_event_streams(), __toCommonJS(event_streams_exports));
	Object.defineProperty(exports, "resolveEventStreamSerdeConfig", {
		enumerable: true,
		get: function() {
			return event_streams_1.resolveEventStreamSerdeConfig;
		}
	});
}));
//#endregion
//#region node_modules/@smithy/middleware-content-length/dist-cjs/index.js
var require_dist_cjs$28 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.getContentLengthPlugin = exports.contentLengthMiddlewareOptions = exports.contentLengthMiddleware = void 0;
	var protocols_1 = (init_protocols$1(), __toCommonJS(protocols_exports));
	Object.defineProperty(exports, "contentLengthMiddleware", {
		enumerable: true,
		get: function() {
			return protocols_1.contentLengthMiddleware;
		}
	});
	Object.defineProperty(exports, "contentLengthMiddlewareOptions", {
		enumerable: true,
		get: function() {
			return protocols_1.contentLengthMiddlewareOptions;
		}
	});
	Object.defineProperty(exports, "getContentLengthPlugin", {
		enumerable: true,
		get: function() {
			return protocols_1.getContentLengthPlugin;
		}
	});
}));
//#endregion
//#region node_modules/@smithy/middleware-endpoint/dist-cjs/index.js
var require_dist_cjs$27 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.resolveEndpointRequiredConfig = exports.resolveEndpointConfig = exports.getEndpointPlugin = exports.endpointMiddlewareOptions = exports.endpointMiddleware = exports.toEndpointV1 = exports.resolveParams = exports.getEndpointFromInstructions = void 0;
	var endpoints_1 = (init_endpoints(), __toCommonJS(endpoints_exports));
	Object.defineProperty(exports, "getEndpointFromInstructions", {
		enumerable: true,
		get: function() {
			return endpoints_1.getEndpointFromInstructions;
		}
	});
	Object.defineProperty(exports, "resolveParams", {
		enumerable: true,
		get: function() {
			return endpoints_1.resolveParams;
		}
	});
	Object.defineProperty(exports, "toEndpointV1", {
		enumerable: true,
		get: function() {
			return endpoints_1.toEndpointV1;
		}
	});
	Object.defineProperty(exports, "endpointMiddleware", {
		enumerable: true,
		get: function() {
			return endpoints_1.endpointMiddleware;
		}
	});
	Object.defineProperty(exports, "endpointMiddlewareOptions", {
		enumerable: true,
		get: function() {
			return endpoints_1.endpointMiddlewareOptions;
		}
	});
	Object.defineProperty(exports, "getEndpointPlugin", {
		enumerable: true,
		get: function() {
			return endpoints_1.getEndpointPlugin;
		}
	});
	Object.defineProperty(exports, "resolveEndpointConfig", {
		enumerable: true,
		get: function() {
			return endpoints_1.resolveEndpointConfig;
		}
	});
	Object.defineProperty(exports, "resolveEndpointRequiredConfig", {
		enumerable: true,
		get: function() {
			return endpoints_1.resolveEndpointRequiredConfig;
		}
	});
}));
//#endregion
//#region node_modules/@smithy/middleware-retry/dist-cjs/index.js
var require_dist_cjs$26 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.retryMiddlewareOptions = exports.retryMiddleware = exports.resolveRetryConfig = exports.omitRetryHeadersMiddlewareOptions = exports.omitRetryHeadersMiddleware = exports.getRetryPlugin = exports.getRetryAfterHint = exports.getOmitRetryHeadersPlugin = exports.defaultRetryDecider = exports.defaultDelayDecider = exports.NODE_RETRY_MODE_CONFIG_OPTIONS = exports.NODE_MAX_ATTEMPT_CONFIG_OPTIONS = exports.ENV_RETRY_MODE = exports.ENV_MAX_ATTEMPTS = exports.CONFIG_RETRY_MODE = exports.CONFIG_MAX_ATTEMPTS = exports.StandardRetryStrategy = exports.AdaptiveRetryStrategy = void 0;
	var retry_1 = (init_retry(), __toCommonJS(retry_exports));
	Object.defineProperty(exports, "AdaptiveRetryStrategy", {
		enumerable: true,
		get: function() {
			return retry_1.DeprecatedAdaptiveRetryStrategy;
		}
	});
	Object.defineProperty(exports, "StandardRetryStrategy", {
		enumerable: true,
		get: function() {
			return retry_1.DeprecatedStandardRetryStrategy;
		}
	});
	Object.defineProperty(exports, "CONFIG_MAX_ATTEMPTS", {
		enumerable: true,
		get: function() {
			return retry_1.CONFIG_MAX_ATTEMPTS;
		}
	});
	Object.defineProperty(exports, "CONFIG_RETRY_MODE", {
		enumerable: true,
		get: function() {
			return retry_1.CONFIG_RETRY_MODE;
		}
	});
	Object.defineProperty(exports, "ENV_MAX_ATTEMPTS", {
		enumerable: true,
		get: function() {
			return retry_1.ENV_MAX_ATTEMPTS;
		}
	});
	Object.defineProperty(exports, "ENV_RETRY_MODE", {
		enumerable: true,
		get: function() {
			return retry_1.ENV_RETRY_MODE;
		}
	});
	Object.defineProperty(exports, "NODE_MAX_ATTEMPT_CONFIG_OPTIONS", {
		enumerable: true,
		get: function() {
			return retry_1.NODE_MAX_ATTEMPT_CONFIG_OPTIONS;
		}
	});
	Object.defineProperty(exports, "NODE_RETRY_MODE_CONFIG_OPTIONS", {
		enumerable: true,
		get: function() {
			return retry_1.NODE_RETRY_MODE_CONFIG_OPTIONS;
		}
	});
	Object.defineProperty(exports, "defaultDelayDecider", {
		enumerable: true,
		get: function() {
			return retry_1.defaultDelayDecider;
		}
	});
	Object.defineProperty(exports, "defaultRetryDecider", {
		enumerable: true,
		get: function() {
			return retry_1.defaultRetryDecider;
		}
	});
	Object.defineProperty(exports, "getOmitRetryHeadersPlugin", {
		enumerable: true,
		get: function() {
			return retry_1.getOmitRetryHeadersPlugin;
		}
	});
	Object.defineProperty(exports, "getRetryAfterHint", {
		enumerable: true,
		get: function() {
			return retry_1.getRetryAfterHint;
		}
	});
	Object.defineProperty(exports, "getRetryPlugin", {
		enumerable: true,
		get: function() {
			return retry_1.getRetryPlugin;
		}
	});
	Object.defineProperty(exports, "omitRetryHeadersMiddleware", {
		enumerable: true,
		get: function() {
			return retry_1.omitRetryHeadersMiddleware;
		}
	});
	Object.defineProperty(exports, "omitRetryHeadersMiddlewareOptions", {
		enumerable: true,
		get: function() {
			return retry_1.omitRetryHeadersMiddlewareOptions;
		}
	});
	Object.defineProperty(exports, "resolveRetryConfig", {
		enumerable: true,
		get: function() {
			return retry_1.resolveRetryConfig;
		}
	});
	Object.defineProperty(exports, "retryMiddleware", {
		enumerable: true,
		get: function() {
			return retry_1.retryMiddleware;
		}
	});
	Object.defineProperty(exports, "retryMiddlewareOptions", {
		enumerable: true,
		get: function() {
			return retry_1.retryMiddlewareOptions;
		}
	});
}));
//#endregion
//#region node_modules/@smithy/smithy-client/dist-cjs/index.js
var require_dist_cjs$25 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.createAggregatedClient = exports.convertMap = exports._json = exports.ServiceException = exports.SENSITIVE_STRING = exports.NoOpLogger = exports.Command = exports.Client = exports.strictParseShort = exports.strictParseLong = exports.strictParseInt32 = exports.strictParseInt = exports.strictParseFloat32 = exports.strictParseFloat = exports.strictParseDouble = exports.strictParseByte = exports.splitHeader = exports.splitEvery = exports.quoteHeader = exports.parseRfc7231DateTime = exports.parseRfc3339DateTimeWithOffset = exports.parseRfc3339DateTime = exports.parseEpochTimestamp = exports.parseBoolean = exports.nv = exports.logger = exports.limitedParseFloat32 = exports.limitedParseFloat = exports.limitedParseDouble = exports.handleFloat = exports.generateIdempotencyToken = exports.expectUnion = exports.expectString = exports.expectShort = exports.expectObject = exports.expectNumber = exports.expectNonNull = exports.expectLong = exports.expectInt32 = exports.expectInt = exports.expectFloat32 = exports.expectByte = exports.expectBoolean = exports.dateToUtcString = exports.copyDocumentWithTransform = exports._parseRfc7231DateTime = exports._parseRfc3339DateTimeWithOffset = exports._parseEpochTimestamp = exports.NumericValue = exports.LazyJsonString = void 0;
	exports.resolvedPath = exports.extendedEncodeURIComponent = exports.collectBody = exports.withBaseException = exports.throwDefaultError = exports.take = exports.serializeFloat = exports.serializeDateTime = exports.resolveDefaultRuntimeConfig = exports.map = exports.loadConfigsForDefaultMode = exports.isSerializableHeaderValue = exports.getValueFromTextNode = exports.getDefaultExtensionConfiguration = exports.getDefaultClientConfiguration = exports.getArrayIfSingleItem = exports.emitWarningIfUnsupportedVersion = exports.decorateServiceException = void 0;
	var serde_1 = (init_serde(), __toCommonJS(serde_exports));
	Object.defineProperty(exports, "LazyJsonString", {
		enumerable: true,
		get: function() {
			return serde_1.LazyJsonString;
		}
	});
	Object.defineProperty(exports, "NumericValue", {
		enumerable: true,
		get: function() {
			return serde_1.NumericValue;
		}
	});
	Object.defineProperty(exports, "_parseEpochTimestamp", {
		enumerable: true,
		get: function() {
			return serde_1._parseEpochTimestamp;
		}
	});
	Object.defineProperty(exports, "_parseRfc3339DateTimeWithOffset", {
		enumerable: true,
		get: function() {
			return serde_1._parseRfc3339DateTimeWithOffset;
		}
	});
	Object.defineProperty(exports, "_parseRfc7231DateTime", {
		enumerable: true,
		get: function() {
			return serde_1._parseRfc7231DateTime;
		}
	});
	Object.defineProperty(exports, "copyDocumentWithTransform", {
		enumerable: true,
		get: function() {
			return serde_1.copyDocumentWithTransform;
		}
	});
	Object.defineProperty(exports, "dateToUtcString", {
		enumerable: true,
		get: function() {
			return serde_1.dateToUtcString;
		}
	});
	Object.defineProperty(exports, "expectBoolean", {
		enumerable: true,
		get: function() {
			return serde_1.expectBoolean;
		}
	});
	Object.defineProperty(exports, "expectByte", {
		enumerable: true,
		get: function() {
			return serde_1.expectByte;
		}
	});
	Object.defineProperty(exports, "expectFloat32", {
		enumerable: true,
		get: function() {
			return serde_1.expectFloat32;
		}
	});
	Object.defineProperty(exports, "expectInt", {
		enumerable: true,
		get: function() {
			return serde_1.expectInt;
		}
	});
	Object.defineProperty(exports, "expectInt32", {
		enumerable: true,
		get: function() {
			return serde_1.expectInt32;
		}
	});
	Object.defineProperty(exports, "expectLong", {
		enumerable: true,
		get: function() {
			return serde_1.expectLong;
		}
	});
	Object.defineProperty(exports, "expectNonNull", {
		enumerable: true,
		get: function() {
			return serde_1.expectNonNull;
		}
	});
	Object.defineProperty(exports, "expectNumber", {
		enumerable: true,
		get: function() {
			return serde_1.expectNumber;
		}
	});
	Object.defineProperty(exports, "expectObject", {
		enumerable: true,
		get: function() {
			return serde_1.expectObject;
		}
	});
	Object.defineProperty(exports, "expectShort", {
		enumerable: true,
		get: function() {
			return serde_1.expectShort;
		}
	});
	Object.defineProperty(exports, "expectString", {
		enumerable: true,
		get: function() {
			return serde_1.expectString;
		}
	});
	Object.defineProperty(exports, "expectUnion", {
		enumerable: true,
		get: function() {
			return serde_1.expectUnion;
		}
	});
	Object.defineProperty(exports, "generateIdempotencyToken", {
		enumerable: true,
		get: function() {
			return serde_1.generateIdempotencyToken;
		}
	});
	Object.defineProperty(exports, "handleFloat", {
		enumerable: true,
		get: function() {
			return serde_1.handleFloat;
		}
	});
	Object.defineProperty(exports, "limitedParseDouble", {
		enumerable: true,
		get: function() {
			return serde_1.limitedParseDouble;
		}
	});
	Object.defineProperty(exports, "limitedParseFloat", {
		enumerable: true,
		get: function() {
			return serde_1.limitedParseFloat;
		}
	});
	Object.defineProperty(exports, "limitedParseFloat32", {
		enumerable: true,
		get: function() {
			return serde_1.limitedParseFloat32;
		}
	});
	Object.defineProperty(exports, "logger", {
		enumerable: true,
		get: function() {
			return serde_1.logger;
		}
	});
	Object.defineProperty(exports, "nv", {
		enumerable: true,
		get: function() {
			return serde_1.nv;
		}
	});
	Object.defineProperty(exports, "parseBoolean", {
		enumerable: true,
		get: function() {
			return serde_1.parseBoolean;
		}
	});
	Object.defineProperty(exports, "parseEpochTimestamp", {
		enumerable: true,
		get: function() {
			return serde_1.parseEpochTimestamp;
		}
	});
	Object.defineProperty(exports, "parseRfc3339DateTime", {
		enumerable: true,
		get: function() {
			return serde_1.parseRfc3339DateTime;
		}
	});
	Object.defineProperty(exports, "parseRfc3339DateTimeWithOffset", {
		enumerable: true,
		get: function() {
			return serde_1.parseRfc3339DateTimeWithOffset;
		}
	});
	Object.defineProperty(exports, "parseRfc7231DateTime", {
		enumerable: true,
		get: function() {
			return serde_1.parseRfc7231DateTime;
		}
	});
	Object.defineProperty(exports, "quoteHeader", {
		enumerable: true,
		get: function() {
			return serde_1.quoteHeader;
		}
	});
	Object.defineProperty(exports, "splitEvery", {
		enumerable: true,
		get: function() {
			return serde_1.splitEvery;
		}
	});
	Object.defineProperty(exports, "splitHeader", {
		enumerable: true,
		get: function() {
			return serde_1.splitHeader;
		}
	});
	Object.defineProperty(exports, "strictParseByte", {
		enumerable: true,
		get: function() {
			return serde_1.strictParseByte;
		}
	});
	Object.defineProperty(exports, "strictParseDouble", {
		enumerable: true,
		get: function() {
			return serde_1.strictParseDouble;
		}
	});
	Object.defineProperty(exports, "strictParseFloat", {
		enumerable: true,
		get: function() {
			return serde_1.strictParseFloat;
		}
	});
	Object.defineProperty(exports, "strictParseFloat32", {
		enumerable: true,
		get: function() {
			return serde_1.strictParseFloat32;
		}
	});
	Object.defineProperty(exports, "strictParseInt", {
		enumerable: true,
		get: function() {
			return serde_1.strictParseInt;
		}
	});
	Object.defineProperty(exports, "strictParseInt32", {
		enumerable: true,
		get: function() {
			return serde_1.strictParseInt32;
		}
	});
	Object.defineProperty(exports, "strictParseLong", {
		enumerable: true,
		get: function() {
			return serde_1.strictParseLong;
		}
	});
	Object.defineProperty(exports, "strictParseShort", {
		enumerable: true,
		get: function() {
			return serde_1.strictParseShort;
		}
	});
	var client_1 = (init_client$1(), __toCommonJS(client_exports$1));
	Object.defineProperty(exports, "Client", {
		enumerable: true,
		get: function() {
			return client_1.Client;
		}
	});
	Object.defineProperty(exports, "Command", {
		enumerable: true,
		get: function() {
			return client_1.Command;
		}
	});
	Object.defineProperty(exports, "NoOpLogger", {
		enumerable: true,
		get: function() {
			return client_1.NoOpLogger;
		}
	});
	Object.defineProperty(exports, "SENSITIVE_STRING", {
		enumerable: true,
		get: function() {
			return client_1.SENSITIVE_STRING;
		}
	});
	Object.defineProperty(exports, "ServiceException", {
		enumerable: true,
		get: function() {
			return client_1.ServiceException;
		}
	});
	Object.defineProperty(exports, "_json", {
		enumerable: true,
		get: function() {
			return client_1._json;
		}
	});
	Object.defineProperty(exports, "convertMap", {
		enumerable: true,
		get: function() {
			return client_1.convertMap;
		}
	});
	Object.defineProperty(exports, "createAggregatedClient", {
		enumerable: true,
		get: function() {
			return client_1.createAggregatedClient;
		}
	});
	Object.defineProperty(exports, "decorateServiceException", {
		enumerable: true,
		get: function() {
			return client_1.decorateServiceException;
		}
	});
	Object.defineProperty(exports, "emitWarningIfUnsupportedVersion", {
		enumerable: true,
		get: function() {
			return client_1.emitWarningIfUnsupportedVersion;
		}
	});
	Object.defineProperty(exports, "getArrayIfSingleItem", {
		enumerable: true,
		get: function() {
			return client_1.getArrayIfSingleItem;
		}
	});
	Object.defineProperty(exports, "getDefaultClientConfiguration", {
		enumerable: true,
		get: function() {
			return client_1.getDefaultClientConfiguration;
		}
	});
	Object.defineProperty(exports, "getDefaultExtensionConfiguration", {
		enumerable: true,
		get: function() {
			return client_1.getDefaultExtensionConfiguration;
		}
	});
	Object.defineProperty(exports, "getValueFromTextNode", {
		enumerable: true,
		get: function() {
			return client_1.getValueFromTextNode;
		}
	});
	Object.defineProperty(exports, "isSerializableHeaderValue", {
		enumerable: true,
		get: function() {
			return client_1.isSerializableHeaderValue;
		}
	});
	Object.defineProperty(exports, "loadConfigsForDefaultMode", {
		enumerable: true,
		get: function() {
			return client_1.loadConfigsForDefaultMode;
		}
	});
	Object.defineProperty(exports, "map", {
		enumerable: true,
		get: function() {
			return client_1.map;
		}
	});
	Object.defineProperty(exports, "resolveDefaultRuntimeConfig", {
		enumerable: true,
		get: function() {
			return client_1.resolveDefaultRuntimeConfig;
		}
	});
	Object.defineProperty(exports, "serializeDateTime", {
		enumerable: true,
		get: function() {
			return client_1.serializeDateTime;
		}
	});
	Object.defineProperty(exports, "serializeFloat", {
		enumerable: true,
		get: function() {
			return client_1.serializeFloat;
		}
	});
	Object.defineProperty(exports, "take", {
		enumerable: true,
		get: function() {
			return client_1.take;
		}
	});
	Object.defineProperty(exports, "throwDefaultError", {
		enumerable: true,
		get: function() {
			return client_1.throwDefaultError;
		}
	});
	Object.defineProperty(exports, "withBaseException", {
		enumerable: true,
		get: function() {
			return client_1.withBaseException;
		}
	});
	var protocols_1 = (init_protocols$1(), __toCommonJS(protocols_exports));
	Object.defineProperty(exports, "collectBody", {
		enumerable: true,
		get: function() {
			return protocols_1.collectBody;
		}
	});
	Object.defineProperty(exports, "extendedEncodeURIComponent", {
		enumerable: true,
		get: function() {
			return protocols_1.extendedEncodeURIComponent;
		}
	});
	Object.defineProperty(exports, "resolvedPath", {
		enumerable: true,
		get: function() {
			return protocols_1.resolvedPath;
		}
	});
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/httpAuthSchemes/utils/getDateHeader.js
var getDateHeader, getAgeHeader;
var init_getDateHeader = __esmMin((() => {
	init_protocols$1();
	getDateHeader = (response) => HttpResponse.isInstance(response) ? response.headers?.date ?? response.headers?.Date : void 0;
	getAgeHeader = (response) => HttpResponse.isInstance(response) ? response.headers?.age ?? response.headers?.Age : void 0;
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/httpAuthSchemes/utils/getSkewCorrectedDate.js
var getSkewCorrectedDate;
var init_getSkewCorrectedDate = __esmMin((() => {
	getSkewCorrectedDate = (systemClockOffset) => new Date(Date.now() + systemClockOffset);
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/httpAuthSchemes/utils/getUpdatedSystemClockOffset.js
var getUpdatedSystemClockOffset;
var init_getUpdatedSystemClockOffset = __esmMin((() => {
	getUpdatedSystemClockOffset = (clockTime, currentSystemClockOffset, timeRequestSent, ageHeader) => {
		if (ageHeader !== void 0) return currentSystemClockOffset;
		const serverTime = Date.parse(clockTime);
		if (Number.isNaN(serverTime)) return currentSystemClockOffset;
		const timeResponseReceived = Date.now();
		if (timeRequestSent !== void 0 && timeResponseReceived - timeRequestSent > 9e5) return currentSystemClockOffset;
		return serverTime - timeResponseReceived;
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/httpAuthSchemes/utils/index.js
var init_utils = __esmMin((() => {
	init_getDateHeader();
	init_getSkewCorrectedDate();
	init_getUpdatedSystemClockOffset();
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/httpAuthSchemes/aws_sdk/AwsSdkSigV4Signer.js
var import_dist_cjs$3, throwSigningPropertyError, hasEventStreamOutput, validateSigningProperties, AwsSdkSigV4Signer, AWSSDKSigV4Signer;
var init_AwsSdkSigV4Signer = __esmMin((() => {
	init_protocols$1();
	import_dist_cjs$3 = require_dist_cjs$40();
	init_utils();
	throwSigningPropertyError = (name, property) => {
		if (!property) throw new Error(`Property \`${name}\` is not resolved for AWS SDK SigV4Auth`);
		return property;
	};
	hasEventStreamOutput = (signingProperties) => {
		return (signingProperties.context?.[import_dist_cjs$3.SMITHY_CONTEXT_KEY]?.eventStream)?.output === true;
	};
	validateSigningProperties = async (signingProperties) => {
		const context = throwSigningPropertyError("context", signingProperties.context);
		const config = throwSigningPropertyError("config", signingProperties.config);
		const authScheme = context.endpointV2?.properties?.authSchemes?.[0];
		return {
			config,
			signer: await throwSigningPropertyError("signer", config.signer)(authScheme),
			signingRegion: signingProperties?.signingRegion,
			signingRegionSet: signingProperties?.signingRegionSet,
			signingName: signingProperties?.signingName
		};
	};
	AwsSdkSigV4Signer = class {
		async sign(httpRequest, identity, signingProperties) {
			if (!HttpRequest.isInstance(httpRequest)) throw new Error("The request is not an instance of `HttpRequest` and cannot be signed");
			const validatedProps = await validateSigningProperties(signingProperties);
			const { config, signer } = validatedProps;
			let { signingRegion, signingName } = validatedProps;
			const handlerExecutionContext = signingProperties.context;
			if (handlerExecutionContext?.authSchemes?.length ?? false) {
				const [first, second] = handlerExecutionContext.authSchemes;
				if (first?.name === "sigv4a" && second?.name === "sigv4") {
					signingRegion = second?.signingRegion ?? signingRegion;
					signingName = second?.signingName ?? signingName;
				}
			}
			const noSkewCorrection = await config.disableClockSkewCorrection?.() === true;
			signingProperties._disableClockSkewCorrection = noSkewCorrection;
			const skipSkewSampling = noSkewCorrection || hasEventStreamOutput(signingProperties);
			signingProperties._skipClockSkewSampling = skipSkewSampling;
			if (!skipSkewSampling) {
				signingProperties._preRequestSystemClockOffset = config.systemClockOffset;
				signingProperties._requestSentAt = Date.now();
			}
			return await signer.sign(httpRequest, {
				signingDate: noSkewCorrection ? /* @__PURE__ */ new Date() : getSkewCorrectedDate(config.systemClockOffset),
				signingRegion,
				signingService: signingName
			});
		}
		errorHandler(signingProperties) {
			return (error) => {
				const errorException = error;
				if (!signingProperties._skipClockSkewSampling && !signingProperties._disableClockSkewCorrection) {
					const serverTime = errorException.ServerTime ?? getDateHeader(errorException.$response);
					if (serverTime) {
						const config = throwSigningPropertyError("config", signingProperties.config);
						const preRequestOffset = signingProperties._preRequestSystemClockOffset;
						const timeRequestSent = signingProperties._requestSentAt;
						const ageHeader = getAgeHeader(errorException.$response);
						const newOffset = getUpdatedSystemClockOffset(serverTime, config.systemClockOffset, timeRequestSent, ageHeader);
						config.systemClockOffset = newOffset;
						if (Math.abs(newOffset) >= 24e4 && (newOffset !== preRequestOffset || preRequestOffset !== void 0 && preRequestOffset !== newOffset) && errorException.$metadata) errorException.$metadata.clockSkewCorrected = true;
					}
				}
				throw error;
			};
		}
		successHandler(httpResponse, signingProperties) {
			if (signingProperties._skipClockSkewSampling || signingProperties._disableClockSkewCorrection) return;
			const dateHeader = getDateHeader(httpResponse);
			if (dateHeader) {
				const config = throwSigningPropertyError("config", signingProperties.config);
				const timeRequestSent = signingProperties._requestSentAt;
				const ageHeader = getAgeHeader(httpResponse);
				config.systemClockOffset = getUpdatedSystemClockOffset(dateHeader, config.systemClockOffset, timeRequestSent, ageHeader);
			}
		}
	};
	AWSSDKSigV4Signer = AwsSdkSigV4Signer;
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/httpAuthSchemes/aws_sdk/AwsSdkSigV4ASigner.js
var AwsSdkSigV4ASigner;
var init_AwsSdkSigV4ASigner = __esmMin((() => {
	init_protocols$1();
	init_utils();
	init_AwsSdkSigV4Signer();
	AwsSdkSigV4ASigner = class extends AwsSdkSigV4Signer {
		async sign(httpRequest, identity, signingProperties) {
			if (!HttpRequest.isInstance(httpRequest)) throw new Error("The request is not an instance of `HttpRequest` and cannot be signed");
			const { config, signer, signingRegion, signingRegionSet, signingName } = await validateSigningProperties(signingProperties);
			const multiRegionOverride = (await config.sigv4aSigningRegionSet?.() ?? signingRegionSet ?? [signingRegion]).join(",");
			const noSkewCorrection = await config.disableClockSkewCorrection?.() === true;
			signingProperties._disableClockSkewCorrection = noSkewCorrection;
			if (!noSkewCorrection) {
				signingProperties._preRequestSystemClockOffset = config.systemClockOffset;
				signingProperties._requestSentAt = Date.now();
			}
			return await signer.sign(httpRequest, {
				signingDate: noSkewCorrection ? /* @__PURE__ */ new Date() : getSkewCorrectedDate(config.systemClockOffset),
				signingRegion: multiRegionOverride,
				signingService: signingName
			});
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/httpAuthSchemes/utils/getArrayForCommaSeparatedString.js
var getArrayForCommaSeparatedString;
var init_getArrayForCommaSeparatedString = __esmMin((() => {
	getArrayForCommaSeparatedString = (str) => typeof str === "string" && str.length > 0 ? str.split(",").map((item) => item.trim()) : [];
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/httpAuthSchemes/utils/getBearerTokenEnvKey.js
var getBearerTokenEnvKey;
var init_getBearerTokenEnvKey = __esmMin((() => {
	getBearerTokenEnvKey = (signingName) => `AWS_BEARER_TOKEN_${signingName.replace(/[\s-]/g, "_").toUpperCase()}`;
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/httpAuthSchemes/aws_sdk/NODE_AUTH_SCHEME_PREFERENCE_OPTIONS.js
var NODE_AUTH_SCHEME_PREFERENCE_ENV_KEY, NODE_AUTH_SCHEME_PREFERENCE_CONFIG_KEY, NODE_AUTH_SCHEME_PREFERENCE_OPTIONS;
var init_NODE_AUTH_SCHEME_PREFERENCE_OPTIONS = __esmMin((() => {
	init_getArrayForCommaSeparatedString();
	init_getBearerTokenEnvKey();
	NODE_AUTH_SCHEME_PREFERENCE_ENV_KEY = "AWS_AUTH_SCHEME_PREFERENCE";
	NODE_AUTH_SCHEME_PREFERENCE_CONFIG_KEY = "auth_scheme_preference";
	NODE_AUTH_SCHEME_PREFERENCE_OPTIONS = {
		environmentVariableSelector: (env, options) => {
			if (options?.signingName) {
				if (getBearerTokenEnvKey(options.signingName) in env) return ["httpBearerAuth"];
			}
			if (!(NODE_AUTH_SCHEME_PREFERENCE_ENV_KEY in env)) return;
			return getArrayForCommaSeparatedString(env[NODE_AUTH_SCHEME_PREFERENCE_ENV_KEY]);
		},
		configFileSelector: (profile) => {
			if (!(NODE_AUTH_SCHEME_PREFERENCE_CONFIG_KEY in profile)) return;
			return getArrayForCommaSeparatedString(profile[NODE_AUTH_SCHEME_PREFERENCE_CONFIG_KEY]);
		},
		default: []
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4AConfig.js
var resolveAwsSdkSigV4AConfig, NODE_SIGV4A_CONFIG_OPTIONS;
var init_resolveAwsSdkSigV4AConfig = __esmMin((() => {
	init_dist_es$1();
	init_config$1();
	resolveAwsSdkSigV4AConfig = (config) => {
		config.sigv4aSigningRegionSet = normalizeProvider(config.sigv4aSigningRegionSet);
		return config;
	};
	NODE_SIGV4A_CONFIG_OPTIONS = {
		environmentVariableSelector(env) {
			if (env.AWS_SIGV4A_SIGNING_REGION_SET) return env.AWS_SIGV4A_SIGNING_REGION_SET.split(",").map((_) => _.trim());
			throw new ProviderError("AWS_SIGV4A_SIGNING_REGION_SET not set in env.", { tryNextLink: true });
		},
		configFileSelector(profile) {
			if (profile.sigv4a_signing_region_set) return (profile.sigv4a_signing_region_set ?? "").split(",").map((_) => _.trim());
			throw new ProviderError("sigv4a_signing_region_set not set in profile.", { tryNextLink: true });
		},
		default: void 0
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.js
function normalizeCredentialProvider(config, { credentials, credentialDefaultProvider }) {
	let credentialsProvider;
	if (credentials) if (!credentials?.memoized) credentialsProvider = memoizeIdentityProvider(credentials, isIdentityExpired, doesIdentityRequireRefresh);
	else credentialsProvider = credentials;
	else if (credentialDefaultProvider) credentialsProvider = normalizeProvider(credentialDefaultProvider(Object.assign({}, config, { parentClientConfig: config })));
	else credentialsProvider = async () => {
		throw new Error("@aws-sdk/core::resolveAwsSdkSigV4Config - `credentials` not provided and no credentialDefaultProvider was configured.");
	};
	credentialsProvider.memoized = true;
	return credentialsProvider;
}
function bindCallerConfig(config, credentialsProvider) {
	if (credentialsProvider.configBound) return credentialsProvider;
	const fn = async (options) => credentialsProvider({
		...options,
		callerClientConfig: config
	});
	fn.memoized = credentialsProvider.memoized;
	fn.configBound = true;
	return fn;
}
var import_dist_cjs$2, bindResolveAwsSdkSigV4Config;
var init_resolveAwsSdkSigV4Config = __esmMin((() => {
	init_client();
	init_dist_es$1();
	import_dist_cjs$2 = require_dist_cjs$39();
	bindResolveAwsSdkSigV4Config = (defaultDisableClockSkewCorrection) => (config) => {
		let inputCredentials = config.credentials;
		let isUserSupplied = !!config.credentials;
		let resolvedCredentials = void 0;
		Object.defineProperty(config, "credentials", {
			set(credentials) {
				if (credentials && credentials !== inputCredentials && credentials !== resolvedCredentials) isUserSupplied = true;
				inputCredentials = credentials;
				const boundProvider = bindCallerConfig(config, normalizeCredentialProvider(config, {
					credentials: inputCredentials,
					credentialDefaultProvider: config.credentialDefaultProvider
				}));
				if (isUserSupplied && !boundProvider.attributed) {
					const isCredentialObject = typeof inputCredentials === "object" && inputCredentials !== null;
					resolvedCredentials = async (options) => {
						const attributedCreds = await boundProvider(options);
						if (isCredentialObject && (!attributedCreds.$source || Object.keys(attributedCreds.$source).length === 0)) return setCredentialFeature(attributedCreds, "CREDENTIALS_CODE", "e");
						return attributedCreds;
					};
					resolvedCredentials.memoized = boundProvider.memoized;
					resolvedCredentials.configBound = boundProvider.configBound;
					resolvedCredentials.attributed = true;
				} else resolvedCredentials = boundProvider;
			},
			get() {
				return resolvedCredentials;
			},
			enumerable: true,
			configurable: true
		});
		config.credentials = inputCredentials;
		const { signingEscapePath = true, systemClockOffset = config.systemClockOffset || 0, sha256 } = config;
		let signer;
		if (config.signer) signer = normalizeProvider(config.signer);
		else if (config.regionInfoProvider) signer = () => normalizeProvider(config.region)().then(async (region) => [await config.regionInfoProvider(region, {
			useFipsEndpoint: await config.useFipsEndpoint(),
			useDualstackEndpoint: await config.useDualstackEndpoint()
		}) || {}, region]).then(([regionInfo, region]) => {
			const { signingRegion, signingService } = regionInfo;
			config.signingRegion = config.signingRegion || signingRegion || region;
			config.signingName = config.signingName || signingService || config.serviceId;
			const params = {
				...config,
				credentials: config.credentials,
				region: config.signingRegion,
				service: config.signingName,
				sha256,
				uriEscapePath: signingEscapePath
			};
			return new (config.signerConstructor || import_dist_cjs$2.SignatureV4)(params);
		});
		else signer = async (authScheme) => {
			authScheme = Object.assign({}, {
				name: "sigv4",
				signingName: config.signingName || config.defaultSigningName,
				signingRegion: await normalizeProvider(config.region)(),
				properties: {}
			}, authScheme);
			const signingRegion = authScheme.signingRegion;
			const signingService = authScheme.signingName;
			config.signingRegion = config.signingRegion || signingRegion;
			config.signingName = config.signingName || signingService || config.serviceId;
			const params = {
				...config,
				credentials: config.credentials,
				region: config.signingRegion,
				service: config.signingName,
				sha256,
				uriEscapePath: signingEscapePath
			};
			return new (config.signerConstructor || import_dist_cjs$2.SignatureV4)(params);
		};
		return Object.assign(config, {
			systemClockOffset,
			signingEscapePath,
			signer,
			disableClockSkewCorrection: normalizeProvider(config.disableClockSkewCorrection ?? defaultDisableClockSkewCorrection)
		});
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/httpAuthSchemes/aws_sdk/index.js
var init_aws_sdk = __esmMin((() => {
	init_AwsSdkSigV4Signer();
	init_AwsSdkSigV4ASigner();
	init_NODE_AUTH_SCHEME_PREFERENCE_OPTIONS();
	init_resolveAwsSdkSigV4AConfig();
	init_resolveAwsSdkSigV4Config();
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/httpAuthSchemes/aws_sdk/clock-skew-node-config.js
var ENV_DISABLE_CLOCK_SKEW_CORRECTION, CONFIG_DISABLE_CLOCK_SKEW_CORRECTION, NODE_DISABLE_CLOCK_SKEW_CORRECTION_CONFIG_OPTIONS;
var init_clock_skew_node_config = __esmMin((() => {
	init_config$1();
	ENV_DISABLE_CLOCK_SKEW_CORRECTION = "AWS_DISABLE_CLOCK_SKEW_CORRECTION";
	CONFIG_DISABLE_CLOCK_SKEW_CORRECTION = "disable_clock_skew_correction";
	NODE_DISABLE_CLOCK_SKEW_CORRECTION_CONFIG_OPTIONS = {
		environmentVariableSelector: (env) => booleanSelector(env, ENV_DISABLE_CLOCK_SKEW_CORRECTION, SelectorType$1.ENV),
		configFileSelector: (profile) => booleanSelector(profile, CONFIG_DISABLE_CLOCK_SKEW_CORRECTION, SelectorType$1.CONFIG),
		default: false
	};
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/httpAuthSchemes/aws_sdk/clock-skew-defaults.js
var DEFAULT_DISABLE_CLOCK_SKEW_CORRECTION;
var init_clock_skew_defaults = __esmMin((() => {
	init_config$1();
	init_clock_skew_node_config();
	DEFAULT_DISABLE_CLOCK_SKEW_CORRECTION = loadConfig(NODE_DISABLE_CLOCK_SKEW_CORRECTION_CONFIG_OPTIONS);
}));
//#endregion
//#region node_modules/@aws-sdk/core/dist-es/submodules/httpAuthSchemes/index.js
var httpAuthSchemes_exports = /* @__PURE__ */ __exportAll({
	AWSSDKSigV4Signer: () => AWSSDKSigV4Signer,
	AwsSdkSigV4ASigner: () => AwsSdkSigV4ASigner,
	AwsSdkSigV4Signer: () => AwsSdkSigV4Signer,
	NODE_AUTH_SCHEME_PREFERENCE_OPTIONS: () => NODE_AUTH_SCHEME_PREFERENCE_OPTIONS,
	NODE_SIGV4A_CONFIG_OPTIONS: () => NODE_SIGV4A_CONFIG_OPTIONS,
	getBearerTokenEnvKey: () => getBearerTokenEnvKey,
	resolveAWSSDKSigV4Config: () => resolveAWSSDKSigV4Config,
	resolveAwsSdkSigV4AConfig: () => resolveAwsSdkSigV4AConfig,
	resolveAwsSdkSigV4Config: () => resolveAwsSdkSigV4Config,
	validateSigningProperties: () => validateSigningProperties
});
var resolveAwsSdkSigV4Config, resolveAWSSDKSigV4Config;
var init_httpAuthSchemes = __esmMin((() => {
	init_aws_sdk();
	init_getBearerTokenEnvKey();
	init_clock_skew_defaults();
	resolveAwsSdkSigV4Config = bindResolveAwsSdkSigV4Config(DEFAULT_DISABLE_CLOCK_SKEW_CORRECTION);
	resolveAWSSDKSigV4Config = resolveAwsSdkSigV4Config;
}));
//#endregion
//#region node_modules/@smithy/util-middleware/dist-cjs/index.js
var require_dist_cjs$24 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.normalizeProvider = exports.getSmithyContext = void 0;
	var client_1 = (init_client$1(), __toCommonJS(client_exports$1));
	Object.defineProperty(exports, "getSmithyContext", {
		enumerable: true,
		get: function() {
			return client_1.getSmithyContext;
		}
	});
	Object.defineProperty(exports, "normalizeProvider", {
		enumerable: true,
		get: function() {
			return client_1.normalizeProvider;
		}
	});
}));
//#endregion
//#region node_modules/@aws-sdk/util-endpoints/dist-cjs/index.js
var require_dist_cjs$23 = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { awsEndpointFunctions, getUserAgentPrefix, isIpAddress, partition, resolveDefaultAwsRegionalEndpointsConfig, resolveEndpoint, setPartitionInfo, toEndpointV1, useDefaultPartitionInfo } = (init_client(), __toCommonJS(client_exports));
	exports.awsEndpointFunctions = awsEndpointFunctions;
	exports.getUserAgentPrefix = getUserAgentPrefix;
	exports.isIpAddress = isIpAddress;
	exports.partition = partition;
	exports.resolveDefaultAwsRegionalEndpointsConfig = resolveDefaultAwsRegionalEndpointsConfig;
	exports.resolveEndpoint = resolveEndpoint;
	exports.setPartitionInfo = setPartitionInfo;
	exports.toEndpointV1 = toEndpointV1;
	exports.useDefaultPartitionInfo = useDefaultPartitionInfo;
	const { EndpointError } = (init_endpoints(), __toCommonJS(endpoints_exports));
	exports.EndpointError = EndpointError;
}));
//#endregion
//#region node_modules/@smithy/util-endpoints/dist-cjs/index.js
var require_dist_cjs$22 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.EndpointError = exports.resolveEndpoint = exports.customEndpointFunctions = exports.isValidHostLabel = exports.isIpAddress = exports.decideEndpoint = exports.EndpointCache = exports.BinaryDecisionDiagram = void 0;
	var endpoints_1 = (init_endpoints(), __toCommonJS(endpoints_exports));
	Object.defineProperty(exports, "BinaryDecisionDiagram", {
		enumerable: true,
		get: function() {
			return endpoints_1.BinaryDecisionDiagram;
		}
	});
	Object.defineProperty(exports, "EndpointCache", {
		enumerable: true,
		get: function() {
			return endpoints_1.EndpointCache;
		}
	});
	Object.defineProperty(exports, "decideEndpoint", {
		enumerable: true,
		get: function() {
			return endpoints_1.decideEndpoint;
		}
	});
	Object.defineProperty(exports, "isIpAddress", {
		enumerable: true,
		get: function() {
			return endpoints_1.isIpAddress;
		}
	});
	Object.defineProperty(exports, "isValidHostLabel", {
		enumerable: true,
		get: function() {
			return endpoints_1.isValidHostLabel;
		}
	});
	Object.defineProperty(exports, "customEndpointFunctions", {
		enumerable: true,
		get: function() {
			return endpoints_1.customEndpointFunctions;
		}
	});
	Object.defineProperty(exports, "resolveEndpoint", {
		enumerable: true,
		get: function() {
			return endpoints_1.resolveEndpoint;
		}
	});
	Object.defineProperty(exports, "EndpointError", {
		enumerable: true,
		get: function() {
			return endpoints_1.EndpointError;
		}
	});
}));
//#endregion
//#region node_modules/@aws-sdk/client-s3/dist-cjs/endpoint/bdd.js
var require_bdd = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.bdd = void 0;
	const util_endpoints_1 = require_dist_cjs$22();
	const av = "ref", aw = "argv", ax = "backend", ay = "authSchemes", az = "disableDoubleEncoding", aA = "signingName", aB = "signingRegion", aC = "signingRegionSet";
	const a = -1, b = true, c = false, d = "isSet", e = "booleanEquals", f = "stringEquals", g = "coalesce", h = "substring", i = "", j = "aws.partition", k = "partitionResult", l = "accessPointSuffix", m = "regionPrefix", n = (n) => "outpostId_ssa_" + n + i, o = "hardwareType", p = "ite", q = "isValidHostLabel", s = "sigv4", t = "aws.isVirtualHostableS3Bucket", u = "url", v = "getAttr", w = "bucketArn", x = "--", y = "arnType", z = "accesspoint", A = (n) => "accessPointName_ssa_" + n + i, B = "s3-object-lambda", C = "s3-outposts", D = "bucketPartition", E = "us-east-1", F = "outpostType", G = "name", H = "s3", I = "{url#scheme}://{Bucket}.{url#authority}{url#path}", J = "{url#scheme}://{url#authority}{url#path}", K = "{url#scheme}://{url#authority}{url#normalizedPath}{Bucket}", L = "https://{Bucket}.s3-accelerate.{partitionResult#dnsSuffix}", M = "https://{Bucket}.s3.{partitionResult#dnsSuffix}", N = (n) => "{url#scheme}://{accessPointName_ssa_" + n + "}-{bucketArn#accountId}.{url#authority}{url#path}", O = "sigv4a", P = "{url#scheme}://{url#authority}{url#normalizedPath}{uri_encoded_bucket}", Q = "https://s3.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", R = "https://s3.{partitionResult#dnsSuffix}", S = { [av]: "UseFIPS" }, T = { [av]: "UseDualStack" }, U = { [av]: "Bucket" }, V = {
		"fn": v,
		[aw]: [{ [av]: k }, G]
	}, W = { [av]: u }, X = { [av]: "Region" }, Y = { [av]: w }, Z = { [av]: y }, aa = { [av]: "accessPointName_ssa_1" }, ab = {
		"fn": v,
		[aw]: [Y, "region"]
	}, ac = { [av]: o }, ad = {
		"fn": v,
		[aw]: [Y, "service"]
	}, ae = {
		"fn": v,
		[aw]: [Y, "accountId"]
	}, af = {
		[ax]: "S3Express",
		[ay]: [{
			[az]: true,
			[G]: "{_s3e_auth}",
			[aA]: "s3express",
			[aB]: "{Region}"
		}]
	}, ag = {
		[ax]: "S3Express",
		[ay]: [{
			[az]: true,
			[G]: s,
			[aA]: "s3express",
			[aB]: "{Region}"
		}]
	}, ah = { [ay]: [{
		[az]: true,
		[G]: O,
		[aA]: C,
		[aC]: ["*"]
	}, {
		[az]: true,
		[G]: s,
		[aA]: C,
		[aB]: "{Region}"
	}] }, ai = { [ay]: [{
		[az]: true,
		[G]: s,
		[aA]: H,
		[aB]: E
	}] }, aj = { [ay]: [{
		[az]: true,
		[G]: s,
		[aA]: H,
		[aB]: "{Region}"
	}] }, ak = { [ay]: [{
		[az]: true,
		[G]: s,
		[aA]: B,
		[aB]: "{bucketArn#region}"
	}] }, al = { [ay]: [{
		[az]: true,
		[G]: s,
		[aA]: H,
		[aB]: "{bucketArn#region}"
	}] }, am = { [ay]: [{
		[az]: true,
		[G]: O,
		[aA]: C,
		[aC]: ["*"]
	}, {
		[az]: true,
		[G]: s,
		[aA]: C,
		[aB]: "{bucketArn#region}"
	}] }, an = { [ay]: [{
		[az]: true,
		[G]: s,
		[aA]: B,
		[aB]: "{Region}"
	}] }, ao = [X], ap = [{ [av]: "Endpoint" }], aq = [U], as = [
		U,
		0,
		7,
		true
	], at = [Y, "resourceId[1]"], au = ["*"];
	const _data = {
		conditions: [
			[d, ao],
			[e, [{ [av]: "Accelerate" }, b]],
			[e, [S, b]],
			[e, [T, b]],
			[d, ap],
			[d, aq],
			[f, [{
				fn: g,
				[aw]: [{
					fn: h,
					[aw]: [
						U,
						0,
						6,
						b
					]
				}, i]
			}, "--x-s3"]],
			[f, [{
				fn: g,
				[aw]: [{
					fn: h,
					[aw]: as
				}, i]
			}, "--xa-s3"]],
			[
				j,
				ao,
				k
			],
			[
				h,
				as,
				l
			],
			[f, [{ [av]: l }, "--op-s3"]],
			[
				h,
				[
					U,
					8,
					12,
					b
				],
				m
			],
			[
				h,
				[
					U,
					32,
					49,
					b
				],
				n(2)
			],
			[
				h,
				[
					U,
					49,
					50,
					b
				],
				o
			],
			[e, [{ [av]: "ForcePathStyle" }, b]],
			[f, [V, "aws-cn"]],
			[
				p,
				[
					T,
					".dualstack",
					i
				],
				"_s3e_ds"
			],
			[q, [{ [av]: n(2) }, c]],
			[
				p,
				[
					S,
					"-fips",
					i
				],
				"_s3e_fips"
			],
			[
				p,
				[
					{
						fn: g,
						[aw]: [{ [av]: "DisableS3ExpressSessionAuth" }, c]
					},
					s,
					"sigv4-s3express"
				],
				"_s3e_auth"
			],
			[t, [U, c]],
			[
				"parseURL",
				ap,
				u
			],
			[e, [{
				fn: g,
				[aw]: [{ [av]: "UseS3ExpressControlEndpoint" }, c]
			}, b]],
			[t, [U, b]],
			[f, [{
				fn: v,
				[aw]: [W, "scheme"]
			}, "http"]],
			[q, [X, c]],
			[
				"aws.parseArn",
				aq,
				w
			],
			[
				v,
				[{
					fn: "split",
					[aw]: [
						U,
						x,
						0
					]
				}, "[-2]"],
				"s3expressAvailabilityZoneId"
			],
			[f, [{
				fn: g,
				[aw]: [{
					fn: h,
					[aw]: [
						U,
						0,
						4,
						c
					]
				}, i]
			}, "arn:"]],
			[f, [{
				fn: g,
				[aw]: [{
					fn: h,
					[aw]: [
						U,
						16,
						18,
						b
					]
				}, i]
			}, x]],
			[e, [{
				fn: v,
				[aw]: [W, "isIp"]
			}, b]],
			[f, [{
				fn: g,
				[aw]: [{
					fn: h,
					[aw]: [
						U,
						21,
						23,
						b
					]
				}, i]
			}, x]],
			[f, [{
				fn: g,
				[aw]: [{
					fn: h,
					[aw]: [
						U,
						27,
						29,
						b
					]
				}, i]
			}, x]],
			[f, [{ [av]: m }, "beta"]],
			[
				"uriEncode",
				aq,
				"uri_encoded_bucket"
			],
			[q, [X, b]],
			[e, [{
				fn: g,
				[aw]: [{ [av]: "UseObjectLambdaEndpoint" }, c]
			}, b]],
			[
				v,
				[Y, "resourceId[0]"],
				y
			],
			[f, [Z, i]],
			[f, [Z, z]],
			[
				v,
				at,
				A(1)
			],
			[f, [aa, i]],
			[f, [ab, i]],
			[f, [{
				fn: g,
				[aw]: [{
					fn: h,
					[aw]: [
						U,
						14,
						16,
						b
					]
				}, i]
			}, x]],
			[f, [ac, "e"]],
			[f, [ac, "o"]],
			[f, [X, "aws-global"]],
			[f, [{
				fn: g,
				[aw]: [{
					fn: h,
					[aw]: [
						U,
						19,
						21,
						b
					]
				}, i]
			}, x]],
			[f, [ad, B]],
			[e, [{
				fn: g,
				[aw]: [{ [av]: "DisableAccessPoints" }, c]
			}, b]],
			[f, [ad, C]],
			[
				j,
				[ab],
				D
			],
			[q, [aa, b]],
			[f, [{
				fn: g,
				[aw]: [{
					fn: h,
					[aw]: [
						U,
						26,
						28,
						b
					]
				}, i]
			}, x]],
			[f, [{
				fn: g,
				[aw]: [{
					fn: h,
					[aw]: [
						U,
						15,
						17,
						b
					]
				}, i]
			}, x]],
			[v, [Y, "resourceId[4]"]],
			[f, [{
				fn: g,
				[aw]: [{
					fn: h,
					[aw]: [
						U,
						20,
						22,
						b
					]
				}, i]
			}, x]],
			[e, [{ [av]: "UseGlobalEndpoint" }, b]],
			[f, [X, E]],
			[
				v,
				at,
				n(1)
			],
			[e, [{
				fn: g,
				[aw]: [{ [av]: "UseArnRegion" }, b]
			}, b]],
			[q, [{ [av]: n(1) }, c]],
			[
				v,
				[Y, "resourceId[2]"],
				F
			],
			[f, [X, ab]],
			[f, [{
				fn: v,
				[aw]: [{ [av]: D }, G]
			}, V]],
			[e, [{ [av]: "DisableMultiRegionAccessPoints" }, b]],
			[q, [ab, b]],
			[f, [{
				fn: v,
				[aw]: [Y, "partition"]
			}, V]],
			[f, [ae, i]],
			[f, [ad, H]],
			[q, [ae, c]],
			[
				v,
				[Y, "resourceId[3]"],
				A(2)
			],
			[q, [aa, c]],
			[f, [{ [av]: F }, z]]
		],
		results: [
			[a],
			[a, "Accelerate cannot be used with FIPS"],
			[a, "Cannot set dual-stack in combination with a custom endpoint."],
			[a, "A custom endpoint cannot be combined with FIPS"],
			[a, "A custom endpoint cannot be combined with S3 Accelerate"],
			[a, "Partition does not support FIPS"],
			[a, "S3Express does not support S3 Accelerate."],
			["{url#scheme}://{url#authority}/{uri_encoded_bucket}{url#path}", af],
			[I, af],
			[a, "S3Express bucket name is not a valid virtual hostable name."],
			["https://s3express-control{_s3e_fips}{_s3e_ds}.{Region}.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", ag],
			["https://{Bucket}.s3express{_s3e_fips}-{s3expressAvailabilityZoneId}{_s3e_ds}.{Region}.{partitionResult#dnsSuffix}", af],
			[a, "Unrecognized S3Express bucket name format."],
			[J, af],
			["https://s3express-control{_s3e_fips}{_s3e_ds}.{Region}.{partitionResult#dnsSuffix}", ag],
			[a, "Expected a endpoint to be specified but no endpoint was found"],
			["https://{Bucket}.ec2.{url#authority}", ah],
			["https://{Bucket}.ec2.s3-outposts.{Region}.{partitionResult#dnsSuffix}", ah],
			["https://{Bucket}.op-{outpostId_ssa_2}.{url#authority}", ah],
			["https://{Bucket}.op-{outpostId_ssa_2}.s3-outposts.{Region}.{partitionResult#dnsSuffix}", ah],
			[a, "Unrecognized hardware type: \"Expected hardware type o or e but got {hardwareType}\""],
			[a, "Invalid Outposts Bucket alias - it must be a valid bucket name."],
			[a, "Invalid ARN: The outpost Id must only contain a-z, A-Z, 0-9 and `-`."],
			[a, "Custom endpoint `{Endpoint}` was not a valid URI"],
			[a, "S3 Accelerate cannot be used in this region"],
			["https://{Bucket}.s3-fips.dualstack.us-east-1.{partitionResult#dnsSuffix}", ai],
			["https://{Bucket}.s3-fips.dualstack.{Region}.{partitionResult#dnsSuffix}", aj],
			["https://{Bucket}.s3-fips.us-east-1.{partitionResult#dnsSuffix}", ai],
			["https://{Bucket}.s3-fips.{Region}.{partitionResult#dnsSuffix}", aj],
			["https://{Bucket}.s3-accelerate.dualstack.us-east-1.{partitionResult#dnsSuffix}", ai],
			["https://{Bucket}.s3-accelerate.dualstack.{partitionResult#dnsSuffix}", aj],
			["https://{Bucket}.s3.dualstack.us-east-1.{partitionResult#dnsSuffix}", ai],
			["https://{Bucket}.s3.dualstack.{Region}.{partitionResult#dnsSuffix}", aj],
			[K, ai],
			[I, ai],
			[K, aj],
			[I, aj],
			[L, ai],
			[L, aj],
			[M, ai],
			[M, aj],
			["https://{Bucket}.s3.{Region}.{partitionResult#dnsSuffix}", aj],
			[a, "Invalid region: region was not a valid DNS name."],
			[a, "S3 Object Lambda does not support Dual-stack"],
			[a, "S3 Object Lambda does not support S3 Accelerate"],
			[a, "Access points are not supported for this operation"],
			[a, "Invalid configuration: region from ARN `{bucketArn#region}` does not match client region `{Region}` and UseArnRegion is `false`"],
			[a, "Invalid ARN: Missing account id"],
			[N(1), ak],
			["https://{accessPointName_ssa_1}-{bucketArn#accountId}.s3-object-lambda-fips.{bucketArn#region}.{bucketPartition#dnsSuffix}", ak],
			["https://{accessPointName_ssa_1}-{bucketArn#accountId}.s3-object-lambda.{bucketArn#region}.{bucketPartition#dnsSuffix}", ak],
			[a, "Invalid ARN: The access point name may only contain a-z, A-Z, 0-9 and `-`. Found: `{accessPointName_ssa_1}`"],
			[a, "Invalid ARN: The account id may only contain a-z, A-Z, 0-9 and `-`. Found: `{bucketArn#accountId}`"],
			[a, "Invalid region in ARN: `{bucketArn#region}` (invalid DNS name)"],
			[a, "Client was configured for partition `{partitionResult#name}` but ARN (`{Bucket}`) has `{bucketPartition#name}`"],
			[a, "Invalid ARN: The ARN may only contain a single resource component after `accesspoint`."],
			[a, "Invalid ARN: bucket ARN is missing a region"],
			[a, "Invalid ARN: Expected a resource of the format `accesspoint:<accesspoint name>` but no name was provided"],
			[a, "Invalid ARN: Object Lambda ARNs only support `accesspoint` arn types, but found: `{arnType}`"],
			[a, "Access Points do not support S3 Accelerate"],
			["https://{accessPointName_ssa_1}-{bucketArn#accountId}.s3-accesspoint-fips.dualstack.{bucketArn#region}.{bucketPartition#dnsSuffix}", al],
			["https://{accessPointName_ssa_1}-{bucketArn#accountId}.s3-accesspoint-fips.{bucketArn#region}.{bucketPartition#dnsSuffix}", al],
			["https://{accessPointName_ssa_1}-{bucketArn#accountId}.s3-accesspoint.dualstack.{bucketArn#region}.{bucketPartition#dnsSuffix}", al],
			[N(1), al],
			["https://{accessPointName_ssa_1}-{bucketArn#accountId}.s3-accesspoint.{bucketArn#region}.{bucketPartition#dnsSuffix}", al],
			[a, "Invalid ARN: The ARN was not for the S3 service, found: {bucketArn#service}"],
			[a, "S3 MRAP does not support dual-stack"],
			[a, "S3 MRAP does not support FIPS"],
			[a, "S3 MRAP does not support S3 Accelerate"],
			[a, "Invalid configuration: Multi-Region Access Point ARNs are disabled."],
			["https://{accessPointName_ssa_1}.accesspoint.s3-global.{partitionResult#dnsSuffix}", { [ay]: [{
				[az]: b,
				name: O,
				[aA]: H,
				[aC]: au
			}] }],
			[a, "Client was configured for partition `{partitionResult#name}` but bucket referred to partition `{bucketArn#partition}`"],
			[a, "Invalid Access Point Name"],
			[a, "S3 Outposts does not support Dual-stack"],
			[a, "S3 Outposts does not support FIPS"],
			[a, "S3 Outposts does not support S3 Accelerate"],
			[a, "Invalid Arn: Outpost Access Point ARN contains sub resources"],
			["https://{accessPointName_ssa_2}-{bucketArn#accountId}.{outpostId_ssa_1}.{url#authority}", am],
			["https://{accessPointName_ssa_2}-{bucketArn#accountId}.{outpostId_ssa_1}.s3-outposts.{bucketArn#region}.{bucketPartition#dnsSuffix}", am],
			[a, "Expected an outpost type `accesspoint`, found {outpostType}"],
			[a, "Invalid ARN: expected an access point name"],
			[a, "Invalid ARN: Expected a 4-component resource"],
			[a, "Invalid ARN: The outpost Id may only contain a-z, A-Z, 0-9 and `-`. Found: `{outpostId_ssa_1}`"],
			[a, "Invalid ARN: The Outpost Id was not set"],
			[a, "Invalid ARN: Unrecognized format: {Bucket} (type: {arnType})"],
			[a, "Invalid ARN: No ARN type specified"],
			[a, "Invalid ARN: `{Bucket}` was not a valid ARN"],
			[a, "Path-style addressing cannot be used with ARN buckets"],
			["https://s3-fips.dualstack.us-east-1.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", ai],
			["https://s3-fips.dualstack.{Region}.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", aj],
			["https://s3-fips.us-east-1.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", ai],
			["https://s3-fips.{Region}.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", aj],
			["https://s3.dualstack.us-east-1.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", ai],
			["https://s3.dualstack.{Region}.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", aj],
			[P, ai],
			[P, aj],
			[Q, ai],
			[Q, aj],
			["https://s3.{Region}.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", aj],
			[a, "Path-style addressing cannot be used with S3 Accelerate"],
			[J, an],
			["https://s3-object-lambda-fips.{Region}.{partitionResult#dnsSuffix}", an],
			["https://s3-object-lambda.{Region}.{partitionResult#dnsSuffix}", an],
			["https://s3-fips.dualstack.us-east-1.{partitionResult#dnsSuffix}", ai],
			["https://s3-fips.dualstack.{Region}.{partitionResult#dnsSuffix}", aj],
			["https://s3-fips.us-east-1.{partitionResult#dnsSuffix}", ai],
			["https://s3-fips.{Region}.{partitionResult#dnsSuffix}", aj],
			["https://s3.dualstack.us-east-1.{partitionResult#dnsSuffix}", ai],
			["https://s3.dualstack.{Region}.{partitionResult#dnsSuffix}", aj],
			[J, ai],
			[J, aj],
			[R, ai],
			[R, aj],
			["https://s3.{Region}.{partitionResult#dnsSuffix}", aj],
			[a, "A region must be set when sending requests to S3."]
		]
	};
	const root = 2;
	const r = 1e8;
	const nodes = new Int32Array([
		-1,
		1,
		-1,
		0,
		3,
		r + 114,
		1,
		422,
		4,
		2,
		270,
		5,
		3,
		231,
		6,
		4,
		84,
		7,
		5,
		15,
		8,
		8,
		9,
		r + 114,
		16,
		10,
		13,
		18,
		11,
		13,
		19,
		12,
		13,
		22,
		r + 14,
		13,
		35,
		14,
		r + 42,
		36,
		r + 102,
		433,
		6,
		269,
		16,
		7,
		268,
		17,
		8,
		19,
		18,
		14,
		499,
		105,
		9,
		20,
		24,
		10,
		21,
		24,
		11,
		22,
		24,
		12,
		23,
		24,
		13,
		545,
		24,
		14,
		76,
		25,
		20,
		72,
		26,
		26,
		27,
		77,
		37,
		28,
		r + 85,
		38,
		r + 85,
		29,
		39,
		46,
		30,
		48,
		r + 58,
		31,
		50,
		32,
		r + 84,
		51,
		33,
		135,
		55,
		r + 76,
		34,
		59,
		35,
		r + 83,
		60,
		39,
		36,
		61,
		37,
		r + 82,
		62,
		38,
		145,
		63,
		41,
		r + 46,
		61,
		40,
		r + 82,
		62,
		41,
		149,
		64,
		42,
		r + 54,
		66,
		43,
		r + 53,
		70,
		44,
		r + 52,
		71,
		45,
		r + 80,
		73,
		r + 78,
		r + 79,
		40,
		47,
		r + 57,
		41,
		r + 57,
		48,
		42,
		183,
		49,
		48,
		61,
		50,
		49,
		r + 45,
		51,
		51,
		52,
		524,
		60,
		55,
		53,
		62,
		r + 55,
		54,
		63,
		56,
		r + 46,
		62,
		r + 55,
		56,
		64,
		57,
		r + 54,
		66,
		58,
		r + 53,
		69,
		59,
		r + 65,
		70,
		60,
		r + 52,
		72,
		r + 64,
		r + 51,
		49,
		r + 45,
		62,
		51,
		63,
		524,
		60,
		66,
		64,
		62,
		r + 55,
		65,
		63,
		67,
		r + 46,
		62,
		r + 55,
		67,
		64,
		68,
		r + 54,
		66,
		69,
		r + 53,
		68,
		r + 47,
		70,
		70,
		71,
		r + 52,
		72,
		r + 50,
		r + 51,
		25,
		73,
		r + 42,
		46,
		r + 39,
		74,
		57,
		75,
		r + 41,
		58,
		r + 40,
		r + 41,
		26,
		r + 87,
		77,
		28,
		r + 86,
		78,
		34,
		81,
		79,
		35,
		80,
		543,
		36,
		r + 102,
		r + 114,
		46,
		r + 96,
		82,
		57,
		83,
		r + 98,
		58,
		r + 97,
		r + 98,
		5,
		100,
		85,
		8,
		86,
		r + 114,
		16,
		87,
		88,
		18,
		90,
		88,
		19,
		89,
		91,
		21,
		96,
		94,
		19,
		92,
		91,
		21,
		97,
		94,
		21,
		96,
		93,
		22,
		r + 14,
		94,
		35,
		95,
		r + 42,
		36,
		r + 102,
		r + 42,
		22,
		r + 13,
		97,
		35,
		98,
		r + 42,
		36,
		r + 100,
		99,
		46,
		r + 109,
		r + 110,
		6,
		212,
		101,
		7,
		206,
		102,
		8,
		118,
		103,
		14,
		117,
		104,
		21,
		105,
		r + 23,
		26,
		106,
		500,
		37,
		107,
		r + 85,
		38,
		r + 85,
		108,
		39,
		111,
		109,
		48,
		r + 58,
		110,
		50,
		135,
		r + 84,
		40,
		112,
		r + 57,
		41,
		r + 57,
		113,
		42,
		114,
		498,
		48,
		r + 56,
		115,
		52,
		116,
		r + 72,
		65,
		r + 69,
		r + 72,
		21,
		499,
		r + 23,
		9,
		119,
		123,
		10,
		120,
		123,
		11,
		121,
		123,
		12,
		122,
		123,
		13,
		200,
		123,
		14,
		193,
		124,
		20,
		188,
		125,
		21,
		126,
		r + 23,
		23,
		127,
		128,
		24,
		187,
		128,
		26,
		129,
		195,
		37,
		130,
		r + 85,
		38,
		r + 85,
		131,
		39,
		157,
		132,
		48,
		r + 58,
		133,
		50,
		134,
		r + 84,
		51,
		140,
		135,
		55,
		r + 76,
		136,
		59,
		137,
		r + 83,
		60,
		r + 82,
		138,
		61,
		139,
		r + 82,
		63,
		r + 82,
		r + 46,
		55,
		r + 76,
		141,
		59,
		142,
		r + 83,
		60,
		147,
		143,
		61,
		144,
		r + 82,
		62,
		146,
		145,
		63,
		149,
		r + 46,
		63,
		152,
		r + 46,
		61,
		148,
		r + 82,
		62,
		152,
		149,
		64,
		150,
		r + 54,
		66,
		151,
		r + 53,
		70,
		r + 81,
		r + 52,
		64,
		153,
		r + 54,
		66,
		154,
		r + 53,
		70,
		155,
		r + 52,
		71,
		156,
		r + 80,
		73,
		r + 77,
		r + 79,
		40,
		158,
		r + 57,
		41,
		r + 57,
		159,
		42,
		183,
		160,
		48,
		172,
		161,
		49,
		r + 45,
		162,
		51,
		163,
		524,
		60,
		166,
		164,
		62,
		r + 55,
		165,
		63,
		167,
		r + 46,
		62,
		r + 55,
		167,
		64,
		168,
		r + 54,
		66,
		169,
		r + 53,
		69,
		170,
		r + 65,
		70,
		171,
		r + 52,
		72,
		r + 63,
		r + 51,
		49,
		r + 45,
		173,
		51,
		174,
		524,
		60,
		177,
		175,
		62,
		r + 55,
		176,
		63,
		178,
		r + 46,
		62,
		r + 55,
		178,
		64,
		179,
		r + 54,
		66,
		180,
		r + 53,
		68,
		r + 47,
		181,
		70,
		182,
		r + 52,
		72,
		r + 48,
		r + 51,
		48,
		r + 56,
		184,
		52,
		185,
		r + 72,
		65,
		r + 69,
		186,
		67,
		r + 70,
		r + 71,
		25,
		r + 36,
		r + 42,
		21,
		189,
		r + 23,
		25,
		190,
		r + 42,
		30,
		192,
		191,
		46,
		r + 34,
		r + 36,
		46,
		r + 33,
		r + 35,
		21,
		194,
		r + 23,
		26,
		r + 87,
		195,
		28,
		r + 86,
		196,
		34,
		199,
		197,
		35,
		198,
		543,
		36,
		r + 100,
		r + 114,
		46,
		r + 94,
		r + 95,
		17,
		201,
		r + 22,
		20,
		202,
		r + 21,
		21,
		203,
		548,
		33,
		204,
		548,
		44,
		r + 16,
		205,
		45,
		r + 18,
		r + 20,
		8,
		207,
		213,
		16,
		208,
		218,
		18,
		209,
		218,
		19,
		210,
		222,
		20,
		211,
		225,
		21,
		229,
		399,
		8,
		216,
		213,
		19,
		214,
		r + 9,
		20,
		215,
		225,
		21,
		229,
		r + 9,
		16,
		217,
		218,
		18,
		221,
		218,
		19,
		219,
		222,
		20,
		220,
		225,
		21,
		229,
		r + 12,
		19,
		224,
		222,
		20,
		223,
		r + 9,
		21,
		r + 9,
		r + 12,
		20,
		228,
		225,
		21,
		226,
		r + 9,
		30,
		227,
		r + 9,
		34,
		r + 7,
		r + 9,
		21,
		229,
		413,
		30,
		230,
		r + 8,
		34,
		r + 7,
		r + 8,
		4,
		r + 2,
		232,
		5,
		233,
		478,
		6,
		269,
		234,
		7,
		268,
		235,
		8,
		236,
		489,
		9,
		237,
		241,
		10,
		238,
		241,
		11,
		239,
		241,
		12,
		240,
		241,
		13,
		545,
		241,
		14,
		264,
		242,
		20,
		262,
		243,
		26,
		244,
		265,
		37,
		245,
		r + 85,
		38,
		r + 85,
		246,
		39,
		247,
		516,
		40,
		248,
		r + 57,
		41,
		r + 57,
		249,
		42,
		536,
		250,
		48,
		r + 43,
		251,
		49,
		r + 45,
		252,
		51,
		253,
		524,
		60,
		256,
		254,
		62,
		r + 55,
		255,
		63,
		257,
		r + 46,
		62,
		r + 55,
		257,
		64,
		258,
		r + 54,
		66,
		259,
		r + 53,
		69,
		260,
		r + 65,
		70,
		261,
		r + 52,
		72,
		r + 62,
		r + 51,
		25,
		263,
		r + 42,
		46,
		r + 31,
		r + 32,
		26,
		r + 87,
		265,
		28,
		r + 86,
		266,
		34,
		267,
		542,
		46,
		r + 92,
		r + 93,
		8,
		395,
		r + 9,
		8,
		405,
		r + 9,
		3,
		344,
		271,
		4,
		r + 3,
		272,
		5,
		282,
		273,
		8,
		274,
		r + 114,
		15,
		r + 5,
		275,
		16,
		276,
		279,
		18,
		277,
		279,
		19,
		278,
		279,
		22,
		r + 14,
		279,
		35,
		280,
		r + 42,
		36,
		r + 101,
		281,
		46,
		r + 105,
		r + 106,
		6,
		403,
		283,
		7,
		393,
		284,
		8,
		293,
		285,
		14,
		499,
		286,
		26,
		287,
		500,
		37,
		288,
		r + 85,
		38,
		r + 85,
		289,
		39,
		290,
		305,
		40,
		291,
		r + 57,
		41,
		r + 57,
		292,
		42,
		333,
		498,
		9,
		294,
		298,
		10,
		295,
		298,
		11,
		296,
		298,
		12,
		297,
		298,
		13,
		392,
		298,
		14,
		337,
		299,
		15,
		r + 5,
		300,
		20,
		335,
		301,
		26,
		302,
		339,
		37,
		303,
		r + 85,
		38,
		r + 85,
		304,
		39,
		307,
		305,
		48,
		r + 58,
		306,
		50,
		r + 74,
		r + 84,
		40,
		308,
		r + 57,
		41,
		r + 57,
		309,
		42,
		333,
		310,
		48,
		322,
		311,
		49,
		r + 45,
		312,
		51,
		313,
		524,
		60,
		316,
		314,
		62,
		r + 55,
		315,
		63,
		317,
		r + 46,
		62,
		r + 55,
		317,
		64,
		318,
		r + 54,
		66,
		319,
		r + 53,
		69,
		320,
		r + 65,
		70,
		321,
		r + 52,
		72,
		r + 61,
		r + 51,
		49,
		r + 45,
		323,
		51,
		324,
		524,
		60,
		327,
		325,
		62,
		r + 55,
		326,
		63,
		328,
		r + 46,
		62,
		r + 55,
		328,
		64,
		329,
		r + 54,
		66,
		330,
		r + 53,
		68,
		r + 47,
		331,
		70,
		332,
		r + 52,
		72,
		r + 49,
		r + 51,
		48,
		r + 56,
		334,
		52,
		r + 67,
		r + 72,
		25,
		336,
		r + 42,
		46,
		r + 27,
		r + 28,
		15,
		r + 5,
		338,
		26,
		r + 87,
		339,
		28,
		r + 86,
		340,
		34,
		343,
		341,
		35,
		342,
		543,
		36,
		r + 101,
		r + 114,
		46,
		r + 90,
		r + 91,
		4,
		r + 2,
		345,
		5,
		355,
		346,
		8,
		347,
		r + 114,
		15,
		r + 5,
		348,
		16,
		349,
		352,
		18,
		350,
		352,
		19,
		351,
		352,
		22,
		r + 14,
		352,
		35,
		353,
		r + 42,
		36,
		r + 43,
		354,
		46,
		r + 103,
		r + 104,
		6,
		403,
		356,
		7,
		393,
		357,
		8,
		358,
		489,
		9,
		359,
		363,
		10,
		360,
		363,
		11,
		361,
		363,
		12,
		362,
		363,
		13,
		392,
		363,
		14,
		387,
		364,
		15,
		r + 5,
		365,
		20,
		385,
		366,
		26,
		367,
		389,
		37,
		368,
		r + 85,
		38,
		r + 85,
		369,
		39,
		370,
		516,
		40,
		371,
		r + 57,
		41,
		r + 57,
		372,
		42,
		536,
		373,
		48,
		r + 43,
		374,
		49,
		r + 45,
		375,
		51,
		376,
		524,
		60,
		379,
		377,
		62,
		r + 55,
		378,
		63,
		380,
		r + 46,
		62,
		r + 55,
		380,
		64,
		381,
		r + 54,
		66,
		382,
		r + 53,
		69,
		383,
		r + 65,
		70,
		384,
		r + 52,
		72,
		r + 60,
		r + 51,
		25,
		386,
		r + 42,
		46,
		r + 25,
		r + 26,
		15,
		r + 5,
		388,
		26,
		r + 87,
		389,
		28,
		r + 86,
		390,
		34,
		391,
		542,
		46,
		r + 88,
		r + 89,
		15,
		r + 5,
		545,
		8,
		394,
		r + 9,
		15,
		r + 5,
		395,
		16,
		396,
		408,
		18,
		397,
		408,
		19,
		398,
		408,
		20,
		399,
		r + 9,
		27,
		400,
		r + 12,
		29,
		r + 11,
		401,
		31,
		r + 11,
		402,
		32,
		r + 11,
		420,
		8,
		404,
		r + 9,
		15,
		r + 5,
		405,
		16,
		406,
		408,
		18,
		407,
		408,
		19,
		409,
		408,
		20,
		r + 12,
		r + 9,
		20,
		412,
		410,
		22,
		411,
		r + 9,
		34,
		r + 10,
		r + 9,
		22,
		414,
		413,
		27,
		417,
		r + 12,
		27,
		416,
		415,
		34,
		r + 10,
		r + 12,
		34,
		r + 10,
		417,
		43,
		r + 11,
		418,
		47,
		r + 11,
		419,
		53,
		r + 11,
		420,
		54,
		r + 11,
		421,
		56,
		r + 11,
		r + 12,
		2,
		r + 1,
		423,
		3,
		476,
		424,
		4,
		r + 4,
		425,
		5,
		436,
		426,
		8,
		427,
		r + 114,
		16,
		428,
		431,
		18,
		429,
		431,
		19,
		430,
		431,
		22,
		r + 14,
		431,
		35,
		432,
		r + 42,
		36,
		r + 44,
		433,
		46,
		r + 111,
		434,
		57,
		435,
		r + 113,
		58,
		r + 112,
		r + 113,
		6,
		r + 6,
		437,
		7,
		r + 6,
		438,
		8,
		448,
		439,
		14,
		499,
		440,
		26,
		441,
		500,
		37,
		442,
		r + 85,
		38,
		r + 85,
		443,
		39,
		444,
		463,
		40,
		445,
		r + 57,
		41,
		r + 57,
		446,
		42,
		469,
		447,
		48,
		r + 44,
		498,
		9,
		449,
		453,
		10,
		450,
		453,
		11,
		451,
		453,
		12,
		452,
		453,
		13,
		545,
		453,
		14,
		471,
		454,
		15,
		458,
		455,
		20,
		456,
		459,
		25,
		457,
		r + 42,
		46,
		r + 37,
		r + 38,
		20,
		538,
		459,
		26,
		460,
		472,
		37,
		461,
		r + 85,
		38,
		r + 85,
		462,
		39,
		465,
		463,
		48,
		r + 58,
		464,
		50,
		r + 75,
		r + 84,
		40,
		466,
		r + 57,
		41,
		r + 57,
		467,
		42,
		469,
		468,
		48,
		r + 44,
		522,
		48,
		r + 44,
		470,
		52,
		r + 68,
		r + 72,
		26,
		r + 87,
		472,
		28,
		r + 86,
		473,
		34,
		r + 99,
		474,
		35,
		475,
		543,
		36,
		r + 44,
		r + 114,
		4,
		r + 2,
		477,
		5,
		486,
		478,
		8,
		479,
		r + 114,
		16,
		480,
		483,
		18,
		481,
		483,
		19,
		482,
		483,
		22,
		r + 14,
		483,
		35,
		484,
		r + 42,
		36,
		r + 43,
		485,
		46,
		r + 107,
		r + 108,
		6,
		r + 6,
		487,
		7,
		r + 6,
		488,
		8,
		501,
		489,
		14,
		499,
		490,
		26,
		491,
		500,
		37,
		492,
		r + 85,
		38,
		r + 85,
		493,
		39,
		494,
		516,
		40,
		495,
		r + 57,
		41,
		r + 57,
		496,
		42,
		536,
		497,
		48,
		r + 43,
		498,
		49,
		r + 45,
		524,
		26,
		r + 87,
		500,
		28,
		r + 86,
		r + 114,
		9,
		502,
		506,
		10,
		503,
		506,
		11,
		504,
		506,
		12,
		505,
		506,
		13,
		545,
		506,
		14,
		539,
		507,
		15,
		511,
		508,
		20,
		509,
		512,
		25,
		510,
		r + 42,
		46,
		r + 29,
		r + 30,
		20,
		538,
		512,
		26,
		513,
		540,
		37,
		514,
		r + 85,
		38,
		r + 85,
		515,
		39,
		518,
		516,
		48,
		r + 58,
		517,
		50,
		r + 73,
		r + 84,
		40,
		519,
		r + 57,
		41,
		r + 57,
		520,
		42,
		536,
		521,
		48,
		r + 43,
		522,
		49,
		r + 45,
		523,
		51,
		527,
		524,
		60,
		r + 55,
		525,
		62,
		r + 55,
		526,
		63,
		r + 55,
		r + 46,
		60,
		530,
		528,
		62,
		r + 55,
		529,
		63,
		531,
		r + 46,
		62,
		r + 55,
		531,
		64,
		532,
		r + 54,
		66,
		533,
		r + 53,
		69,
		534,
		r + 65,
		70,
		535,
		r + 52,
		72,
		r + 59,
		r + 51,
		48,
		r + 43,
		537,
		52,
		r + 66,
		r + 72,
		25,
		r + 24,
		r + 42,
		26,
		r + 87,
		540,
		28,
		r + 86,
		541,
		34,
		r + 99,
		542,
		35,
		544,
		543,
		36,
		r + 42,
		r + 114,
		36,
		r + 43,
		r + 114,
		17,
		546,
		r + 22,
		20,
		547,
		r + 21,
		33,
		550,
		548,
		44,
		r + 17,
		549,
		45,
		r + 19,
		r + 20,
		44,
		r + 15,
		551,
		45,
		r + 15,
		r + 20
	]);
	exports.bdd = util_endpoints_1.BinaryDecisionDiagram.from(nodes, root, _data.conditions, _data.results);
}));
//#endregion
//#region node_modules/@aws-sdk/client-s3/dist-cjs/endpoint/endpointResolver.js
var require_endpointResolver = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.defaultEndpointResolver = void 0;
	const util_endpoints_1 = require_dist_cjs$23();
	const util_endpoints_2 = require_dist_cjs$22();
	const bdd_1 = require_bdd();
	const cache = new util_endpoints_2.EndpointCache({
		size: 50,
		params: [
			"Accelerate",
			"Bucket",
			"DisableAccessPoints",
			"DisableMultiRegionAccessPoints",
			"DisableS3ExpressSessionAuth",
			"Endpoint",
			"ForcePathStyle",
			"Region",
			"UseArnRegion",
			"UseDualStack",
			"UseFIPS",
			"UseGlobalEndpoint",
			"UseObjectLambdaEndpoint",
			"UseS3ExpressControlEndpoint"
		]
	});
	const defaultEndpointResolver = (endpointParams, context = {}) => {
		return cache.get(endpointParams, () => (0, util_endpoints_2.decideEndpoint)(bdd_1.bdd, {
			endpointParams,
			logger: context.logger
		}));
	};
	exports.defaultEndpointResolver = defaultEndpointResolver;
	util_endpoints_2.customEndpointFunctions.aws = util_endpoints_1.awsEndpointFunctions;
}));
//#endregion
//#region node_modules/@aws-sdk/client-s3/dist-cjs/auth/httpAuthSchemeProvider.js
var require_httpAuthSchemeProvider = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.resolveHttpAuthSchemeConfig = exports.defaultS3HttpAuthSchemeProvider = exports.defaultS3HttpAuthSchemeParametersProvider = void 0;
	const httpAuthSchemes_1 = (init_httpAuthSchemes(), __toCommonJS(httpAuthSchemes_exports));
	const signature_v4_multi_region_1 = require_dist_cjs$38();
	const middleware_endpoint_1 = require_dist_cjs$27();
	const util_middleware_1 = require_dist_cjs$24();
	const endpointResolver_1 = require_endpointResolver();
	const createEndpointRuleSetHttpAuthSchemeParametersProvider = (defaultHttpAuthSchemeParametersProvider) => async (config, context, input) => {
		if (!input) throw new Error("Could not find `input` for `defaultEndpointRuleSetHttpAuthSchemeParametersProvider`");
		const defaultParameters = await defaultHttpAuthSchemeParametersProvider(config, context, input);
		const instructionsFn = (0, util_middleware_1.getSmithyContext)(context)?.commandInstance?.constructor?.getEndpointParameterInstructions;
		if (!instructionsFn) throw new Error(`getEndpointParameterInstructions() is not defined on '${context.commandName}'`);
		const endpointParameters = await (0, middleware_endpoint_1.resolveParams)(input, { getEndpointParameterInstructions: instructionsFn }, config);
		return Object.assign(defaultParameters, endpointParameters);
	};
	const _defaultS3HttpAuthSchemeParametersProvider = async (config, context, input) => {
		return {
			operation: (0, util_middleware_1.getSmithyContext)(context).operation,
			region: await (0, util_middleware_1.normalizeProvider)(config.region)() || (() => {
				throw new Error("expected `region` to be configured for `aws.auth#sigv4`");
			})()
		};
	};
	exports.defaultS3HttpAuthSchemeParametersProvider = createEndpointRuleSetHttpAuthSchemeParametersProvider(_defaultS3HttpAuthSchemeParametersProvider);
	function createAwsAuthSigv4HttpAuthOption(authParameters) {
		return {
			schemeId: "aws.auth#sigv4",
			signingProperties: {
				name: "s3",
				region: authParameters.region
			},
			propertiesExtractor: (config, context) => ({ signingProperties: {
				config,
				context
			} })
		};
	}
	function createAwsAuthSigv4aHttpAuthOption(authParameters) {
		return {
			schemeId: "aws.auth#sigv4a",
			signingProperties: {
				name: "s3",
				region: authParameters.region
			},
			propertiesExtractor: (config, context) => ({ signingProperties: {
				config,
				context
			} })
		};
	}
	const createEndpointRuleSetHttpAuthSchemeProvider = (defaultEndpointResolver, defaultHttpAuthSchemeResolver, createHttpAuthOptionFunctions) => {
		const endpointRuleSetHttpAuthSchemeProvider = (authParameters) => {
			const authSchemes = defaultEndpointResolver(authParameters).properties?.authSchemes;
			if (!authSchemes) return defaultHttpAuthSchemeResolver(authParameters);
			const options = [];
			for (const scheme of authSchemes) {
				const { name: resolvedName, properties = {}, ...rest } = scheme;
				const name = resolvedName.toLowerCase();
				if (resolvedName !== name) console.warn(`HttpAuthScheme has been normalized with lowercasing: '${resolvedName}' to '${name}'`);
				let schemeId;
				if (name === "sigv4a") {
					schemeId = "aws.auth#sigv4a";
					const sigv4Present = authSchemes.find((s) => {
						const name = s.name.toLowerCase();
						return name !== "sigv4a" && name.startsWith("sigv4");
					});
					if (signature_v4_multi_region_1.SignatureV4MultiRegion.sigv4aDependency() === "none" && sigv4Present) continue;
				} else if (name.startsWith("sigv4")) schemeId = "aws.auth#sigv4";
				else throw new Error(`Unknown HttpAuthScheme found in '@smithy.rules#endpointRuleSet': '${name}'`);
				const createOption = createHttpAuthOptionFunctions[schemeId];
				if (!createOption) throw new Error(`Could not find HttpAuthOption create function for '${schemeId}'`);
				const option = createOption(authParameters);
				option.schemeId = schemeId;
				option.signingProperties = {
					...option.signingProperties || {},
					...rest,
					...properties
				};
				options.push(option);
			}
			return options;
		};
		return endpointRuleSetHttpAuthSchemeProvider;
	};
	const _defaultS3HttpAuthSchemeProvider = (authParameters) => {
		const options = [];
		switch (authParameters.operation) {
			default:
				options.push(createAwsAuthSigv4HttpAuthOption(authParameters));
				options.push(createAwsAuthSigv4aHttpAuthOption(authParameters));
		}
		return options;
	};
	exports.defaultS3HttpAuthSchemeProvider = createEndpointRuleSetHttpAuthSchemeProvider(endpointResolver_1.defaultEndpointResolver, _defaultS3HttpAuthSchemeProvider, {
		"aws.auth#sigv4": createAwsAuthSigv4HttpAuthOption,
		"aws.auth#sigv4a": createAwsAuthSigv4aHttpAuthOption
	});
	const resolveHttpAuthSchemeConfig = (config) => {
		const config_0 = (0, httpAuthSchemes_1.resolveAwsSdkSigV4Config)(config);
		const config_1 = (0, httpAuthSchemes_1.resolveAwsSdkSigV4AConfig)(config_0);
		return Object.assign(config_1, { authSchemePreference: (0, util_middleware_1.normalizeProvider)(config.authSchemePreference ?? []) });
	};
	exports.resolveHttpAuthSchemeConfig = resolveHttpAuthSchemeConfig;
}));
//#endregion
//#region node_modules/@aws-sdk/client-s3/dist-cjs/models/S3ServiceException.js
var require_S3ServiceException = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.S3ServiceException = exports.__ServiceException = void 0;
	const smithy_client_1 = require_dist_cjs$25();
	Object.defineProperty(exports, "__ServiceException", {
		enumerable: true,
		get: function() {
			return smithy_client_1.ServiceException;
		}
	});
	exports.S3ServiceException = class S3ServiceException extends smithy_client_1.ServiceException {
		constructor(options) {
			super(options);
			Object.setPrototypeOf(this, S3ServiceException.prototype);
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/client-s3/dist-cjs/models/errors.js
var require_errors = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ObjectAlreadyInActiveTierError = exports.IdempotencyParameterMismatch = exports.TooManyParts = exports.InvalidWriteOffset = exports.InvalidRequest = exports.EncryptionTypeMismatch = exports.NotFound = exports.NoSuchKey = exports.InvalidObjectState = exports.NoSuchBucket = exports.BucketAlreadyOwnedByYou = exports.BucketAlreadyExists = exports.ObjectNotInActiveTierError = exports.AccessDenied = exports.NoSuchUpload = void 0;
	const S3ServiceException_1 = require_S3ServiceException();
	exports.NoSuchUpload = class NoSuchUpload extends S3ServiceException_1.S3ServiceException {
		name = "NoSuchUpload";
		$fault = "client";
		constructor(opts) {
			super({
				name: "NoSuchUpload",
				$fault: "client",
				...opts
			});
			Object.setPrototypeOf(this, NoSuchUpload.prototype);
		}
	};
	exports.AccessDenied = class AccessDenied extends S3ServiceException_1.S3ServiceException {
		name = "AccessDenied";
		$fault = "client";
		constructor(opts) {
			super({
				name: "AccessDenied",
				$fault: "client",
				...opts
			});
			Object.setPrototypeOf(this, AccessDenied.prototype);
		}
	};
	exports.ObjectNotInActiveTierError = class ObjectNotInActiveTierError extends S3ServiceException_1.S3ServiceException {
		name = "ObjectNotInActiveTierError";
		$fault = "client";
		constructor(opts) {
			super({
				name: "ObjectNotInActiveTierError",
				$fault: "client",
				...opts
			});
			Object.setPrototypeOf(this, ObjectNotInActiveTierError.prototype);
		}
	};
	exports.BucketAlreadyExists = class BucketAlreadyExists extends S3ServiceException_1.S3ServiceException {
		name = "BucketAlreadyExists";
		$fault = "client";
		constructor(opts) {
			super({
				name: "BucketAlreadyExists",
				$fault: "client",
				...opts
			});
			Object.setPrototypeOf(this, BucketAlreadyExists.prototype);
		}
	};
	exports.BucketAlreadyOwnedByYou = class BucketAlreadyOwnedByYou extends S3ServiceException_1.S3ServiceException {
		name = "BucketAlreadyOwnedByYou";
		$fault = "client";
		constructor(opts) {
			super({
				name: "BucketAlreadyOwnedByYou",
				$fault: "client",
				...opts
			});
			Object.setPrototypeOf(this, BucketAlreadyOwnedByYou.prototype);
		}
	};
	exports.NoSuchBucket = class NoSuchBucket extends S3ServiceException_1.S3ServiceException {
		name = "NoSuchBucket";
		$fault = "client";
		constructor(opts) {
			super({
				name: "NoSuchBucket",
				$fault: "client",
				...opts
			});
			Object.setPrototypeOf(this, NoSuchBucket.prototype);
		}
	};
	exports.InvalidObjectState = class InvalidObjectState extends S3ServiceException_1.S3ServiceException {
		name = "InvalidObjectState";
		$fault = "client";
		StorageClass;
		AccessTier;
		constructor(opts) {
			super({
				name: "InvalidObjectState",
				$fault: "client",
				...opts
			});
			Object.setPrototypeOf(this, InvalidObjectState.prototype);
			this.StorageClass = opts.StorageClass;
			this.AccessTier = opts.AccessTier;
		}
	};
	exports.NoSuchKey = class NoSuchKey extends S3ServiceException_1.S3ServiceException {
		name = "NoSuchKey";
		$fault = "client";
		constructor(opts) {
			super({
				name: "NoSuchKey",
				$fault: "client",
				...opts
			});
			Object.setPrototypeOf(this, NoSuchKey.prototype);
		}
	};
	exports.NotFound = class NotFound extends S3ServiceException_1.S3ServiceException {
		name = "NotFound";
		$fault = "client";
		constructor(opts) {
			super({
				name: "NotFound",
				$fault: "client",
				...opts
			});
			Object.setPrototypeOf(this, NotFound.prototype);
		}
	};
	exports.EncryptionTypeMismatch = class EncryptionTypeMismatch extends S3ServiceException_1.S3ServiceException {
		name = "EncryptionTypeMismatch";
		$fault = "client";
		constructor(opts) {
			super({
				name: "EncryptionTypeMismatch",
				$fault: "client",
				...opts
			});
			Object.setPrototypeOf(this, EncryptionTypeMismatch.prototype);
		}
	};
	exports.InvalidRequest = class InvalidRequest extends S3ServiceException_1.S3ServiceException {
		name = "InvalidRequest";
		$fault = "client";
		constructor(opts) {
			super({
				name: "InvalidRequest",
				$fault: "client",
				...opts
			});
			Object.setPrototypeOf(this, InvalidRequest.prototype);
		}
	};
	exports.InvalidWriteOffset = class InvalidWriteOffset extends S3ServiceException_1.S3ServiceException {
		name = "InvalidWriteOffset";
		$fault = "client";
		constructor(opts) {
			super({
				name: "InvalidWriteOffset",
				$fault: "client",
				...opts
			});
			Object.setPrototypeOf(this, InvalidWriteOffset.prototype);
		}
	};
	exports.TooManyParts = class TooManyParts extends S3ServiceException_1.S3ServiceException {
		name = "TooManyParts";
		$fault = "client";
		constructor(opts) {
			super({
				name: "TooManyParts",
				$fault: "client",
				...opts
			});
			Object.setPrototypeOf(this, TooManyParts.prototype);
		}
	};
	exports.IdempotencyParameterMismatch = class IdempotencyParameterMismatch extends S3ServiceException_1.S3ServiceException {
		name = "IdempotencyParameterMismatch";
		$fault = "client";
		constructor(opts) {
			super({
				name: "IdempotencyParameterMismatch",
				$fault: "client",
				...opts
			});
			Object.setPrototypeOf(this, IdempotencyParameterMismatch.prototype);
		}
	};
	exports.ObjectAlreadyInActiveTierError = class ObjectAlreadyInActiveTierError extends S3ServiceException_1.S3ServiceException {
		name = "ObjectAlreadyInActiveTierError";
		$fault = "client";
		constructor(opts) {
			super({
				name: "ObjectAlreadyInActiveTierError",
				$fault: "client",
				...opts
			});
			Object.setPrototypeOf(this, ObjectAlreadyInActiveTierError.prototype);
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/client-s3/dist-cjs/schemas/schemas_0.js
var require_schemas_0 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.CreateBucketMetadataTableConfigurationRequest$ = exports.CreateBucketMetadataConfigurationRequest$ = exports.CreateBucketConfiguration$ = exports.CORSRule$ = exports.CORSConfiguration$ = exports.CopyPartResult$ = exports.CopyObjectResult$ = exports.CopyObjectRequest$ = exports.CopyObjectOutput$ = exports.ContinuationEvent$ = exports.Condition$ = exports.CompleteMultipartUploadRequest$ = exports.CompleteMultipartUploadOutput$ = exports.CompletedPart$ = exports.CompletedMultipartUpload$ = exports.CommonPrefix$ = exports.Checksum$ = exports.BucketLoggingStatus$ = exports.BucketLifecycleConfiguration$ = exports.BucketInfo$ = exports.Bucket$ = exports.BlockedEncryptionTypes$ = exports.AnalyticsS3BucketDestination$ = exports.AnalyticsExportDestination$ = exports.AnalyticsConfiguration$ = exports.AnalyticsAndOperator$ = exports.AccessControlTranslation$ = exports.AccessControlPolicy$ = exports.AccelerateConfiguration$ = exports.AbortMultipartUploadRequest$ = exports.AbortMultipartUploadOutput$ = exports.AbortIncompleteMultipartUpload$ = exports.AbacStatus$ = exports.errorTypeRegistries = exports.TooManyParts$ = exports.ObjectNotInActiveTierError$ = exports.ObjectAlreadyInActiveTierError$ = exports.NotFound$ = exports.NoSuchUpload$ = exports.NoSuchKey$ = exports.NoSuchBucket$ = exports.InvalidWriteOffset$ = exports.InvalidRequest$ = exports.InvalidObjectState$ = exports.IdempotencyParameterMismatch$ = exports.EncryptionTypeMismatch$ = exports.BucketAlreadyOwnedByYou$ = exports.BucketAlreadyExists$ = exports.AccessDenied$ = exports.S3ServiceException$ = void 0;
	exports.GetBucketAccelerateConfigurationRequest$ = exports.GetBucketAccelerateConfigurationOutput$ = exports.GetBucketAbacRequest$ = exports.GetBucketAbacOutput$ = exports.FilterRule$ = exports.ExistingObjectReplication$ = exports.EventBridgeConfiguration$ = exports.ErrorDocument$ = exports.ErrorDetails$ = exports._Error$ = exports.EndEvent$ = exports.EncryptionConfiguration$ = exports.Encryption$ = exports.DestinationResult$ = exports.Destination$ = exports.DeletePublicAccessBlockRequest$ = exports.DeleteObjectTaggingRequest$ = exports.DeleteObjectTaggingOutput$ = exports.DeleteObjectsRequest$ = exports.DeleteObjectsOutput$ = exports.DeleteObjectRequest$ = exports.DeleteObjectOutput$ = exports.DeleteMarkerReplication$ = exports.DeleteMarkerEntry$ = exports.DeletedObject$ = exports.DeleteBucketWebsiteRequest$ = exports.DeleteBucketTaggingRequest$ = exports.DeleteBucketRequest$ = exports.DeleteBucketReplicationRequest$ = exports.DeleteBucketPolicyRequest$ = exports.DeleteBucketOwnershipControlsRequest$ = exports.DeleteBucketMetricsConfigurationRequest$ = exports.DeleteBucketMetadataTableConfigurationRequest$ = exports.DeleteBucketMetadataConfigurationRequest$ = exports.DeleteBucketLifecycleRequest$ = exports.DeleteBucketInventoryConfigurationRequest$ = exports.DeleteBucketIntelligentTieringConfigurationRequest$ = exports.DeleteBucketEncryptionRequest$ = exports.DeleteBucketCorsRequest$ = exports.DeleteBucketAnalyticsConfigurationRequest$ = exports.Delete$ = exports.DefaultRetention$ = exports.CSVOutput$ = exports.CSVInput$ = exports.CreateSessionRequest$ = exports.CreateSessionOutput$ = exports.CreateMultipartUploadRequest$ = exports.CreateMultipartUploadOutput$ = exports.CreateBucketRequest$ = exports.CreateBucketOutput$ = void 0;
	exports.GetObjectLegalHoldRequest$ = exports.GetObjectLegalHoldOutput$ = exports.GetObjectAttributesRequest$ = exports.GetObjectAttributesParts$ = exports.GetObjectAttributesOutput$ = exports.GetObjectAclRequest$ = exports.GetObjectAclOutput$ = exports.GetBucketWebsiteRequest$ = exports.GetBucketWebsiteOutput$ = exports.GetBucketVersioningRequest$ = exports.GetBucketVersioningOutput$ = exports.GetBucketTaggingRequest$ = exports.GetBucketTaggingOutput$ = exports.GetBucketRequestPaymentRequest$ = exports.GetBucketRequestPaymentOutput$ = exports.GetBucketReplicationRequest$ = exports.GetBucketReplicationOutput$ = exports.GetBucketPolicyStatusRequest$ = exports.GetBucketPolicyStatusOutput$ = exports.GetBucketPolicyRequest$ = exports.GetBucketPolicyOutput$ = exports.GetBucketOwnershipControlsRequest$ = exports.GetBucketOwnershipControlsOutput$ = exports.GetBucketNotificationConfigurationRequest$ = exports.GetBucketMetricsConfigurationRequest$ = exports.GetBucketMetricsConfigurationOutput$ = exports.GetBucketMetadataTableConfigurationResult$ = exports.GetBucketMetadataTableConfigurationRequest$ = exports.GetBucketMetadataTableConfigurationOutput$ = exports.GetBucketMetadataConfigurationResult$ = exports.GetBucketMetadataConfigurationRequest$ = exports.GetBucketMetadataConfigurationOutput$ = exports.GetBucketLoggingRequest$ = exports.GetBucketLoggingOutput$ = exports.GetBucketLocationRequest$ = exports.GetBucketLocationOutput$ = exports.GetBucketLifecycleConfigurationRequest$ = exports.GetBucketLifecycleConfigurationOutput$ = exports.GetBucketInventoryConfigurationRequest$ = exports.GetBucketInventoryConfigurationOutput$ = exports.GetBucketIntelligentTieringConfigurationRequest$ = exports.GetBucketIntelligentTieringConfigurationOutput$ = exports.GetBucketEncryptionRequest$ = exports.GetBucketEncryptionOutput$ = exports.GetBucketCorsRequest$ = exports.GetBucketCorsOutput$ = exports.GetBucketAnalyticsConfigurationRequest$ = exports.GetBucketAnalyticsConfigurationOutput$ = exports.GetBucketAclRequest$ = exports.GetBucketAclOutput$ = void 0;
	exports.ListBucketInventoryConfigurationsRequest$ = exports.ListBucketInventoryConfigurationsOutput$ = exports.ListBucketIntelligentTieringConfigurationsRequest$ = exports.ListBucketIntelligentTieringConfigurationsOutput$ = exports.ListBucketAnalyticsConfigurationsRequest$ = exports.ListBucketAnalyticsConfigurationsOutput$ = exports.LifecycleRuleFilter$ = exports.LifecycleRuleAndOperator$ = exports.LifecycleRule$ = exports.LifecycleExpiration$ = exports.LambdaFunctionConfiguration$ = exports.JSONOutput$ = exports.JSONInput$ = exports.JournalTableConfigurationUpdates$ = exports.JournalTableConfigurationResult$ = exports.JournalTableConfiguration$ = exports.InventoryTableConfigurationUpdates$ = exports.InventoryTableConfigurationResult$ = exports.InventoryTableConfiguration$ = exports.InventorySchedule$ = exports.InventoryS3BucketDestination$ = exports.InventoryFilter$ = exports.InventoryEncryption$ = exports.InventoryDestination$ = exports.InventoryConfiguration$ = exports.IntelligentTieringFilter$ = exports.IntelligentTieringConfiguration$ = exports.IntelligentTieringAndOperator$ = exports.InputSerialization$ = exports.Initiator$ = exports.IndexDocument$ = exports.HeadObjectRequest$ = exports.HeadObjectOutput$ = exports.HeadBucketRequest$ = exports.HeadBucketOutput$ = exports.Grantee$ = exports.Grant$ = exports.GlacierJobParameters$ = exports.GetPublicAccessBlockRequest$ = exports.GetPublicAccessBlockOutput$ = exports.GetObjectTorrentRequest$ = exports.GetObjectTorrentOutput$ = exports.GetObjectTaggingRequest$ = exports.GetObjectTaggingOutput$ = exports.GetObjectRetentionRequest$ = exports.GetObjectRetentionOutput$ = exports.GetObjectRequest$ = exports.GetObjectOutput$ = exports.GetObjectLockConfigurationRequest$ = exports.GetObjectLockConfigurationOutput$ = void 0;
	exports.Progress$ = exports.PolicyStatus$ = exports.PartitionedPrefix$ = exports.Part$ = exports.ParquetInput$ = exports.OwnershipControlsRule$ = exports.OwnershipControls$ = exports.Owner$ = exports.OutputSerialization$ = exports.OutputLocation$ = exports.ObjectVersion$ = exports.ObjectPart$ = exports.ObjectLockRule$ = exports.ObjectLockRetention$ = exports.ObjectLockLegalHold$ = exports.ObjectLockConfiguration$ = exports.ObjectIdentifier$ = exports._Object$ = exports.NotificationConfigurationFilter$ = exports.NotificationConfiguration$ = exports.NoncurrentVersionTransition$ = exports.NoncurrentVersionExpiration$ = exports.MultipartUpload$ = exports.MetricsConfiguration$ = exports.MetricsAndOperator$ = exports.Metrics$ = exports.MetadataTableEncryptionConfiguration$ = exports.MetadataTableConfigurationResult$ = exports.MetadataTableConfiguration$ = exports.MetadataEntry$ = exports.MetadataConfigurationResult$ = exports.MetadataConfiguration$ = exports.LoggingEnabled$ = exports.LocationInfo$ = exports.ListPartsRequest$ = exports.ListPartsOutput$ = exports.ListObjectVersionsRequest$ = exports.ListObjectVersionsOutput$ = exports.ListObjectsV2Request$ = exports.ListObjectsV2Output$ = exports.ListObjectsRequest$ = exports.ListObjectsOutput$ = exports.ListMultipartUploadsRequest$ = exports.ListMultipartUploadsOutput$ = exports.ListDirectoryBucketsRequest$ = exports.ListDirectoryBucketsOutput$ = exports.ListBucketsRequest$ = exports.ListBucketsOutput$ = exports.ListBucketMetricsConfigurationsRequest$ = exports.ListBucketMetricsConfigurationsOutput$ = void 0;
	exports.RequestPaymentConfiguration$ = exports.ReplicationTimeValue$ = exports.ReplicationTime$ = exports.ReplicationRuleFilter$ = exports.ReplicationRuleAndOperator$ = exports.ReplicationRule$ = exports.ReplicationConfiguration$ = exports.ReplicaModifications$ = exports.RenameObjectRequest$ = exports.RenameObjectOutput$ = exports.RedirectAllRequestsTo$ = exports.Redirect$ = exports.RecordsEvent$ = exports.RecordExpiration$ = exports.QueueConfiguration$ = exports.PutPublicAccessBlockRequest$ = exports.PutObjectTaggingRequest$ = exports.PutObjectTaggingOutput$ = exports.PutObjectRetentionRequest$ = exports.PutObjectRetentionOutput$ = exports.PutObjectRequest$ = exports.PutObjectOutput$ = exports.PutObjectLockConfigurationRequest$ = exports.PutObjectLockConfigurationOutput$ = exports.PutObjectLegalHoldRequest$ = exports.PutObjectLegalHoldOutput$ = exports.PutObjectAclRequest$ = exports.PutObjectAclOutput$ = exports.PutBucketWebsiteRequest$ = exports.PutBucketVersioningRequest$ = exports.PutBucketTaggingRequest$ = exports.PutBucketRequestPaymentRequest$ = exports.PutBucketReplicationRequest$ = exports.PutBucketPolicyRequest$ = exports.PutBucketOwnershipControlsRequest$ = exports.PutBucketNotificationConfigurationRequest$ = exports.PutBucketMetricsConfigurationRequest$ = exports.PutBucketLoggingRequest$ = exports.PutBucketLifecycleConfigurationRequest$ = exports.PutBucketLifecycleConfigurationOutput$ = exports.PutBucketInventoryConfigurationRequest$ = exports.PutBucketIntelligentTieringConfigurationRequest$ = exports.PutBucketEncryptionRequest$ = exports.PutBucketCorsRequest$ = exports.PutBucketAnalyticsConfigurationRequest$ = exports.PutBucketAclRequest$ = exports.PutBucketAccelerateConfigurationRequest$ = exports.PutBucketAbacRequest$ = exports.PublicAccessBlockConfiguration$ = exports.ProgressEvent$ = void 0;
	exports.SelectObjectContentEventStream$ = exports.ObjectEncryption$ = exports.MetricsFilter$ = exports.AnalyticsFilter$ = exports.WriteGetObjectResponseRequest$ = exports.WebsiteConfiguration$ = exports.VersioningConfiguration$ = exports.UploadPartRequest$ = exports.UploadPartOutput$ = exports.UploadPartCopyRequest$ = exports.UploadPartCopyOutput$ = exports.UpdateObjectEncryptionResponse$ = exports.UpdateObjectEncryptionRequest$ = exports.UpdateBucketMetadataJournalTableConfigurationRequest$ = exports.UpdateBucketMetadataInventoryTableConfigurationRequest$ = exports.Transition$ = exports.TopicConfiguration$ = exports.Tiering$ = exports.TargetObjectKeyFormat$ = exports.TargetGrant$ = exports.Tagging$ = exports.Tag$ = exports.StorageClassAnalysisDataExport$ = exports.StorageClassAnalysis$ = exports.StatsEvent$ = exports.Stats$ = exports.SSES3$ = exports.SSEKMSEncryption$ = exports.SseKmsEncryptedObjects$ = exports.SSEKMS$ = exports.SourceSelectionCriteria$ = exports.SimplePrefix$ = exports.SessionCredentials$ = exports.ServerSideEncryptionRule$ = exports.ServerSideEncryptionConfiguration$ = exports.ServerSideEncryptionByDefault$ = exports.SelectParameters$ = exports.SelectObjectContentRequest$ = exports.SelectObjectContentOutput$ = exports.ScanRange$ = exports.S3TablesDestinationResult$ = exports.S3TablesDestination$ = exports.S3Location$ = exports.S3KeyFilter$ = exports.RoutingRule$ = exports.RestoreStatus$ = exports.RestoreRequest$ = exports.RestoreObjectRequest$ = exports.RestoreObjectOutput$ = exports.RequestProgress$ = void 0;
	exports.GetBucketWebsite$ = exports.GetBucketVersioning$ = exports.GetBucketTagging$ = exports.GetBucketRequestPayment$ = exports.GetBucketReplication$ = exports.GetBucketPolicyStatus$ = exports.GetBucketPolicy$ = exports.GetBucketOwnershipControls$ = exports.GetBucketNotificationConfiguration$ = exports.GetBucketMetricsConfiguration$ = exports.GetBucketMetadataTableConfiguration$ = exports.GetBucketMetadataConfiguration$ = exports.GetBucketLogging$ = exports.GetBucketLocation$ = exports.GetBucketLifecycleConfiguration$ = exports.GetBucketInventoryConfiguration$ = exports.GetBucketIntelligentTieringConfiguration$ = exports.GetBucketEncryption$ = exports.GetBucketCors$ = exports.GetBucketAnalyticsConfiguration$ = exports.GetBucketAcl$ = exports.GetBucketAccelerateConfiguration$ = exports.GetBucketAbac$ = exports.DeletePublicAccessBlock$ = exports.DeleteObjectTagging$ = exports.DeleteObjects$ = exports.DeleteObject$ = exports.DeleteBucketWebsite$ = exports.DeleteBucketTagging$ = exports.DeleteBucketReplication$ = exports.DeleteBucketPolicy$ = exports.DeleteBucketOwnershipControls$ = exports.DeleteBucketMetricsConfiguration$ = exports.DeleteBucketMetadataTableConfiguration$ = exports.DeleteBucketMetadataConfiguration$ = exports.DeleteBucketLifecycle$ = exports.DeleteBucketInventoryConfiguration$ = exports.DeleteBucketIntelligentTieringConfiguration$ = exports.DeleteBucketEncryption$ = exports.DeleteBucketCors$ = exports.DeleteBucketAnalyticsConfiguration$ = exports.DeleteBucket$ = exports.CreateSession$ = exports.CreateMultipartUpload$ = exports.CreateBucketMetadataTableConfiguration$ = exports.CreateBucketMetadataConfiguration$ = exports.CreateBucket$ = exports.CopyObject$ = exports.CompleteMultipartUpload$ = exports.AbortMultipartUpload$ = void 0;
	exports.RestoreObject$ = exports.RenameObject$ = exports.PutPublicAccessBlock$ = exports.PutObjectTagging$ = exports.PutObjectRetention$ = exports.PutObjectLockConfiguration$ = exports.PutObjectLegalHold$ = exports.PutObjectAcl$ = exports.PutObject$ = exports.PutBucketWebsite$ = exports.PutBucketVersioning$ = exports.PutBucketTagging$ = exports.PutBucketRequestPayment$ = exports.PutBucketReplication$ = exports.PutBucketPolicy$ = exports.PutBucketOwnershipControls$ = exports.PutBucketNotificationConfiguration$ = exports.PutBucketMetricsConfiguration$ = exports.PutBucketLogging$ = exports.PutBucketLifecycleConfiguration$ = exports.PutBucketInventoryConfiguration$ = exports.PutBucketIntelligentTieringConfiguration$ = exports.PutBucketEncryption$ = exports.PutBucketCors$ = exports.PutBucketAnalyticsConfiguration$ = exports.PutBucketAcl$ = exports.PutBucketAccelerateConfiguration$ = exports.PutBucketAbac$ = exports.ListParts$ = exports.ListObjectVersions$ = exports.ListObjectsV2$ = exports.ListObjects$ = exports.ListMultipartUploads$ = exports.ListDirectoryBuckets$ = exports.ListBuckets$ = exports.ListBucketMetricsConfigurations$ = exports.ListBucketInventoryConfigurations$ = exports.ListBucketIntelligentTieringConfigurations$ = exports.ListBucketAnalyticsConfigurations$ = exports.HeadObject$ = exports.HeadBucket$ = exports.GetPublicAccessBlock$ = exports.GetObjectTorrent$ = exports.GetObjectTagging$ = exports.GetObjectRetention$ = exports.GetObjectLockConfiguration$ = exports.GetObjectLegalHold$ = exports.GetObjectAttributes$ = exports.GetObjectAcl$ = exports.GetObject$ = void 0;
	exports.WriteGetObjectResponse$ = exports.UploadPartCopy$ = exports.UploadPart$ = exports.UpdateObjectEncryption$ = exports.UpdateBucketMetadataJournalTableConfiguration$ = exports.UpdateBucketMetadataInventoryTableConfiguration$ = exports.SelectObjectContent$ = void 0;
	const _A = "Account";
	const _AAO = "AnalyticsAndOperator";
	const _AC = "AccelerateConfiguration";
	const _ACL = "AccessControlList";
	const _ACL_ = "ACL";
	const _ACLn = "AnalyticsConfigurationList";
	const _ACP = "AccessControlPolicy";
	const _ACT = "AccessControlTranslation";
	const _ACn = "AnalyticsConfiguration";
	const _AD = "AccessDenied";
	const _ADb = "AbortDate";
	const _AED = "AnalyticsExportDestination";
	const _AF = "AnalyticsFilter";
	const _AH = "AllowedHeaders";
	const _AHl = "AllowedHeader";
	const _AI = "AccountId";
	const _AIMU = "AbortIncompleteMultipartUpload";
	const _AKI = "AccessKeyId";
	const _AM = "AllowedMethods";
	const _AMU = "AbortMultipartUpload";
	const _AMUO = "AbortMultipartUploadOutput";
	const _AMUR = "AbortMultipartUploadRequest";
	const _AMl = "AllowedMethod";
	const _AO = "AllowedOrigins";
	const _AOl = "AllowedOrigin";
	const _APA = "AccessPointAlias";
	const _APAc = "AccessPointArn";
	const _AQRD = "AllowQuotedRecordDelimiter";
	const _AR = "AcceptRanges";
	const _ARI = "AbortRuleId";
	const _AS = "AbacStatus";
	const _ASBD = "AnalyticsS3BucketDestination";
	const _ASSEBD = "ApplyServerSideEncryptionByDefault";
	const _ASr = "ArchiveStatus";
	const _AT = "AccessTier";
	const _An = "And";
	const _B = "Bucket";
	const _BA = "BucketArn";
	const _BAE = "BucketAlreadyExists";
	const _BAI = "BucketAccountId";
	const _BAOBY = "BucketAlreadyOwnedByYou";
	const _BET = "BlockedEncryptionTypes";
	const _BGR = "BypassGovernanceRetention";
	const _BI = "BucketInfo";
	const _BKE = "BucketKeyEnabled";
	const _BLC = "BucketLifecycleConfiguration";
	const _BLN = "BucketLocationName";
	const _BLS = "BucketLoggingStatus";
	const _BLT = "BucketLocationType";
	const _BN = "BucketNamespace";
	const _BNu = "BucketName";
	const _BP = "BytesProcessed";
	const _BPA = "BlockPublicAcls";
	const _BPP = "BlockPublicPolicy";
	const _BR = "BucketRegion";
	const _BRy = "BytesReturned";
	const _BS = "BytesScanned";
	const _Bo = "Body";
	const _Bu = "Buckets";
	const _C = "Checksum";
	const _CA = "ChecksumAlgorithm";
	const _CACL = "CannedACL";
	const _CB = "CreateBucket";
	const _CBC = "CreateBucketConfiguration";
	const _CBMC = "CreateBucketMetadataConfiguration";
	const _CBMCR = "CreateBucketMetadataConfigurationRequest";
	const _CBMTC = "CreateBucketMetadataTableConfiguration";
	const _CBMTCR = "CreateBucketMetadataTableConfigurationRequest";
	const _CBO = "CreateBucketOutput";
	const _CBR = "CreateBucketRequest";
	const _CC = "CacheControl";
	const _CCRC = "ChecksumCRC32";
	const _CCRCC = "ChecksumCRC32C";
	const _CCRCNVME = "ChecksumCRC64NVME";
	const _CC_ = "Cache-Control";
	const _CD = "CreationDate";
	const _CD_ = "Content-Disposition";
	const _CDo = "ContentDisposition";
	const _CE = "ContinuationEvent";
	const _CE_ = "Content-Encoding";
	const _CEo = "ContentEncoding";
	const _CF = "CloudFunction";
	const _CFC = "CloudFunctionConfiguration";
	const _CL = "ContentLanguage";
	const _CL_ = "Content-Language";
	const _CL__ = "Content-Length";
	const _CLo = "ContentLength";
	const _CM = "Content-MD5";
	const _CMD = "ChecksumMD5";
	const _CMDo = "ContentMD5";
	const _CMU = "CompletedMultipartUpload";
	const _CMUO = "CompleteMultipartUploadOutput";
	const _CMUOr = "CreateMultipartUploadOutput";
	const _CMUR = "CompleteMultipartUploadResult";
	const _CMURo = "CompleteMultipartUploadRequest";
	const _CMURr = "CreateMultipartUploadRequest";
	const _CMUo = "CompleteMultipartUpload";
	const _CMUr = "CreateMultipartUpload";
	const _CMh = "ChecksumMode";
	const _CO = "CopyObject";
	const _COO = "CopyObjectOutput";
	const _COR = "CopyObjectResult";
	const _CORSC = "CORSConfiguration";
	const _CORSR = "CORSRules";
	const _CORSRu = "CORSRule";
	const _CORo = "CopyObjectRequest";
	const _CP = "CommonPrefix";
	const _CPL = "CommonPrefixList";
	const _CPLo = "CompletedPartList";
	const _CPR = "CopyPartResult";
	const _CPo = "CompletedPart";
	const _CPom = "CommonPrefixes";
	const _CR = "ContentRange";
	const _CRSBA = "ConfirmRemoveSelfBucketAccess";
	const _CR_ = "Content-Range";
	const _CS = "CopySource";
	const _CSHA = "ChecksumSHA1";
	const _CSHAh = "ChecksumSHA256";
	const _CSHAhe = "ChecksumSHA512";
	const _CSIM = "CopySourceIfMatch";
	const _CSIMS = "CopySourceIfModifiedSince";
	const _CSINM = "CopySourceIfNoneMatch";
	const _CSIUS = "CopySourceIfUnmodifiedSince";
	const _CSO = "CreateSessionOutput";
	const _CSR = "CreateSessionResult";
	const _CSRo = "CopySourceRange";
	const _CSRr = "CreateSessionRequest";
	const _CSSSECA = "CopySourceSSECustomerAlgorithm";
	const _CSSSECK = "CopySourceSSECustomerKey";
	const _CSSSECKMD = "CopySourceSSECustomerKeyMD5";
	const _CSV = "CSV";
	const _CSVI = "CopySourceVersionId";
	const _CSVIn = "CSVInput";
	const _CSVO = "CSVOutput";
	const _CSo = "ConfigurationState";
	const _CSr = "CreateSession";
	const _CT = "ChecksumType";
	const _CT_ = "Content-Type";
	const _CTl = "ClientToken";
	const _CTo = "ContentType";
	const _CTom = "CompressionType";
	const _CTon = "ContinuationToken";
	const _CXXHASH = "ChecksumXXHASH64";
	const _CXXHASHh = "ChecksumXXHASH3";
	const _CXXHASHhe = "ChecksumXXHASH128";
	const _Co = "Condition";
	const _Cod = "Code";
	const _Com = "Comments";
	const _Con = "Contents";
	const _Cont = "Cont";
	const _Cr = "Credentials";
	const _D = "Days";
	const _DAI = "DaysAfterInitiation";
	const _DB = "DeleteBucket";
	const _DBAC = "DeleteBucketAnalyticsConfiguration";
	const _DBACR = "DeleteBucketAnalyticsConfigurationRequest";
	const _DBC = "DeleteBucketCors";
	const _DBCR = "DeleteBucketCorsRequest";
	const _DBE = "DeleteBucketEncryption";
	const _DBER = "DeleteBucketEncryptionRequest";
	const _DBIC = "DeleteBucketInventoryConfiguration";
	const _DBICR = "DeleteBucketInventoryConfigurationRequest";
	const _DBITC = "DeleteBucketIntelligentTieringConfiguration";
	const _DBITCR = "DeleteBucketIntelligentTieringConfigurationRequest";
	const _DBL = "DeleteBucketLifecycle";
	const _DBLR = "DeleteBucketLifecycleRequest";
	const _DBMC = "DeleteBucketMetadataConfiguration";
	const _DBMCR = "DeleteBucketMetadataConfigurationRequest";
	const _DBMCRe = "DeleteBucketMetricsConfigurationRequest";
	const _DBMCe = "DeleteBucketMetricsConfiguration";
	const _DBMTC = "DeleteBucketMetadataTableConfiguration";
	const _DBMTCR = "DeleteBucketMetadataTableConfigurationRequest";
	const _DBOC = "DeleteBucketOwnershipControls";
	const _DBOCR = "DeleteBucketOwnershipControlsRequest";
	const _DBP = "DeleteBucketPolicy";
	const _DBPR = "DeleteBucketPolicyRequest";
	const _DBR = "DeleteBucketRequest";
	const _DBRR = "DeleteBucketReplicationRequest";
	const _DBRe = "DeleteBucketReplication";
	const _DBT = "DeleteBucketTagging";
	const _DBTR = "DeleteBucketTaggingRequest";
	const _DBW = "DeleteBucketWebsite";
	const _DBWR = "DeleteBucketWebsiteRequest";
	const _DE = "DataExport";
	const _DIM = "DestinationIfMatch";
	const _DIMS = "DestinationIfModifiedSince";
	const _DINM = "DestinationIfNoneMatch";
	const _DIUS = "DestinationIfUnmodifiedSince";
	const _DM = "DeleteMarker";
	const _DME = "DeleteMarkerEntry";
	const _DMR = "DeleteMarkerReplication";
	const _DMVI = "DeleteMarkerVersionId";
	const _DMe = "DeleteMarkers";
	const _DN = "DisplayName";
	const _DO = "DeletedObject";
	const _DOO = "DeleteObjectOutput";
	const _DOOe = "DeleteObjectsOutput";
	const _DOR = "DeleteObjectRequest";
	const _DORe = "DeleteObjectsRequest";
	const _DOT = "DeleteObjectTagging";
	const _DOTO = "DeleteObjectTaggingOutput";
	const _DOTR = "DeleteObjectTaggingRequest";
	const _DOe = "DeletedObjects";
	const _DOel = "DeleteObject";
	const _DOele = "DeleteObjects";
	const _DPAB = "DeletePublicAccessBlock";
	const _DPABR = "DeletePublicAccessBlockRequest";
	const _DR = "DataRedundancy";
	const _DRe = "DefaultRetention";
	const _DRel = "DeleteResult";
	const _DRes = "DestinationResult";
	const _Da = "Date";
	const _De = "Delete";
	const _Del = "Deleted";
	const _Deli = "Delimiter";
	const _Des = "Destination";
	const _Desc = "Description";
	const _Det = "Details";
	const _E = "Expiration";
	const _EA = "EmailAddress";
	const _EBC = "EventBridgeConfiguration";
	const _EBO = "ExpectedBucketOwner";
	const _EC = "EncryptionConfiguration";
	const _ECr = "ErrorCode";
	const _ED = "ErrorDetails";
	const _EDr = "ErrorDocument";
	const _EE = "EndEvent";
	const _EH = "ExposeHeaders";
	const _EHx = "ExposeHeader";
	const _EM = "ErrorMessage";
	const _EODM = "ExpiredObjectDeleteMarker";
	const _EOR = "ExistingObjectReplication";
	const _ES = "ExpiresString";
	const _ESBO = "ExpectedSourceBucketOwner";
	const _ET = "EncryptionType";
	const _ETL = "EncryptionTypeList";
	const _ETM = "EncryptionTypeMismatch";
	const _ETa = "ETag";
	const _ETn = "EncodingType";
	const _ETv = "EventThreshold";
	const _ETx = "ExpressionType";
	const _En = "Encryption";
	const _Ena = "Enabled";
	const _End = "End";
	const _Er = "Errors";
	const _Err = "Error";
	const _Ev = "Events";
	const _Eve = "Event";
	const _Ex = "Expires";
	const _Exp = "Expression";
	const _F = "Filter";
	const _FD = "FieldDelimiter";
	const _FHI = "FileHeaderInfo";
	const _FO = "FetchOwner";
	const _FR = "FilterRule";
	const _FRL = "FilterRuleList";
	const _FRi = "FilterRules";
	const _Fi = "Field";
	const _Fo = "Format";
	const _Fr = "Frequency";
	const _G = "Grants";
	const _GBA = "GetBucketAbac";
	const _GBAC = "GetBucketAccelerateConfiguration";
	const _GBACO = "GetBucketAccelerateConfigurationOutput";
	const _GBACOe = "GetBucketAnalyticsConfigurationOutput";
	const _GBACR = "GetBucketAccelerateConfigurationRequest";
	const _GBACRe = "GetBucketAnalyticsConfigurationRequest";
	const _GBACe = "GetBucketAnalyticsConfiguration";
	const _GBAO = "GetBucketAbacOutput";
	const _GBAOe = "GetBucketAclOutput";
	const _GBAR = "GetBucketAbacRequest";
	const _GBARe = "GetBucketAclRequest";
	const _GBAe = "GetBucketAcl";
	const _GBC = "GetBucketCors";
	const _GBCO = "GetBucketCorsOutput";
	const _GBCR = "GetBucketCorsRequest";
	const _GBE = "GetBucketEncryption";
	const _GBEO = "GetBucketEncryptionOutput";
	const _GBER = "GetBucketEncryptionRequest";
	const _GBIC = "GetBucketInventoryConfiguration";
	const _GBICO = "GetBucketInventoryConfigurationOutput";
	const _GBICR = "GetBucketInventoryConfigurationRequest";
	const _GBITC = "GetBucketIntelligentTieringConfiguration";
	const _GBITCO = "GetBucketIntelligentTieringConfigurationOutput";
	const _GBITCR = "GetBucketIntelligentTieringConfigurationRequest";
	const _GBL = "GetBucketLocation";
	const _GBLC = "GetBucketLifecycleConfiguration";
	const _GBLCO = "GetBucketLifecycleConfigurationOutput";
	const _GBLCR = "GetBucketLifecycleConfigurationRequest";
	const _GBLO = "GetBucketLocationOutput";
	const _GBLOe = "GetBucketLoggingOutput";
	const _GBLR = "GetBucketLocationRequest";
	const _GBLRe = "GetBucketLoggingRequest";
	const _GBLe = "GetBucketLogging";
	const _GBMC = "GetBucketMetadataConfiguration";
	const _GBMCO = "GetBucketMetadataConfigurationOutput";
	const _GBMCOe = "GetBucketMetricsConfigurationOutput";
	const _GBMCR = "GetBucketMetadataConfigurationResult";
	const _GBMCRe = "GetBucketMetadataConfigurationRequest";
	const _GBMCRet = "GetBucketMetricsConfigurationRequest";
	const _GBMCe = "GetBucketMetricsConfiguration";
	const _GBMTC = "GetBucketMetadataTableConfiguration";
	const _GBMTCO = "GetBucketMetadataTableConfigurationOutput";
	const _GBMTCR = "GetBucketMetadataTableConfigurationResult";
	const _GBMTCRe = "GetBucketMetadataTableConfigurationRequest";
	const _GBNC = "GetBucketNotificationConfiguration";
	const _GBNCR = "GetBucketNotificationConfigurationRequest";
	const _GBOC = "GetBucketOwnershipControls";
	const _GBOCO = "GetBucketOwnershipControlsOutput";
	const _GBOCR = "GetBucketOwnershipControlsRequest";
	const _GBP = "GetBucketPolicy";
	const _GBPO = "GetBucketPolicyOutput";
	const _GBPR = "GetBucketPolicyRequest";
	const _GBPS = "GetBucketPolicyStatus";
	const _GBPSO = "GetBucketPolicyStatusOutput";
	const _GBPSR = "GetBucketPolicyStatusRequest";
	const _GBR = "GetBucketReplication";
	const _GBRO = "GetBucketReplicationOutput";
	const _GBRP = "GetBucketRequestPayment";
	const _GBRPO = "GetBucketRequestPaymentOutput";
	const _GBRPR = "GetBucketRequestPaymentRequest";
	const _GBRR = "GetBucketReplicationRequest";
	const _GBT = "GetBucketTagging";
	const _GBTO = "GetBucketTaggingOutput";
	const _GBTR = "GetBucketTaggingRequest";
	const _GBV = "GetBucketVersioning";
	const _GBVO = "GetBucketVersioningOutput";
	const _GBVR = "GetBucketVersioningRequest";
	const _GBW = "GetBucketWebsite";
	const _GBWO = "GetBucketWebsiteOutput";
	const _GBWR = "GetBucketWebsiteRequest";
	const _GFC = "GrantFullControl";
	const _GJP = "GlacierJobParameters";
	const _GO = "GetObject";
	const _GOA = "GetObjectAcl";
	const _GOAO = "GetObjectAclOutput";
	const _GOAOe = "GetObjectAttributesOutput";
	const _GOAP = "GetObjectAttributesParts";
	const _GOAR = "GetObjectAclRequest";
	const _GOARe = "GetObjectAttributesResponse";
	const _GOARet = "GetObjectAttributesRequest";
	const _GOAe = "GetObjectAttributes";
	const _GOLC = "GetObjectLockConfiguration";
	const _GOLCO = "GetObjectLockConfigurationOutput";
	const _GOLCR = "GetObjectLockConfigurationRequest";
	const _GOLH = "GetObjectLegalHold";
	const _GOLHO = "GetObjectLegalHoldOutput";
	const _GOLHR = "GetObjectLegalHoldRequest";
	const _GOO = "GetObjectOutput";
	const _GOR = "GetObjectRequest";
	const _GORO = "GetObjectRetentionOutput";
	const _GORR = "GetObjectRetentionRequest";
	const _GORe = "GetObjectRetention";
	const _GOT = "GetObjectTagging";
	const _GOTO = "GetObjectTaggingOutput";
	const _GOTOe = "GetObjectTorrentOutput";
	const _GOTR = "GetObjectTaggingRequest";
	const _GOTRe = "GetObjectTorrentRequest";
	const _GOTe = "GetObjectTorrent";
	const _GPAB = "GetPublicAccessBlock";
	const _GPABO = "GetPublicAccessBlockOutput";
	const _GPABR = "GetPublicAccessBlockRequest";
	const _GR = "GrantRead";
	const _GRACP = "GrantReadACP";
	const _GW = "GrantWrite";
	const _GWACP = "GrantWriteACP";
	const _Gr = "Grant";
	const _Gra = "Grantee";
	const _HB = "HeadBucket";
	const _HBO = "HeadBucketOutput";
	const _HBR = "HeadBucketRequest";
	const _HECRE = "HttpErrorCodeReturnedEquals";
	const _HN = "HostName";
	const _HO = "HeadObject";
	const _HOO = "HeadObjectOutput";
	const _HOR = "HeadObjectRequest";
	const _HRC = "HttpRedirectCode";
	const _I = "Id";
	const _IC = "InventoryConfiguration";
	const _ICL = "InventoryConfigurationList";
	const _ID = "ID";
	const _IDn = "IndexDocument";
	const _IDnv = "InventoryDestination";
	const _IE = "IsEnabled";
	const _IEn = "InventoryEncryption";
	const _IF = "InventoryFilter";
	const _IL = "IsLatest";
	const _IM = "IfMatch";
	const _IMIT = "IfMatchInitiatedTime";
	const _IMLMT = "IfMatchLastModifiedTime";
	const _IMS = "IfMatchSize";
	const _IMS_ = "If-Modified-Since";
	const _IMSf = "IfModifiedSince";
	const _IMUR = "InitiateMultipartUploadResult";
	const _IM_ = "If-Match";
	const _INM = "IfNoneMatch";
	const _INM_ = "If-None-Match";
	const _IOF = "InventoryOptionalFields";
	const _IOS = "InvalidObjectState";
	const _IOV = "IncludedObjectVersions";
	const _IP = "IsPublic";
	const _IPA = "IgnorePublicAcls";
	const _IPM = "IdempotencyParameterMismatch";
	const _IR = "InvalidRequest";
	const _IRIP = "IsRestoreInProgress";
	const _IS = "InputSerialization";
	const _ISBD = "InventoryS3BucketDestination";
	const _ISn = "InventorySchedule";
	const _IT = "IsTruncated";
	const _ITAO = "IntelligentTieringAndOperator";
	const _ITC = "IntelligentTieringConfiguration";
	const _ITCL = "IntelligentTieringConfigurationList";
	const _ITCR = "InventoryTableConfigurationResult";
	const _ITCU = "InventoryTableConfigurationUpdates";
	const _ITCn = "InventoryTableConfiguration";
	const _ITF = "IntelligentTieringFilter";
	const _IUS = "IfUnmodifiedSince";
	const _IUS_ = "If-Unmodified-Since";
	const _IWO = "InvalidWriteOffset";
	const _In = "Initiator";
	const _Ini = "Initiated";
	const _JSON = "JSON";
	const _JSONI = "JSONInput";
	const _JSONO = "JSONOutput";
	const _JTC = "JournalTableConfiguration";
	const _JTCR = "JournalTableConfigurationResult";
	const _JTCU = "JournalTableConfigurationUpdates";
	const _K = "Key";
	const _KC = "KeyCount";
	const _KI = "KeyId";
	const _KKA = "KmsKeyArn";
	const _KM = "KeyMarker";
	const _KMSC = "KMSContext";
	const _KMSKA = "KMSKeyArn";
	const _KMSKI = "KMSKeyId";
	const _KMSMKID = "KMSMasterKeyID";
	const _KPE = "KeyPrefixEquals";
	const _L = "Location";
	const _LAMBR = "ListAllMyBucketsResult";
	const _LAMDBR = "ListAllMyDirectoryBucketsResult";
	const _LB = "ListBuckets";
	const _LBAC = "ListBucketAnalyticsConfigurations";
	const _LBACO = "ListBucketAnalyticsConfigurationsOutput";
	const _LBACR = "ListBucketAnalyticsConfigurationResult";
	const _LBACRi = "ListBucketAnalyticsConfigurationsRequest";
	const _LBIC = "ListBucketInventoryConfigurations";
	const _LBICO = "ListBucketInventoryConfigurationsOutput";
	const _LBICR = "ListBucketInventoryConfigurationsRequest";
	const _LBITC = "ListBucketIntelligentTieringConfigurations";
	const _LBITCO = "ListBucketIntelligentTieringConfigurationsOutput";
	const _LBITCR = "ListBucketIntelligentTieringConfigurationsRequest";
	const _LBMC = "ListBucketMetricsConfigurations";
	const _LBMCO = "ListBucketMetricsConfigurationsOutput";
	const _LBMCR = "ListBucketMetricsConfigurationsRequest";
	const _LBO = "ListBucketsOutput";
	const _LBR = "ListBucketsRequest";
	const _LBRi = "ListBucketResult";
	const _LC = "LocationConstraint";
	const _LCi = "LifecycleConfiguration";
	const _LDB = "ListDirectoryBuckets";
	const _LDBO = "ListDirectoryBucketsOutput";
	const _LDBR = "ListDirectoryBucketsRequest";
	const _LE = "LoggingEnabled";
	const _LEi = "LifecycleExpiration";
	const _LFA = "LambdaFunctionArn";
	const _LFC = "LambdaFunctionConfiguration";
	const _LFCL = "LambdaFunctionConfigurationList";
	const _LFCa = "LambdaFunctionConfigurations";
	const _LH = "LegalHold";
	const _LI = "LocationInfo";
	const _LICR = "ListInventoryConfigurationsResult";
	const _LM = "LastModified";
	const _LMCR = "ListMetricsConfigurationsResult";
	const _LMT = "LastModifiedTime";
	const _LMU = "ListMultipartUploads";
	const _LMUO = "ListMultipartUploadsOutput";
	const _LMUR = "ListMultipartUploadsResult";
	const _LMURi = "ListMultipartUploadsRequest";
	const _LM_ = "Last-Modified";
	const _LO = "ListObjects";
	const _LOO = "ListObjectsOutput";
	const _LOR = "ListObjectsRequest";
	const _LOV = "ListObjectsV2";
	const _LOVO = "ListObjectsV2Output";
	const _LOVOi = "ListObjectVersionsOutput";
	const _LOVR = "ListObjectsV2Request";
	const _LOVRi = "ListObjectVersionsRequest";
	const _LOVi = "ListObjectVersions";
	const _LP = "ListParts";
	const _LPO = "ListPartsOutput";
	const _LPR = "ListPartsResult";
	const _LPRi = "ListPartsRequest";
	const _LR = "LifecycleRule";
	const _LRAO = "LifecycleRuleAndOperator";
	const _LRF = "LifecycleRuleFilter";
	const _LRi = "LifecycleRules";
	const _LVR = "ListVersionsResult";
	const _M = "Metadata";
	const _MAO = "MetricsAndOperator";
	const _MAS = "MaxAgeSeconds";
	const _MB = "MaxBuckets";
	const _MC = "MetadataConfiguration";
	const _MCL = "MetricsConfigurationList";
	const _MCR = "MetadataConfigurationResult";
	const _MCe = "MetricsConfiguration";
	const _MD = "MetadataDirective";
	const _MDB = "MaxDirectoryBuckets";
	const _MDf = "MfaDelete";
	const _ME = "MetadataEntry";
	const _MF = "MetricsFilter";
	const _MFA = "MFA";
	const _MFAD = "MFADelete";
	const _MK = "MaxKeys";
	const _MM = "MissingMeta";
	const _MOS = "MpuObjectSize";
	const _MP = "MaxParts";
	const _MTC = "MetadataTableConfiguration";
	const _MTCR = "MetadataTableConfigurationResult";
	const _MTEC = "MetadataTableEncryptionConfiguration";
	const _MU = "MultipartUpload";
	const _MUL = "MultipartUploadList";
	const _MUa = "MaxUploads";
	const _Ma = "Marker";
	const _Me = "Metrics";
	const _Mes = "Message";
	const _Mi = "Minutes";
	const _Mo = "Mode";
	const _N = "Name";
	const _NC = "NotificationConfiguration";
	const _NCF = "NotificationConfigurationFilter";
	const _NCT = "NextContinuationToken";
	const _ND = "NoncurrentDays";
	const _NEKKAS = "NonEmptyKmsKeyArnString";
	const _NF = "NotFound";
	const _NKM = "NextKeyMarker";
	const _NM = "NextMarker";
	const _NNV = "NewerNoncurrentVersions";
	const _NPNM = "NextPartNumberMarker";
	const _NSB = "NoSuchBucket";
	const _NSK = "NoSuchKey";
	const _NSU = "NoSuchUpload";
	const _NUIM = "NextUploadIdMarker";
	const _NVE = "NoncurrentVersionExpiration";
	const _NVIM = "NextVersionIdMarker";
	const _NVT = "NoncurrentVersionTransitions";
	const _NVTL = "NoncurrentVersionTransitionList";
	const _NVTo = "NoncurrentVersionTransition";
	const _O = "Owner";
	const _OA = "ObjectAttributes";
	const _OAIATE = "ObjectAlreadyInActiveTierError";
	const _OC = "OwnershipControls";
	const _OCR = "OwnershipControlsRule";
	const _OCRw = "OwnershipControlsRules";
	const _OE = "ObjectEncryption";
	const _OF = "OptionalFields";
	const _OI = "ObjectIdentifier";
	const _OIL = "ObjectIdentifierList";
	const _OL = "OutputLocation";
	const _OLC = "ObjectLockConfiguration";
	const _OLE = "ObjectLockEnabled";
	const _OLEFB = "ObjectLockEnabledForBucket";
	const _OLLH = "ObjectLockLegalHold";
	const _OLLHS = "ObjectLockLegalHoldStatus";
	const _OLM = "ObjectLockMode";
	const _OLR = "ObjectLockRetention";
	const _OLRUD = "ObjectLockRetainUntilDate";
	const _OLRb = "ObjectLockRule";
	const _OLb = "ObjectList";
	const _ONIATE = "ObjectNotInActiveTierError";
	const _OO = "ObjectOwnership";
	const _OOA = "OptionalObjectAttributes";
	const _OP = "ObjectParts";
	const _OPb = "ObjectPart";
	const _OS = "ObjectSize";
	const _OSGT = "ObjectSizeGreaterThan";
	const _OSLT = "ObjectSizeLessThan";
	const _OSV = "OutputSchemaVersion";
	const _OSu = "OutputSerialization";
	const _OV = "ObjectVersion";
	const _OVL = "ObjectVersionList";
	const _Ob = "Objects";
	const _Obj = "Object";
	const _P = "Prefix";
	const _PABC = "PublicAccessBlockConfiguration";
	const _PBA = "PutBucketAbac";
	const _PBAC = "PutBucketAccelerateConfiguration";
	const _PBACR = "PutBucketAccelerateConfigurationRequest";
	const _PBACRu = "PutBucketAnalyticsConfigurationRequest";
	const _PBACu = "PutBucketAnalyticsConfiguration";
	const _PBAR = "PutBucketAbacRequest";
	const _PBARu = "PutBucketAclRequest";
	const _PBAu = "PutBucketAcl";
	const _PBC = "PutBucketCors";
	const _PBCR = "PutBucketCorsRequest";
	const _PBE = "PutBucketEncryption";
	const _PBER = "PutBucketEncryptionRequest";
	const _PBIC = "PutBucketInventoryConfiguration";
	const _PBICR = "PutBucketInventoryConfigurationRequest";
	const _PBITC = "PutBucketIntelligentTieringConfiguration";
	const _PBITCR = "PutBucketIntelligentTieringConfigurationRequest";
	const _PBL = "PutBucketLogging";
	const _PBLC = "PutBucketLifecycleConfiguration";
	const _PBLCO = "PutBucketLifecycleConfigurationOutput";
	const _PBLCR = "PutBucketLifecycleConfigurationRequest";
	const _PBLR = "PutBucketLoggingRequest";
	const _PBMC = "PutBucketMetricsConfiguration";
	const _PBMCR = "PutBucketMetricsConfigurationRequest";
	const _PBNC = "PutBucketNotificationConfiguration";
	const _PBNCR = "PutBucketNotificationConfigurationRequest";
	const _PBOC = "PutBucketOwnershipControls";
	const _PBOCR = "PutBucketOwnershipControlsRequest";
	const _PBP = "PutBucketPolicy";
	const _PBPR = "PutBucketPolicyRequest";
	const _PBR = "PutBucketReplication";
	const _PBRP = "PutBucketRequestPayment";
	const _PBRPR = "PutBucketRequestPaymentRequest";
	const _PBRR = "PutBucketReplicationRequest";
	const _PBT = "PutBucketTagging";
	const _PBTR = "PutBucketTaggingRequest";
	const _PBV = "PutBucketVersioning";
	const _PBVR = "PutBucketVersioningRequest";
	const _PBW = "PutBucketWebsite";
	const _PBWR = "PutBucketWebsiteRequest";
	const _PC = "PartsCount";
	const _PDS = "PartitionDateSource";
	const _PE = "ProgressEvent";
	const _PI = "ParquetInput";
	const _PL = "PartsList";
	const _PN = "PartNumber";
	const _PNM = "PartNumberMarker";
	const _PO = "PutObject";
	const _POA = "PutObjectAcl";
	const _POAO = "PutObjectAclOutput";
	const _POAR = "PutObjectAclRequest";
	const _POLC = "PutObjectLockConfiguration";
	const _POLCO = "PutObjectLockConfigurationOutput";
	const _POLCR = "PutObjectLockConfigurationRequest";
	const _POLH = "PutObjectLegalHold";
	const _POLHO = "PutObjectLegalHoldOutput";
	const _POLHR = "PutObjectLegalHoldRequest";
	const _POO = "PutObjectOutput";
	const _POR = "PutObjectRequest";
	const _PORO = "PutObjectRetentionOutput";
	const _PORR = "PutObjectRetentionRequest";
	const _PORu = "PutObjectRetention";
	const _POT = "PutObjectTagging";
	const _POTO = "PutObjectTaggingOutput";
	const _POTR = "PutObjectTaggingRequest";
	const _PP = "PartitionedPrefix";
	const _PPAB = "PutPublicAccessBlock";
	const _PPABR = "PutPublicAccessBlockRequest";
	const _PS = "PolicyStatus";
	const _Pa = "Parts";
	const _Par = "Part";
	const _Parq = "Parquet";
	const _Pay = "Payer";
	const _Payl = "Payload";
	const _Pe = "Permission";
	const _Po = "Policy";
	const _Pr = "Progress";
	const _Pri = "Priority";
	const _Pro = "Protocol";
	const _Q = "Quiet";
	const _QA = "QueueArn";
	const _QC = "QuoteCharacter";
	const _QCL = "QueueConfigurationList";
	const _QCu = "QueueConfigurations";
	const _QCue = "QueueConfiguration";
	const _QEC = "QuoteEscapeCharacter";
	const _QF = "QuoteFields";
	const _Qu = "Queue";
	const _R = "Rules";
	const _RART = "RedirectAllRequestsTo";
	const _RC = "RequestCharged";
	const _RCC = "ResponseCacheControl";
	const _RCD = "ResponseContentDisposition";
	const _RCE = "ResponseContentEncoding";
	const _RCL = "ResponseContentLanguage";
	const _RCT = "ResponseContentType";
	const _RCe = "ReplicationConfiguration";
	const _RD = "RecordDelimiter";
	const _RE = "ResponseExpires";
	const _RED = "RestoreExpiryDate";
	const _REe = "RecordExpiration";
	const _REec = "RecordsEvent";
	const _RKKID = "ReplicaKmsKeyID";
	const _RKPW = "ReplaceKeyPrefixWith";
	const _RKW = "ReplaceKeyWith";
	const _RM = "ReplicaModifications";
	const _RO = "RenameObject";
	const _ROO = "RenameObjectOutput";
	const _ROOe = "RestoreObjectOutput";
	const _ROP = "RestoreOutputPath";
	const _ROR = "RenameObjectRequest";
	const _RORe = "RestoreObjectRequest";
	const _ROe = "RestoreObject";
	const _RP = "RequestPayer";
	const _RPB = "RestrictPublicBuckets";
	const _RPC = "RequestPaymentConfiguration";
	const _RPe = "RequestProgress";
	const _RR = "RoutingRules";
	const _RRAO = "ReplicationRuleAndOperator";
	const _RRF = "ReplicationRuleFilter";
	const _RRe = "ReplicationRule";
	const _RRep = "ReplicationRules";
	const _RReq = "RequestRoute";
	const _RRes = "RestoreRequest";
	const _RRo = "RoutingRule";
	const _RS = "ReplicationStatus";
	const _RSe = "RestoreStatus";
	const _RSen = "RenameSource";
	const _RT = "ReplicationTime";
	const _RTV = "ReplicationTimeValue";
	const _RTe = "RequestToken";
	const _RUD = "RetainUntilDate";
	const _Ra = "Range";
	const _Re = "Restore";
	const _Rec = "Records";
	const _Red = "Redirect";
	const _Ret = "Retention";
	const _Ro = "Role";
	const _Ru = "Rule";
	const _S = "Status";
	const _SA = "StartAfter";
	const _SAK = "SecretAccessKey";
	const _SAs = "SseAlgorithm";
	const _SB = "StreamingBlob";
	const _SBD = "S3BucketDestination";
	const _SC = "StorageClass";
	const _SCA = "StorageClassAnalysis";
	const _SCADE = "StorageClassAnalysisDataExport";
	const _SCV = "SessionCredentialValue";
	const _SCe = "SessionCredentials";
	const _SCt = "StatusCode";
	const _SDV = "SkipDestinationValidation";
	const _SE = "StatsEvent";
	const _SIM = "SourceIfMatch";
	const _SIMS = "SourceIfModifiedSince";
	const _SINM = "SourceIfNoneMatch";
	const _SIUS = "SourceIfUnmodifiedSince";
	const _SK = "SSE-KMS";
	const _SKEO = "SseKmsEncryptedObjects";
	const _SKF = "S3KeyFilter";
	const _SKe = "S3Key";
	const _SL = "S3Location";
	const _SM = "SessionMode";
	const _SOC = "SelectObjectContent";
	const _SOCES = "SelectObjectContentEventStream";
	const _SOCO = "SelectObjectContentOutput";
	const _SOCR = "SelectObjectContentRequest";
	const _SP = "SelectParameters";
	const _SPi = "SimplePrefix";
	const _SR = "ScanRange";
	const _SS = "SSE-S3";
	const _SSC = "SourceSelectionCriteria";
	const _SSE = "ServerSideEncryption";
	const _SSEA = "SSEAlgorithm";
	const _SSEBD = "ServerSideEncryptionByDefault";
	const _SSEC = "ServerSideEncryptionConfiguration";
	const _SSECA = "SSECustomerAlgorithm";
	const _SSECK = "SSECustomerKey";
	const _SSECKMD = "SSECustomerKeyMD5";
	const _SSEKMS = "SSEKMS";
	const _SSEKMSE = "SSEKMSEncryption";
	const _SSEKMSEC = "SSEKMSEncryptionContext";
	const _SSEKMSKI = "SSEKMSKeyId";
	const _SSER = "ServerSideEncryptionRule";
	const _SSERe = "ServerSideEncryptionRules";
	const _SSES = "SSES3";
	const _ST = "SessionToken";
	const _STD = "S3TablesDestination";
	const _STDR = "S3TablesDestinationResult";
	const _S_ = "S3";
	const _Sc = "Schedule";
	const _Si = "Size";
	const _St = "Start";
	const _Sta = "Stats";
	const _Su = "Suffix";
	const _T = "Tags";
	const _TA = "TableArn";
	const _TAo = "TopicArn";
	const _TB = "TargetBucket";
	const _TBA = "TableBucketArn";
	const _TBT = "TableBucketType";
	const _TC = "TagCount";
	const _TCL = "TopicConfigurationList";
	const _TCo = "TopicConfigurations";
	const _TCop = "TopicConfiguration";
	const _TD = "TaggingDirective";
	const _TDMOS = "TransitionDefaultMinimumObjectSize";
	const _TG = "TargetGrants";
	const _TGa = "TargetGrant";
	const _TL = "TieringList";
	const _TLr = "TransitionList";
	const _TMP = "TooManyParts";
	const _TN = "TableNamespace";
	const _TNa = "TableName";
	const _TOKF = "TargetObjectKeyFormat";
	const _TP = "TargetPrefix";
	const _TPC = "TotalPartsCount";
	const _TS = "TagSet";
	const _TSa = "TableStatus";
	const _Ta = "Tag";
	const _Tag = "Tagging";
	const _Ti = "Tier";
	const _Tie = "Tierings";
	const _Tier = "Tiering";
	const _Tim = "Time";
	const _To = "Token";
	const _Top = "Topic";
	const _Tr = "Transitions";
	const _Tra = "Transition";
	const _Ty = "Type";
	const _U = "Uploads";
	const _UBMITC = "UpdateBucketMetadataInventoryTableConfiguration";
	const _UBMITCR = "UpdateBucketMetadataInventoryTableConfigurationRequest";
	const _UBMJTC = "UpdateBucketMetadataJournalTableConfiguration";
	const _UBMJTCR = "UpdateBucketMetadataJournalTableConfigurationRequest";
	const _UI = "UploadId";
	const _UIM = "UploadIdMarker";
	const _UM = "UserMetadata";
	const _UOE = "UpdateObjectEncryption";
	const _UOER = "UpdateObjectEncryptionRequest";
	const _UOERp = "UpdateObjectEncryptionResponse";
	const _UP = "UploadPart";
	const _UPC = "UploadPartCopy";
	const _UPCO = "UploadPartCopyOutput";
	const _UPCR = "UploadPartCopyRequest";
	const _UPO = "UploadPartOutput";
	const _UPR = "UploadPartRequest";
	const _URI = "URI";
	const _Up = "Upload";
	const _V = "Value";
	const _VC = "VersioningConfiguration";
	const _VI = "VersionId";
	const _VIM = "VersionIdMarker";
	const _Ve = "Versions";
	const _Ver = "Version";
	const _WC = "WebsiteConfiguration";
	const _WGOR = "WriteGetObjectResponse";
	const _WGORR = "WriteGetObjectResponseRequest";
	const _WOB = "WriteOffsetBytes";
	const _WRL = "WebsiteRedirectLocation";
	const _Y = "Years";
	const _ar = "accept-ranges";
	const _br = "bucket-region";
	const _c = "client";
	const _ct = "continuation-token";
	const _d = "delimiter";
	const _e = "error";
	const _eP = "eventPayload";
	const _en = "endpoint";
	const _et = "encoding-type";
	const _fo = "fetch-owner";
	const _h = "http";
	const _hC = "httpChecksum";
	const _hE = "httpError";
	const _hH = "httpHeader";
	const _hL = "hostLabel";
	const _hP = "httpPayload";
	const _hPH = "httpPrefixHeaders";
	const _hQ = "httpQuery";
	const _hi = "http://www.w3.org/2001/XMLSchema-instance";
	const _i = "id";
	const _iT = "idempotencyToken";
	const _km = "key-marker";
	const _m = "marker";
	const _mb = "max-buckets";
	const _mdb = "max-directory-buckets";
	const _mk = "max-keys";
	const _mp = "max-parts";
	const _mu = "max-uploads";
	const _p = "prefix";
	const _pN = "partNumber";
	const _pnm = "part-number-marker";
	const _rcc = "response-cache-control";
	const _rcd = "response-content-disposition";
	const _rce = "response-content-encoding";
	const _rcl = "response-content-language";
	const _rct = "response-content-type";
	const _re = "response-expires";
	const _s = "smithy.ts.sdk.synthetic.com.amazonaws.s3";
	const _sa = "start-after";
	const _st = "streaming";
	const _uI = "uploadId";
	const _uim = "upload-id-marker";
	const _vI = "versionId";
	const _vim = "version-id-marker";
	const _x = "xsi";
	const _xA = "xmlAttribute";
	const _xF = "xmlFlattened";
	const _xN = "xmlName";
	const _xNm = "xmlNamespace";
	const _xaa = "x-amz-acl";
	const _xaad = "x-amz-abort-date";
	const _xaapa = "x-amz-access-point-alias";
	const _xaari = "x-amz-abort-rule-id";
	const _xaas = "x-amz-archive-status";
	const _xaba = "x-amz-bucket-arn";
	const _xabgr = "x-amz-bypass-governance-retention";
	const _xabln = "x-amz-bucket-location-name";
	const _xablt = "x-amz-bucket-location-type";
	const _xabn = "x-amz-bucket-namespace";
	const _xabole = "x-amz-bucket-object-lock-enabled";
	const _xabolt = "x-amz-bucket-object-lock-token";
	const _xabr = "x-amz-bucket-region";
	const _xaca = "x-amz-checksum-algorithm";
	const _xacc = "x-amz-checksum-crc32";
	const _xacc_ = "x-amz-checksum-crc32c";
	const _xacc__ = "x-amz-checksum-crc64nvme";
	const _xacm = "x-amz-checksum-md5";
	const _xacm_ = "x-amz-checksum-mode";
	const _xacrsba = "x-amz-confirm-remove-self-bucket-access";
	const _xacs = "x-amz-checksum-sha1";
	const _xacs_ = "x-amz-checksum-sha256";
	const _xacs__ = "x-amz-checksum-sha512";
	const _xacs___ = "x-amz-copy-source";
	const _xacsim = "x-amz-copy-source-if-match";
	const _xacsims = "x-amz-copy-source-if-modified-since";
	const _xacsinm = "x-amz-copy-source-if-none-match";
	const _xacsius = "x-amz-copy-source-if-unmodified-since";
	const _xacsm = "x-amz-create-session-mode";
	const _xacsr = "x-amz-copy-source-range";
	const _xacssseca = "x-amz-copy-source-server-side-encryption-customer-algorithm";
	const _xacssseck = "x-amz-copy-source-server-side-encryption-customer-key";
	const _xacssseckM = "x-amz-copy-source-server-side-encryption-customer-key-MD5";
	const _xacsvi = "x-amz-copy-source-version-id";
	const _xact = "x-amz-checksum-type";
	const _xact_ = "x-amz-client-token";
	const _xacx = "x-amz-checksum-xxhash64";
	const _xacx_ = "x-amz-checksum-xxhash3";
	const _xacx__ = "x-amz-checksum-xxhash128";
	const _xadm = "x-amz-delete-marker";
	const _xae = "x-amz-expiration";
	const _xaebo = "x-amz-expected-bucket-owner";
	const _xafec = "x-amz-fwd-error-code";
	const _xafem = "x-amz-fwd-error-message";
	const _xafhCC = "x-amz-fwd-header-Cache-Control";
	const _xafhCD = "x-amz-fwd-header-Content-Disposition";
	const _xafhCE = "x-amz-fwd-header-Content-Encoding";
	const _xafhCL = "x-amz-fwd-header-Content-Language";
	const _xafhCR = "x-amz-fwd-header-Content-Range";
	const _xafhCT = "x-amz-fwd-header-Content-Type";
	const _xafhE = "x-amz-fwd-header-ETag";
	const _xafhE_ = "x-amz-fwd-header-Expires";
	const _xafhLM = "x-amz-fwd-header-Last-Modified";
	const _xafhar = "x-amz-fwd-header-accept-ranges";
	const _xafhxacc = "x-amz-fwd-header-x-amz-checksum-crc32";
	const _xafhxacc_ = "x-amz-fwd-header-x-amz-checksum-crc32c";
	const _xafhxacc__ = "x-amz-fwd-header-x-amz-checksum-crc64nvme";
	const _xafhxacm = "x-amz-fwd-header-x-amz-checksum-md5";
	const _xafhxacs = "x-amz-fwd-header-x-amz-checksum-sha1";
	const _xafhxacs_ = "x-amz-fwd-header-x-amz-checksum-sha256";
	const _xafhxacs__ = "x-amz-fwd-header-x-amz-checksum-sha512";
	const _xafhxacx = "x-amz-fwd-header-x-amz-checksum-xxhash64";
	const _xafhxacx_ = "x-amz-fwd-header-x-amz-checksum-xxhash3";
	const _xafhxacx__ = "x-amz-fwd-header-x-amz-checksum-xxhash128";
	const _xafhxadm = "x-amz-fwd-header-x-amz-delete-marker";
	const _xafhxae = "x-amz-fwd-header-x-amz-expiration";
	const _xafhxamm = "x-amz-fwd-header-x-amz-missing-meta";
	const _xafhxampc = "x-amz-fwd-header-x-amz-mp-parts-count";
	const _xafhxaollh = "x-amz-fwd-header-x-amz-object-lock-legal-hold";
	const _xafhxaolm = "x-amz-fwd-header-x-amz-object-lock-mode";
	const _xafhxaolrud = "x-amz-fwd-header-x-amz-object-lock-retain-until-date";
	const _xafhxar = "x-amz-fwd-header-x-amz-restore";
	const _xafhxarc = "x-amz-fwd-header-x-amz-request-charged";
	const _xafhxars = "x-amz-fwd-header-x-amz-replication-status";
	const _xafhxasc = "x-amz-fwd-header-x-amz-storage-class";
	const _xafhxasse = "x-amz-fwd-header-x-amz-server-side-encryption";
	const _xafhxasseakki = "x-amz-fwd-header-x-amz-server-side-encryption-aws-kms-key-id";
	const _xafhxassebke = "x-amz-fwd-header-x-amz-server-side-encryption-bucket-key-enabled";
	const _xafhxasseca = "x-amz-fwd-header-x-amz-server-side-encryption-customer-algorithm";
	const _xafhxasseckM = "x-amz-fwd-header-x-amz-server-side-encryption-customer-key-MD5";
	const _xafhxatc = "x-amz-fwd-header-x-amz-tagging-count";
	const _xafhxavi = "x-amz-fwd-header-x-amz-version-id";
	const _xafs = "x-amz-fwd-status";
	const _xagfc = "x-amz-grant-full-control";
	const _xagr = "x-amz-grant-read";
	const _xagra = "x-amz-grant-read-acp";
	const _xagw = "x-amz-grant-write";
	const _xagwa = "x-amz-grant-write-acp";
	const _xaimit = "x-amz-if-match-initiated-time";
	const _xaimlmt = "x-amz-if-match-last-modified-time";
	const _xaims = "x-amz-if-match-size";
	const _xam = "x-amz-meta-";
	const _xam_ = "x-amz-mfa";
	const _xamd = "x-amz-metadata-directive";
	const _xamm = "x-amz-missing-meta";
	const _xamos = "x-amz-mp-object-size";
	const _xamp = "x-amz-max-parts";
	const _xampc = "x-amz-mp-parts-count";
	const _xaoa = "x-amz-object-attributes";
	const _xaollh = "x-amz-object-lock-legal-hold";
	const _xaolm = "x-amz-object-lock-mode";
	const _xaolrud = "x-amz-object-lock-retain-until-date";
	const _xaoo = "x-amz-object-ownership";
	const _xaooa = "x-amz-optional-object-attributes";
	const _xaos = "x-amz-object-size";
	const _xapnm = "x-amz-part-number-marker";
	const _xar = "x-amz-restore";
	const _xarc = "x-amz-request-charged";
	const _xarop = "x-amz-restore-output-path";
	const _xarp = "x-amz-request-payer";
	const _xarr = "x-amz-request-route";
	const _xars = "x-amz-replication-status";
	const _xars_ = "x-amz-rename-source";
	const _xarsim = "x-amz-rename-source-if-match";
	const _xarsims = "x-amz-rename-source-if-modified-since";
	const _xarsinm = "x-amz-rename-source-if-none-match";
	const _xarsius = "x-amz-rename-source-if-unmodified-since";
	const _xart = "x-amz-request-token";
	const _xasc = "x-amz-storage-class";
	const _xasca = "x-amz-sdk-checksum-algorithm";
	const _xasdv = "x-amz-skip-destination-validation";
	const _xasebo = "x-amz-source-expected-bucket-owner";
	const _xasse = "x-amz-server-side-encryption";
	const _xasseakki = "x-amz-server-side-encryption-aws-kms-key-id";
	const _xassebke = "x-amz-server-side-encryption-bucket-key-enabled";
	const _xassec = "x-amz-server-side-encryption-context";
	const _xasseca = "x-amz-server-side-encryption-customer-algorithm";
	const _xasseck = "x-amz-server-side-encryption-customer-key";
	const _xasseckM = "x-amz-server-side-encryption-customer-key-MD5";
	const _xat = "x-amz-tagging";
	const _xatc = "x-amz-tagging-count";
	const _xatd = "x-amz-tagging-directive";
	const _xatdmos = "x-amz-transition-default-minimum-object-size";
	const _xavi = "x-amz-version-id";
	const _xawob = "x-amz-write-offset-bytes";
	const _xawrl = "x-amz-website-redirect-location";
	const _xs = "xsi:type";
	const n0 = "com.amazonaws.s3";
	const schema_1 = (init_schema(), __toCommonJS(schema_exports));
	const errors_1 = require_errors();
	const S3ServiceException_1 = require_S3ServiceException();
	const _s_registry = schema_1.TypeRegistry.for(_s);
	exports.S3ServiceException$ = [
		-3,
		_s,
		"S3ServiceException",
		0,
		[],
		[]
	];
	_s_registry.registerError(exports.S3ServiceException$, S3ServiceException_1.S3ServiceException);
	const n0_registry = schema_1.TypeRegistry.for(n0);
	exports.AccessDenied$ = [
		-3,
		n0,
		_AD,
		{
			[_e]: _c,
			[_hE]: 403
		},
		[],
		[]
	];
	n0_registry.registerError(exports.AccessDenied$, errors_1.AccessDenied);
	exports.BucketAlreadyExists$ = [
		-3,
		n0,
		_BAE,
		{
			[_e]: _c,
			[_hE]: 409
		},
		[],
		[]
	];
	n0_registry.registerError(exports.BucketAlreadyExists$, errors_1.BucketAlreadyExists);
	exports.BucketAlreadyOwnedByYou$ = [
		-3,
		n0,
		_BAOBY,
		{
			[_e]: _c,
			[_hE]: 409
		},
		[],
		[]
	];
	n0_registry.registerError(exports.BucketAlreadyOwnedByYou$, errors_1.BucketAlreadyOwnedByYou);
	exports.EncryptionTypeMismatch$ = [
		-3,
		n0,
		_ETM,
		{
			[_e]: _c,
			[_hE]: 400
		},
		[],
		[]
	];
	n0_registry.registerError(exports.EncryptionTypeMismatch$, errors_1.EncryptionTypeMismatch);
	exports.IdempotencyParameterMismatch$ = [
		-3,
		n0,
		_IPM,
		{
			[_e]: _c,
			[_hE]: 400
		},
		[],
		[]
	];
	n0_registry.registerError(exports.IdempotencyParameterMismatch$, errors_1.IdempotencyParameterMismatch);
	exports.InvalidObjectState$ = [
		-3,
		n0,
		_IOS,
		{
			[_e]: _c,
			[_hE]: 403
		},
		[_SC, _AT],
		[0, 0]
	];
	n0_registry.registerError(exports.InvalidObjectState$, errors_1.InvalidObjectState);
	exports.InvalidRequest$ = [
		-3,
		n0,
		_IR,
		{
			[_e]: _c,
			[_hE]: 400
		},
		[],
		[]
	];
	n0_registry.registerError(exports.InvalidRequest$, errors_1.InvalidRequest);
	exports.InvalidWriteOffset$ = [
		-3,
		n0,
		_IWO,
		{
			[_e]: _c,
			[_hE]: 400
		},
		[],
		[]
	];
	n0_registry.registerError(exports.InvalidWriteOffset$, errors_1.InvalidWriteOffset);
	exports.NoSuchBucket$ = [
		-3,
		n0,
		_NSB,
		{
			[_e]: _c,
			[_hE]: 404
		},
		[],
		[]
	];
	n0_registry.registerError(exports.NoSuchBucket$, errors_1.NoSuchBucket);
	exports.NoSuchKey$ = [
		-3,
		n0,
		_NSK,
		{
			[_e]: _c,
			[_hE]: 404
		},
		[],
		[]
	];
	n0_registry.registerError(exports.NoSuchKey$, errors_1.NoSuchKey);
	exports.NoSuchUpload$ = [
		-3,
		n0,
		_NSU,
		{
			[_e]: _c,
			[_hE]: 404
		},
		[],
		[]
	];
	n0_registry.registerError(exports.NoSuchUpload$, errors_1.NoSuchUpload);
	exports.NotFound$ = [
		-3,
		n0,
		_NF,
		{ [_e]: _c },
		[],
		[]
	];
	n0_registry.registerError(exports.NotFound$, errors_1.NotFound);
	exports.ObjectAlreadyInActiveTierError$ = [
		-3,
		n0,
		_OAIATE,
		{
			[_e]: _c,
			[_hE]: 403
		},
		[],
		[]
	];
	n0_registry.registerError(exports.ObjectAlreadyInActiveTierError$, errors_1.ObjectAlreadyInActiveTierError);
	exports.ObjectNotInActiveTierError$ = [
		-3,
		n0,
		_ONIATE,
		{
			[_e]: _c,
			[_hE]: 403
		},
		[],
		[]
	];
	n0_registry.registerError(exports.ObjectNotInActiveTierError$, errors_1.ObjectNotInActiveTierError);
	exports.TooManyParts$ = [
		-3,
		n0,
		_TMP,
		{
			[_e]: _c,
			[_hE]: 400
		},
		[],
		[]
	];
	n0_registry.registerError(exports.TooManyParts$, errors_1.TooManyParts);
	exports.errorTypeRegistries = [_s_registry, n0_registry];
	var CopySourceSSECustomerKey = [
		0,
		n0,
		_CSSSECK,
		8,
		0
	];
	var NonEmptyKmsKeyArnString = [
		0,
		n0,
		_NEKKAS,
		8,
		0
	];
	var SessionCredentialValue = [
		0,
		n0,
		_SCV,
		8,
		0
	];
	var SSECustomerKey = [
		0,
		n0,
		_SSECK,
		8,
		0
	];
	var SSEKMSEncryptionContext = [
		0,
		n0,
		_SSEKMSEC,
		8,
		0
	];
	var SSEKMSKeyId = [
		0,
		n0,
		_SSEKMSKI,
		8,
		0
	];
	var StreamingBlob = [
		0,
		n0,
		_SB,
		{ [_st]: 1 },
		42
	];
	exports.AbacStatus$ = [
		3,
		n0,
		_AS,
		0,
		[_S],
		[0]
	];
	exports.AbortIncompleteMultipartUpload$ = [
		3,
		n0,
		_AIMU,
		0,
		[_DAI],
		[1]
	];
	exports.AbortMultipartUploadOutput$ = [
		3,
		n0,
		_AMUO,
		0,
		[_RC],
		[[0, { [_hH]: _xarc }]]
	];
	exports.AbortMultipartUploadRequest$ = [
		3,
		n0,
		_AMUR,
		0,
		[
			_B,
			_K,
			_UI,
			_RP,
			_EBO,
			_IMIT
		],
		[
			[0, 1],
			[0, 1],
			[0, { [_hQ]: _uI }],
			[0, { [_hH]: _xarp }],
			[0, { [_hH]: _xaebo }],
			[6, { [_hH]: _xaimit }]
		],
		3
	];
	exports.AccelerateConfiguration$ = [
		3,
		n0,
		_AC,
		0,
		[_S],
		[0]
	];
	exports.AccessControlPolicy$ = [
		3,
		n0,
		_ACP,
		0,
		[_G, _O],
		[[() => Grants, { [_xN]: _ACL }], () => exports.Owner$]
	];
	exports.AccessControlTranslation$ = [
		3,
		n0,
		_ACT,
		0,
		[_O],
		[0],
		1
	];
	exports.AnalyticsAndOperator$ = [
		3,
		n0,
		_AAO,
		0,
		[_P, _T],
		[0, [() => TagSet, {
			[_xF]: 1,
			[_xN]: _Ta
		}]]
	];
	exports.AnalyticsConfiguration$ = [
		3,
		n0,
		_ACn,
		0,
		[
			_I,
			_SCA,
			_F
		],
		[
			0,
			() => exports.StorageClassAnalysis$,
			[() => exports.AnalyticsFilter$, 0]
		],
		2
	];
	exports.AnalyticsExportDestination$ = [
		3,
		n0,
		_AED,
		0,
		[_SBD],
		[() => exports.AnalyticsS3BucketDestination$],
		1
	];
	exports.AnalyticsS3BucketDestination$ = [
		3,
		n0,
		_ASBD,
		0,
		[
			_Fo,
			_B,
			_BAI,
			_P
		],
		[
			0,
			0,
			0,
			0
		],
		2
	];
	exports.BlockedEncryptionTypes$ = [
		3,
		n0,
		_BET,
		0,
		[_ET],
		[[() => EncryptionTypeList, { [_xF]: 1 }]]
	];
	exports.Bucket$ = [
		3,
		n0,
		_B,
		0,
		[
			_N,
			_CD,
			_BR,
			_BA
		],
		[
			0,
			4,
			0,
			0
		]
	];
	exports.BucketInfo$ = [
		3,
		n0,
		_BI,
		0,
		[_DR, _Ty],
		[0, 0]
	];
	exports.BucketLifecycleConfiguration$ = [
		3,
		n0,
		_BLC,
		0,
		[_R],
		[[() => LifecycleRules, {
			[_xF]: 1,
			[_xN]: _Ru
		}]],
		1
	];
	exports.BucketLoggingStatus$ = [
		3,
		n0,
		_BLS,
		0,
		[_LE],
		[[() => exports.LoggingEnabled$, 0]]
	];
	exports.Checksum$ = [
		3,
		n0,
		_C,
		0,
		[
			_CCRC,
			_CCRCC,
			_CCRCNVME,
			_CSHA,
			_CSHAh,
			_CSHAhe,
			_CMD,
			_CXXHASH,
			_CXXHASHh,
			_CXXHASHhe,
			_CT
		],
		[
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0
		]
	];
	exports.CommonPrefix$ = [
		3,
		n0,
		_CP,
		0,
		[_P],
		[0]
	];
	exports.CompletedMultipartUpload$ = [
		3,
		n0,
		_CMU,
		0,
		[_Pa],
		[[() => CompletedPartList, {
			[_xF]: 1,
			[_xN]: _Par
		}]]
	];
	exports.CompletedPart$ = [
		3,
		n0,
		_CPo,
		0,
		[
			_ETa,
			_CCRC,
			_CCRCC,
			_CCRCNVME,
			_CSHA,
			_CSHAh,
			_CSHAhe,
			_CMD,
			_CXXHASH,
			_CXXHASHh,
			_CXXHASHhe,
			_PN
		],
		[
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			1
		]
	];
	exports.CompleteMultipartUploadOutput$ = [
		3,
		n0,
		_CMUO,
		{ [_xN]: _CMUR },
		[
			_L,
			_B,
			_K,
			_E,
			_ETa,
			_CCRC,
			_CCRCC,
			_CCRCNVME,
			_CSHA,
			_CSHAh,
			_CSHAhe,
			_CMD,
			_CXXHASH,
			_CXXHASHh,
			_CXXHASHhe,
			_CT,
			_SSE,
			_VI,
			_SSEKMSKI,
			_BKE,
			_RC
		],
		[
			0,
			0,
			0,
			[0, { [_hH]: _xae }],
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			[0, { [_hH]: _xasse }],
			[0, { [_hH]: _xavi }],
			[() => SSEKMSKeyId, { [_hH]: _xasseakki }],
			[2, { [_hH]: _xassebke }],
			[0, { [_hH]: _xarc }]
		]
	];
	exports.CompleteMultipartUploadRequest$ = [
		3,
		n0,
		_CMURo,
		0,
		[
			_B,
			_K,
			_UI,
			_MU,
			_CCRC,
			_CCRCC,
			_CCRCNVME,
			_CSHA,
			_CSHAh,
			_CSHAhe,
			_CMD,
			_CXXHASH,
			_CXXHASHh,
			_CXXHASHhe,
			_CT,
			_MOS,
			_RP,
			_EBO,
			_IM,
			_INM,
			_SSECA,
			_SSECK,
			_SSECKMD
		],
		[
			[0, 1],
			[0, 1],
			[0, { [_hQ]: _uI }],
			[() => exports.CompletedMultipartUpload$, {
				[_hP]: 1,
				[_xN]: _CMUo
			}],
			[0, { [_hH]: _xacc }],
			[0, { [_hH]: _xacc_ }],
			[0, { [_hH]: _xacc__ }],
			[0, { [_hH]: _xacs }],
			[0, { [_hH]: _xacs_ }],
			[0, { [_hH]: _xacs__ }],
			[0, { [_hH]: _xacm }],
			[0, { [_hH]: _xacx }],
			[0, { [_hH]: _xacx_ }],
			[0, { [_hH]: _xacx__ }],
			[0, { [_hH]: _xact }],
			[1, { [_hH]: _xamos }],
			[0, { [_hH]: _xarp }],
			[0, { [_hH]: _xaebo }],
			[0, { [_hH]: _IM_ }],
			[0, { [_hH]: _INM_ }],
			[0, { [_hH]: _xasseca }],
			[() => SSECustomerKey, { [_hH]: _xasseck }],
			[0, { [_hH]: _xasseckM }]
		],
		3
	];
	exports.Condition$ = [
		3,
		n0,
		_Co,
		0,
		[_HECRE, _KPE],
		[0, 0]
	];
	exports.ContinuationEvent$ = [
		3,
		n0,
		_CE,
		0,
		[],
		[]
	];
	exports.CopyObjectOutput$ = [
		3,
		n0,
		_COO,
		0,
		[
			_COR,
			_E,
			_CSVI,
			_VI,
			_SSE,
			_SSECA,
			_SSECKMD,
			_SSEKMSKI,
			_SSEKMSEC,
			_BKE,
			_RC
		],
		[
			[() => exports.CopyObjectResult$, 16],
			[0, { [_hH]: _xae }],
			[0, { [_hH]: _xacsvi }],
			[0, { [_hH]: _xavi }],
			[0, { [_hH]: _xasse }],
			[0, { [_hH]: _xasseca }],
			[0, { [_hH]: _xasseckM }],
			[() => SSEKMSKeyId, { [_hH]: _xasseakki }],
			[() => SSEKMSEncryptionContext, { [_hH]: _xassec }],
			[2, { [_hH]: _xassebke }],
			[0, { [_hH]: _xarc }]
		]
	];
	exports.CopyObjectRequest$ = [
		3,
		n0,
		_CORo,
		0,
		[
			_B,
			_CS,
			_K,
			_ACL_,
			_CC,
			_CA,
			_CDo,
			_CEo,
			_CL,
			_CTo,
			_CSIM,
			_CSIMS,
			_CSINM,
			_CSIUS,
			_Ex,
			_GFC,
			_GR,
			_GRACP,
			_GWACP,
			_IM,
			_INM,
			_M,
			_MD,
			_TD,
			_SSE,
			_SC,
			_WRL,
			_SSECA,
			_SSECK,
			_SSECKMD,
			_SSEKMSKI,
			_SSEKMSEC,
			_BKE,
			_CSSSECA,
			_CSSSECK,
			_CSSSECKMD,
			_RP,
			_Tag,
			_OLM,
			_OLRUD,
			_OLLHS,
			_EBO,
			_ESBO
		],
		[
			[0, 1],
			[0, { [_hH]: _xacs___ }],
			[0, 1],
			[0, { [_hH]: _xaa }],
			[0, { [_hH]: _CC_ }],
			[0, { [_hH]: _xaca }],
			[0, { [_hH]: _CD_ }],
			[0, { [_hH]: _CE_ }],
			[0, { [_hH]: _CL_ }],
			[0, { [_hH]: _CT_ }],
			[0, { [_hH]: _xacsim }],
			[4, { [_hH]: _xacsims }],
			[0, { [_hH]: _xacsinm }],
			[4, { [_hH]: _xacsius }],
			[4, { [_hH]: _Ex }],
			[0, { [_hH]: _xagfc }],
			[0, { [_hH]: _xagr }],
			[0, { [_hH]: _xagra }],
			[0, { [_hH]: _xagwa }],
			[0, { [_hH]: _IM_ }],
			[0, { [_hH]: _INM_ }],
			[128, { [_hPH]: _xam }],
			[0, { [_hH]: _xamd }],
			[0, { [_hH]: _xatd }],
			[0, { [_hH]: _xasse }],
			[0, { [_hH]: _xasc }],
			[0, { [_hH]: _xawrl }],
			[0, { [_hH]: _xasseca }],
			[() => SSECustomerKey, { [_hH]: _xasseck }],
			[0, { [_hH]: _xasseckM }],
			[() => SSEKMSKeyId, { [_hH]: _xasseakki }],
			[() => SSEKMSEncryptionContext, { [_hH]: _xassec }],
			[2, { [_hH]: _xassebke }],
			[0, { [_hH]: _xacssseca }],
			[() => CopySourceSSECustomerKey, { [_hH]: _xacssseck }],
			[0, { [_hH]: _xacssseckM }],
			[0, { [_hH]: _xarp }],
			[0, { [_hH]: _xat }],
			[0, { [_hH]: _xaolm }],
			[5, { [_hH]: _xaolrud }],
			[0, { [_hH]: _xaollh }],
			[0, { [_hH]: _xaebo }],
			[0, { [_hH]: _xasebo }]
		],
		3
	];
	exports.CopyObjectResult$ = [
		3,
		n0,
		_COR,
		0,
		[
			_ETa,
			_LM,
			_CT,
			_CCRC,
			_CCRCC,
			_CCRCNVME,
			_CSHA,
			_CSHAh,
			_CSHAhe,
			_CMD,
			_CXXHASH,
			_CXXHASHh,
			_CXXHASHhe
		],
		[
			0,
			4,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0
		]
	];
	exports.CopyPartResult$ = [
		3,
		n0,
		_CPR,
		0,
		[
			_ETa,
			_LM,
			_CCRC,
			_CCRCC,
			_CCRCNVME,
			_CSHA,
			_CSHAh,
			_CSHAhe,
			_CMD,
			_CXXHASH,
			_CXXHASHh,
			_CXXHASHhe
		],
		[
			0,
			4,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0
		]
	];
	exports.CORSConfiguration$ = [
		3,
		n0,
		_CORSC,
		0,
		[_CORSR],
		[[() => CORSRules, {
			[_xF]: 1,
			[_xN]: _CORSRu
		}]],
		1
	];
	exports.CORSRule$ = [
		3,
		n0,
		_CORSRu,
		0,
		[
			_AM,
			_AO,
			_ID,
			_AH,
			_EH,
			_MAS
		],
		[
			[64, {
				[_xF]: 1,
				[_xN]: _AMl
			}],
			[64, {
				[_xF]: 1,
				[_xN]: _AOl
			}],
			0,
			[64, {
				[_xF]: 1,
				[_xN]: _AHl
			}],
			[64, {
				[_xF]: 1,
				[_xN]: _EHx
			}],
			1
		],
		2
	];
	exports.CreateBucketConfiguration$ = [
		3,
		n0,
		_CBC,
		0,
		[
			_LC,
			_L,
			_B,
			_T
		],
		[
			0,
			() => exports.LocationInfo$,
			() => exports.BucketInfo$,
			[() => TagSet, 0]
		]
	];
	exports.CreateBucketMetadataConfigurationRequest$ = [
		3,
		n0,
		_CBMCR,
		0,
		[
			_B,
			_MC,
			_CMDo,
			_CA,
			_EBO
		],
		[
			[0, 1],
			[() => exports.MetadataConfiguration$, {
				[_hP]: 1,
				[_xN]: _MC
			}],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.CreateBucketMetadataTableConfigurationRequest$ = [
		3,
		n0,
		_CBMTCR,
		0,
		[
			_B,
			_MTC,
			_CMDo,
			_CA,
			_EBO
		],
		[
			[0, 1],
			[() => exports.MetadataTableConfiguration$, {
				[_hP]: 1,
				[_xN]: _MTC
			}],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.CreateBucketOutput$ = [
		3,
		n0,
		_CBO,
		0,
		[_L, _BA],
		[[0, { [_hH]: _L }], [0, { [_hH]: _xaba }]]
	];
	exports.CreateBucketRequest$ = [
		3,
		n0,
		_CBR,
		0,
		[
			_B,
			_ACL_,
			_CBC,
			_GFC,
			_GR,
			_GRACP,
			_GW,
			_GWACP,
			_OLEFB,
			_OO,
			_BN
		],
		[
			[0, 1],
			[0, { [_hH]: _xaa }],
			[() => exports.CreateBucketConfiguration$, {
				[_hP]: 1,
				[_xN]: _CBC
			}],
			[0, { [_hH]: _xagfc }],
			[0, { [_hH]: _xagr }],
			[0, { [_hH]: _xagra }],
			[0, { [_hH]: _xagw }],
			[0, { [_hH]: _xagwa }],
			[2, { [_hH]: _xabole }],
			[0, { [_hH]: _xaoo }],
			[0, { [_hH]: _xabn }]
		],
		1
	];
	exports.CreateMultipartUploadOutput$ = [
		3,
		n0,
		_CMUOr,
		{ [_xN]: _IMUR },
		[
			_ADb,
			_ARI,
			_B,
			_K,
			_UI,
			_SSE,
			_SSECA,
			_SSECKMD,
			_SSEKMSKI,
			_SSEKMSEC,
			_BKE,
			_RC,
			_CA,
			_CT
		],
		[
			[4, { [_hH]: _xaad }],
			[0, { [_hH]: _xaari }],
			[0, { [_xN]: _B }],
			0,
			0,
			[0, { [_hH]: _xasse }],
			[0, { [_hH]: _xasseca }],
			[0, { [_hH]: _xasseckM }],
			[() => SSEKMSKeyId, { [_hH]: _xasseakki }],
			[() => SSEKMSEncryptionContext, { [_hH]: _xassec }],
			[2, { [_hH]: _xassebke }],
			[0, { [_hH]: _xarc }],
			[0, { [_hH]: _xaca }],
			[0, { [_hH]: _xact }]
		]
	];
	exports.CreateMultipartUploadRequest$ = [
		3,
		n0,
		_CMURr,
		0,
		[
			_B,
			_K,
			_ACL_,
			_CC,
			_CDo,
			_CEo,
			_CL,
			_CTo,
			_Ex,
			_GFC,
			_GR,
			_GRACP,
			_GWACP,
			_M,
			_SSE,
			_SC,
			_WRL,
			_SSECA,
			_SSECK,
			_SSECKMD,
			_SSEKMSKI,
			_SSEKMSEC,
			_BKE,
			_RP,
			_Tag,
			_OLM,
			_OLRUD,
			_OLLHS,
			_EBO,
			_CA,
			_CT
		],
		[
			[0, 1],
			[0, 1],
			[0, { [_hH]: _xaa }],
			[0, { [_hH]: _CC_ }],
			[0, { [_hH]: _CD_ }],
			[0, { [_hH]: _CE_ }],
			[0, { [_hH]: _CL_ }],
			[0, { [_hH]: _CT_ }],
			[4, { [_hH]: _Ex }],
			[0, { [_hH]: _xagfc }],
			[0, { [_hH]: _xagr }],
			[0, { [_hH]: _xagra }],
			[0, { [_hH]: _xagwa }],
			[128, { [_hPH]: _xam }],
			[0, { [_hH]: _xasse }],
			[0, { [_hH]: _xasc }],
			[0, { [_hH]: _xawrl }],
			[0, { [_hH]: _xasseca }],
			[() => SSECustomerKey, { [_hH]: _xasseck }],
			[0, { [_hH]: _xasseckM }],
			[() => SSEKMSKeyId, { [_hH]: _xasseakki }],
			[() => SSEKMSEncryptionContext, { [_hH]: _xassec }],
			[2, { [_hH]: _xassebke }],
			[0, { [_hH]: _xarp }],
			[0, { [_hH]: _xat }],
			[0, { [_hH]: _xaolm }],
			[5, { [_hH]: _xaolrud }],
			[0, { [_hH]: _xaollh }],
			[0, { [_hH]: _xaebo }],
			[0, { [_hH]: _xaca }],
			[0, { [_hH]: _xact }]
		],
		2
	];
	exports.CreateSessionOutput$ = [
		3,
		n0,
		_CSO,
		{ [_xN]: _CSR },
		[
			_Cr,
			_SSE,
			_SSEKMSKI,
			_SSEKMSEC,
			_BKE
		],
		[
			[() => exports.SessionCredentials$, { [_xN]: _Cr }],
			[0, { [_hH]: _xasse }],
			[() => SSEKMSKeyId, { [_hH]: _xasseakki }],
			[() => SSEKMSEncryptionContext, { [_hH]: _xassec }],
			[2, { [_hH]: _xassebke }]
		],
		1
	];
	exports.CreateSessionRequest$ = [
		3,
		n0,
		_CSRr,
		0,
		[
			_B,
			_SM,
			_SSE,
			_SSEKMSKI,
			_SSEKMSEC,
			_BKE
		],
		[
			[0, 1],
			[0, { [_hH]: _xacsm }],
			[0, { [_hH]: _xasse }],
			[() => SSEKMSKeyId, { [_hH]: _xasseakki }],
			[() => SSEKMSEncryptionContext, { [_hH]: _xassec }],
			[2, { [_hH]: _xassebke }]
		],
		1
	];
	exports.CSVInput$ = [
		3,
		n0,
		_CSVIn,
		0,
		[
			_FHI,
			_Com,
			_QEC,
			_RD,
			_FD,
			_QC,
			_AQRD
		],
		[
			0,
			0,
			0,
			0,
			0,
			0,
			2
		]
	];
	exports.CSVOutput$ = [
		3,
		n0,
		_CSVO,
		0,
		[
			_QF,
			_QEC,
			_RD,
			_FD,
			_QC
		],
		[
			0,
			0,
			0,
			0,
			0
		]
	];
	exports.DefaultRetention$ = [
		3,
		n0,
		_DRe,
		0,
		[
			_Mo,
			_D,
			_Y
		],
		[
			0,
			1,
			1
		]
	];
	exports.Delete$ = [
		3,
		n0,
		_De,
		0,
		[_Ob, _Q],
		[[() => ObjectIdentifierList, {
			[_xF]: 1,
			[_xN]: _Obj
		}], 2],
		1
	];
	exports.DeleteBucketAnalyticsConfigurationRequest$ = [
		3,
		n0,
		_DBACR,
		0,
		[
			_B,
			_I,
			_EBO
		],
		[
			[0, 1],
			[0, { [_hQ]: _i }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.DeleteBucketCorsRequest$ = [
		3,
		n0,
		_DBCR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.DeleteBucketEncryptionRequest$ = [
		3,
		n0,
		_DBER,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.DeleteBucketIntelligentTieringConfigurationRequest$ = [
		3,
		n0,
		_DBITCR,
		0,
		[
			_B,
			_I,
			_EBO
		],
		[
			[0, 1],
			[0, { [_hQ]: _i }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.DeleteBucketInventoryConfigurationRequest$ = [
		3,
		n0,
		_DBICR,
		0,
		[
			_B,
			_I,
			_EBO
		],
		[
			[0, 1],
			[0, { [_hQ]: _i }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.DeleteBucketLifecycleRequest$ = [
		3,
		n0,
		_DBLR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.DeleteBucketMetadataConfigurationRequest$ = [
		3,
		n0,
		_DBMCR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.DeleteBucketMetadataTableConfigurationRequest$ = [
		3,
		n0,
		_DBMTCR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.DeleteBucketMetricsConfigurationRequest$ = [
		3,
		n0,
		_DBMCRe,
		0,
		[
			_B,
			_I,
			_EBO
		],
		[
			[0, 1],
			[0, { [_hQ]: _i }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.DeleteBucketOwnershipControlsRequest$ = [
		3,
		n0,
		_DBOCR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.DeleteBucketPolicyRequest$ = [
		3,
		n0,
		_DBPR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.DeleteBucketReplicationRequest$ = [
		3,
		n0,
		_DBRR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.DeleteBucketRequest$ = [
		3,
		n0,
		_DBR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.DeleteBucketTaggingRequest$ = [
		3,
		n0,
		_DBTR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.DeleteBucketWebsiteRequest$ = [
		3,
		n0,
		_DBWR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.DeletedObject$ = [
		3,
		n0,
		_DO,
		0,
		[
			_K,
			_VI,
			_DM,
			_DMVI
		],
		[
			0,
			0,
			2,
			0
		]
	];
	exports.DeleteMarkerEntry$ = [
		3,
		n0,
		_DME,
		0,
		[
			_O,
			_K,
			_VI,
			_IL,
			_LM
		],
		[
			() => exports.Owner$,
			0,
			0,
			2,
			4
		]
	];
	exports.DeleteMarkerReplication$ = [
		3,
		n0,
		_DMR,
		0,
		[_S],
		[0]
	];
	exports.DeleteObjectOutput$ = [
		3,
		n0,
		_DOO,
		0,
		[
			_DM,
			_VI,
			_RC
		],
		[
			[2, { [_hH]: _xadm }],
			[0, { [_hH]: _xavi }],
			[0, { [_hH]: _xarc }]
		]
	];
	exports.DeleteObjectRequest$ = [
		3,
		n0,
		_DOR,
		0,
		[
			_B,
			_K,
			_MFA,
			_VI,
			_RP,
			_BGR,
			_EBO,
			_IM,
			_IMLMT,
			_IMS
		],
		[
			[0, 1],
			[0, 1],
			[0, { [_hH]: _xam_ }],
			[0, { [_hQ]: _vI }],
			[0, { [_hH]: _xarp }],
			[2, { [_hH]: _xabgr }],
			[0, { [_hH]: _xaebo }],
			[0, { [_hH]: _IM_ }],
			[6, { [_hH]: _xaimlmt }],
			[1, { [_hH]: _xaims }]
		],
		2
	];
	exports.DeleteObjectsOutput$ = [
		3,
		n0,
		_DOOe,
		{ [_xN]: _DRel },
		[
			_Del,
			_RC,
			_Er
		],
		[
			[() => DeletedObjects, { [_xF]: 1 }],
			[0, { [_hH]: _xarc }],
			[() => Errors, {
				[_xF]: 1,
				[_xN]: _Err
			}]
		]
	];
	exports.DeleteObjectsRequest$ = [
		3,
		n0,
		_DORe,
		0,
		[
			_B,
			_De,
			_MFA,
			_RP,
			_BGR,
			_EBO,
			_CA
		],
		[
			[0, 1],
			[() => exports.Delete$, {
				[_hP]: 1,
				[_xN]: _De
			}],
			[0, { [_hH]: _xam_ }],
			[0, { [_hH]: _xarp }],
			[2, { [_hH]: _xabgr }],
			[0, { [_hH]: _xaebo }],
			[0, { [_hH]: _xasca }]
		],
		2
	];
	exports.DeleteObjectTaggingOutput$ = [
		3,
		n0,
		_DOTO,
		0,
		[_VI],
		[[0, { [_hH]: _xavi }]]
	];
	exports.DeleteObjectTaggingRequest$ = [
		3,
		n0,
		_DOTR,
		0,
		[
			_B,
			_K,
			_VI,
			_EBO
		],
		[
			[0, 1],
			[0, 1],
			[0, { [_hQ]: _vI }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.DeletePublicAccessBlockRequest$ = [
		3,
		n0,
		_DPABR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.Destination$ = [
		3,
		n0,
		_Des,
		0,
		[
			_B,
			_A,
			_SC,
			_ACT,
			_EC,
			_RT,
			_Me
		],
		[
			0,
			0,
			0,
			() => exports.AccessControlTranslation$,
			() => exports.EncryptionConfiguration$,
			() => exports.ReplicationTime$,
			() => exports.Metrics$
		],
		1
	];
	exports.DestinationResult$ = [
		3,
		n0,
		_DRes,
		0,
		[
			_TBT,
			_TBA,
			_TN
		],
		[
			0,
			0,
			0
		]
	];
	exports.Encryption$ = [
		3,
		n0,
		_En,
		0,
		[
			_ET,
			_KMSKI,
			_KMSC
		],
		[
			0,
			[() => SSEKMSKeyId, 0],
			0
		],
		1
	];
	exports.EncryptionConfiguration$ = [
		3,
		n0,
		_EC,
		0,
		[_RKKID],
		[0]
	];
	exports.EndEvent$ = [
		3,
		n0,
		_EE,
		0,
		[],
		[]
	];
	exports._Error$ = [
		3,
		n0,
		_Err,
		0,
		[
			_K,
			_VI,
			_Cod,
			_Mes
		],
		[
			0,
			0,
			0,
			0
		]
	];
	exports.ErrorDetails$ = [
		3,
		n0,
		_ED,
		0,
		[_ECr, _EM],
		[0, 0]
	];
	exports.ErrorDocument$ = [
		3,
		n0,
		_EDr,
		0,
		[_K],
		[0],
		1
	];
	exports.EventBridgeConfiguration$ = [
		3,
		n0,
		_EBC,
		0,
		[],
		[]
	];
	exports.ExistingObjectReplication$ = [
		3,
		n0,
		_EOR,
		0,
		[_S],
		[0],
		1
	];
	exports.FilterRule$ = [
		3,
		n0,
		_FR,
		0,
		[_N, _V],
		[0, 0]
	];
	exports.GetBucketAbacOutput$ = [
		3,
		n0,
		_GBAO,
		0,
		[_AS],
		[[() => exports.AbacStatus$, 16]]
	];
	exports.GetBucketAbacRequest$ = [
		3,
		n0,
		_GBAR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetBucketAccelerateConfigurationOutput$ = [
		3,
		n0,
		_GBACO,
		{ [_xN]: _AC },
		[_S, _RC],
		[0, [0, { [_hH]: _xarc }]]
	];
	exports.GetBucketAccelerateConfigurationRequest$ = [
		3,
		n0,
		_GBACR,
		0,
		[
			_B,
			_EBO,
			_RP
		],
		[
			[0, 1],
			[0, { [_hH]: _xaebo }],
			[0, { [_hH]: _xarp }]
		],
		1
	];
	exports.GetBucketAclOutput$ = [
		3,
		n0,
		_GBAOe,
		{ [_xN]: _ACP },
		[_O, _G],
		[() => exports.Owner$, [() => Grants, { [_xN]: _ACL }]]
	];
	exports.GetBucketAclRequest$ = [
		3,
		n0,
		_GBARe,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetBucketAnalyticsConfigurationOutput$ = [
		3,
		n0,
		_GBACOe,
		0,
		[_ACn],
		[[() => exports.AnalyticsConfiguration$, 16]]
	];
	exports.GetBucketAnalyticsConfigurationRequest$ = [
		3,
		n0,
		_GBACRe,
		0,
		[
			_B,
			_I,
			_EBO
		],
		[
			[0, 1],
			[0, { [_hQ]: _i }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.GetBucketCorsOutput$ = [
		3,
		n0,
		_GBCO,
		{ [_xN]: _CORSC },
		[_CORSR],
		[[() => CORSRules, {
			[_xF]: 1,
			[_xN]: _CORSRu
		}]]
	];
	exports.GetBucketCorsRequest$ = [
		3,
		n0,
		_GBCR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetBucketEncryptionOutput$ = [
		3,
		n0,
		_GBEO,
		0,
		[_SSEC],
		[[() => exports.ServerSideEncryptionConfiguration$, 16]]
	];
	exports.GetBucketEncryptionRequest$ = [
		3,
		n0,
		_GBER,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetBucketIntelligentTieringConfigurationOutput$ = [
		3,
		n0,
		_GBITCO,
		0,
		[_ITC],
		[[() => exports.IntelligentTieringConfiguration$, 16]]
	];
	exports.GetBucketIntelligentTieringConfigurationRequest$ = [
		3,
		n0,
		_GBITCR,
		0,
		[
			_B,
			_I,
			_EBO
		],
		[
			[0, 1],
			[0, { [_hQ]: _i }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.GetBucketInventoryConfigurationOutput$ = [
		3,
		n0,
		_GBICO,
		0,
		[_IC],
		[[() => exports.InventoryConfiguration$, 16]]
	];
	exports.GetBucketInventoryConfigurationRequest$ = [
		3,
		n0,
		_GBICR,
		0,
		[
			_B,
			_I,
			_EBO
		],
		[
			[0, 1],
			[0, { [_hQ]: _i }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.GetBucketLifecycleConfigurationOutput$ = [
		3,
		n0,
		_GBLCO,
		{ [_xN]: _LCi },
		[_R, _TDMOS],
		[[() => LifecycleRules, {
			[_xF]: 1,
			[_xN]: _Ru
		}], [0, { [_hH]: _xatdmos }]]
	];
	exports.GetBucketLifecycleConfigurationRequest$ = [
		3,
		n0,
		_GBLCR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetBucketLocationOutput$ = [
		3,
		n0,
		_GBLO,
		{ [_xN]: _LC },
		[_LC],
		[0]
	];
	exports.GetBucketLocationRequest$ = [
		3,
		n0,
		_GBLR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetBucketLoggingOutput$ = [
		3,
		n0,
		_GBLOe,
		{ [_xN]: _BLS },
		[_LE],
		[[() => exports.LoggingEnabled$, 0]]
	];
	exports.GetBucketLoggingRequest$ = [
		3,
		n0,
		_GBLRe,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetBucketMetadataConfigurationOutput$ = [
		3,
		n0,
		_GBMCO,
		0,
		[_GBMCR],
		[[() => exports.GetBucketMetadataConfigurationResult$, 16]]
	];
	exports.GetBucketMetadataConfigurationRequest$ = [
		3,
		n0,
		_GBMCRe,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetBucketMetadataConfigurationResult$ = [
		3,
		n0,
		_GBMCR,
		0,
		[_MCR],
		[() => exports.MetadataConfigurationResult$],
		1
	];
	exports.GetBucketMetadataTableConfigurationOutput$ = [
		3,
		n0,
		_GBMTCO,
		0,
		[_GBMTCR],
		[[() => exports.GetBucketMetadataTableConfigurationResult$, 16]]
	];
	exports.GetBucketMetadataTableConfigurationRequest$ = [
		3,
		n0,
		_GBMTCRe,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetBucketMetadataTableConfigurationResult$ = [
		3,
		n0,
		_GBMTCR,
		0,
		[
			_MTCR,
			_S,
			_Err
		],
		[
			() => exports.MetadataTableConfigurationResult$,
			0,
			() => exports.ErrorDetails$
		],
		2
	];
	exports.GetBucketMetricsConfigurationOutput$ = [
		3,
		n0,
		_GBMCOe,
		0,
		[_MCe],
		[[() => exports.MetricsConfiguration$, 16]]
	];
	exports.GetBucketMetricsConfigurationRequest$ = [
		3,
		n0,
		_GBMCRet,
		0,
		[
			_B,
			_I,
			_EBO
		],
		[
			[0, 1],
			[0, { [_hQ]: _i }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.GetBucketNotificationConfigurationRequest$ = [
		3,
		n0,
		_GBNCR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetBucketOwnershipControlsOutput$ = [
		3,
		n0,
		_GBOCO,
		0,
		[_OC],
		[[() => exports.OwnershipControls$, 16]]
	];
	exports.GetBucketOwnershipControlsRequest$ = [
		3,
		n0,
		_GBOCR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetBucketPolicyOutput$ = [
		3,
		n0,
		_GBPO,
		0,
		[_Po],
		[[0, 16]]
	];
	exports.GetBucketPolicyRequest$ = [
		3,
		n0,
		_GBPR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetBucketPolicyStatusOutput$ = [
		3,
		n0,
		_GBPSO,
		0,
		[_PS],
		[[() => exports.PolicyStatus$, 16]]
	];
	exports.GetBucketPolicyStatusRequest$ = [
		3,
		n0,
		_GBPSR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetBucketReplicationOutput$ = [
		3,
		n0,
		_GBRO,
		0,
		[_RCe],
		[[() => exports.ReplicationConfiguration$, 16]]
	];
	exports.GetBucketReplicationRequest$ = [
		3,
		n0,
		_GBRR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetBucketRequestPaymentOutput$ = [
		3,
		n0,
		_GBRPO,
		{ [_xN]: _RPC },
		[_Pay],
		[0]
	];
	exports.GetBucketRequestPaymentRequest$ = [
		3,
		n0,
		_GBRPR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetBucketTaggingOutput$ = [
		3,
		n0,
		_GBTO,
		{ [_xN]: _Tag },
		[_TS],
		[[() => TagSet, 0]],
		1
	];
	exports.GetBucketTaggingRequest$ = [
		3,
		n0,
		_GBTR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetBucketVersioningOutput$ = [
		3,
		n0,
		_GBVO,
		{ [_xN]: _VC },
		[_S, _MFAD],
		[0, [0, { [_xN]: _MDf }]]
	];
	exports.GetBucketVersioningRequest$ = [
		3,
		n0,
		_GBVR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetBucketWebsiteOutput$ = [
		3,
		n0,
		_GBWO,
		{ [_xN]: _WC },
		[
			_RART,
			_IDn,
			_EDr,
			_RR
		],
		[
			() => exports.RedirectAllRequestsTo$,
			() => exports.IndexDocument$,
			() => exports.ErrorDocument$,
			[() => RoutingRules, 0]
		]
	];
	exports.GetBucketWebsiteRequest$ = [
		3,
		n0,
		_GBWR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetObjectAclOutput$ = [
		3,
		n0,
		_GOAO,
		{ [_xN]: _ACP },
		[
			_O,
			_G,
			_RC
		],
		[
			() => exports.Owner$,
			[() => Grants, { [_xN]: _ACL }],
			[0, { [_hH]: _xarc }]
		]
	];
	exports.GetObjectAclRequest$ = [
		3,
		n0,
		_GOAR,
		0,
		[
			_B,
			_K,
			_VI,
			_RP,
			_EBO
		],
		[
			[0, 1],
			[0, 1],
			[0, { [_hQ]: _vI }],
			[0, { [_hH]: _xarp }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.GetObjectAttributesOutput$ = [
		3,
		n0,
		_GOAOe,
		{ [_xN]: _GOARe },
		[
			_DM,
			_LM,
			_VI,
			_RC,
			_ETa,
			_C,
			_OP,
			_SC,
			_OS
		],
		[
			[2, { [_hH]: _xadm }],
			[4, { [_hH]: _LM_ }],
			[0, { [_hH]: _xavi }],
			[0, { [_hH]: _xarc }],
			0,
			() => exports.Checksum$,
			[() => exports.GetObjectAttributesParts$, 0],
			0,
			1
		]
	];
	exports.GetObjectAttributesParts$ = [
		3,
		n0,
		_GOAP,
		0,
		[
			_TPC,
			_PNM,
			_NPNM,
			_MP,
			_IT,
			_Pa
		],
		[
			[1, { [_xN]: _PC }],
			0,
			0,
			1,
			2,
			[() => PartsList, {
				[_xF]: 1,
				[_xN]: _Par
			}]
		]
	];
	exports.GetObjectAttributesRequest$ = [
		3,
		n0,
		_GOARet,
		0,
		[
			_B,
			_K,
			_OA,
			_VI,
			_MP,
			_PNM,
			_SSECA,
			_SSECK,
			_SSECKMD,
			_RP,
			_EBO
		],
		[
			[0, 1],
			[0, 1],
			[64, { [_hH]: _xaoa }],
			[0, { [_hQ]: _vI }],
			[1, { [_hH]: _xamp }],
			[0, { [_hH]: _xapnm }],
			[0, { [_hH]: _xasseca }],
			[() => SSECustomerKey, { [_hH]: _xasseck }],
			[0, { [_hH]: _xasseckM }],
			[0, { [_hH]: _xarp }],
			[0, { [_hH]: _xaebo }]
		],
		3
	];
	exports.GetObjectLegalHoldOutput$ = [
		3,
		n0,
		_GOLHO,
		0,
		[_LH],
		[[() => exports.ObjectLockLegalHold$, {
			[_hP]: 1,
			[_xN]: _LH
		}]]
	];
	exports.GetObjectLegalHoldRequest$ = [
		3,
		n0,
		_GOLHR,
		0,
		[
			_B,
			_K,
			_VI,
			_RP,
			_EBO
		],
		[
			[0, 1],
			[0, 1],
			[0, { [_hQ]: _vI }],
			[0, { [_hH]: _xarp }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.GetObjectLockConfigurationOutput$ = [
		3,
		n0,
		_GOLCO,
		0,
		[_OLC],
		[[() => exports.ObjectLockConfiguration$, 16]]
	];
	exports.GetObjectLockConfigurationRequest$ = [
		3,
		n0,
		_GOLCR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GetObjectOutput$ = [
		3,
		n0,
		_GOO,
		0,
		[
			_Bo,
			_DM,
			_AR,
			_E,
			_Re,
			_LM,
			_CLo,
			_ETa,
			_CCRC,
			_CCRCC,
			_CCRCNVME,
			_CSHA,
			_CSHAh,
			_CSHAhe,
			_CMD,
			_CXXHASH,
			_CXXHASHh,
			_CXXHASHhe,
			_CT,
			_MM,
			_VI,
			_CC,
			_CDo,
			_CEo,
			_CL,
			_CR,
			_CTo,
			_Ex,
			_ES,
			_WRL,
			_SSE,
			_M,
			_SSECA,
			_SSECKMD,
			_SSEKMSKI,
			_BKE,
			_SC,
			_RC,
			_RS,
			_PC,
			_TC,
			_OLM,
			_OLRUD,
			_OLLHS
		],
		[
			[() => StreamingBlob, 16],
			[2, { [_hH]: _xadm }],
			[0, { [_hH]: _ar }],
			[0, { [_hH]: _xae }],
			[0, { [_hH]: _xar }],
			[4, { [_hH]: _LM_ }],
			[1, { [_hH]: _CL__ }],
			[0, { [_hH]: _ETa }],
			[0, { [_hH]: _xacc }],
			[0, { [_hH]: _xacc_ }],
			[0, { [_hH]: _xacc__ }],
			[0, { [_hH]: _xacs }],
			[0, { [_hH]: _xacs_ }],
			[0, { [_hH]: _xacs__ }],
			[0, { [_hH]: _xacm }],
			[0, { [_hH]: _xacx }],
			[0, { [_hH]: _xacx_ }],
			[0, { [_hH]: _xacx__ }],
			[0, { [_hH]: _xact }],
			[1, { [_hH]: _xamm }],
			[0, { [_hH]: _xavi }],
			[0, { [_hH]: _CC_ }],
			[0, { [_hH]: _CD_ }],
			[0, { [_hH]: _CE_ }],
			[0, { [_hH]: _CL_ }],
			[0, { [_hH]: _CR_ }],
			[0, { [_hH]: _CT_ }],
			[4, { [_hH]: _Ex }],
			[0, { [_hH]: _ES }],
			[0, { [_hH]: _xawrl }],
			[0, { [_hH]: _xasse }],
			[128, { [_hPH]: _xam }],
			[0, { [_hH]: _xasseca }],
			[0, { [_hH]: _xasseckM }],
			[() => SSEKMSKeyId, { [_hH]: _xasseakki }],
			[2, { [_hH]: _xassebke }],
			[0, { [_hH]: _xasc }],
			[0, { [_hH]: _xarc }],
			[0, { [_hH]: _xars }],
			[1, { [_hH]: _xampc }],
			[1, { [_hH]: _xatc }],
			[0, { [_hH]: _xaolm }],
			[5, { [_hH]: _xaolrud }],
			[0, { [_hH]: _xaollh }]
		]
	];
	exports.GetObjectRequest$ = [
		3,
		n0,
		_GOR,
		0,
		[
			_B,
			_K,
			_IM,
			_IMSf,
			_INM,
			_IUS,
			_Ra,
			_RCC,
			_RCD,
			_RCE,
			_RCL,
			_RCT,
			_RE,
			_VI,
			_SSECA,
			_SSECK,
			_SSECKMD,
			_RP,
			_PN,
			_EBO,
			_CMh
		],
		[
			[0, 1],
			[0, 1],
			[0, { [_hH]: _IM_ }],
			[4, { [_hH]: _IMS_ }],
			[0, { [_hH]: _INM_ }],
			[4, { [_hH]: _IUS_ }],
			[0, { [_hH]: _Ra }],
			[0, { [_hQ]: _rcc }],
			[0, { [_hQ]: _rcd }],
			[0, { [_hQ]: _rce }],
			[0, { [_hQ]: _rcl }],
			[0, { [_hQ]: _rct }],
			[6, { [_hQ]: _re }],
			[0, { [_hQ]: _vI }],
			[0, { [_hH]: _xasseca }],
			[() => SSECustomerKey, { [_hH]: _xasseck }],
			[0, { [_hH]: _xasseckM }],
			[0, { [_hH]: _xarp }],
			[1, { [_hQ]: _pN }],
			[0, { [_hH]: _xaebo }],
			[0, { [_hH]: _xacm_ }]
		],
		2
	];
	exports.GetObjectRetentionOutput$ = [
		3,
		n0,
		_GORO,
		0,
		[_Ret],
		[[() => exports.ObjectLockRetention$, {
			[_hP]: 1,
			[_xN]: _Ret
		}]]
	];
	exports.GetObjectRetentionRequest$ = [
		3,
		n0,
		_GORR,
		0,
		[
			_B,
			_K,
			_VI,
			_RP,
			_EBO
		],
		[
			[0, 1],
			[0, 1],
			[0, { [_hQ]: _vI }],
			[0, { [_hH]: _xarp }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.GetObjectTaggingOutput$ = [
		3,
		n0,
		_GOTO,
		{ [_xN]: _Tag },
		[_TS, _VI],
		[[() => TagSet, 0], [0, { [_hH]: _xavi }]],
		1
	];
	exports.GetObjectTaggingRequest$ = [
		3,
		n0,
		_GOTR,
		0,
		[
			_B,
			_K,
			_VI,
			_EBO,
			_RP
		],
		[
			[0, 1],
			[0, 1],
			[0, { [_hQ]: _vI }],
			[0, { [_hH]: _xaebo }],
			[0, { [_hH]: _xarp }]
		],
		2
	];
	exports.GetObjectTorrentOutput$ = [
		3,
		n0,
		_GOTOe,
		0,
		[_Bo, _RC],
		[[() => StreamingBlob, 16], [0, { [_hH]: _xarc }]]
	];
	exports.GetObjectTorrentRequest$ = [
		3,
		n0,
		_GOTRe,
		0,
		[
			_B,
			_K,
			_RP,
			_EBO
		],
		[
			[0, 1],
			[0, 1],
			[0, { [_hH]: _xarp }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.GetPublicAccessBlockOutput$ = [
		3,
		n0,
		_GPABO,
		0,
		[_PABC],
		[[() => exports.PublicAccessBlockConfiguration$, 16]]
	];
	exports.GetPublicAccessBlockRequest$ = [
		3,
		n0,
		_GPABR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.GlacierJobParameters$ = [
		3,
		n0,
		_GJP,
		0,
		[_Ti],
		[0],
		1
	];
	exports.Grant$ = [
		3,
		n0,
		_Gr,
		0,
		[_Gra, _Pe],
		[[() => exports.Grantee$, { [_xNm]: [_x, _hi] }], 0]
	];
	exports.Grantee$ = [
		3,
		n0,
		_Gra,
		0,
		[
			_Ty,
			_DN,
			_EA,
			_ID,
			_URI
		],
		[
			[0, {
				[_xA]: 1,
				[_xN]: _xs
			}],
			0,
			0,
			0,
			0
		],
		1
	];
	exports.HeadBucketOutput$ = [
		3,
		n0,
		_HBO,
		0,
		[
			_BA,
			_BLT,
			_BLN,
			_BR,
			_APA
		],
		[
			[0, { [_hH]: _xaba }],
			[0, { [_hH]: _xablt }],
			[0, { [_hH]: _xabln }],
			[0, { [_hH]: _xabr }],
			[2, { [_hH]: _xaapa }]
		]
	];
	exports.HeadBucketRequest$ = [
		3,
		n0,
		_HBR,
		0,
		[_B, _EBO],
		[[0, 1], [0, { [_hH]: _xaebo }]],
		1
	];
	exports.HeadObjectOutput$ = [
		3,
		n0,
		_HOO,
		0,
		[
			_DM,
			_AR,
			_E,
			_Re,
			_ASr,
			_LM,
			_CLo,
			_CCRC,
			_CCRCC,
			_CCRCNVME,
			_CSHA,
			_CSHAh,
			_CSHAhe,
			_CMD,
			_CXXHASH,
			_CXXHASHh,
			_CXXHASHhe,
			_CT,
			_ETa,
			_MM,
			_VI,
			_CC,
			_CDo,
			_CEo,
			_CL,
			_CTo,
			_CR,
			_Ex,
			_ES,
			_WRL,
			_SSE,
			_M,
			_SSECA,
			_SSECKMD,
			_SSEKMSKI,
			_BKE,
			_SC,
			_RC,
			_RS,
			_PC,
			_TC,
			_OLM,
			_OLRUD,
			_OLLHS
		],
		[
			[2, { [_hH]: _xadm }],
			[0, { [_hH]: _ar }],
			[0, { [_hH]: _xae }],
			[0, { [_hH]: _xar }],
			[0, { [_hH]: _xaas }],
			[4, { [_hH]: _LM_ }],
			[1, { [_hH]: _CL__ }],
			[0, { [_hH]: _xacc }],
			[0, { [_hH]: _xacc_ }],
			[0, { [_hH]: _xacc__ }],
			[0, { [_hH]: _xacs }],
			[0, { [_hH]: _xacs_ }],
			[0, { [_hH]: _xacs__ }],
			[0, { [_hH]: _xacm }],
			[0, { [_hH]: _xacx }],
			[0, { [_hH]: _xacx_ }],
			[0, { [_hH]: _xacx__ }],
			[0, { [_hH]: _xact }],
			[0, { [_hH]: _ETa }],
			[1, { [_hH]: _xamm }],
			[0, { [_hH]: _xavi }],
			[0, { [_hH]: _CC_ }],
			[0, { [_hH]: _CD_ }],
			[0, { [_hH]: _CE_ }],
			[0, { [_hH]: _CL_ }],
			[0, { [_hH]: _CT_ }],
			[0, { [_hH]: _CR_ }],
			[4, { [_hH]: _Ex }],
			[0, { [_hH]: _ES }],
			[0, { [_hH]: _xawrl }],
			[0, { [_hH]: _xasse }],
			[128, { [_hPH]: _xam }],
			[0, { [_hH]: _xasseca }],
			[0, { [_hH]: _xasseckM }],
			[() => SSEKMSKeyId, { [_hH]: _xasseakki }],
			[2, { [_hH]: _xassebke }],
			[0, { [_hH]: _xasc }],
			[0, { [_hH]: _xarc }],
			[0, { [_hH]: _xars }],
			[1, { [_hH]: _xampc }],
			[1, { [_hH]: _xatc }],
			[0, { [_hH]: _xaolm }],
			[5, { [_hH]: _xaolrud }],
			[0, { [_hH]: _xaollh }]
		]
	];
	exports.HeadObjectRequest$ = [
		3,
		n0,
		_HOR,
		0,
		[
			_B,
			_K,
			_IM,
			_IMSf,
			_INM,
			_IUS,
			_Ra,
			_RCC,
			_RCD,
			_RCE,
			_RCL,
			_RCT,
			_RE,
			_VI,
			_SSECA,
			_SSECK,
			_SSECKMD,
			_RP,
			_PN,
			_EBO,
			_CMh
		],
		[
			[0, 1],
			[0, 1],
			[0, { [_hH]: _IM_ }],
			[4, { [_hH]: _IMS_ }],
			[0, { [_hH]: _INM_ }],
			[4, { [_hH]: _IUS_ }],
			[0, { [_hH]: _Ra }],
			[0, { [_hQ]: _rcc }],
			[0, { [_hQ]: _rcd }],
			[0, { [_hQ]: _rce }],
			[0, { [_hQ]: _rcl }],
			[0, { [_hQ]: _rct }],
			[6, { [_hQ]: _re }],
			[0, { [_hQ]: _vI }],
			[0, { [_hH]: _xasseca }],
			[() => SSECustomerKey, { [_hH]: _xasseck }],
			[0, { [_hH]: _xasseckM }],
			[0, { [_hH]: _xarp }],
			[1, { [_hQ]: _pN }],
			[0, { [_hH]: _xaebo }],
			[0, { [_hH]: _xacm_ }]
		],
		2
	];
	exports.IndexDocument$ = [
		3,
		n0,
		_IDn,
		0,
		[_Su],
		[0],
		1
	];
	exports.Initiator$ = [
		3,
		n0,
		_In,
		0,
		[_ID, _DN],
		[0, 0]
	];
	exports.InputSerialization$ = [
		3,
		n0,
		_IS,
		0,
		[
			_CSV,
			_CTom,
			_JSON,
			_Parq
		],
		[
			() => exports.CSVInput$,
			0,
			() => exports.JSONInput$,
			() => exports.ParquetInput$
		]
	];
	exports.IntelligentTieringAndOperator$ = [
		3,
		n0,
		_ITAO,
		0,
		[_P, _T],
		[0, [() => TagSet, {
			[_xF]: 1,
			[_xN]: _Ta
		}]]
	];
	exports.IntelligentTieringConfiguration$ = [
		3,
		n0,
		_ITC,
		0,
		[
			_I,
			_S,
			_Tie,
			_F
		],
		[
			0,
			0,
			[() => TieringList, {
				[_xF]: 1,
				[_xN]: _Tier
			}],
			[() => exports.IntelligentTieringFilter$, 0]
		],
		3
	];
	exports.IntelligentTieringFilter$ = [
		3,
		n0,
		_ITF,
		0,
		[
			_P,
			_Ta,
			_An
		],
		[
			0,
			() => exports.Tag$,
			[() => exports.IntelligentTieringAndOperator$, 0]
		]
	];
	exports.InventoryConfiguration$ = [
		3,
		n0,
		_IC,
		0,
		[
			_Des,
			_IE,
			_I,
			_IOV,
			_Sc,
			_F,
			_OF
		],
		[
			[() => exports.InventoryDestination$, 0],
			2,
			0,
			0,
			() => exports.InventorySchedule$,
			() => exports.InventoryFilter$,
			[() => InventoryOptionalFields, 0]
		],
		5
	];
	exports.InventoryDestination$ = [
		3,
		n0,
		_IDnv,
		0,
		[_SBD],
		[[() => exports.InventoryS3BucketDestination$, 0]],
		1
	];
	exports.InventoryEncryption$ = [
		3,
		n0,
		_IEn,
		0,
		[_SSES, _SSEKMS],
		[[() => exports.SSES3$, { [_xN]: _SS }], [() => exports.SSEKMS$, { [_xN]: _SK }]]
	];
	exports.InventoryFilter$ = [
		3,
		n0,
		_IF,
		0,
		[_P],
		[0],
		1
	];
	exports.InventoryS3BucketDestination$ = [
		3,
		n0,
		_ISBD,
		0,
		[
			_B,
			_Fo,
			_AI,
			_P,
			_En
		],
		[
			0,
			0,
			0,
			0,
			[() => exports.InventoryEncryption$, 0]
		],
		2
	];
	exports.InventorySchedule$ = [
		3,
		n0,
		_ISn,
		0,
		[_Fr],
		[0],
		1
	];
	exports.InventoryTableConfiguration$ = [
		3,
		n0,
		_ITCn,
		0,
		[_CSo, _EC],
		[0, () => exports.MetadataTableEncryptionConfiguration$],
		1
	];
	exports.InventoryTableConfigurationResult$ = [
		3,
		n0,
		_ITCR,
		0,
		[
			_CSo,
			_TSa,
			_Err,
			_TNa,
			_TA
		],
		[
			0,
			0,
			() => exports.ErrorDetails$,
			0,
			0
		],
		1
	];
	exports.InventoryTableConfigurationUpdates$ = [
		3,
		n0,
		_ITCU,
		0,
		[_CSo, _EC],
		[0, () => exports.MetadataTableEncryptionConfiguration$],
		1
	];
	exports.JournalTableConfiguration$ = [
		3,
		n0,
		_JTC,
		0,
		[_REe, _EC],
		[() => exports.RecordExpiration$, () => exports.MetadataTableEncryptionConfiguration$],
		1
	];
	exports.JournalTableConfigurationResult$ = [
		3,
		n0,
		_JTCR,
		0,
		[
			_TSa,
			_TNa,
			_REe,
			_Err,
			_TA
		],
		[
			0,
			0,
			() => exports.RecordExpiration$,
			() => exports.ErrorDetails$,
			0
		],
		3
	];
	exports.JournalTableConfigurationUpdates$ = [
		3,
		n0,
		_JTCU,
		0,
		[_REe],
		[() => exports.RecordExpiration$],
		1
	];
	exports.JSONInput$ = [
		3,
		n0,
		_JSONI,
		0,
		[_Ty],
		[0]
	];
	exports.JSONOutput$ = [
		3,
		n0,
		_JSONO,
		0,
		[_RD],
		[0]
	];
	exports.LambdaFunctionConfiguration$ = [
		3,
		n0,
		_LFC,
		0,
		[
			_LFA,
			_Ev,
			_I,
			_F
		],
		[
			[0, { [_xN]: _CF }],
			[64, {
				[_xF]: 1,
				[_xN]: _Eve
			}],
			0,
			[() => exports.NotificationConfigurationFilter$, 0]
		],
		2
	];
	exports.LifecycleExpiration$ = [
		3,
		n0,
		_LEi,
		0,
		[
			_Da,
			_D,
			_EODM
		],
		[
			5,
			1,
			2
		]
	];
	exports.LifecycleRule$ = [
		3,
		n0,
		_LR,
		0,
		[
			_S,
			_E,
			_ID,
			_P,
			_F,
			_Tr,
			_NVT,
			_NVE,
			_AIMU
		],
		[
			0,
			() => exports.LifecycleExpiration$,
			0,
			0,
			[() => exports.LifecycleRuleFilter$, 0],
			[() => TransitionList, {
				[_xF]: 1,
				[_xN]: _Tra
			}],
			[() => NoncurrentVersionTransitionList, {
				[_xF]: 1,
				[_xN]: _NVTo
			}],
			() => exports.NoncurrentVersionExpiration$,
			() => exports.AbortIncompleteMultipartUpload$
		],
		1
	];
	exports.LifecycleRuleAndOperator$ = [
		3,
		n0,
		_LRAO,
		0,
		[
			_P,
			_T,
			_OSGT,
			_OSLT
		],
		[
			0,
			[() => TagSet, {
				[_xF]: 1,
				[_xN]: _Ta
			}],
			1,
			1
		]
	];
	exports.LifecycleRuleFilter$ = [
		3,
		n0,
		_LRF,
		0,
		[
			_P,
			_Ta,
			_OSGT,
			_OSLT,
			_An
		],
		[
			0,
			() => exports.Tag$,
			1,
			1,
			[() => exports.LifecycleRuleAndOperator$, 0]
		]
	];
	exports.ListBucketAnalyticsConfigurationsOutput$ = [
		3,
		n0,
		_LBACO,
		{ [_xN]: _LBACR },
		[
			_IT,
			_CTon,
			_NCT,
			_ACLn
		],
		[
			2,
			0,
			0,
			[() => AnalyticsConfigurationList, {
				[_xF]: 1,
				[_xN]: _ACn
			}]
		]
	];
	exports.ListBucketAnalyticsConfigurationsRequest$ = [
		3,
		n0,
		_LBACRi,
		0,
		[
			_B,
			_CTon,
			_EBO
		],
		[
			[0, 1],
			[0, { [_hQ]: _ct }],
			[0, { [_hH]: _xaebo }]
		],
		1
	];
	exports.ListBucketIntelligentTieringConfigurationsOutput$ = [
		3,
		n0,
		_LBITCO,
		0,
		[
			_IT,
			_CTon,
			_NCT,
			_ITCL
		],
		[
			2,
			0,
			0,
			[() => IntelligentTieringConfigurationList, {
				[_xF]: 1,
				[_xN]: _ITC
			}]
		]
	];
	exports.ListBucketIntelligentTieringConfigurationsRequest$ = [
		3,
		n0,
		_LBITCR,
		0,
		[
			_B,
			_CTon,
			_EBO
		],
		[
			[0, 1],
			[0, { [_hQ]: _ct }],
			[0, { [_hH]: _xaebo }]
		],
		1
	];
	exports.ListBucketInventoryConfigurationsOutput$ = [
		3,
		n0,
		_LBICO,
		{ [_xN]: _LICR },
		[
			_CTon,
			_ICL,
			_IT,
			_NCT
		],
		[
			0,
			[() => InventoryConfigurationList, {
				[_xF]: 1,
				[_xN]: _IC
			}],
			2,
			0
		]
	];
	exports.ListBucketInventoryConfigurationsRequest$ = [
		3,
		n0,
		_LBICR,
		0,
		[
			_B,
			_CTon,
			_EBO
		],
		[
			[0, 1],
			[0, { [_hQ]: _ct }],
			[0, { [_hH]: _xaebo }]
		],
		1
	];
	exports.ListBucketMetricsConfigurationsOutput$ = [
		3,
		n0,
		_LBMCO,
		{ [_xN]: _LMCR },
		[
			_IT,
			_CTon,
			_NCT,
			_MCL
		],
		[
			2,
			0,
			0,
			[() => MetricsConfigurationList, {
				[_xF]: 1,
				[_xN]: _MCe
			}]
		]
	];
	exports.ListBucketMetricsConfigurationsRequest$ = [
		3,
		n0,
		_LBMCR,
		0,
		[
			_B,
			_CTon,
			_EBO
		],
		[
			[0, 1],
			[0, { [_hQ]: _ct }],
			[0, { [_hH]: _xaebo }]
		],
		1
	];
	exports.ListBucketsOutput$ = [
		3,
		n0,
		_LBO,
		{ [_xN]: _LAMBR },
		[
			_Bu,
			_O,
			_CTon,
			_P
		],
		[
			[() => Buckets, 0],
			() => exports.Owner$,
			0,
			0
		]
	];
	exports.ListBucketsRequest$ = [
		3,
		n0,
		_LBR,
		0,
		[
			_MB,
			_CTon,
			_P,
			_BR
		],
		[
			[1, { [_hQ]: _mb }],
			[0, { [_hQ]: _ct }],
			[0, { [_hQ]: _p }],
			[0, { [_hQ]: _br }]
		]
	];
	exports.ListDirectoryBucketsOutput$ = [
		3,
		n0,
		_LDBO,
		{ [_xN]: _LAMDBR },
		[_Bu, _CTon],
		[[() => Buckets, 0], 0]
	];
	exports.ListDirectoryBucketsRequest$ = [
		3,
		n0,
		_LDBR,
		0,
		[_CTon, _MDB],
		[[0, { [_hQ]: _ct }], [1, { [_hQ]: _mdb }]]
	];
	exports.ListMultipartUploadsOutput$ = [
		3,
		n0,
		_LMUO,
		{ [_xN]: _LMUR },
		[
			_B,
			_KM,
			_UIM,
			_NKM,
			_P,
			_Deli,
			_NUIM,
			_MUa,
			_IT,
			_U,
			_CPom,
			_ETn,
			_RC
		],
		[
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			1,
			2,
			[() => MultipartUploadList, {
				[_xF]: 1,
				[_xN]: _Up
			}],
			[() => CommonPrefixList, { [_xF]: 1 }],
			0,
			[0, { [_hH]: _xarc }]
		]
	];
	exports.ListMultipartUploadsRequest$ = [
		3,
		n0,
		_LMURi,
		0,
		[
			_B,
			_Deli,
			_ETn,
			_KM,
			_MUa,
			_P,
			_UIM,
			_EBO,
			_RP
		],
		[
			[0, 1],
			[0, { [_hQ]: _d }],
			[0, { [_hQ]: _et }],
			[0, { [_hQ]: _km }],
			[1, { [_hQ]: _mu }],
			[0, { [_hQ]: _p }],
			[0, { [_hQ]: _uim }],
			[0, { [_hH]: _xaebo }],
			[0, { [_hH]: _xarp }]
		],
		1
	];
	exports.ListObjectsOutput$ = [
		3,
		n0,
		_LOO,
		{ [_xN]: _LBRi },
		[
			_IT,
			_Ma,
			_NM,
			_Con,
			_N,
			_P,
			_Deli,
			_MK,
			_CPom,
			_ETn,
			_RC
		],
		[
			2,
			0,
			0,
			[() => ObjectList, { [_xF]: 1 }],
			0,
			0,
			0,
			1,
			[() => CommonPrefixList, { [_xF]: 1 }],
			0,
			[0, { [_hH]: _xarc }]
		]
	];
	exports.ListObjectsRequest$ = [
		3,
		n0,
		_LOR,
		0,
		[
			_B,
			_Deli,
			_ETn,
			_Ma,
			_MK,
			_P,
			_RP,
			_EBO,
			_OOA
		],
		[
			[0, 1],
			[0, { [_hQ]: _d }],
			[0, { [_hQ]: _et }],
			[0, { [_hQ]: _m }],
			[1, { [_hQ]: _mk }],
			[0, { [_hQ]: _p }],
			[0, { [_hH]: _xarp }],
			[0, { [_hH]: _xaebo }],
			[64, { [_hH]: _xaooa }]
		],
		1
	];
	exports.ListObjectsV2Output$ = [
		3,
		n0,
		_LOVO,
		{ [_xN]: _LBRi },
		[
			_IT,
			_Con,
			_N,
			_P,
			_Deli,
			_MK,
			_CPom,
			_ETn,
			_KC,
			_CTon,
			_NCT,
			_SA,
			_RC
		],
		[
			2,
			[() => ObjectList, { [_xF]: 1 }],
			0,
			0,
			0,
			1,
			[() => CommonPrefixList, { [_xF]: 1 }],
			0,
			1,
			0,
			0,
			0,
			[0, { [_hH]: _xarc }]
		]
	];
	exports.ListObjectsV2Request$ = [
		3,
		n0,
		_LOVR,
		0,
		[
			_B,
			_Deli,
			_ETn,
			_MK,
			_P,
			_CTon,
			_FO,
			_SA,
			_RP,
			_EBO,
			_OOA
		],
		[
			[0, 1],
			[0, { [_hQ]: _d }],
			[0, { [_hQ]: _et }],
			[1, { [_hQ]: _mk }],
			[0, { [_hQ]: _p }],
			[0, { [_hQ]: _ct }],
			[2, { [_hQ]: _fo }],
			[0, { [_hQ]: _sa }],
			[0, { [_hH]: _xarp }],
			[0, { [_hH]: _xaebo }],
			[64, { [_hH]: _xaooa }]
		],
		1
	];
	exports.ListObjectVersionsOutput$ = [
		3,
		n0,
		_LOVOi,
		{ [_xN]: _LVR },
		[
			_IT,
			_KM,
			_VIM,
			_NKM,
			_NVIM,
			_Ve,
			_DMe,
			_N,
			_P,
			_Deli,
			_MK,
			_CPom,
			_ETn,
			_RC
		],
		[
			2,
			0,
			0,
			0,
			0,
			[() => ObjectVersionList, {
				[_xF]: 1,
				[_xN]: _Ver
			}],
			[() => DeleteMarkers, {
				[_xF]: 1,
				[_xN]: _DM
			}],
			0,
			0,
			0,
			1,
			[() => CommonPrefixList, { [_xF]: 1 }],
			0,
			[0, { [_hH]: _xarc }]
		]
	];
	exports.ListObjectVersionsRequest$ = [
		3,
		n0,
		_LOVRi,
		0,
		[
			_B,
			_Deli,
			_ETn,
			_KM,
			_MK,
			_P,
			_VIM,
			_EBO,
			_RP,
			_OOA
		],
		[
			[0, 1],
			[0, { [_hQ]: _d }],
			[0, { [_hQ]: _et }],
			[0, { [_hQ]: _km }],
			[1, { [_hQ]: _mk }],
			[0, { [_hQ]: _p }],
			[0, { [_hQ]: _vim }],
			[0, { [_hH]: _xaebo }],
			[0, { [_hH]: _xarp }],
			[64, { [_hH]: _xaooa }]
		],
		1
	];
	exports.ListPartsOutput$ = [
		3,
		n0,
		_LPO,
		{ [_xN]: _LPR },
		[
			_ADb,
			_ARI,
			_B,
			_K,
			_UI,
			_PNM,
			_NPNM,
			_MP,
			_IT,
			_Pa,
			_In,
			_O,
			_SC,
			_RC,
			_CA,
			_CT
		],
		[
			[4, { [_hH]: _xaad }],
			[0, { [_hH]: _xaari }],
			0,
			0,
			0,
			0,
			0,
			1,
			2,
			[() => Parts, {
				[_xF]: 1,
				[_xN]: _Par
			}],
			() => exports.Initiator$,
			() => exports.Owner$,
			0,
			[0, { [_hH]: _xarc }],
			0,
			0
		]
	];
	exports.ListPartsRequest$ = [
		3,
		n0,
		_LPRi,
		0,
		[
			_B,
			_K,
			_UI,
			_MP,
			_PNM,
			_RP,
			_EBO,
			_SSECA,
			_SSECK,
			_SSECKMD
		],
		[
			[0, 1],
			[0, 1],
			[0, { [_hQ]: _uI }],
			[1, { [_hQ]: _mp }],
			[0, { [_hQ]: _pnm }],
			[0, { [_hH]: _xarp }],
			[0, { [_hH]: _xaebo }],
			[0, { [_hH]: _xasseca }],
			[() => SSECustomerKey, { [_hH]: _xasseck }],
			[0, { [_hH]: _xasseckM }]
		],
		3
	];
	exports.LocationInfo$ = [
		3,
		n0,
		_LI,
		0,
		[_Ty, _N],
		[0, 0]
	];
	exports.LoggingEnabled$ = [
		3,
		n0,
		_LE,
		0,
		[
			_TB,
			_TP,
			_TG,
			_TOKF
		],
		[
			0,
			0,
			[() => TargetGrants, 0],
			[() => exports.TargetObjectKeyFormat$, 0]
		],
		2
	];
	exports.MetadataConfiguration$ = [
		3,
		n0,
		_MC,
		0,
		[_JTC, _ITCn],
		[() => exports.JournalTableConfiguration$, () => exports.InventoryTableConfiguration$],
		1
	];
	exports.MetadataConfigurationResult$ = [
		3,
		n0,
		_MCR,
		0,
		[
			_DRes,
			_JTCR,
			_ITCR
		],
		[
			() => exports.DestinationResult$,
			() => exports.JournalTableConfigurationResult$,
			() => exports.InventoryTableConfigurationResult$
		],
		1
	];
	exports.MetadataEntry$ = [
		3,
		n0,
		_ME,
		0,
		[_N, _V],
		[0, 0]
	];
	exports.MetadataTableConfiguration$ = [
		3,
		n0,
		_MTC,
		0,
		[_STD],
		[() => exports.S3TablesDestination$],
		1
	];
	exports.MetadataTableConfigurationResult$ = [
		3,
		n0,
		_MTCR,
		0,
		[_STDR],
		[() => exports.S3TablesDestinationResult$],
		1
	];
	exports.MetadataTableEncryptionConfiguration$ = [
		3,
		n0,
		_MTEC,
		0,
		[_SAs, _KKA],
		[0, 0],
		1
	];
	exports.Metrics$ = [
		3,
		n0,
		_Me,
		0,
		[_S, _ETv],
		[0, () => exports.ReplicationTimeValue$],
		1
	];
	exports.MetricsAndOperator$ = [
		3,
		n0,
		_MAO,
		0,
		[
			_P,
			_T,
			_APAc
		],
		[
			0,
			[() => TagSet, {
				[_xF]: 1,
				[_xN]: _Ta
			}],
			0
		]
	];
	exports.MetricsConfiguration$ = [
		3,
		n0,
		_MCe,
		0,
		[_I, _F],
		[0, [() => exports.MetricsFilter$, 0]],
		1
	];
	exports.MultipartUpload$ = [
		3,
		n0,
		_MU,
		0,
		[
			_UI,
			_K,
			_Ini,
			_SC,
			_O,
			_In,
			_CA,
			_CT
		],
		[
			0,
			0,
			4,
			0,
			() => exports.Owner$,
			() => exports.Initiator$,
			0,
			0
		]
	];
	exports.NoncurrentVersionExpiration$ = [
		3,
		n0,
		_NVE,
		0,
		[_ND, _NNV],
		[1, 1]
	];
	exports.NoncurrentVersionTransition$ = [
		3,
		n0,
		_NVTo,
		0,
		[
			_ND,
			_SC,
			_NNV
		],
		[
			1,
			0,
			1
		]
	];
	exports.NotificationConfiguration$ = [
		3,
		n0,
		_NC,
		0,
		[
			_TCo,
			_QCu,
			_LFCa,
			_EBC
		],
		[
			[() => TopicConfigurationList, {
				[_xF]: 1,
				[_xN]: _TCop
			}],
			[() => QueueConfigurationList, {
				[_xF]: 1,
				[_xN]: _QCue
			}],
			[() => LambdaFunctionConfigurationList, {
				[_xF]: 1,
				[_xN]: _CFC
			}],
			() => exports.EventBridgeConfiguration$
		]
	];
	exports.NotificationConfigurationFilter$ = [
		3,
		n0,
		_NCF,
		0,
		[_K],
		[[() => exports.S3KeyFilter$, { [_xN]: _SKe }]]
	];
	exports._Object$ = [
		3,
		n0,
		_Obj,
		0,
		[
			_K,
			_LM,
			_ETa,
			_CA,
			_CT,
			_Si,
			_SC,
			_O,
			_RSe
		],
		[
			0,
			4,
			0,
			[64, { [_xF]: 1 }],
			0,
			1,
			0,
			() => exports.Owner$,
			() => exports.RestoreStatus$
		]
	];
	exports.ObjectIdentifier$ = [
		3,
		n0,
		_OI,
		0,
		[
			_K,
			_VI,
			_ETa,
			_LMT,
			_Si
		],
		[
			0,
			0,
			0,
			6,
			1
		],
		1
	];
	exports.ObjectLockConfiguration$ = [
		3,
		n0,
		_OLC,
		0,
		[_OLE, _Ru],
		[0, () => exports.ObjectLockRule$]
	];
	exports.ObjectLockLegalHold$ = [
		3,
		n0,
		_OLLH,
		0,
		[_S],
		[0]
	];
	exports.ObjectLockRetention$ = [
		3,
		n0,
		_OLR,
		0,
		[_Mo, _RUD],
		[0, 5]
	];
	exports.ObjectLockRule$ = [
		3,
		n0,
		_OLRb,
		0,
		[_DRe],
		[() => exports.DefaultRetention$]
	];
	exports.ObjectPart$ = [
		3,
		n0,
		_OPb,
		0,
		[
			_PN,
			_Si,
			_CCRC,
			_CCRCC,
			_CCRCNVME,
			_CSHA,
			_CSHAh,
			_CSHAhe,
			_CMD,
			_CXXHASH,
			_CXXHASHh,
			_CXXHASHhe
		],
		[
			1,
			1,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0
		]
	];
	exports.ObjectVersion$ = [
		3,
		n0,
		_OV,
		0,
		[
			_ETa,
			_CA,
			_CT,
			_Si,
			_SC,
			_K,
			_VI,
			_IL,
			_LM,
			_O,
			_RSe
		],
		[
			0,
			[64, { [_xF]: 1 }],
			0,
			1,
			0,
			0,
			0,
			2,
			4,
			() => exports.Owner$,
			() => exports.RestoreStatus$
		]
	];
	exports.OutputLocation$ = [
		3,
		n0,
		_OL,
		0,
		[_S_],
		[[() => exports.S3Location$, 0]]
	];
	exports.OutputSerialization$ = [
		3,
		n0,
		_OSu,
		0,
		[_CSV, _JSON],
		[() => exports.CSVOutput$, () => exports.JSONOutput$]
	];
	exports.Owner$ = [
		3,
		n0,
		_O,
		0,
		[_DN, _ID],
		[0, 0]
	];
	exports.OwnershipControls$ = [
		3,
		n0,
		_OC,
		0,
		[_R],
		[[() => OwnershipControlsRules, {
			[_xF]: 1,
			[_xN]: _Ru
		}]],
		1
	];
	exports.OwnershipControlsRule$ = [
		3,
		n0,
		_OCR,
		0,
		[_OO],
		[0],
		1
	];
	exports.ParquetInput$ = [
		3,
		n0,
		_PI,
		0,
		[],
		[]
	];
	exports.Part$ = [
		3,
		n0,
		_Par,
		0,
		[
			_PN,
			_LM,
			_ETa,
			_Si,
			_CCRC,
			_CCRCC,
			_CCRCNVME,
			_CSHA,
			_CSHAh,
			_CSHAhe,
			_CMD,
			_CXXHASH,
			_CXXHASHh,
			_CXXHASHhe
		],
		[
			1,
			4,
			0,
			1,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0
		]
	];
	exports.PartitionedPrefix$ = [
		3,
		n0,
		_PP,
		{ [_xN]: _PP },
		[_PDS],
		[0]
	];
	exports.PolicyStatus$ = [
		3,
		n0,
		_PS,
		0,
		[_IP],
		[[2, { [_xN]: _IP }]]
	];
	exports.Progress$ = [
		3,
		n0,
		_Pr,
		0,
		[
			_BS,
			_BP,
			_BRy
		],
		[
			1,
			1,
			1
		]
	];
	exports.ProgressEvent$ = [
		3,
		n0,
		_PE,
		0,
		[_Det],
		[[() => exports.Progress$, { [_eP]: 1 }]]
	];
	exports.PublicAccessBlockConfiguration$ = [
		3,
		n0,
		_PABC,
		0,
		[
			_BPA,
			_IPA,
			_BPP,
			_RPB
		],
		[
			[2, { [_xN]: _BPA }],
			[2, { [_xN]: _IPA }],
			[2, { [_xN]: _BPP }],
			[2, { [_xN]: _RPB }]
		]
	];
	exports.PutBucketAbacRequest$ = [
		3,
		n0,
		_PBAR,
		0,
		[
			_B,
			_AS,
			_CMDo,
			_CA,
			_EBO
		],
		[
			[0, 1],
			[() => exports.AbacStatus$, {
				[_hP]: 1,
				[_xN]: _AS
			}],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.PutBucketAccelerateConfigurationRequest$ = [
		3,
		n0,
		_PBACR,
		0,
		[
			_B,
			_AC,
			_EBO,
			_CA
		],
		[
			[0, 1],
			[() => exports.AccelerateConfiguration$, {
				[_hP]: 1,
				[_xN]: _AC
			}],
			[0, { [_hH]: _xaebo }],
			[0, { [_hH]: _xasca }]
		],
		2
	];
	exports.PutBucketAclRequest$ = [
		3,
		n0,
		_PBARu,
		0,
		[
			_B,
			_ACL_,
			_ACP,
			_CMDo,
			_CA,
			_GFC,
			_GR,
			_GRACP,
			_GW,
			_GWACP,
			_EBO
		],
		[
			[0, 1],
			[0, { [_hH]: _xaa }],
			[() => exports.AccessControlPolicy$, {
				[_hP]: 1,
				[_xN]: _ACP
			}],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xagfc }],
			[0, { [_hH]: _xagr }],
			[0, { [_hH]: _xagra }],
			[0, { [_hH]: _xagw }],
			[0, { [_hH]: _xagwa }],
			[0, { [_hH]: _xaebo }]
		],
		1
	];
	exports.PutBucketAnalyticsConfigurationRequest$ = [
		3,
		n0,
		_PBACRu,
		0,
		[
			_B,
			_I,
			_ACn,
			_EBO
		],
		[
			[0, 1],
			[0, { [_hQ]: _i }],
			[() => exports.AnalyticsConfiguration$, {
				[_hP]: 1,
				[_xN]: _ACn
			}],
			[0, { [_hH]: _xaebo }]
		],
		3
	];
	exports.PutBucketCorsRequest$ = [
		3,
		n0,
		_PBCR,
		0,
		[
			_B,
			_CORSC,
			_CMDo,
			_CA,
			_EBO
		],
		[
			[0, 1],
			[() => exports.CORSConfiguration$, {
				[_hP]: 1,
				[_xN]: _CORSC
			}],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.PutBucketEncryptionRequest$ = [
		3,
		n0,
		_PBER,
		0,
		[
			_B,
			_SSEC,
			_CMDo,
			_CA,
			_EBO
		],
		[
			[0, 1],
			[() => exports.ServerSideEncryptionConfiguration$, {
				[_hP]: 1,
				[_xN]: _SSEC
			}],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.PutBucketIntelligentTieringConfigurationRequest$ = [
		3,
		n0,
		_PBITCR,
		0,
		[
			_B,
			_I,
			_ITC,
			_EBO
		],
		[
			[0, 1],
			[0, { [_hQ]: _i }],
			[() => exports.IntelligentTieringConfiguration$, {
				[_hP]: 1,
				[_xN]: _ITC
			}],
			[0, { [_hH]: _xaebo }]
		],
		3
	];
	exports.PutBucketInventoryConfigurationRequest$ = [
		3,
		n0,
		_PBICR,
		0,
		[
			_B,
			_I,
			_IC,
			_EBO
		],
		[
			[0, 1],
			[0, { [_hQ]: _i }],
			[() => exports.InventoryConfiguration$, {
				[_hP]: 1,
				[_xN]: _IC
			}],
			[0, { [_hH]: _xaebo }]
		],
		3
	];
	exports.PutBucketLifecycleConfigurationOutput$ = [
		3,
		n0,
		_PBLCO,
		0,
		[_TDMOS],
		[[0, { [_hH]: _xatdmos }]]
	];
	exports.PutBucketLifecycleConfigurationRequest$ = [
		3,
		n0,
		_PBLCR,
		0,
		[
			_B,
			_CA,
			_LCi,
			_EBO,
			_TDMOS
		],
		[
			[0, 1],
			[0, { [_hH]: _xasca }],
			[() => exports.BucketLifecycleConfiguration$, {
				[_hP]: 1,
				[_xN]: _LCi
			}],
			[0, { [_hH]: _xaebo }],
			[0, { [_hH]: _xatdmos }]
		],
		1
	];
	exports.PutBucketLoggingRequest$ = [
		3,
		n0,
		_PBLR,
		0,
		[
			_B,
			_BLS,
			_CMDo,
			_CA,
			_EBO
		],
		[
			[0, 1],
			[() => exports.BucketLoggingStatus$, {
				[_hP]: 1,
				[_xN]: _BLS
			}],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.PutBucketMetricsConfigurationRequest$ = [
		3,
		n0,
		_PBMCR,
		0,
		[
			_B,
			_I,
			_MCe,
			_EBO
		],
		[
			[0, 1],
			[0, { [_hQ]: _i }],
			[() => exports.MetricsConfiguration$, {
				[_hP]: 1,
				[_xN]: _MCe
			}],
			[0, { [_hH]: _xaebo }]
		],
		3
	];
	exports.PutBucketNotificationConfigurationRequest$ = [
		3,
		n0,
		_PBNCR,
		0,
		[
			_B,
			_NC,
			_EBO,
			_SDV
		],
		[
			[0, 1],
			[() => exports.NotificationConfiguration$, {
				[_hP]: 1,
				[_xN]: _NC
			}],
			[0, { [_hH]: _xaebo }],
			[2, { [_hH]: _xasdv }]
		],
		2
	];
	exports.PutBucketOwnershipControlsRequest$ = [
		3,
		n0,
		_PBOCR,
		0,
		[
			_B,
			_OC,
			_CMDo,
			_EBO,
			_CA
		],
		[
			[0, 1],
			[() => exports.OwnershipControls$, {
				[_hP]: 1,
				[_xN]: _OC
			}],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xaebo }],
			[0, { [_hH]: _xasca }]
		],
		2
	];
	exports.PutBucketPolicyRequest$ = [
		3,
		n0,
		_PBPR,
		0,
		[
			_B,
			_Po,
			_CMDo,
			_CA,
			_CRSBA,
			_EBO
		],
		[
			[0, 1],
			[0, 16],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[2, { [_hH]: _xacrsba }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.PutBucketReplicationRequest$ = [
		3,
		n0,
		_PBRR,
		0,
		[
			_B,
			_RCe,
			_CMDo,
			_CA,
			_To,
			_EBO
		],
		[
			[0, 1],
			[() => exports.ReplicationConfiguration$, {
				[_hP]: 1,
				[_xN]: _RCe
			}],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xabolt }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.PutBucketRequestPaymentRequest$ = [
		3,
		n0,
		_PBRPR,
		0,
		[
			_B,
			_RPC,
			_CMDo,
			_CA,
			_EBO
		],
		[
			[0, 1],
			[() => exports.RequestPaymentConfiguration$, {
				[_hP]: 1,
				[_xN]: _RPC
			}],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.PutBucketTaggingRequest$ = [
		3,
		n0,
		_PBTR,
		0,
		[
			_B,
			_Tag,
			_CMDo,
			_CA,
			_EBO
		],
		[
			[0, 1],
			[() => exports.Tagging$, {
				[_hP]: 1,
				[_xN]: _Tag
			}],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.PutBucketVersioningRequest$ = [
		3,
		n0,
		_PBVR,
		0,
		[
			_B,
			_VC,
			_CMDo,
			_CA,
			_MFA,
			_EBO
		],
		[
			[0, 1],
			[() => exports.VersioningConfiguration$, {
				[_hP]: 1,
				[_xN]: _VC
			}],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xam_ }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.PutBucketWebsiteRequest$ = [
		3,
		n0,
		_PBWR,
		0,
		[
			_B,
			_WC,
			_CMDo,
			_CA,
			_EBO
		],
		[
			[0, 1],
			[() => exports.WebsiteConfiguration$, {
				[_hP]: 1,
				[_xN]: _WC
			}],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.PutObjectAclOutput$ = [
		3,
		n0,
		_POAO,
		0,
		[_RC],
		[[0, { [_hH]: _xarc }]]
	];
	exports.PutObjectAclRequest$ = [
		3,
		n0,
		_POAR,
		0,
		[
			_B,
			_K,
			_ACL_,
			_ACP,
			_CMDo,
			_CA,
			_GFC,
			_GR,
			_GRACP,
			_GW,
			_GWACP,
			_RP,
			_VI,
			_EBO
		],
		[
			[0, 1],
			[0, 1],
			[0, { [_hH]: _xaa }],
			[() => exports.AccessControlPolicy$, {
				[_hP]: 1,
				[_xN]: _ACP
			}],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xagfc }],
			[0, { [_hH]: _xagr }],
			[0, { [_hH]: _xagra }],
			[0, { [_hH]: _xagw }],
			[0, { [_hH]: _xagwa }],
			[0, { [_hH]: _xarp }],
			[0, { [_hQ]: _vI }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.PutObjectLegalHoldOutput$ = [
		3,
		n0,
		_POLHO,
		0,
		[_RC],
		[[0, { [_hH]: _xarc }]]
	];
	exports.PutObjectLegalHoldRequest$ = [
		3,
		n0,
		_POLHR,
		0,
		[
			_B,
			_K,
			_LH,
			_RP,
			_VI,
			_CMDo,
			_CA,
			_EBO
		],
		[
			[0, 1],
			[0, 1],
			[() => exports.ObjectLockLegalHold$, {
				[_hP]: 1,
				[_xN]: _LH
			}],
			[0, { [_hH]: _xarp }],
			[0, { [_hQ]: _vI }],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.PutObjectLockConfigurationOutput$ = [
		3,
		n0,
		_POLCO,
		0,
		[_RC],
		[[0, { [_hH]: _xarc }]]
	];
	exports.PutObjectLockConfigurationRequest$ = [
		3,
		n0,
		_POLCR,
		0,
		[
			_B,
			_OLC,
			_RP,
			_To,
			_CMDo,
			_CA,
			_EBO
		],
		[
			[0, 1],
			[() => exports.ObjectLockConfiguration$, {
				[_hP]: 1,
				[_xN]: _OLC
			}],
			[0, { [_hH]: _xarp }],
			[0, { [_hH]: _xabolt }],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xaebo }]
		],
		1
	];
	exports.PutObjectOutput$ = [
		3,
		n0,
		_POO,
		0,
		[
			_E,
			_ETa,
			_CCRC,
			_CCRCC,
			_CCRCNVME,
			_CSHA,
			_CSHAh,
			_CSHAhe,
			_CMD,
			_CXXHASH,
			_CXXHASHh,
			_CXXHASHhe,
			_CT,
			_SSE,
			_VI,
			_SSECA,
			_SSECKMD,
			_SSEKMSKI,
			_SSEKMSEC,
			_BKE,
			_Si,
			_RC
		],
		[
			[0, { [_hH]: _xae }],
			[0, { [_hH]: _ETa }],
			[0, { [_hH]: _xacc }],
			[0, { [_hH]: _xacc_ }],
			[0, { [_hH]: _xacc__ }],
			[0, { [_hH]: _xacs }],
			[0, { [_hH]: _xacs_ }],
			[0, { [_hH]: _xacs__ }],
			[0, { [_hH]: _xacm }],
			[0, { [_hH]: _xacx }],
			[0, { [_hH]: _xacx_ }],
			[0, { [_hH]: _xacx__ }],
			[0, { [_hH]: _xact }],
			[0, { [_hH]: _xasse }],
			[0, { [_hH]: _xavi }],
			[0, { [_hH]: _xasseca }],
			[0, { [_hH]: _xasseckM }],
			[() => SSEKMSKeyId, { [_hH]: _xasseakki }],
			[() => SSEKMSEncryptionContext, { [_hH]: _xassec }],
			[2, { [_hH]: _xassebke }],
			[1, { [_hH]: _xaos }],
			[0, { [_hH]: _xarc }]
		]
	];
	exports.PutObjectRequest$ = [
		3,
		n0,
		_POR,
		0,
		[
			_B,
			_K,
			_ACL_,
			_Bo,
			_CC,
			_CDo,
			_CEo,
			_CL,
			_CLo,
			_CMDo,
			_CTo,
			_CA,
			_CCRC,
			_CCRCC,
			_CCRCNVME,
			_CSHA,
			_CSHAh,
			_CSHAhe,
			_CMD,
			_CXXHASH,
			_CXXHASHh,
			_CXXHASHhe,
			_Ex,
			_IM,
			_INM,
			_GFC,
			_GR,
			_GRACP,
			_GWACP,
			_WOB,
			_M,
			_SSE,
			_SC,
			_WRL,
			_SSECA,
			_SSECK,
			_SSECKMD,
			_SSEKMSKI,
			_SSEKMSEC,
			_BKE,
			_RP,
			_Tag,
			_OLM,
			_OLRUD,
			_OLLHS,
			_EBO
		],
		[
			[0, 1],
			[0, 1],
			[0, { [_hH]: _xaa }],
			[() => StreamingBlob, 16],
			[0, { [_hH]: _CC_ }],
			[0, { [_hH]: _CD_ }],
			[0, { [_hH]: _CE_ }],
			[0, { [_hH]: _CL_ }],
			[1, { [_hH]: _CL__ }],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _CT_ }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xacc }],
			[0, { [_hH]: _xacc_ }],
			[0, { [_hH]: _xacc__ }],
			[0, { [_hH]: _xacs }],
			[0, { [_hH]: _xacs_ }],
			[0, { [_hH]: _xacs__ }],
			[0, { [_hH]: _xacm }],
			[0, { [_hH]: _xacx }],
			[0, { [_hH]: _xacx_ }],
			[0, { [_hH]: _xacx__ }],
			[4, { [_hH]: _Ex }],
			[0, { [_hH]: _IM_ }],
			[0, { [_hH]: _INM_ }],
			[0, { [_hH]: _xagfc }],
			[0, { [_hH]: _xagr }],
			[0, { [_hH]: _xagra }],
			[0, { [_hH]: _xagwa }],
			[1, { [_hH]: _xawob }],
			[128, { [_hPH]: _xam }],
			[0, { [_hH]: _xasse }],
			[0, { [_hH]: _xasc }],
			[0, { [_hH]: _xawrl }],
			[0, { [_hH]: _xasseca }],
			[() => SSECustomerKey, { [_hH]: _xasseck }],
			[0, { [_hH]: _xasseckM }],
			[() => SSEKMSKeyId, { [_hH]: _xasseakki }],
			[() => SSEKMSEncryptionContext, { [_hH]: _xassec }],
			[2, { [_hH]: _xassebke }],
			[0, { [_hH]: _xarp }],
			[0, { [_hH]: _xat }],
			[0, { [_hH]: _xaolm }],
			[5, { [_hH]: _xaolrud }],
			[0, { [_hH]: _xaollh }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.PutObjectRetentionOutput$ = [
		3,
		n0,
		_PORO,
		0,
		[_RC],
		[[0, { [_hH]: _xarc }]]
	];
	exports.PutObjectRetentionRequest$ = [
		3,
		n0,
		_PORR,
		0,
		[
			_B,
			_K,
			_Ret,
			_RP,
			_VI,
			_BGR,
			_CMDo,
			_CA,
			_EBO
		],
		[
			[0, 1],
			[0, 1],
			[() => exports.ObjectLockRetention$, {
				[_hP]: 1,
				[_xN]: _Ret
			}],
			[0, { [_hH]: _xarp }],
			[0, { [_hQ]: _vI }],
			[2, { [_hH]: _xabgr }],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.PutObjectTaggingOutput$ = [
		3,
		n0,
		_POTO,
		0,
		[_VI],
		[[0, { [_hH]: _xavi }]]
	];
	exports.PutObjectTaggingRequest$ = [
		3,
		n0,
		_POTR,
		0,
		[
			_B,
			_K,
			_Tag,
			_VI,
			_CMDo,
			_CA,
			_EBO,
			_RP
		],
		[
			[0, 1],
			[0, 1],
			[() => exports.Tagging$, {
				[_hP]: 1,
				[_xN]: _Tag
			}],
			[0, { [_hQ]: _vI }],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xaebo }],
			[0, { [_hH]: _xarp }]
		],
		3
	];
	exports.PutPublicAccessBlockRequest$ = [
		3,
		n0,
		_PPABR,
		0,
		[
			_B,
			_PABC,
			_CMDo,
			_CA,
			_EBO
		],
		[
			[0, 1],
			[() => exports.PublicAccessBlockConfiguration$, {
				[_hP]: 1,
				[_xN]: _PABC
			}],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.QueueConfiguration$ = [
		3,
		n0,
		_QCue,
		0,
		[
			_QA,
			_Ev,
			_I,
			_F
		],
		[
			[0, { [_xN]: _Qu }],
			[64, {
				[_xF]: 1,
				[_xN]: _Eve
			}],
			0,
			[() => exports.NotificationConfigurationFilter$, 0]
		],
		2
	];
	exports.RecordExpiration$ = [
		3,
		n0,
		_REe,
		0,
		[_E, _D],
		[0, 1],
		1
	];
	exports.RecordsEvent$ = [
		3,
		n0,
		_REec,
		0,
		[_Payl],
		[[21, { [_eP]: 1 }]]
	];
	exports.Redirect$ = [
		3,
		n0,
		_Red,
		0,
		[
			_HN,
			_HRC,
			_Pro,
			_RKPW,
			_RKW
		],
		[
			0,
			0,
			0,
			0,
			0
		]
	];
	exports.RedirectAllRequestsTo$ = [
		3,
		n0,
		_RART,
		0,
		[_HN, _Pro],
		[0, 0],
		1
	];
	exports.RenameObjectOutput$ = [
		3,
		n0,
		_ROO,
		0,
		[],
		[]
	];
	exports.RenameObjectRequest$ = [
		3,
		n0,
		_ROR,
		0,
		[
			_B,
			_K,
			_RSen,
			_DIM,
			_DINM,
			_DIMS,
			_DIUS,
			_SIM,
			_SINM,
			_SIMS,
			_SIUS,
			_CTl
		],
		[
			[0, 1],
			[0, 1],
			[0, { [_hH]: _xars_ }],
			[0, { [_hH]: _IM_ }],
			[0, { [_hH]: _INM_ }],
			[4, { [_hH]: _IMS_ }],
			[4, { [_hH]: _IUS_ }],
			[0, { [_hH]: _xarsim }],
			[0, { [_hH]: _xarsinm }],
			[6, { [_hH]: _xarsims }],
			[6, { [_hH]: _xarsius }],
			[0, {
				[_hH]: _xact_,
				[_iT]: 1
			}]
		],
		3
	];
	exports.ReplicaModifications$ = [
		3,
		n0,
		_RM,
		0,
		[_S],
		[0],
		1
	];
	exports.ReplicationConfiguration$ = [
		3,
		n0,
		_RCe,
		0,
		[_Ro, _R],
		[0, [() => ReplicationRules, {
			[_xF]: 1,
			[_xN]: _Ru
		}]],
		2
	];
	exports.ReplicationRule$ = [
		3,
		n0,
		_RRe,
		0,
		[
			_S,
			_Des,
			_ID,
			_Pri,
			_P,
			_F,
			_SSC,
			_EOR,
			_DMR
		],
		[
			0,
			() => exports.Destination$,
			0,
			1,
			0,
			[() => exports.ReplicationRuleFilter$, 0],
			() => exports.SourceSelectionCriteria$,
			() => exports.ExistingObjectReplication$,
			() => exports.DeleteMarkerReplication$
		],
		2
	];
	exports.ReplicationRuleAndOperator$ = [
		3,
		n0,
		_RRAO,
		0,
		[_P, _T],
		[0, [() => TagSet, {
			[_xF]: 1,
			[_xN]: _Ta
		}]]
	];
	exports.ReplicationRuleFilter$ = [
		3,
		n0,
		_RRF,
		0,
		[
			_P,
			_Ta,
			_An
		],
		[
			0,
			() => exports.Tag$,
			[() => exports.ReplicationRuleAndOperator$, 0]
		]
	];
	exports.ReplicationTime$ = [
		3,
		n0,
		_RT,
		0,
		[_S, _Tim],
		[0, () => exports.ReplicationTimeValue$],
		2
	];
	exports.ReplicationTimeValue$ = [
		3,
		n0,
		_RTV,
		0,
		[_Mi],
		[1]
	];
	exports.RequestPaymentConfiguration$ = [
		3,
		n0,
		_RPC,
		0,
		[_Pay],
		[0],
		1
	];
	exports.RequestProgress$ = [
		3,
		n0,
		_RPe,
		0,
		[_Ena],
		[2]
	];
	exports.RestoreObjectOutput$ = [
		3,
		n0,
		_ROOe,
		0,
		[_RC, _ROP],
		[[0, { [_hH]: _xarc }], [0, { [_hH]: _xarop }]]
	];
	exports.RestoreObjectRequest$ = [
		3,
		n0,
		_RORe,
		0,
		[
			_B,
			_K,
			_VI,
			_RRes,
			_RP,
			_CA,
			_EBO
		],
		[
			[0, 1],
			[0, 1],
			[0, { [_hQ]: _vI }],
			[() => exports.RestoreRequest$, {
				[_hP]: 1,
				[_xN]: _RRes
			}],
			[0, { [_hH]: _xarp }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.RestoreRequest$ = [
		3,
		n0,
		_RRes,
		0,
		[
			_D,
			_GJP,
			_Ty,
			_Ti,
			_Desc,
			_SP,
			_OL
		],
		[
			1,
			() => exports.GlacierJobParameters$,
			0,
			0,
			0,
			() => exports.SelectParameters$,
			[() => exports.OutputLocation$, 0]
		]
	];
	exports.RestoreStatus$ = [
		3,
		n0,
		_RSe,
		0,
		[_IRIP, _RED],
		[2, 4]
	];
	exports.RoutingRule$ = [
		3,
		n0,
		_RRo,
		0,
		[_Red, _Co],
		[() => exports.Redirect$, () => exports.Condition$],
		1
	];
	exports.S3KeyFilter$ = [
		3,
		n0,
		_SKF,
		0,
		[_FRi],
		[[() => FilterRuleList, {
			[_xF]: 1,
			[_xN]: _FR
		}]]
	];
	exports.S3Location$ = [
		3,
		n0,
		_SL,
		0,
		[
			_BNu,
			_P,
			_En,
			_CACL,
			_ACL,
			_Tag,
			_UM,
			_SC
		],
		[
			0,
			0,
			[() => exports.Encryption$, 0],
			0,
			[() => Grants, 0],
			[() => exports.Tagging$, 0],
			[() => UserMetadata, 0],
			0
		],
		2
	];
	exports.S3TablesDestination$ = [
		3,
		n0,
		_STD,
		0,
		[_TBA, _TNa],
		[0, 0],
		2
	];
	exports.S3TablesDestinationResult$ = [
		3,
		n0,
		_STDR,
		0,
		[
			_TBA,
			_TNa,
			_TA,
			_TN
		],
		[
			0,
			0,
			0,
			0
		],
		4
	];
	exports.ScanRange$ = [
		3,
		n0,
		_SR,
		0,
		[_St, _End],
		[1, 1]
	];
	exports.SelectObjectContentOutput$ = [
		3,
		n0,
		_SOCO,
		0,
		[_Payl],
		[[() => exports.SelectObjectContentEventStream$, 16]]
	];
	exports.SelectObjectContentRequest$ = [
		3,
		n0,
		_SOCR,
		0,
		[
			_B,
			_K,
			_Exp,
			_ETx,
			_IS,
			_OSu,
			_SSECA,
			_SSECK,
			_SSECKMD,
			_RPe,
			_SR,
			_EBO
		],
		[
			[0, 1],
			[0, 1],
			0,
			0,
			() => exports.InputSerialization$,
			() => exports.OutputSerialization$,
			[0, { [_hH]: _xasseca }],
			[() => SSECustomerKey, { [_hH]: _xasseck }],
			[0, { [_hH]: _xasseckM }],
			() => exports.RequestProgress$,
			() => exports.ScanRange$,
			[0, { [_hH]: _xaebo }]
		],
		6
	];
	exports.SelectParameters$ = [
		3,
		n0,
		_SP,
		0,
		[
			_IS,
			_ETx,
			_Exp,
			_OSu
		],
		[
			() => exports.InputSerialization$,
			0,
			0,
			() => exports.OutputSerialization$
		],
		4
	];
	exports.ServerSideEncryptionByDefault$ = [
		3,
		n0,
		_SSEBD,
		0,
		[_SSEA, _KMSMKID],
		[0, [() => SSEKMSKeyId, 0]],
		1
	];
	exports.ServerSideEncryptionConfiguration$ = [
		3,
		n0,
		_SSEC,
		0,
		[_R],
		[[() => ServerSideEncryptionRules, {
			[_xF]: 1,
			[_xN]: _Ru
		}]],
		1
	];
	exports.ServerSideEncryptionRule$ = [
		3,
		n0,
		_SSER,
		0,
		[
			_ASSEBD,
			_BKE,
			_BET
		],
		[
			[() => exports.ServerSideEncryptionByDefault$, 0],
			2,
			[() => exports.BlockedEncryptionTypes$, 0]
		]
	];
	exports.SessionCredentials$ = [
		3,
		n0,
		_SCe,
		0,
		[
			_AKI,
			_SAK,
			_ST,
			_E
		],
		[
			[0, { [_xN]: _AKI }],
			[() => SessionCredentialValue, { [_xN]: _SAK }],
			[() => SessionCredentialValue, { [_xN]: _ST }],
			[4, { [_xN]: _E }]
		],
		4
	];
	exports.SimplePrefix$ = [
		3,
		n0,
		_SPi,
		{ [_xN]: _SPi },
		[],
		[]
	];
	exports.SourceSelectionCriteria$ = [
		3,
		n0,
		_SSC,
		0,
		[_SKEO, _RM],
		[() => exports.SseKmsEncryptedObjects$, () => exports.ReplicaModifications$]
	];
	exports.SSEKMS$ = [
		3,
		n0,
		_SSEKMS,
		{ [_xN]: _SK },
		[_KI],
		[[() => SSEKMSKeyId, 0]],
		1
	];
	exports.SseKmsEncryptedObjects$ = [
		3,
		n0,
		_SKEO,
		0,
		[_S],
		[0],
		1
	];
	exports.SSEKMSEncryption$ = [
		3,
		n0,
		_SSEKMSE,
		{ [_xN]: _SK },
		[_KMSKA, _BKE],
		[[() => NonEmptyKmsKeyArnString, 0], 2],
		1
	];
	exports.SSES3$ = [
		3,
		n0,
		_SSES,
		{ [_xN]: _SS },
		[],
		[]
	];
	exports.Stats$ = [
		3,
		n0,
		_Sta,
		0,
		[
			_BS,
			_BP,
			_BRy
		],
		[
			1,
			1,
			1
		]
	];
	exports.StatsEvent$ = [
		3,
		n0,
		_SE,
		0,
		[_Det],
		[[() => exports.Stats$, { [_eP]: 1 }]]
	];
	exports.StorageClassAnalysis$ = [
		3,
		n0,
		_SCA,
		0,
		[_DE],
		[() => exports.StorageClassAnalysisDataExport$]
	];
	exports.StorageClassAnalysisDataExport$ = [
		3,
		n0,
		_SCADE,
		0,
		[_OSV, _Des],
		[0, () => exports.AnalyticsExportDestination$],
		2
	];
	exports.Tag$ = [
		3,
		n0,
		_Ta,
		0,
		[_K, _V],
		[0, 0],
		2
	];
	exports.Tagging$ = [
		3,
		n0,
		_Tag,
		0,
		[_TS],
		[[() => TagSet, 0]],
		1
	];
	exports.TargetGrant$ = [
		3,
		n0,
		_TGa,
		0,
		[_Gra, _Pe],
		[[() => exports.Grantee$, { [_xNm]: [_x, _hi] }], 0]
	];
	exports.TargetObjectKeyFormat$ = [
		3,
		n0,
		_TOKF,
		0,
		[_SPi, _PP],
		[[() => exports.SimplePrefix$, { [_xN]: _SPi }], [() => exports.PartitionedPrefix$, { [_xN]: _PP }]]
	];
	exports.Tiering$ = [
		3,
		n0,
		_Tier,
		0,
		[_D, _AT],
		[1, 0],
		2
	];
	exports.TopicConfiguration$ = [
		3,
		n0,
		_TCop,
		0,
		[
			_TAo,
			_Ev,
			_I,
			_F
		],
		[
			[0, { [_xN]: _Top }],
			[64, {
				[_xF]: 1,
				[_xN]: _Eve
			}],
			0,
			[() => exports.NotificationConfigurationFilter$, 0]
		],
		2
	];
	exports.Transition$ = [
		3,
		n0,
		_Tra,
		0,
		[
			_Da,
			_D,
			_SC
		],
		[
			5,
			1,
			0
		]
	];
	exports.UpdateBucketMetadataInventoryTableConfigurationRequest$ = [
		3,
		n0,
		_UBMITCR,
		0,
		[
			_B,
			_ITCn,
			_CMDo,
			_CA,
			_EBO
		],
		[
			[0, 1],
			[() => exports.InventoryTableConfigurationUpdates$, {
				[_hP]: 1,
				[_xN]: _ITCn
			}],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.UpdateBucketMetadataJournalTableConfigurationRequest$ = [
		3,
		n0,
		_UBMJTCR,
		0,
		[
			_B,
			_JTC,
			_CMDo,
			_CA,
			_EBO
		],
		[
			[0, 1],
			[() => exports.JournalTableConfigurationUpdates$, {
				[_hP]: 1,
				[_xN]: _JTC
			}],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xaebo }]
		],
		2
	];
	exports.UpdateObjectEncryptionRequest$ = [
		3,
		n0,
		_UOER,
		0,
		[
			_B,
			_K,
			_OE,
			_VI,
			_RP,
			_EBO,
			_CMDo,
			_CA
		],
		[
			[0, 1],
			[0, 1],
			[() => exports.ObjectEncryption$, 16],
			[0, { [_hQ]: _vI }],
			[0, { [_hH]: _xarp }],
			[0, { [_hH]: _xaebo }],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }]
		],
		3
	];
	exports.UpdateObjectEncryptionResponse$ = [
		3,
		n0,
		_UOERp,
		0,
		[_RC],
		[[0, { [_hH]: _xarc }]]
	];
	exports.UploadPartCopyOutput$ = [
		3,
		n0,
		_UPCO,
		0,
		[
			_CSVI,
			_CPR,
			_SSE,
			_SSECA,
			_SSECKMD,
			_SSEKMSKI,
			_BKE,
			_RC
		],
		[
			[0, { [_hH]: _xacsvi }],
			[() => exports.CopyPartResult$, 16],
			[0, { [_hH]: _xasse }],
			[0, { [_hH]: _xasseca }],
			[0, { [_hH]: _xasseckM }],
			[() => SSEKMSKeyId, { [_hH]: _xasseakki }],
			[2, { [_hH]: _xassebke }],
			[0, { [_hH]: _xarc }]
		]
	];
	exports.UploadPartCopyRequest$ = [
		3,
		n0,
		_UPCR,
		0,
		[
			_B,
			_CS,
			_K,
			_PN,
			_UI,
			_CSIM,
			_CSIMS,
			_CSINM,
			_CSIUS,
			_CSRo,
			_SSECA,
			_SSECK,
			_SSECKMD,
			_CSSSECA,
			_CSSSECK,
			_CSSSECKMD,
			_RP,
			_EBO,
			_ESBO
		],
		[
			[0, 1],
			[0, { [_hH]: _xacs___ }],
			[0, 1],
			[1, { [_hQ]: _pN }],
			[0, { [_hQ]: _uI }],
			[0, { [_hH]: _xacsim }],
			[4, { [_hH]: _xacsims }],
			[0, { [_hH]: _xacsinm }],
			[4, { [_hH]: _xacsius }],
			[0, { [_hH]: _xacsr }],
			[0, { [_hH]: _xasseca }],
			[() => SSECustomerKey, { [_hH]: _xasseck }],
			[0, { [_hH]: _xasseckM }],
			[0, { [_hH]: _xacssseca }],
			[() => CopySourceSSECustomerKey, { [_hH]: _xacssseck }],
			[0, { [_hH]: _xacssseckM }],
			[0, { [_hH]: _xarp }],
			[0, { [_hH]: _xaebo }],
			[0, { [_hH]: _xasebo }]
		],
		5
	];
	exports.UploadPartOutput$ = [
		3,
		n0,
		_UPO,
		0,
		[
			_SSE,
			_ETa,
			_CCRC,
			_CCRCC,
			_CCRCNVME,
			_CSHA,
			_CSHAh,
			_CSHAhe,
			_CMD,
			_CXXHASH,
			_CXXHASHh,
			_CXXHASHhe,
			_SSECA,
			_SSECKMD,
			_SSEKMSKI,
			_BKE,
			_RC
		],
		[
			[0, { [_hH]: _xasse }],
			[0, { [_hH]: _ETa }],
			[0, { [_hH]: _xacc }],
			[0, { [_hH]: _xacc_ }],
			[0, { [_hH]: _xacc__ }],
			[0, { [_hH]: _xacs }],
			[0, { [_hH]: _xacs_ }],
			[0, { [_hH]: _xacs__ }],
			[0, { [_hH]: _xacm }],
			[0, { [_hH]: _xacx }],
			[0, { [_hH]: _xacx_ }],
			[0, { [_hH]: _xacx__ }],
			[0, { [_hH]: _xasseca }],
			[0, { [_hH]: _xasseckM }],
			[() => SSEKMSKeyId, { [_hH]: _xasseakki }],
			[2, { [_hH]: _xassebke }],
			[0, { [_hH]: _xarc }]
		]
	];
	exports.UploadPartRequest$ = [
		3,
		n0,
		_UPR,
		0,
		[
			_B,
			_K,
			_PN,
			_UI,
			_Bo,
			_CLo,
			_CMDo,
			_CA,
			_CCRC,
			_CCRCC,
			_CCRCNVME,
			_CSHA,
			_CSHAh,
			_CSHAhe,
			_CMD,
			_CXXHASH,
			_CXXHASHh,
			_CXXHASHhe,
			_SSECA,
			_SSECK,
			_SSECKMD,
			_RP,
			_EBO
		],
		[
			[0, 1],
			[0, 1],
			[1, { [_hQ]: _pN }],
			[0, { [_hQ]: _uI }],
			[() => StreamingBlob, 16],
			[1, { [_hH]: _CL__ }],
			[0, { [_hH]: _CM }],
			[0, { [_hH]: _xasca }],
			[0, { [_hH]: _xacc }],
			[0, { [_hH]: _xacc_ }],
			[0, { [_hH]: _xacc__ }],
			[0, { [_hH]: _xacs }],
			[0, { [_hH]: _xacs_ }],
			[0, { [_hH]: _xacs__ }],
			[0, { [_hH]: _xacm }],
			[0, { [_hH]: _xacx }],
			[0, { [_hH]: _xacx_ }],
			[0, { [_hH]: _xacx__ }],
			[0, { [_hH]: _xasseca }],
			[() => SSECustomerKey, { [_hH]: _xasseck }],
			[0, { [_hH]: _xasseckM }],
			[0, { [_hH]: _xarp }],
			[0, { [_hH]: _xaebo }]
		],
		4
	];
	exports.VersioningConfiguration$ = [
		3,
		n0,
		_VC,
		0,
		[_MFAD, _S],
		[[0, { [_xN]: _MDf }], 0]
	];
	exports.WebsiteConfiguration$ = [
		3,
		n0,
		_WC,
		0,
		[
			_EDr,
			_IDn,
			_RART,
			_RR
		],
		[
			() => exports.ErrorDocument$,
			() => exports.IndexDocument$,
			() => exports.RedirectAllRequestsTo$,
			[() => RoutingRules, 0]
		]
	];
	exports.WriteGetObjectResponseRequest$ = [
		3,
		n0,
		_WGORR,
		0,
		[
			_RReq,
			_RTe,
			_Bo,
			_SCt,
			_ECr,
			_EM,
			_AR,
			_CC,
			_CDo,
			_CEo,
			_CL,
			_CLo,
			_CR,
			_CTo,
			_CCRC,
			_CCRCC,
			_CCRCNVME,
			_CSHA,
			_CSHAh,
			_CSHAhe,
			_CMD,
			_CXXHASH,
			_CXXHASHh,
			_CXXHASHhe,
			_DM,
			_ETa,
			_Ex,
			_E,
			_LM,
			_MM,
			_M,
			_OLM,
			_OLLHS,
			_OLRUD,
			_PC,
			_RS,
			_RC,
			_Re,
			_SSE,
			_SSECA,
			_SSEKMSKI,
			_SSECKMD,
			_SC,
			_TC,
			_VI,
			_BKE
		],
		[
			[0, {
				[_hL]: 1,
				[_hH]: _xarr
			}],
			[0, { [_hH]: _xart }],
			[() => StreamingBlob, 16],
			[1, { [_hH]: _xafs }],
			[0, { [_hH]: _xafec }],
			[0, { [_hH]: _xafem }],
			[0, { [_hH]: _xafhar }],
			[0, { [_hH]: _xafhCC }],
			[0, { [_hH]: _xafhCD }],
			[0, { [_hH]: _xafhCE }],
			[0, { [_hH]: _xafhCL }],
			[1, { [_hH]: _CL__ }],
			[0, { [_hH]: _xafhCR }],
			[0, { [_hH]: _xafhCT }],
			[0, { [_hH]: _xafhxacc }],
			[0, { [_hH]: _xafhxacc_ }],
			[0, { [_hH]: _xafhxacc__ }],
			[0, { [_hH]: _xafhxacs }],
			[0, { [_hH]: _xafhxacs_ }],
			[0, { [_hH]: _xafhxacs__ }],
			[0, { [_hH]: _xafhxacm }],
			[0, { [_hH]: _xafhxacx }],
			[0, { [_hH]: _xafhxacx_ }],
			[0, { [_hH]: _xafhxacx__ }],
			[2, { [_hH]: _xafhxadm }],
			[0, { [_hH]: _xafhE }],
			[4, { [_hH]: _xafhE_ }],
			[0, { [_hH]: _xafhxae }],
			[4, { [_hH]: _xafhLM }],
			[1, { [_hH]: _xafhxamm }],
			[128, { [_hPH]: _xam }],
			[0, { [_hH]: _xafhxaolm }],
			[0, { [_hH]: _xafhxaollh }],
			[5, { [_hH]: _xafhxaolrud }],
			[1, { [_hH]: _xafhxampc }],
			[0, { [_hH]: _xafhxars }],
			[0, { [_hH]: _xafhxarc }],
			[0, { [_hH]: _xafhxar }],
			[0, { [_hH]: _xafhxasse }],
			[0, { [_hH]: _xafhxasseca }],
			[() => SSEKMSKeyId, { [_hH]: _xafhxasseakki }],
			[0, { [_hH]: _xafhxasseckM }],
			[0, { [_hH]: _xafhxasc }],
			[1, { [_hH]: _xafhxatc }],
			[0, { [_hH]: _xafhxavi }],
			[2, { [_hH]: _xafhxassebke }]
		],
		2
	];
	var __Unit = "unit";
	var AnalyticsConfigurationList = [
		1,
		n0,
		_ACLn,
		0,
		[() => exports.AnalyticsConfiguration$, 0]
	];
	var Buckets = [
		1,
		n0,
		_Bu,
		0,
		[() => exports.Bucket$, { [_xN]: _B }]
	];
	var CommonPrefixList = [
		1,
		n0,
		_CPL,
		0,
		() => exports.CommonPrefix$
	];
	var CompletedPartList = [
		1,
		n0,
		_CPLo,
		0,
		() => exports.CompletedPart$
	];
	var CORSRules = [
		1,
		n0,
		_CORSR,
		0,
		[() => exports.CORSRule$, 0]
	];
	var DeletedObjects = [
		1,
		n0,
		_DOe,
		0,
		() => exports.DeletedObject$
	];
	var DeleteMarkers = [
		1,
		n0,
		_DMe,
		0,
		() => exports.DeleteMarkerEntry$
	];
	var EncryptionTypeList = [
		1,
		n0,
		_ETL,
		0,
		[0, { [_xN]: _ET }]
	];
	var Errors = [
		1,
		n0,
		_Er,
		0,
		() => exports._Error$
	];
	var FilterRuleList = [
		1,
		n0,
		_FRL,
		0,
		() => exports.FilterRule$
	];
	var Grants = [
		1,
		n0,
		_G,
		0,
		[() => exports.Grant$, { [_xN]: _Gr }]
	];
	var IntelligentTieringConfigurationList = [
		1,
		n0,
		_ITCL,
		0,
		[() => exports.IntelligentTieringConfiguration$, 0]
	];
	var InventoryConfigurationList = [
		1,
		n0,
		_ICL,
		0,
		[() => exports.InventoryConfiguration$, 0]
	];
	var InventoryOptionalFields = [
		1,
		n0,
		_IOF,
		0,
		[0, { [_xN]: _Fi }]
	];
	var LambdaFunctionConfigurationList = [
		1,
		n0,
		_LFCL,
		0,
		[() => exports.LambdaFunctionConfiguration$, 0]
	];
	var LifecycleRules = [
		1,
		n0,
		_LRi,
		0,
		[() => exports.LifecycleRule$, 0]
	];
	var MetricsConfigurationList = [
		1,
		n0,
		_MCL,
		0,
		[() => exports.MetricsConfiguration$, 0]
	];
	var MultipartUploadList = [
		1,
		n0,
		_MUL,
		0,
		() => exports.MultipartUpload$
	];
	var NoncurrentVersionTransitionList = [
		1,
		n0,
		_NVTL,
		0,
		() => exports.NoncurrentVersionTransition$
	];
	var ObjectIdentifierList = [
		1,
		n0,
		_OIL,
		0,
		() => exports.ObjectIdentifier$
	];
	var ObjectList = [
		1,
		n0,
		_OLb,
		0,
		[() => exports._Object$, 0]
	];
	var ObjectVersionList = [
		1,
		n0,
		_OVL,
		0,
		[() => exports.ObjectVersion$, 0]
	];
	var OwnershipControlsRules = [
		1,
		n0,
		_OCRw,
		0,
		() => exports.OwnershipControlsRule$
	];
	var Parts = [
		1,
		n0,
		_Pa,
		0,
		() => exports.Part$
	];
	var PartsList = [
		1,
		n0,
		_PL,
		0,
		() => exports.ObjectPart$
	];
	var QueueConfigurationList = [
		1,
		n0,
		_QCL,
		0,
		[() => exports.QueueConfiguration$, 0]
	];
	var ReplicationRules = [
		1,
		n0,
		_RRep,
		0,
		[() => exports.ReplicationRule$, 0]
	];
	var RoutingRules = [
		1,
		n0,
		_RR,
		0,
		[() => exports.RoutingRule$, { [_xN]: _RRo }]
	];
	var ServerSideEncryptionRules = [
		1,
		n0,
		_SSERe,
		0,
		[() => exports.ServerSideEncryptionRule$, 0]
	];
	var TagSet = [
		1,
		n0,
		_TS,
		0,
		[() => exports.Tag$, { [_xN]: _Ta }]
	];
	var TargetGrants = [
		1,
		n0,
		_TG,
		0,
		[() => exports.TargetGrant$, { [_xN]: _Gr }]
	];
	var TieringList = [
		1,
		n0,
		_TL,
		0,
		() => exports.Tiering$
	];
	var TopicConfigurationList = [
		1,
		n0,
		_TCL,
		0,
		[() => exports.TopicConfiguration$, 0]
	];
	var TransitionList = [
		1,
		n0,
		_TLr,
		0,
		() => exports.Transition$
	];
	var UserMetadata = [
		1,
		n0,
		_UM,
		0,
		[() => exports.MetadataEntry$, { [_xN]: _ME }]
	];
	exports.AnalyticsFilter$ = [
		4,
		n0,
		_AF,
		0,
		[
			_P,
			_Ta,
			_An
		],
		[
			0,
			() => exports.Tag$,
			[() => exports.AnalyticsAndOperator$, 0]
		]
	];
	exports.MetricsFilter$ = [
		4,
		n0,
		_MF,
		0,
		[
			_P,
			_Ta,
			_APAc,
			_An
		],
		[
			0,
			() => exports.Tag$,
			0,
			[() => exports.MetricsAndOperator$, 0]
		]
	];
	exports.ObjectEncryption$ = [
		4,
		n0,
		_OE,
		0,
		[_SSEKMS],
		[[() => exports.SSEKMSEncryption$, { [_xN]: _SK }]]
	];
	exports.SelectObjectContentEventStream$ = [
		4,
		n0,
		_SOCES,
		{ [_st]: 1 },
		[
			_Rec,
			_Sta,
			_Pr,
			_Cont,
			_End
		],
		[
			[() => exports.RecordsEvent$, 0],
			[() => exports.StatsEvent$, 0],
			[() => exports.ProgressEvent$, 0],
			() => exports.ContinuationEvent$,
			() => exports.EndEvent$
		]
	];
	exports.AbortMultipartUpload$ = [
		9,
		n0,
		_AMU,
		{ [_h]: [
			"DELETE",
			"/{Key+}?x-id=AbortMultipartUpload",
			204
		] },
		() => exports.AbortMultipartUploadRequest$,
		() => exports.AbortMultipartUploadOutput$
	];
	exports.CompleteMultipartUpload$ = [
		9,
		n0,
		_CMUo,
		{ [_h]: [
			"POST",
			"/{Key+}",
			200
		] },
		() => exports.CompleteMultipartUploadRequest$,
		() => exports.CompleteMultipartUploadOutput$
	];
	exports.CopyObject$ = [
		9,
		n0,
		_CO,
		{ [_h]: [
			"PUT",
			"/{Key+}?x-id=CopyObject",
			200
		] },
		() => exports.CopyObjectRequest$,
		() => exports.CopyObjectOutput$
	];
	exports.CreateBucket$ = [
		9,
		n0,
		_CB,
		{ [_h]: [
			"PUT",
			"/",
			200
		] },
		() => exports.CreateBucketRequest$,
		() => exports.CreateBucketOutput$
	];
	exports.CreateBucketMetadataConfiguration$ = [
		9,
		n0,
		_CBMC,
		{
			[_hC]: "-",
			[_h]: [
				"POST",
				"/?metadataConfiguration",
				200
			]
		},
		() => exports.CreateBucketMetadataConfigurationRequest$,
		() => __Unit
	];
	exports.CreateBucketMetadataTableConfiguration$ = [
		9,
		n0,
		_CBMTC,
		{
			[_hC]: "-",
			[_h]: [
				"POST",
				"/?metadataTable",
				200
			]
		},
		() => exports.CreateBucketMetadataTableConfigurationRequest$,
		() => __Unit
	];
	exports.CreateMultipartUpload$ = [
		9,
		n0,
		_CMUr,
		{ [_h]: [
			"POST",
			"/{Key+}?uploads",
			200
		] },
		() => exports.CreateMultipartUploadRequest$,
		() => exports.CreateMultipartUploadOutput$
	];
	exports.CreateSession$ = [
		9,
		n0,
		_CSr,
		{ [_h]: [
			"GET",
			"/?session",
			200
		] },
		() => exports.CreateSessionRequest$,
		() => exports.CreateSessionOutput$
	];
	exports.DeleteBucket$ = [
		9,
		n0,
		_DB,
		{ [_h]: [
			"DELETE",
			"/",
			204
		] },
		() => exports.DeleteBucketRequest$,
		() => __Unit
	];
	exports.DeleteBucketAnalyticsConfiguration$ = [
		9,
		n0,
		_DBAC,
		{ [_h]: [
			"DELETE",
			"/?analytics",
			204
		] },
		() => exports.DeleteBucketAnalyticsConfigurationRequest$,
		() => __Unit
	];
	exports.DeleteBucketCors$ = [
		9,
		n0,
		_DBC,
		{ [_h]: [
			"DELETE",
			"/?cors",
			204
		] },
		() => exports.DeleteBucketCorsRequest$,
		() => __Unit
	];
	exports.DeleteBucketEncryption$ = [
		9,
		n0,
		_DBE,
		{ [_h]: [
			"DELETE",
			"/?encryption",
			204
		] },
		() => exports.DeleteBucketEncryptionRequest$,
		() => __Unit
	];
	exports.DeleteBucketIntelligentTieringConfiguration$ = [
		9,
		n0,
		_DBITC,
		{ [_h]: [
			"DELETE",
			"/?intelligent-tiering",
			204
		] },
		() => exports.DeleteBucketIntelligentTieringConfigurationRequest$,
		() => __Unit
	];
	exports.DeleteBucketInventoryConfiguration$ = [
		9,
		n0,
		_DBIC,
		{ [_h]: [
			"DELETE",
			"/?inventory",
			204
		] },
		() => exports.DeleteBucketInventoryConfigurationRequest$,
		() => __Unit
	];
	exports.DeleteBucketLifecycle$ = [
		9,
		n0,
		_DBL,
		{ [_h]: [
			"DELETE",
			"/?lifecycle",
			204
		] },
		() => exports.DeleteBucketLifecycleRequest$,
		() => __Unit
	];
	exports.DeleteBucketMetadataConfiguration$ = [
		9,
		n0,
		_DBMC,
		{ [_h]: [
			"DELETE",
			"/?metadataConfiguration",
			204
		] },
		() => exports.DeleteBucketMetadataConfigurationRequest$,
		() => __Unit
	];
	exports.DeleteBucketMetadataTableConfiguration$ = [
		9,
		n0,
		_DBMTC,
		{ [_h]: [
			"DELETE",
			"/?metadataTable",
			204
		] },
		() => exports.DeleteBucketMetadataTableConfigurationRequest$,
		() => __Unit
	];
	exports.DeleteBucketMetricsConfiguration$ = [
		9,
		n0,
		_DBMCe,
		{ [_h]: [
			"DELETE",
			"/?metrics",
			204
		] },
		() => exports.DeleteBucketMetricsConfigurationRequest$,
		() => __Unit
	];
	exports.DeleteBucketOwnershipControls$ = [
		9,
		n0,
		_DBOC,
		{ [_h]: [
			"DELETE",
			"/?ownershipControls",
			204
		] },
		() => exports.DeleteBucketOwnershipControlsRequest$,
		() => __Unit
	];
	exports.DeleteBucketPolicy$ = [
		9,
		n0,
		_DBP,
		{ [_h]: [
			"DELETE",
			"/?policy",
			204
		] },
		() => exports.DeleteBucketPolicyRequest$,
		() => __Unit
	];
	exports.DeleteBucketReplication$ = [
		9,
		n0,
		_DBRe,
		{ [_h]: [
			"DELETE",
			"/?replication",
			204
		] },
		() => exports.DeleteBucketReplicationRequest$,
		() => __Unit
	];
	exports.DeleteBucketTagging$ = [
		9,
		n0,
		_DBT,
		{ [_h]: [
			"DELETE",
			"/?tagging",
			204
		] },
		() => exports.DeleteBucketTaggingRequest$,
		() => __Unit
	];
	exports.DeleteBucketWebsite$ = [
		9,
		n0,
		_DBW,
		{ [_h]: [
			"DELETE",
			"/?website",
			204
		] },
		() => exports.DeleteBucketWebsiteRequest$,
		() => __Unit
	];
	exports.DeleteObject$ = [
		9,
		n0,
		_DOel,
		{ [_h]: [
			"DELETE",
			"/{Key+}?x-id=DeleteObject",
			204
		] },
		() => exports.DeleteObjectRequest$,
		() => exports.DeleteObjectOutput$
	];
	exports.DeleteObjects$ = [
		9,
		n0,
		_DOele,
		{
			[_hC]: "-",
			[_h]: [
				"POST",
				"/?delete",
				200
			]
		},
		() => exports.DeleteObjectsRequest$,
		() => exports.DeleteObjectsOutput$
	];
	exports.DeleteObjectTagging$ = [
		9,
		n0,
		_DOT,
		{ [_h]: [
			"DELETE",
			"/{Key+}?tagging",
			204
		] },
		() => exports.DeleteObjectTaggingRequest$,
		() => exports.DeleteObjectTaggingOutput$
	];
	exports.DeletePublicAccessBlock$ = [
		9,
		n0,
		_DPAB,
		{ [_h]: [
			"DELETE",
			"/?publicAccessBlock",
			204
		] },
		() => exports.DeletePublicAccessBlockRequest$,
		() => __Unit
	];
	exports.GetBucketAbac$ = [
		9,
		n0,
		_GBA,
		{ [_h]: [
			"GET",
			"/?abac",
			200
		] },
		() => exports.GetBucketAbacRequest$,
		() => exports.GetBucketAbacOutput$
	];
	exports.GetBucketAccelerateConfiguration$ = [
		9,
		n0,
		_GBAC,
		{ [_h]: [
			"GET",
			"/?accelerate",
			200
		] },
		() => exports.GetBucketAccelerateConfigurationRequest$,
		() => exports.GetBucketAccelerateConfigurationOutput$
	];
	exports.GetBucketAcl$ = [
		9,
		n0,
		_GBAe,
		{ [_h]: [
			"GET",
			"/?acl",
			200
		] },
		() => exports.GetBucketAclRequest$,
		() => exports.GetBucketAclOutput$
	];
	exports.GetBucketAnalyticsConfiguration$ = [
		9,
		n0,
		_GBACe,
		{ [_h]: [
			"GET",
			"/?analytics&x-id=GetBucketAnalyticsConfiguration",
			200
		] },
		() => exports.GetBucketAnalyticsConfigurationRequest$,
		() => exports.GetBucketAnalyticsConfigurationOutput$
	];
	exports.GetBucketCors$ = [
		9,
		n0,
		_GBC,
		{ [_h]: [
			"GET",
			"/?cors",
			200
		] },
		() => exports.GetBucketCorsRequest$,
		() => exports.GetBucketCorsOutput$
	];
	exports.GetBucketEncryption$ = [
		9,
		n0,
		_GBE,
		{ [_h]: [
			"GET",
			"/?encryption",
			200
		] },
		() => exports.GetBucketEncryptionRequest$,
		() => exports.GetBucketEncryptionOutput$
	];
	exports.GetBucketIntelligentTieringConfiguration$ = [
		9,
		n0,
		_GBITC,
		{ [_h]: [
			"GET",
			"/?intelligent-tiering&x-id=GetBucketIntelligentTieringConfiguration",
			200
		] },
		() => exports.GetBucketIntelligentTieringConfigurationRequest$,
		() => exports.GetBucketIntelligentTieringConfigurationOutput$
	];
	exports.GetBucketInventoryConfiguration$ = [
		9,
		n0,
		_GBIC,
		{ [_h]: [
			"GET",
			"/?inventory&x-id=GetBucketInventoryConfiguration",
			200
		] },
		() => exports.GetBucketInventoryConfigurationRequest$,
		() => exports.GetBucketInventoryConfigurationOutput$
	];
	exports.GetBucketLifecycleConfiguration$ = [
		9,
		n0,
		_GBLC,
		{ [_h]: [
			"GET",
			"/?lifecycle",
			200
		] },
		() => exports.GetBucketLifecycleConfigurationRequest$,
		() => exports.GetBucketLifecycleConfigurationOutput$
	];
	exports.GetBucketLocation$ = [
		9,
		n0,
		_GBL,
		{ [_h]: [
			"GET",
			"/?location",
			200
		] },
		() => exports.GetBucketLocationRequest$,
		() => exports.GetBucketLocationOutput$
	];
	exports.GetBucketLogging$ = [
		9,
		n0,
		_GBLe,
		{ [_h]: [
			"GET",
			"/?logging",
			200
		] },
		() => exports.GetBucketLoggingRequest$,
		() => exports.GetBucketLoggingOutput$
	];
	exports.GetBucketMetadataConfiguration$ = [
		9,
		n0,
		_GBMC,
		{ [_h]: [
			"GET",
			"/?metadataConfiguration",
			200
		] },
		() => exports.GetBucketMetadataConfigurationRequest$,
		() => exports.GetBucketMetadataConfigurationOutput$
	];
	exports.GetBucketMetadataTableConfiguration$ = [
		9,
		n0,
		_GBMTC,
		{ [_h]: [
			"GET",
			"/?metadataTable",
			200
		] },
		() => exports.GetBucketMetadataTableConfigurationRequest$,
		() => exports.GetBucketMetadataTableConfigurationOutput$
	];
	exports.GetBucketMetricsConfiguration$ = [
		9,
		n0,
		_GBMCe,
		{ [_h]: [
			"GET",
			"/?metrics&x-id=GetBucketMetricsConfiguration",
			200
		] },
		() => exports.GetBucketMetricsConfigurationRequest$,
		() => exports.GetBucketMetricsConfigurationOutput$
	];
	exports.GetBucketNotificationConfiguration$ = [
		9,
		n0,
		_GBNC,
		{ [_h]: [
			"GET",
			"/?notification",
			200
		] },
		() => exports.GetBucketNotificationConfigurationRequest$,
		() => exports.NotificationConfiguration$
	];
	exports.GetBucketOwnershipControls$ = [
		9,
		n0,
		_GBOC,
		{ [_h]: [
			"GET",
			"/?ownershipControls",
			200
		] },
		() => exports.GetBucketOwnershipControlsRequest$,
		() => exports.GetBucketOwnershipControlsOutput$
	];
	exports.GetBucketPolicy$ = [
		9,
		n0,
		_GBP,
		{ [_h]: [
			"GET",
			"/?policy",
			200
		] },
		() => exports.GetBucketPolicyRequest$,
		() => exports.GetBucketPolicyOutput$
	];
	exports.GetBucketPolicyStatus$ = [
		9,
		n0,
		_GBPS,
		{ [_h]: [
			"GET",
			"/?policyStatus",
			200
		] },
		() => exports.GetBucketPolicyStatusRequest$,
		() => exports.GetBucketPolicyStatusOutput$
	];
	exports.GetBucketReplication$ = [
		9,
		n0,
		_GBR,
		{ [_h]: [
			"GET",
			"/?replication",
			200
		] },
		() => exports.GetBucketReplicationRequest$,
		() => exports.GetBucketReplicationOutput$
	];
	exports.GetBucketRequestPayment$ = [
		9,
		n0,
		_GBRP,
		{ [_h]: [
			"GET",
			"/?requestPayment",
			200
		] },
		() => exports.GetBucketRequestPaymentRequest$,
		() => exports.GetBucketRequestPaymentOutput$
	];
	exports.GetBucketTagging$ = [
		9,
		n0,
		_GBT,
		{ [_h]: [
			"GET",
			"/?tagging",
			200
		] },
		() => exports.GetBucketTaggingRequest$,
		() => exports.GetBucketTaggingOutput$
	];
	exports.GetBucketVersioning$ = [
		9,
		n0,
		_GBV,
		{ [_h]: [
			"GET",
			"/?versioning",
			200
		] },
		() => exports.GetBucketVersioningRequest$,
		() => exports.GetBucketVersioningOutput$
	];
	exports.GetBucketWebsite$ = [
		9,
		n0,
		_GBW,
		{ [_h]: [
			"GET",
			"/?website",
			200
		] },
		() => exports.GetBucketWebsiteRequest$,
		() => exports.GetBucketWebsiteOutput$
	];
	exports.GetObject$ = [
		9,
		n0,
		_GO,
		{
			[_hC]: "-",
			[_h]: [
				"GET",
				"/{Key+}?x-id=GetObject",
				200
			]
		},
		() => exports.GetObjectRequest$,
		() => exports.GetObjectOutput$
	];
	exports.GetObjectAcl$ = [
		9,
		n0,
		_GOA,
		{ [_h]: [
			"GET",
			"/{Key+}?acl",
			200
		] },
		() => exports.GetObjectAclRequest$,
		() => exports.GetObjectAclOutput$
	];
	exports.GetObjectAttributes$ = [
		9,
		n0,
		_GOAe,
		{ [_h]: [
			"GET",
			"/{Key+}?attributes",
			200
		] },
		() => exports.GetObjectAttributesRequest$,
		() => exports.GetObjectAttributesOutput$
	];
	exports.GetObjectLegalHold$ = [
		9,
		n0,
		_GOLH,
		{ [_h]: [
			"GET",
			"/{Key+}?legal-hold",
			200
		] },
		() => exports.GetObjectLegalHoldRequest$,
		() => exports.GetObjectLegalHoldOutput$
	];
	exports.GetObjectLockConfiguration$ = [
		9,
		n0,
		_GOLC,
		{ [_h]: [
			"GET",
			"/?object-lock",
			200
		] },
		() => exports.GetObjectLockConfigurationRequest$,
		() => exports.GetObjectLockConfigurationOutput$
	];
	exports.GetObjectRetention$ = [
		9,
		n0,
		_GORe,
		{ [_h]: [
			"GET",
			"/{Key+}?retention",
			200
		] },
		() => exports.GetObjectRetentionRequest$,
		() => exports.GetObjectRetentionOutput$
	];
	exports.GetObjectTagging$ = [
		9,
		n0,
		_GOT,
		{ [_h]: [
			"GET",
			"/{Key+}?tagging",
			200
		] },
		() => exports.GetObjectTaggingRequest$,
		() => exports.GetObjectTaggingOutput$
	];
	exports.GetObjectTorrent$ = [
		9,
		n0,
		_GOTe,
		{ [_h]: [
			"GET",
			"/{Key+}?torrent",
			200
		] },
		() => exports.GetObjectTorrentRequest$,
		() => exports.GetObjectTorrentOutput$
	];
	exports.GetPublicAccessBlock$ = [
		9,
		n0,
		_GPAB,
		{ [_h]: [
			"GET",
			"/?publicAccessBlock",
			200
		] },
		() => exports.GetPublicAccessBlockRequest$,
		() => exports.GetPublicAccessBlockOutput$
	];
	exports.HeadBucket$ = [
		9,
		n0,
		_HB,
		{ [_h]: [
			"HEAD",
			"/",
			200
		] },
		() => exports.HeadBucketRequest$,
		() => exports.HeadBucketOutput$
	];
	exports.HeadObject$ = [
		9,
		n0,
		_HO,
		{ [_h]: [
			"HEAD",
			"/{Key+}",
			200
		] },
		() => exports.HeadObjectRequest$,
		() => exports.HeadObjectOutput$
	];
	exports.ListBucketAnalyticsConfigurations$ = [
		9,
		n0,
		_LBAC,
		{ [_h]: [
			"GET",
			"/?analytics&x-id=ListBucketAnalyticsConfigurations",
			200
		] },
		() => exports.ListBucketAnalyticsConfigurationsRequest$,
		() => exports.ListBucketAnalyticsConfigurationsOutput$
	];
	exports.ListBucketIntelligentTieringConfigurations$ = [
		9,
		n0,
		_LBITC,
		{ [_h]: [
			"GET",
			"/?intelligent-tiering&x-id=ListBucketIntelligentTieringConfigurations",
			200
		] },
		() => exports.ListBucketIntelligentTieringConfigurationsRequest$,
		() => exports.ListBucketIntelligentTieringConfigurationsOutput$
	];
	exports.ListBucketInventoryConfigurations$ = [
		9,
		n0,
		_LBIC,
		{ [_h]: [
			"GET",
			"/?inventory&x-id=ListBucketInventoryConfigurations",
			200
		] },
		() => exports.ListBucketInventoryConfigurationsRequest$,
		() => exports.ListBucketInventoryConfigurationsOutput$
	];
	exports.ListBucketMetricsConfigurations$ = [
		9,
		n0,
		_LBMC,
		{ [_h]: [
			"GET",
			"/?metrics&x-id=ListBucketMetricsConfigurations",
			200
		] },
		() => exports.ListBucketMetricsConfigurationsRequest$,
		() => exports.ListBucketMetricsConfigurationsOutput$
	];
	exports.ListBuckets$ = [
		9,
		n0,
		_LB,
		{ [_h]: [
			"GET",
			"/?x-id=ListBuckets",
			200
		] },
		() => exports.ListBucketsRequest$,
		() => exports.ListBucketsOutput$
	];
	exports.ListDirectoryBuckets$ = [
		9,
		n0,
		_LDB,
		{ [_h]: [
			"GET",
			"/?x-id=ListDirectoryBuckets",
			200
		] },
		() => exports.ListDirectoryBucketsRequest$,
		() => exports.ListDirectoryBucketsOutput$
	];
	exports.ListMultipartUploads$ = [
		9,
		n0,
		_LMU,
		{ [_h]: [
			"GET",
			"/?uploads",
			200
		] },
		() => exports.ListMultipartUploadsRequest$,
		() => exports.ListMultipartUploadsOutput$
	];
	exports.ListObjects$ = [
		9,
		n0,
		_LO,
		{ [_h]: [
			"GET",
			"/",
			200
		] },
		() => exports.ListObjectsRequest$,
		() => exports.ListObjectsOutput$
	];
	exports.ListObjectsV2$ = [
		9,
		n0,
		_LOV,
		{ [_h]: [
			"GET",
			"/?list-type=2",
			200
		] },
		() => exports.ListObjectsV2Request$,
		() => exports.ListObjectsV2Output$
	];
	exports.ListObjectVersions$ = [
		9,
		n0,
		_LOVi,
		{ [_h]: [
			"GET",
			"/?versions",
			200
		] },
		() => exports.ListObjectVersionsRequest$,
		() => exports.ListObjectVersionsOutput$
	];
	exports.ListParts$ = [
		9,
		n0,
		_LP,
		{ [_h]: [
			"GET",
			"/{Key+}?x-id=ListParts",
			200
		] },
		() => exports.ListPartsRequest$,
		() => exports.ListPartsOutput$
	];
	exports.PutBucketAbac$ = [
		9,
		n0,
		_PBA,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/?abac",
				200
			]
		},
		() => exports.PutBucketAbacRequest$,
		() => __Unit
	];
	exports.PutBucketAccelerateConfiguration$ = [
		9,
		n0,
		_PBAC,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/?accelerate",
				200
			]
		},
		() => exports.PutBucketAccelerateConfigurationRequest$,
		() => __Unit
	];
	exports.PutBucketAcl$ = [
		9,
		n0,
		_PBAu,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/?acl",
				200
			]
		},
		() => exports.PutBucketAclRequest$,
		() => __Unit
	];
	exports.PutBucketAnalyticsConfiguration$ = [
		9,
		n0,
		_PBACu,
		{ [_h]: [
			"PUT",
			"/?analytics",
			200
		] },
		() => exports.PutBucketAnalyticsConfigurationRequest$,
		() => __Unit
	];
	exports.PutBucketCors$ = [
		9,
		n0,
		_PBC,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/?cors",
				200
			]
		},
		() => exports.PutBucketCorsRequest$,
		() => __Unit
	];
	exports.PutBucketEncryption$ = [
		9,
		n0,
		_PBE,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/?encryption",
				200
			]
		},
		() => exports.PutBucketEncryptionRequest$,
		() => __Unit
	];
	exports.PutBucketIntelligentTieringConfiguration$ = [
		9,
		n0,
		_PBITC,
		{ [_h]: [
			"PUT",
			"/?intelligent-tiering",
			200
		] },
		() => exports.PutBucketIntelligentTieringConfigurationRequest$,
		() => __Unit
	];
	exports.PutBucketInventoryConfiguration$ = [
		9,
		n0,
		_PBIC,
		{ [_h]: [
			"PUT",
			"/?inventory",
			200
		] },
		() => exports.PutBucketInventoryConfigurationRequest$,
		() => __Unit
	];
	exports.PutBucketLifecycleConfiguration$ = [
		9,
		n0,
		_PBLC,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/?lifecycle",
				200
			]
		},
		() => exports.PutBucketLifecycleConfigurationRequest$,
		() => exports.PutBucketLifecycleConfigurationOutput$
	];
	exports.PutBucketLogging$ = [
		9,
		n0,
		_PBL,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/?logging",
				200
			]
		},
		() => exports.PutBucketLoggingRequest$,
		() => __Unit
	];
	exports.PutBucketMetricsConfiguration$ = [
		9,
		n0,
		_PBMC,
		{ [_h]: [
			"PUT",
			"/?metrics",
			200
		] },
		() => exports.PutBucketMetricsConfigurationRequest$,
		() => __Unit
	];
	exports.PutBucketNotificationConfiguration$ = [
		9,
		n0,
		_PBNC,
		{ [_h]: [
			"PUT",
			"/?notification",
			200
		] },
		() => exports.PutBucketNotificationConfigurationRequest$,
		() => __Unit
	];
	exports.PutBucketOwnershipControls$ = [
		9,
		n0,
		_PBOC,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/?ownershipControls",
				200
			]
		},
		() => exports.PutBucketOwnershipControlsRequest$,
		() => __Unit
	];
	exports.PutBucketPolicy$ = [
		9,
		n0,
		_PBP,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/?policy",
				200
			]
		},
		() => exports.PutBucketPolicyRequest$,
		() => __Unit
	];
	exports.PutBucketReplication$ = [
		9,
		n0,
		_PBR,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/?replication",
				200
			]
		},
		() => exports.PutBucketReplicationRequest$,
		() => __Unit
	];
	exports.PutBucketRequestPayment$ = [
		9,
		n0,
		_PBRP,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/?requestPayment",
				200
			]
		},
		() => exports.PutBucketRequestPaymentRequest$,
		() => __Unit
	];
	exports.PutBucketTagging$ = [
		9,
		n0,
		_PBT,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/?tagging",
				200
			]
		},
		() => exports.PutBucketTaggingRequest$,
		() => __Unit
	];
	exports.PutBucketVersioning$ = [
		9,
		n0,
		_PBV,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/?versioning",
				200
			]
		},
		() => exports.PutBucketVersioningRequest$,
		() => __Unit
	];
	exports.PutBucketWebsite$ = [
		9,
		n0,
		_PBW,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/?website",
				200
			]
		},
		() => exports.PutBucketWebsiteRequest$,
		() => __Unit
	];
	exports.PutObject$ = [
		9,
		n0,
		_PO,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/{Key+}?x-id=PutObject",
				200
			]
		},
		() => exports.PutObjectRequest$,
		() => exports.PutObjectOutput$
	];
	exports.PutObjectAcl$ = [
		9,
		n0,
		_POA,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/{Key+}?acl",
				200
			]
		},
		() => exports.PutObjectAclRequest$,
		() => exports.PutObjectAclOutput$
	];
	exports.PutObjectLegalHold$ = [
		9,
		n0,
		_POLH,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/{Key+}?legal-hold",
				200
			]
		},
		() => exports.PutObjectLegalHoldRequest$,
		() => exports.PutObjectLegalHoldOutput$
	];
	exports.PutObjectLockConfiguration$ = [
		9,
		n0,
		_POLC,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/?object-lock",
				200
			]
		},
		() => exports.PutObjectLockConfigurationRequest$,
		() => exports.PutObjectLockConfigurationOutput$
	];
	exports.PutObjectRetention$ = [
		9,
		n0,
		_PORu,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/{Key+}?retention",
				200
			]
		},
		() => exports.PutObjectRetentionRequest$,
		() => exports.PutObjectRetentionOutput$
	];
	exports.PutObjectTagging$ = [
		9,
		n0,
		_POT,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/{Key+}?tagging",
				200
			]
		},
		() => exports.PutObjectTaggingRequest$,
		() => exports.PutObjectTaggingOutput$
	];
	exports.PutPublicAccessBlock$ = [
		9,
		n0,
		_PPAB,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/?publicAccessBlock",
				200
			]
		},
		() => exports.PutPublicAccessBlockRequest$,
		() => __Unit
	];
	exports.RenameObject$ = [
		9,
		n0,
		_RO,
		{ [_h]: [
			"PUT",
			"/{Key+}?renameObject",
			200
		] },
		() => exports.RenameObjectRequest$,
		() => exports.RenameObjectOutput$
	];
	exports.RestoreObject$ = [
		9,
		n0,
		_ROe,
		{
			[_hC]: "-",
			[_h]: [
				"POST",
				"/{Key+}?restore",
				200
			]
		},
		() => exports.RestoreObjectRequest$,
		() => exports.RestoreObjectOutput$
	];
	exports.SelectObjectContent$ = [
		9,
		n0,
		_SOC,
		{ [_h]: [
			"POST",
			"/{Key+}?select&select-type=2",
			200
		] },
		() => exports.SelectObjectContentRequest$,
		() => exports.SelectObjectContentOutput$
	];
	exports.UpdateBucketMetadataInventoryTableConfiguration$ = [
		9,
		n0,
		_UBMITC,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/?metadataInventoryTable",
				200
			]
		},
		() => exports.UpdateBucketMetadataInventoryTableConfigurationRequest$,
		() => __Unit
	];
	exports.UpdateBucketMetadataJournalTableConfiguration$ = [
		9,
		n0,
		_UBMJTC,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/?metadataJournalTable",
				200
			]
		},
		() => exports.UpdateBucketMetadataJournalTableConfigurationRequest$,
		() => __Unit
	];
	exports.UpdateObjectEncryption$ = [
		9,
		n0,
		_UOE,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/{Key+}?encryption",
				200
			]
		},
		() => exports.UpdateObjectEncryptionRequest$,
		() => exports.UpdateObjectEncryptionResponse$
	];
	exports.UploadPart$ = [
		9,
		n0,
		_UP,
		{
			[_hC]: "-",
			[_h]: [
				"PUT",
				"/{Key+}?x-id=UploadPart",
				200
			]
		},
		() => exports.UploadPartRequest$,
		() => exports.UploadPartOutput$
	];
	exports.UploadPartCopy$ = [
		9,
		n0,
		_UPC,
		{ [_h]: [
			"PUT",
			"/{Key+}?x-id=UploadPartCopy",
			200
		] },
		() => exports.UploadPartCopyRequest$,
		() => exports.UploadPartCopyOutput$
	];
	exports.WriteGetObjectResponse$ = [
		9,
		n0,
		_WGOR,
		{
			[_en]: ["{RequestRoute}."],
			[_h]: [
				"POST",
				"/WriteGetObjectResponse",
				200
			]
		},
		() => exports.WriteGetObjectResponseRequest$,
		() => __Unit
	];
}));
//#endregion
//#region node_modules/@aws-sdk/client-s3/package.json
var require_package = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"name": "@aws-sdk/client-s3",
		"description": "AWS SDK for JavaScript S3 Client for Node.js, Browser and React Native",
		"version": "3.1041.0",
		"scripts": {
			"build": "concurrently 'yarn:build:types' 'yarn:build:es' && yarn build:cjs",
			"build:cjs": "node ../../scripts/compilation/inline client-s3",
			"build:es": "tsc -p tsconfig.es.json",
			"build:include:deps": "yarn g:turbo run build -F=\"$npm_package_name\"",
			"build:types": "tsc -p tsconfig.types.json",
			"build:types:downlevel": "downlevel-dts dist-types dist-types/ts3.4",
			"clean": "premove dist-cjs dist-es dist-types tsconfig.cjs.tsbuildinfo tsconfig.es.tsbuildinfo tsconfig.types.tsbuildinfo",
			"extract:docs": "api-extractor run --local",
			"generate:client": "node ../../scripts/generate-clients/single-service --solo s3",
			"test": "yarn g:vitest run",
			"test:browser": "node ./test/browser-build/esbuild && yarn g:vitest run -c vitest.config.browser.mts",
			"test:browser:watch": "node ./test/browser-build/esbuild && yarn g:vitest watch -c vitest.config.browser.mts",
			"test:e2e": "yarn g:vitest run -c vitest.config.e2e.mts && yarn test:browser",
			"test:e2e:watch": "yarn g:vitest watch -c vitest.config.e2e.mts",
			"test:index": "tsc --noEmit ./test/index-types.ts && node ./test/index-objects.spec.mjs",
			"test:integration": "yarn g:vitest run -c vitest.config.integ.mts",
			"test:integration:watch": "yarn g:vitest watch -c vitest.config.integ.mts",
			"test:watch": "yarn g:vitest watch"
		},
		"main": "./dist-cjs/index.js",
		"types": "./dist-types/index.d.ts",
		"module": "./dist-es/index.js",
		"sideEffects": false,
		"dependencies": {
			"@aws-crypto/sha1-browser": "5.2.0",
			"@aws-crypto/sha256-browser": "5.2.0",
			"@aws-crypto/sha256-js": "5.2.0",
			"@aws-sdk/core": "^3.974.8",
			"@aws-sdk/credential-provider-node": "^3.972.39",
			"@aws-sdk/middleware-bucket-endpoint": "^3.972.10",
			"@aws-sdk/middleware-expect-continue": "^3.972.10",
			"@aws-sdk/middleware-flexible-checksums": "^3.974.16",
			"@aws-sdk/middleware-host-header": "^3.972.10",
			"@aws-sdk/middleware-location-constraint": "^3.972.10",
			"@aws-sdk/middleware-logger": "^3.972.10",
			"@aws-sdk/middleware-recursion-detection": "^3.972.11",
			"@aws-sdk/middleware-sdk-s3": "^3.972.37",
			"@aws-sdk/middleware-ssec": "^3.972.10",
			"@aws-sdk/middleware-user-agent": "^3.972.38",
			"@aws-sdk/region-config-resolver": "^3.972.13",
			"@aws-sdk/signature-v4-multi-region": "^3.996.25",
			"@aws-sdk/types": "^3.973.8",
			"@aws-sdk/util-endpoints": "^3.996.8",
			"@aws-sdk/util-user-agent-browser": "^3.972.10",
			"@aws-sdk/util-user-agent-node": "^3.973.24",
			"@smithy/config-resolver": "^4.4.17",
			"@smithy/core": "^3.23.17",
			"@smithy/eventstream-serde-browser": "^4.2.14",
			"@smithy/eventstream-serde-config-resolver": "^4.3.14",
			"@smithy/eventstream-serde-node": "^4.2.14",
			"@smithy/fetch-http-handler": "^5.3.17",
			"@smithy/hash-blob-browser": "^4.2.15",
			"@smithy/hash-node": "^4.2.14",
			"@smithy/hash-stream-node": "^4.2.14",
			"@smithy/invalid-dependency": "^4.2.14",
			"@smithy/md5-js": "^4.2.14",
			"@smithy/middleware-content-length": "^4.2.14",
			"@smithy/middleware-endpoint": "^4.4.32",
			"@smithy/middleware-retry": "^4.5.7",
			"@smithy/middleware-serde": "^4.2.20",
			"@smithy/middleware-stack": "^4.2.14",
			"@smithy/node-config-provider": "^4.3.14",
			"@smithy/node-http-handler": "^4.6.1",
			"@smithy/protocol-http": "^5.3.14",
			"@smithy/smithy-client": "^4.12.13",
			"@smithy/types": "^4.14.1",
			"@smithy/url-parser": "^4.2.14",
			"@smithy/util-base64": "^4.3.2",
			"@smithy/util-body-length-browser": "^4.2.2",
			"@smithy/util-body-length-node": "^4.2.3",
			"@smithy/util-defaults-mode-browser": "^4.3.49",
			"@smithy/util-defaults-mode-node": "^4.2.54",
			"@smithy/util-endpoints": "^3.4.2",
			"@smithy/util-middleware": "^4.2.14",
			"@smithy/util-retry": "^4.3.6",
			"@smithy/util-stream": "^4.5.25",
			"@smithy/util-utf8": "^4.2.2",
			"@smithy/util-waiter": "^4.3.0",
			"tslib": "^2.6.2"
		},
		"devDependencies": {
			"@aws-sdk/signature-v4-crt": "3.1041.0",
			"@smithy/snapshot-testing": "^2.0.8",
			"@tsconfig/node20": "20.1.8",
			"@types/node": "^20.14.8",
			"concurrently": "7.0.0",
			"downlevel-dts": "0.10.1",
			"premove": "4.0.0",
			"typescript": "~5.8.3",
			"vitest": "^4.0.17"
		},
		"engines": { "node": ">=20.0.0" },
		"typesVersions": { "<4.5": { "dist-types/*": ["dist-types/ts3.4/*"] } },
		"files": ["dist-*/**"],
		"author": {
			"name": "AWS SDK for JavaScript Team",
			"url": "https://aws.amazon.com/javascript/"
		},
		"license": "Apache-2.0",
		"browser": { "./dist-es/runtimeConfig": "./dist-es/runtimeConfig.browser" },
		"react-native": { "./dist-es/runtimeConfig": "./dist-es/runtimeConfig.native" },
		"homepage": "https://github.com/aws/aws-sdk-js-v3/tree/main/clients/client-s3",
		"repository": {
			"type": "git",
			"url": "https://github.com/aws/aws-sdk-js-v3.git",
			"directory": "clients/client-s3"
		}
	};
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-bucket-endpoint/dist-cjs/index.js
var require_dist_cjs$21 = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { NODE_DISABLE_MULTIREGION_ACCESS_POINT_CONFIG_OPTIONS, NODE_DISABLE_MULTIREGION_ACCESS_POINT_ENV_NAME, NODE_DISABLE_MULTIREGION_ACCESS_POINT_INI_NAME, NODE_USE_ARN_REGION_CONFIG_OPTIONS, NODE_USE_ARN_REGION_ENV_NAME, NODE_USE_ARN_REGION_INI_NAME, bucketEndpointMiddleware, bucketEndpointMiddlewareOptions, bucketHostname, getArnResources, getBucketEndpointPlugin, getSuffixForArnEndpoint, resolveBucketEndpointConfig, validateAccountId, validateDNSHostLabel, validateNoDualstack, validateNoFIPS, validateOutpostService, validatePartition, validateRegion } = (init_s3(), __toCommonJS(s3_exports));
	exports.NODE_DISABLE_MULTIREGION_ACCESS_POINT_CONFIG_OPTIONS = NODE_DISABLE_MULTIREGION_ACCESS_POINT_CONFIG_OPTIONS;
	exports.NODE_DISABLE_MULTIREGION_ACCESS_POINT_ENV_NAME = NODE_DISABLE_MULTIREGION_ACCESS_POINT_ENV_NAME;
	exports.NODE_DISABLE_MULTIREGION_ACCESS_POINT_INI_NAME = NODE_DISABLE_MULTIREGION_ACCESS_POINT_INI_NAME;
	exports.NODE_USE_ARN_REGION_CONFIG_OPTIONS = NODE_USE_ARN_REGION_CONFIG_OPTIONS;
	exports.NODE_USE_ARN_REGION_ENV_NAME = NODE_USE_ARN_REGION_ENV_NAME;
	exports.NODE_USE_ARN_REGION_INI_NAME = NODE_USE_ARN_REGION_INI_NAME;
	exports.bucketEndpointMiddleware = bucketEndpointMiddleware;
	exports.bucketEndpointMiddlewareOptions = bucketEndpointMiddlewareOptions;
	exports.bucketHostname = bucketHostname;
	exports.getArnResources = getArnResources;
	exports.getBucketEndpointPlugin = getBucketEndpointPlugin;
	exports.getSuffixForArnEndpoint = getSuffixForArnEndpoint;
	exports.resolveBucketEndpointConfig = resolveBucketEndpointConfig;
	exports.validateAccountId = validateAccountId;
	exports.validateDNSHostLabel = validateDNSHostLabel;
	exports.validateNoDualstack = validateNoDualstack;
	exports.validateNoFIPS = validateNoFIPS;
	exports.validateOutpostService = validateOutpostService;
	exports.validatePartition = validatePartition;
	exports.validateRegion = validateRegion;
}));
//#endregion
//#region node_modules/@aws-sdk/util-user-agent-node/dist-cjs/index.js
var require_dist_cjs$20 = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { NODE_APP_ID_CONFIG_OPTIONS, UA_APP_ID_ENV_NAME, UA_APP_ID_INI_NAME, createDefaultUserAgentProvider, crtAvailability, defaultUserAgent } = (init_client(), __toCommonJS(client_exports));
	exports.NODE_APP_ID_CONFIG_OPTIONS = NODE_APP_ID_CONFIG_OPTIONS;
	exports.UA_APP_ID_ENV_NAME = UA_APP_ID_ENV_NAME;
	exports.UA_APP_ID_INI_NAME = UA_APP_ID_INI_NAME;
	exports.createDefaultUserAgentProvider = createDefaultUserAgentProvider;
	exports.crtAvailability = crtAvailability;
	exports.defaultUserAgent = defaultUserAgent;
}));
//#endregion
//#region node_modules/@smithy/eventstream-serde-node/dist-cjs/index.js
var require_dist_cjs$19 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.eventStreamSerdeProvider = exports.EventStreamMarshaller = void 0;
	var event_streams_1 = (init_event_streams(), __toCommonJS(event_streams_exports));
	Object.defineProperty(exports, "EventStreamMarshaller", {
		enumerable: true,
		get: function() {
			return event_streams_1.EventStreamMarshaller;
		}
	});
	Object.defineProperty(exports, "eventStreamSerdeProvider", {
		enumerable: true,
		get: function() {
			return event_streams_1.eventStreamSerdeProvider;
		}
	});
}));
//#endregion
//#region node_modules/@smithy/hash-node/dist-cjs/index.js
var require_dist_cjs$18 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Hash = void 0;
	var serde_1 = (init_serde(), __toCommonJS(serde_exports));
	Object.defineProperty(exports, "Hash", {
		enumerable: true,
		get: function() {
			return serde_1.Hash;
		}
	});
}));
//#endregion
//#region node_modules/@smithy/hash-stream-node/dist-cjs/index.js
var require_dist_cjs$17 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.readableStreamHasher = exports.fileStreamHasher = void 0;
	var checksum_1 = (init_checksum(), __toCommonJS(checksum_exports));
	Object.defineProperty(exports, "fileStreamHasher", {
		enumerable: true,
		get: function() {
			return checksum_1.fileStreamHasher;
		}
	});
	Object.defineProperty(exports, "readableStreamHasher", {
		enumerable: true,
		get: function() {
			return checksum_1.readableStreamHasher;
		}
	});
}));
//#endregion
//#region node_modules/@smithy/node-config-provider/dist-cjs/index.js
var require_dist_cjs$16 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.loadConfig = void 0;
	var config_1 = (init_config$1(), __toCommonJS(config_exports));
	Object.defineProperty(exports, "loadConfig", {
		enumerable: true,
		get: function() {
			return config_1.loadConfig;
		}
	});
}));
//#endregion
//#region node_modules/@smithy/node-http-handler/dist-cjs/index.js
var require_dist_cjs$15 = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { hasOwn } = (init_serde(), __toCommonJS(serde_exports));
	const { streamCollector } = (init_serde(), __toCommonJS(serde_exports));
	exports.streamCollector = streamCollector;
	const { buildQueryString, HttpResponse } = (init_protocols$1(), __toCommonJS(protocols_exports));
	const node_https = __require("node:https");
	const { Readable: Readable$1 } = __require("node:stream");
	const http2 = __require("node:http2");
	function buildAbortError(abortSignal) {
		const reason = abortSignal && typeof abortSignal === "object" && "reason" in abortSignal ? abortSignal.reason : void 0;
		if (reason) {
			if (reason instanceof Error) {
				const abortError = /* @__PURE__ */ new Error("Request aborted");
				abortError.name = "AbortError";
				abortError.cause = reason;
				return abortError;
			}
			const abortError = new Error(String(reason));
			abortError.name = "AbortError";
			return abortError;
		}
		const abortError = /* @__PURE__ */ new Error("Request aborted");
		abortError.name = "AbortError";
		return abortError;
	}
	const NODEJS_TIMEOUT_ERROR_CODES = [
		"ECONNRESET",
		"EPIPE",
		"ETIMEDOUT"
	];
	const getTransformedHeaders = (headers) => {
		const transformedHeaders = {};
		for (const name in headers) {
			if (!hasOwn(headers, name)) continue;
			const headerValues = headers[name];
			transformedHeaders[name] = Array.isArray(headerValues) ? headerValues.join(",") : headerValues;
		}
		return transformedHeaders;
	};
	const timing = {
		setTimeout: (cb, ms) => setTimeout(cb, ms),
		clearTimeout: (timeoutId) => clearTimeout(timeoutId)
	};
	const DEFER_EVENT_LISTENER_TIME$2 = 1e3;
	const setConnectionTimeout = (request, reject, timeoutInMs = 0) => {
		if (!timeoutInMs) return -1;
		const registerTimeout = (offset) => {
			const timeoutId = timing.setTimeout(() => {
				request.destroy();
				reject(Object.assign(/* @__PURE__ */ new Error(`@smithy/node-http-handler - the request socket did not establish a connection with the server within the configured timeout of ${timeoutInMs} ms.`), { name: "TimeoutError" }));
			}, timeoutInMs - offset);
			const doWithSocket = (socket) => {
				if (socket?.connecting) socket.on("connect", () => {
					timing.clearTimeout(timeoutId);
				});
				else timing.clearTimeout(timeoutId);
			};
			if (request.socket) doWithSocket(request.socket);
			else request.on("socket", doWithSocket);
		};
		if (timeoutInMs < 2e3) {
			registerTimeout(0);
			return 0;
		}
		return timing.setTimeout(registerTimeout.bind(null, DEFER_EVENT_LISTENER_TIME$2), DEFER_EVENT_LISTENER_TIME$2);
	};
	const setRequestTimeout = (req, reject, timeoutInMs = 0, throwOnRequestTimeout, logger) => {
		if (timeoutInMs) return timing.setTimeout(() => {
			let msg = `@smithy/node-http-handler - [${throwOnRequestTimeout ? "ERROR" : "WARN"}] a request has exceeded the configured ${timeoutInMs} ms requestTimeout.`;
			if (throwOnRequestTimeout) {
				const error = Object.assign(new Error(msg), {
					name: "TimeoutError",
					code: "ETIMEDOUT"
				});
				req.destroy(error);
				reject(error);
			} else {
				msg += ` Init client requestHandler with throwOnRequestTimeout=true to turn this into an error.`;
				logger?.warn?.(msg);
			}
		}, timeoutInMs);
		return -1;
	};
	const DEFER_EVENT_LISTENER_TIME$1 = 3e3;
	const setSocketKeepAlive = (request, { keepAlive, keepAliveMsecs }, deferTimeMs = DEFER_EVENT_LISTENER_TIME$1) => {
		if (keepAlive !== true) return -1;
		const registerListener = () => {
			if (request.socket) request.socket.setKeepAlive(keepAlive, keepAliveMsecs || 0);
			else request.on("socket", (socket) => {
				socket.setKeepAlive(keepAlive, keepAliveMsecs || 0);
			});
		};
		if (deferTimeMs === 0) {
			registerListener();
			return 0;
		}
		return timing.setTimeout(registerListener, deferTimeMs);
	};
	const resolveDefaultSocketTimeout = (config) => {
		const value = config?.defaultSocketTimeout;
		return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : void 0;
	};
	const DEFER_EVENT_LISTENER_TIME = 3e3;
	const setSocketTimeout = (request, reject, timeoutInMs = 0, isServiceDefault = false) => {
		if (!Number.isFinite(timeoutInMs) || timeoutInMs <= 0) return;
		let response;
		request.once("response", (res) => response = res);
		const onTimeout = () => {
			if (response?.complete) {
				request.socket?.destroy();
				return;
			}
			const error = Object.assign(/* @__PURE__ */ new Error(`@smithy/node-http-handler - the request socket timed out after ${timeoutInMs} ms of inactivity (${isServiceDefault ? "service default socket timeout" : "configured by client requestHandler"}).`), { name: "TimeoutError" });
			response?.destroy(error);
			request.destroy();
			reject(error);
		};
		const registerTimeout = () => {
			const { socket } = request;
			if (!socket) request.once("socket", registerTimeout);
			else if (socket.connecting) socket.once("connect", registerTimeout);
			else {
				socket.setTimeout(timeoutInMs, onTimeout);
				request.on("close", () => socket.removeListener("timeout", onTimeout));
			}
		};
		if (timeoutInMs < 6e3) {
			registerTimeout();
			return;
		}
		const deferralId = timing.setTimeout(registerTimeout, DEFER_EVENT_LISTENER_TIME);
		request.once("close", () => timing.clearTimeout(deferralId));
	};
	const MIN_WAIT_TIME = 6e3;
	async function writeRequestBody(httpRequest, request, maxContinueTimeoutMs = MIN_WAIT_TIME, externalAgent = false) {
		const headers = request.headers;
		const expect = headers ? headers.Expect || headers.expect : void 0;
		let timeoutId = -1;
		let sendBody = true;
		if (!externalAgent && expect === "100-continue") sendBody = await Promise.race([new Promise((resolve) => {
			timeoutId = Number(timing.setTimeout(() => resolve(true), Math.max(MIN_WAIT_TIME, maxContinueTimeoutMs)));
		}), new Promise((resolve) => {
			httpRequest.on("continue", () => {
				timing.clearTimeout(timeoutId);
				resolve(true);
			});
			httpRequest.on("response", () => {
				timing.clearTimeout(timeoutId);
				resolve(false);
			});
			httpRequest.on("error", () => {
				timing.clearTimeout(timeoutId);
				resolve(false);
			});
		})]);
		if (sendBody) writeBody(httpRequest, request.body);
	}
	function writeBody(httpRequest, body) {
		if (body instanceof Readable$1) {
			body.pipe(httpRequest);
			return;
		}
		if (body) {
			const isBuffer = Buffer.isBuffer(body);
			if (isBuffer || typeof body === "string") {
				if (isBuffer && body.byteLength === 0) httpRequest.end();
				else httpRequest.end(body);
				return;
			}
			const uint8 = body;
			if (typeof uint8 === "object" && uint8.buffer && typeof uint8.byteOffset === "number" && typeof uint8.byteLength === "number") {
				httpRequest.end(Buffer.from(uint8.buffer, uint8.byteOffset, uint8.byteLength));
				return;
			}
			httpRequest.end(Buffer.from(body));
			return;
		}
		httpRequest.end();
	}
	const DEFAULT_REQUEST_TIMEOUT = 0;
	let hAgent = void 0;
	let hRequest = void 0;
	var NodeHttpHandler = class NodeHttpHandler {
		config;
		configProvider;
		socketWarningTimestamp = 0;
		externalAgent = false;
		metadata = { handlerProtocol: "http/1.1" };
		static create(instanceOrOptions) {
			if (typeof instanceOrOptions?.handle === "function") return instanceOrOptions;
			return new NodeHttpHandler(instanceOrOptions);
		}
		static checkSocketUsage(agent, socketWarningTimestamp, logger = console) {
			const { sockets, requests, maxSockets } = agent;
			if (typeof maxSockets !== "number" || maxSockets === Infinity) return socketWarningTimestamp;
			if (Date.now() - 15e3 < socketWarningTimestamp) return socketWarningTimestamp;
			if (sockets && requests) for (const origin in sockets) {
				if (!hasOwn(sockets, origin)) continue;
				const socketsInUse = sockets[origin]?.length ?? 0;
				const requestsEnqueued = requests[origin]?.length ?? 0;
				if (socketsInUse >= maxSockets && requestsEnqueued >= 2 * maxSockets) {
					logger?.warn?.(`@smithy/node-http-handler:WARN - socket usage at capacity=${socketsInUse} and ${requestsEnqueued} additional requests are enqueued.
See https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-configuring-maxsockets.html
or increase socketAcquisitionWarningTimeout=(millis) in the NodeHttpHandler config.`);
					return Date.now();
				}
			}
			return socketWarningTimestamp;
		}
		constructor(options) {
			this.configProvider = new Promise((resolve, reject) => {
				if (typeof options === "function") options().then((_options) => {
					resolve(this.resolveDefaultConfig(_options));
				}).catch(reject);
				else resolve(this.resolveDefaultConfig(options));
			});
		}
		destroy() {
			this.config?.httpAgent?.destroy();
			this.config?.httpsAgent?.destroy();
		}
		async handle(request, { abortSignal, requestTimeout } = {}) {
			if (!this.config) this.config = await this.configProvider;
			const config = this.config;
			const logger = config.logger;
			const isSSL = request.protocol === "https:";
			if (!isSSL && !this.config.httpAgent) this.config.httpAgent = await this.config.httpAgentProvider();
			return new Promise((_resolve, _reject) => {
				let writeRequestBodyPromise = void 0;
				let socketWarningTimeoutId = -1;
				let connectionTimeoutId = -1;
				let requestTimeoutId = -1;
				let keepAliveTimeoutId = -1;
				const clearTimeouts = () => {
					timing.clearTimeout(socketWarningTimeoutId);
					timing.clearTimeout(connectionTimeoutId);
					timing.clearTimeout(requestTimeoutId);
					timing.clearTimeout(keepAliveTimeoutId);
				};
				const resolve = async (arg) => {
					await writeRequestBodyPromise;
					clearTimeouts();
					_resolve(arg);
				};
				const reject = async (arg) => {
					await writeRequestBodyPromise;
					clearTimeouts();
					_reject(arg);
				};
				if (abortSignal?.aborted) {
					reject(buildAbortError(abortSignal));
					return;
				}
				const headers = request.headers;
				const expectContinue = headers ? (headers.Expect ?? headers.expect) === "100-continue" : false;
				let agent = isSSL ? config.httpsAgent : config.httpAgent;
				if (expectContinue && !this.externalAgent) agent = new (isSSL ? node_https.Agent : hAgent)({
					keepAlive: false,
					maxSockets: Infinity
				});
				socketWarningTimeoutId = timing.setTimeout(() => {
					this.socketWarningTimestamp = NodeHttpHandler.checkSocketUsage(agent, this.socketWarningTimestamp, logger);
				}, config.socketAcquisitionWarningTimeout ?? (config.requestTimeout ?? 2e3) + (config.connectionTimeout ?? 1e3));
				const queryString = request.query ? buildQueryString(request.query) : "";
				let auth = void 0;
				if (request.username != null || request.password != null) auth = `${request.username ?? ""}:${request.password ?? ""}`;
				let path = request.path;
				if (queryString) path += `?${queryString}`;
				if (request.fragment) path += `#${request.fragment}`;
				let hostname = request.hostname ?? "";
				if (hostname[0] === "[" && hostname.endsWith("]")) hostname = request.hostname.slice(1, -1);
				else hostname = request.hostname;
				const nodeHttpsOptions = {
					headers: request.headers,
					host: hostname,
					method: request.method,
					path,
					port: request.port,
					agent,
					auth
				};
				const req = (isSSL ? node_https.request : hRequest)(nodeHttpsOptions, (res) => {
					resolve({ response: new HttpResponse({
						statusCode: res.statusCode || -1,
						reason: res.statusMessage,
						headers: getTransformedHeaders(res.headers),
						body: res
					}) });
				});
				req.on("error", (err) => {
					if (NODEJS_TIMEOUT_ERROR_CODES.includes(err.code)) reject(Object.assign(err, { name: "TimeoutError" }));
					else reject(err);
				});
				if (abortSignal) {
					const onAbort = () => {
						req.destroy();
						reject(buildAbortError(abortSignal));
					};
					if (typeof abortSignal.addEventListener === "function") {
						const signal = abortSignal;
						signal.addEventListener("abort", onAbort, { once: true });
						req.once("close", () => signal.removeEventListener("abort", onAbort));
					} else abortSignal.onabort = onAbort;
				}
				const effectiveRequestTimeout = requestTimeout ?? config.requestTimeout;
				connectionTimeoutId = setConnectionTimeout(req, reject, config.connectionTimeout);
				requestTimeoutId = setRequestTimeout(req, reject, effectiveRequestTimeout, config.throwOnRequestTimeout, logger ?? console);
				const defaultSocketTimeout = config.socketTimeout === void 0 ? resolveDefaultSocketTimeout(config) : void 0;
				if (defaultSocketTimeout) setSocketTimeout(req, reject, defaultSocketTimeout, true);
				else setSocketTimeout(req, reject, config.socketTimeout);
				const httpAgent = nodeHttpsOptions.agent;
				if (typeof httpAgent === "object" && "keepAlive" in httpAgent) keepAliveTimeoutId = setSocketKeepAlive(req, {
					keepAlive: httpAgent.keepAlive,
					keepAliveMsecs: httpAgent.keepAliveMsecs
				});
				writeRequestBodyPromise = writeRequestBody(req, request, effectiveRequestTimeout, this.externalAgent).catch((e) => {
					clearTimeouts();
					return _reject(e);
				});
			});
		}
		updateHttpClientConfig(key, value) {
			this.config = void 0;
			this.configProvider = this.configProvider.then((config) => {
				switch (key) {
					case Symbol.for("logger"):
						key = "logger";
						value = config.logger ?? value;
						break;
					case Symbol.for("@smithy/defaultSocketTimeout"):
						key = "defaultSocketTimeout";
						value = resolveDefaultSocketTimeout(config) ?? value;
						break;
				}
				return {
					...config,
					[key]: value
				};
			});
		}
		httpHandlerConfigs() {
			return this.config ?? {};
		}
		resolveDefaultConfig(options) {
			const { requestTimeout, connectionTimeout, socketTimeout, socketAcquisitionWarningTimeout, httpAgent, httpsAgent, throwOnRequestTimeout, logger } = options || {};
			const keepAlive = true;
			const maxSockets = 50;
			let httpAgentPromise;
			return {
				connectionTimeout,
				requestTimeout,
				socketTimeout,
				defaultSocketTimeout: resolveDefaultSocketTimeout(options),
				socketAcquisitionWarningTimeout,
				throwOnRequestTimeout,
				httpAgentProvider: () => httpAgentPromise ??= (async () => {
					const node_http = __require("node:http");
					const { Agent, request } = node_http.default ?? node_http;
					hRequest = request;
					hAgent = Agent;
					if (httpAgent instanceof hAgent || typeof httpAgent?.destroy === "function") {
						this.externalAgent = true;
						return httpAgent;
					}
					return new hAgent({
						keepAlive,
						maxSockets,
						...httpAgent
					});
				})(),
				httpsAgent: (() => {
					if (httpsAgent instanceof node_https.Agent || typeof httpsAgent?.destroy === "function") {
						this.externalAgent = true;
						return httpsAgent;
					}
					return new node_https.Agent({
						keepAlive,
						maxSockets,
						...httpsAgent
					});
				})(),
				logger
			};
		}
	};
	const ids = new Uint16Array(1);
	var ClientHttp2SessionRef = class {
		id = ids[0]++;
		total = 0;
		max = 0;
		session;
		refs = 0;
		constructor(session) {
			session.unref();
			this.session = session;
		}
		retain() {
			if (this.session.destroyed) throw new Error("@smithy/node-http-handler - cannot acquire reference to destroyed session.");
			this.refs += 1;
			this.total += 1;
			this.max = Math.max(this.refs, this.max);
			this.session.ref();
		}
		free() {
			if (this.session.destroyed) return;
			this.refs -= 1;
			if (this.refs === 0) this.session.unref();
			if (this.refs < 0) throw new Error("@smithy/node-http-handler - ClientHttp2Session refcount at zero, cannot decrement.");
		}
		deref() {
			return this.session;
		}
		close() {
			if (!this.session.closed) this.session.close();
		}
		destroy() {
			this.refs = 0;
			if (!this.session.destroyed) {
				this.session.setTimeout(0);
				this.session.destroy();
			}
		}
		useCount() {
			return this.refs;
		}
	};
	var NodeHttp2ConnectionPool = class {
		sessions = [];
		maxConcurrency = 0;
		constructor(sessions) {
			this.sessions = (sessions ?? []).map((session) => new ClientHttp2SessionRef(session));
		}
		poll() {
			let cleanup = false;
			for (const session of this.sessions) {
				if (session.deref().destroyed) {
					cleanup = true;
					continue;
				}
				if (!this.maxConcurrency || session.useCount() < this.maxConcurrency) return session;
			}
			if (cleanup) {
				for (const session of this.sessions) if (session.deref().destroyed) this.remove(session);
			}
		}
		offerLast(ref) {
			this.sessions.push(ref);
		}
		remove(ref) {
			const ix = this.sessions.indexOf(ref);
			if (ix > -1) this.sessions.splice(ix, 1);
		}
		[Symbol.iterator]() {
			return this.sessions[Symbol.iterator]();
		}
		setMaxConcurrency(maxConcurrency) {
			this.maxConcurrency = maxConcurrency;
		}
		destroy(ref) {
			this.remove(ref);
			ref.destroy();
		}
	};
	var NodeHttp2ConnectionManager = class {
		config;
		connectOptions;
		connectionPools = /* @__PURE__ */ new Map();
		constructor(config) {
			this.config = config;
			if (this.config.maxConcurrency && this.config.maxConcurrency <= 0) throw new RangeError("maxConcurrency must be greater than zero.");
		}
		lease(requestContext, connectionConfiguration) {
			const url = this.getUrlString(requestContext);
			const pool = this.getPool(url);
			if (!this.config.disableConcurrency && !connectionConfiguration.isEventStream) {
				const available = pool.poll();
				if (available) {
					available.retain();
					return available;
				}
			}
			const ref = new ClientHttp2SessionRef(this.connect(url));
			const session = ref.deref();
			if (this.config.maxConcurrency) session.settings({ maxConcurrentStreams: this.config.maxConcurrency }, (err) => {
				if (err) throw new Error("Fail to set maxConcurrentStreams to " + this.config.maxConcurrency + "when creating new session for " + requestContext.destination.toString());
			});
			const graceful = () => {
				this.removeFromPoolAndClose(url, ref);
			};
			const ensureDestroyed = () => {
				this.removeFromPoolAndCheckedDestroy(url, ref);
			};
			session.on("goaway", graceful);
			session.on("error", ensureDestroyed);
			session.on("frameError", ensureDestroyed);
			session.on("close", ensureDestroyed);
			if (connectionConfiguration.requestTimeout) session.setTimeout(connectionConfiguration.requestTimeout, ensureDestroyed);
			pool.offerLast(ref);
			ref.retain();
			return ref;
		}
		release(_requestContext, ref) {
			ref.free();
		}
		createIsolatedSession(requestContext, connectionConfiguration) {
			const url = this.getUrlString(requestContext);
			const ref = new ClientHttp2SessionRef(this.connect(url));
			const session = ref.deref();
			session.settings({ maxConcurrentStreams: 1 });
			const ensureDestroyed = () => {
				ref.destroy();
			};
			session.on("error", ensureDestroyed);
			session.on("frameError", ensureDestroyed);
			session.on("close", ensureDestroyed);
			const timeout = connectionConfiguration.requestTimeout ?? 3e5;
			session.setTimeout(timeout, ensureDestroyed);
			ref.retain();
			return ref;
		}
		destroy() {
			for (const [url, connectionPool] of this.connectionPools) {
				for (const session of [...connectionPool]) session.destroy();
				this.connectionPools.delete(url);
			}
		}
		setMaxConcurrentStreams(maxConcurrentStreams) {
			if (maxConcurrentStreams && maxConcurrentStreams <= 0) throw new RangeError("maxConcurrentStreams must be greater than zero.");
			this.config.maxConcurrency = maxConcurrentStreams;
			for (const pool of this.connectionPools.values()) pool.setMaxConcurrency(maxConcurrentStreams);
		}
		setDisableConcurrentStreams(disableConcurrentStreams) {
			this.config.disableConcurrency = disableConcurrentStreams;
		}
		setNodeHttp2ConnectOptions(nodeHttp2ConnectOptions) {
			this.connectOptions = nodeHttp2ConnectOptions;
		}
		debug() {
			const pools = {};
			for (const [url, pool] of this.connectionPools) {
				const sessions = [];
				for (const ref of pool) sessions.push({
					id: ref.id,
					active: ref.useCount(),
					maxConcurrent: ref.max,
					totalRequests: ref.total
				});
				pools[url] = { sessions };
			}
			return pools;
		}
		removeFromPoolAndClose(authority, ref) {
			this.connectionPools.get(authority)?.remove(ref);
			ref.close();
		}
		removeFromPoolAndCheckedDestroy(authority, ref) {
			this.connectionPools.get(authority)?.remove(ref);
			ref.destroy();
		}
		getPool(url) {
			if (!this.connectionPools.has(url)) {
				const pool = new NodeHttp2ConnectionPool();
				if (this.config.maxConcurrency) pool.setMaxConcurrency(this.config.maxConcurrency);
				this.connectionPools.set(url, pool);
			}
			return this.connectionPools.get(url);
		}
		getUrlString(request) {
			return request.destination.toString();
		}
		connect(url) {
			return this.connectOptions === void 0 ? http2.connect(url) : http2.connect(url, this.connectOptions);
		}
	};
	const { constants } = http2;
	var NodeHttp2Handler = class NodeHttp2Handler {
		config;
		configProvider;
		metadata = { handlerProtocol: "h2" };
		connectionManager = new NodeHttp2ConnectionManager({});
		static create(instanceOrOptions) {
			if (typeof instanceOrOptions?.handle === "function") return instanceOrOptions;
			return new NodeHttp2Handler(instanceOrOptions);
		}
		constructor(options) {
			this.configProvider = new Promise((resolve, reject) => {
				if (typeof options === "function") options().then((opts) => {
					resolve(opts || {});
				}).catch(reject);
				else resolve(options || {});
			});
		}
		destroy() {
			this.connectionManager.destroy();
		}
		async handle(request, { abortSignal, requestTimeout, isEventStream } = {}) {
			if (!this.config) {
				const config = await this.configProvider;
				this.config = {
					...config,
					defaultSocketTimeout: resolveDefaultSocketTimeout(config)
				};
				const { disableConcurrentStreams, maxConcurrentStreams, nodeHttp2ConnectOptions } = this.config;
				this.connectionManager.setDisableConcurrentStreams(disableConcurrentStreams ?? false);
				if (maxConcurrentStreams) this.connectionManager.setMaxConcurrentStreams(maxConcurrentStreams);
				if (nodeHttp2ConnectOptions) this.connectionManager.setNodeHttp2ConnectOptions(nodeHttp2ConnectOptions);
			}
			const { requestTimeout: configRequestTimeout, disableConcurrentStreams, sessionTimeout } = this.config;
			const useIsolatedSession = disableConcurrentStreams || isEventStream;
			const effectiveRequestTimeout = requestTimeout ?? configRequestTimeout;
			const defaultSocketTimeout = effectiveRequestTimeout === void 0 && sessionTimeout === void 0 ? this.config.defaultSocketTimeout : void 0;
			return new Promise((_resolve, _reject) => {
				let fulfilled = false;
				let writeRequestBodyPromise = void 0;
				const resolve = async (arg) => {
					await writeRequestBodyPromise;
					_resolve(arg);
				};
				const reject = async (arg) => {
					await writeRequestBodyPromise;
					_reject(arg);
				};
				if (abortSignal?.aborted) {
					fulfilled = true;
					reject(buildAbortError(abortSignal));
					return;
				}
				const { hostname, method, port, protocol, query } = request;
				let auth = "";
				if (request.username != null || request.password != null) auth = `${request.username ?? ""}:${request.password ?? ""}@`;
				const authority = `${protocol}//${auth}${hostname}${port ? `:${port}` : ""}`;
				const requestContext = { destination: new URL(authority) };
				const connectConfig = {
					requestTimeout: this.config?.sessionTimeout,
					isEventStream
				};
				const ref = useIsolatedSession ? this.connectionManager.createIsolatedSession(requestContext, connectConfig) : this.connectionManager.lease(requestContext, connectConfig);
				const session = ref.deref();
				const rejectWithDestroy = (err) => {
					if (useIsolatedSession) ref.destroy();
					fulfilled = true;
					reject(err);
				};
				const queryString = query ? buildQueryString(query) : "";
				let path = request.path;
				if (queryString) path += `?${queryString}`;
				if (request.fragment) path += `#${request.fragment}`;
				const clientHttp2Stream = session.request({
					...request.headers,
					[constants.HTTP2_HEADER_PATH]: path,
					[constants.HTTP2_HEADER_METHOD]: method
				});
				if (effectiveRequestTimeout) clientHttp2Stream.setTimeout(effectiveRequestTimeout, () => {
					clientHttp2Stream.close();
					const timeoutError = /* @__PURE__ */ new Error(`Stream timed out because of no activity for ${effectiveRequestTimeout} ms`);
					timeoutError.name = "TimeoutError";
					rejectWithDestroy(timeoutError);
				});
				else if (defaultSocketTimeout) {
					clientHttp2Stream.setTimeout(defaultSocketTimeout, () => {
						const timeoutError = /* @__PURE__ */ new Error(`Stream timed out because of no activity for ${defaultSocketTimeout} ms`);
						timeoutError.name = "TimeoutError";
						fulfilled = true;
						reject(timeoutError);
						clientHttp2Stream.destroy(timeoutError);
						if (useIsolatedSession) ref.destroy();
					});
					clientHttp2Stream.once("response", () => clientHttp2Stream.setTimeout(defaultSocketTimeout));
				}
				if (abortSignal) {
					const onAbort = () => {
						clientHttp2Stream.close();
						rejectWithDestroy(buildAbortError(abortSignal));
					};
					if (typeof abortSignal.addEventListener === "function") {
						const signal = abortSignal;
						signal.addEventListener("abort", onAbort, { once: true });
						clientHttp2Stream.once("close", () => signal.removeEventListener("abort", onAbort));
					} else abortSignal.onabort = onAbort;
				}
				clientHttp2Stream.on("frameError", (type, code, id) => {
					rejectWithDestroy(/* @__PURE__ */ new Error(`Frame type id ${type} in stream id ${id} has failed with code ${code}.`));
				});
				clientHttp2Stream.on("error", rejectWithDestroy);
				clientHttp2Stream.on("aborted", () => {
					rejectWithDestroy(/* @__PURE__ */ new Error(`HTTP/2 stream is abnormally aborted in mid-communication with result code ${clientHttp2Stream.rstCode}.`));
				});
				clientHttp2Stream.on("response", (headers) => {
					const httpResponse = new HttpResponse({
						statusCode: headers[":status"] ?? -1,
						headers: getTransformedHeaders(headers),
						body: clientHttp2Stream
					});
					fulfilled = true;
					resolve({ response: httpResponse });
					if (useIsolatedSession) {
						session.close();
						clientHttp2Stream.on("end", () => {
							ref.destroy();
						});
					}
				});
				clientHttp2Stream.on("close", () => {
					if (useIsolatedSession) ref.destroy();
					else this.connectionManager.release(requestContext, ref);
					if (!fulfilled) {
						const error = /* @__PURE__ */ new Error("Unexpected error: http2 request did not get a response");
						if (session.destroyed) error.name = "TimeoutError";
						rejectWithDestroy(error);
					}
				});
				writeRequestBodyPromise = writeRequestBody(clientHttp2Stream, request, effectiveRequestTimeout);
			});
		}
		updateHttpClientConfig(key, value) {
			this.config = void 0;
			this.configProvider = this.configProvider.then((config) => {
				switch (key) {
					case Symbol.for("@smithy/defaultSocketTimeout"):
						key = "defaultSocketTimeout";
						value = resolveDefaultSocketTimeout(config) ?? value;
						break;
				}
				return {
					...config,
					[key]: value
				};
			});
		}
		httpHandlerConfigs() {
			return this.config ?? {};
		}
	};
	exports.DEFAULT_REQUEST_TIMEOUT = DEFAULT_REQUEST_TIMEOUT;
	exports.NodeHttp2Handler = NodeHttp2Handler;
	exports.NodeHttpHandler = NodeHttpHandler;
}));
//#endregion
//#region node_modules/@smithy/util-body-length-node/dist-cjs/index.js
var require_dist_cjs$14 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.calculateBodyLength = void 0;
	var serde_1 = (init_serde(), __toCommonJS(serde_exports));
	Object.defineProperty(exports, "calculateBodyLength", {
		enumerable: true,
		get: function() {
			return serde_1.calculateBodyLength;
		}
	});
}));
//#endregion
//#region node_modules/@smithy/util-defaults-mode-node/dist-cjs/index.js
var require_dist_cjs$13 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.resolveDefaultsModeConfig = void 0;
	var config_1 = (init_config$1(), __toCommonJS(config_exports));
	Object.defineProperty(exports, "resolveDefaultsModeConfig", {
		enumerable: true,
		get: function() {
			return config_1.resolveDefaultsModeConfig;
		}
	});
}));
//#endregion
//#region node_modules/@smithy/util-retry/dist-cjs/index.js
var require_dist_cjs$12 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.TIMEOUT_RETRY_COST = exports.THROTTLING_RETRY_DELAY_BASE = exports.Retry = exports.RETRY_MODES = exports.RETRY_COST = exports.NO_RETRY_INCREMENT = exports.REQUEST_HEADER = exports.MAXIMUM_RETRY_DELAY = exports.INVOCATION_ID_HEADER = exports.INITIAL_RETRY_TOKENS = exports.DEFAULT_RETRY_MODE = exports.DEFAULT_RETRY_DELAY_BASE = exports.DEFAULT_MAX_ATTEMPTS = exports.StandardRetryStrategy = exports.DefaultRateLimiter = exports.ConfiguredRetryStrategy = exports.AdaptiveRetryStrategy = void 0;
	var retry_1 = (init_retry(), __toCommonJS(retry_exports));
	Object.defineProperty(exports, "AdaptiveRetryStrategy", {
		enumerable: true,
		get: function() {
			return retry_1.AdaptiveRetryStrategy;
		}
	});
	Object.defineProperty(exports, "ConfiguredRetryStrategy", {
		enumerable: true,
		get: function() {
			return retry_1.ConfiguredRetryStrategy;
		}
	});
	Object.defineProperty(exports, "DefaultRateLimiter", {
		enumerable: true,
		get: function() {
			return retry_1.DefaultRateLimiter;
		}
	});
	Object.defineProperty(exports, "StandardRetryStrategy", {
		enumerable: true,
		get: function() {
			return retry_1.StandardRetryStrategy;
		}
	});
	Object.defineProperty(exports, "DEFAULT_MAX_ATTEMPTS", {
		enumerable: true,
		get: function() {
			return retry_1.DEFAULT_MAX_ATTEMPTS;
		}
	});
	Object.defineProperty(exports, "DEFAULT_RETRY_DELAY_BASE", {
		enumerable: true,
		get: function() {
			return retry_1.DEFAULT_RETRY_DELAY_BASE;
		}
	});
	Object.defineProperty(exports, "DEFAULT_RETRY_MODE", {
		enumerable: true,
		get: function() {
			return retry_1.DEFAULT_RETRY_MODE;
		}
	});
	Object.defineProperty(exports, "INITIAL_RETRY_TOKENS", {
		enumerable: true,
		get: function() {
			return retry_1.INITIAL_RETRY_TOKENS;
		}
	});
	Object.defineProperty(exports, "INVOCATION_ID_HEADER", {
		enumerable: true,
		get: function() {
			return retry_1.INVOCATION_ID_HEADER;
		}
	});
	Object.defineProperty(exports, "MAXIMUM_RETRY_DELAY", {
		enumerable: true,
		get: function() {
			return retry_1.MAXIMUM_RETRY_DELAY;
		}
	});
	Object.defineProperty(exports, "REQUEST_HEADER", {
		enumerable: true,
		get: function() {
			return retry_1.REQUEST_HEADER;
		}
	});
	Object.defineProperty(exports, "NO_RETRY_INCREMENT", {
		enumerable: true,
		get: function() {
			return retry_1.NO_RETRY_INCREMENT;
		}
	});
	Object.defineProperty(exports, "RETRY_COST", {
		enumerable: true,
		get: function() {
			return retry_1.RETRY_COST;
		}
	});
	Object.defineProperty(exports, "RETRY_MODES", {
		enumerable: true,
		get: function() {
			return retry_1.RETRY_MODES;
		}
	});
	Object.defineProperty(exports, "Retry", {
		enumerable: true,
		get: function() {
			return retry_1.Retry;
		}
	});
	Object.defineProperty(exports, "THROTTLING_RETRY_DELAY_BASE", {
		enumerable: true,
		get: function() {
			return retry_1.THROTTLING_RETRY_DELAY_BASE;
		}
	});
	Object.defineProperty(exports, "TIMEOUT_RETRY_COST", {
		enumerable: true,
		get: function() {
			return retry_1.TIMEOUT_RETRY_COST;
		}
	});
}));
//#endregion
//#region node_modules/@smithy/url-parser/dist-cjs/index.js
var require_dist_cjs$11 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.parseUrl = void 0;
	var protocols_1 = (init_protocols$1(), __toCommonJS(protocols_exports));
	Object.defineProperty(exports, "parseUrl", {
		enumerable: true,
		get: function() {
			return protocols_1.parseUrl;
		}
	});
}));
//#endregion
//#region node_modules/@smithy/util-base64/dist-cjs/index.js
var require_dist_cjs$10 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.toBase64 = exports.fromBase64 = void 0;
	var serde_1 = (init_serde(), __toCommonJS(serde_exports));
	Object.defineProperty(exports, "fromBase64", {
		enumerable: true,
		get: function() {
			return serde_1.fromBase64;
		}
	});
	Object.defineProperty(exports, "toBase64", {
		enumerable: true,
		get: function() {
			return serde_1.toBase64;
		}
	});
}));
//#endregion
//#region node_modules/@smithy/util-stream/dist-cjs/index.js
var require_dist_cjs$9 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.isBlob = exports.isReadableStream = exports.splitStream = exports.sdkStreamMixin = exports.headStream = exports.getAwsChunkedEncodingStream = exports.createBufferedReadable = exports.createChecksumStream = exports.ChecksumStream = exports.Uint8ArrayBlobAdapter = void 0;
	var serde_1 = (init_serde(), __toCommonJS(serde_exports));
	Object.defineProperty(exports, "Uint8ArrayBlobAdapter", {
		enumerable: true,
		get: function() {
			return serde_1.Uint8ArrayBlobAdapter;
		}
	});
	Object.defineProperty(exports, "ChecksumStream", {
		enumerable: true,
		get: function() {
			return serde_1.ChecksumStream;
		}
	});
	Object.defineProperty(exports, "createChecksumStream", {
		enumerable: true,
		get: function() {
			return serde_1.createChecksumStream;
		}
	});
	Object.defineProperty(exports, "createBufferedReadable", {
		enumerable: true,
		get: function() {
			return serde_1.createBufferedReadable;
		}
	});
	Object.defineProperty(exports, "getAwsChunkedEncodingStream", {
		enumerable: true,
		get: function() {
			return serde_1.getAwsChunkedEncodingStream;
		}
	});
	Object.defineProperty(exports, "headStream", {
		enumerable: true,
		get: function() {
			return serde_1.headStream;
		}
	});
	Object.defineProperty(exports, "sdkStreamMixin", {
		enumerable: true,
		get: function() {
			return serde_1.sdkStreamMixin;
		}
	});
	Object.defineProperty(exports, "splitStream", {
		enumerable: true,
		get: function() {
			return serde_1.splitStream;
		}
	});
	Object.defineProperty(exports, "isReadableStream", {
		enumerable: true,
		get: function() {
			return serde_1.isReadableStream;
		}
	});
	Object.defineProperty(exports, "isBlob", {
		enumerable: true,
		get: function() {
			return serde_1.isBlob;
		}
	});
}));
//#endregion
//#region node_modules/@smithy/util-utf8/dist-cjs/index.js
var require_dist_cjs$8 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.toUtf8 = exports.toUint8Array = exports.fromUtf8 = void 0;
	var serde_1 = (init_serde(), __toCommonJS(serde_exports));
	Object.defineProperty(exports, "fromUtf8", {
		enumerable: true,
		get: function() {
			return serde_1.fromUtf8;
		}
	});
	Object.defineProperty(exports, "toUint8Array", {
		enumerable: true,
		get: function() {
			return serde_1.toUint8Array;
		}
	});
	Object.defineProperty(exports, "toUtf8", {
		enumerable: true,
		get: function() {
			return serde_1.toUtf8;
		}
	});
}));
//#endregion
//#region node_modules/@aws-sdk/client-s3/dist-cjs/runtimeConfig.shared.js
var require_runtimeConfig_shared = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.getRuntimeConfig = void 0;
	const httpAuthSchemes_1 = (init_httpAuthSchemes(), __toCommonJS(httpAuthSchemes_exports));
	const middleware_sdk_s3_1 = (init_dist_es(), __toCommonJS(dist_es_exports));
	const signature_v4_multi_region_1 = require_dist_cjs$38();
	const smithy_client_1 = require_dist_cjs$25();
	const url_parser_1 = require_dist_cjs$11();
	const util_base64_1 = require_dist_cjs$10();
	const util_stream_1 = require_dist_cjs$9();
	const util_utf8_1 = require_dist_cjs$8();
	const httpAuthSchemeProvider_1 = require_httpAuthSchemeProvider();
	const endpointResolver_1 = require_endpointResolver();
	const schemas_0_1 = require_schemas_0();
	const getRuntimeConfig = (config) => {
		return {
			apiVersion: "2006-03-01",
			base64Decoder: config?.base64Decoder ?? util_base64_1.fromBase64,
			base64Encoder: config?.base64Encoder ?? util_base64_1.toBase64,
			disableHostPrefix: config?.disableHostPrefix ?? false,
			endpointProvider: config?.endpointProvider ?? endpointResolver_1.defaultEndpointResolver,
			extensions: config?.extensions ?? [],
			getAwsChunkedEncodingStream: config?.getAwsChunkedEncodingStream ?? util_stream_1.getAwsChunkedEncodingStream,
			httpAuthSchemeProvider: config?.httpAuthSchemeProvider ?? httpAuthSchemeProvider_1.defaultS3HttpAuthSchemeProvider,
			httpAuthSchemes: config?.httpAuthSchemes ?? [{
				schemeId: "aws.auth#sigv4",
				identityProvider: (ipc) => ipc.getIdentityProvider("aws.auth#sigv4"),
				signer: new httpAuthSchemes_1.AwsSdkSigV4Signer()
			}, {
				schemeId: "aws.auth#sigv4a",
				identityProvider: (ipc) => ipc.getIdentityProvider("aws.auth#sigv4a"),
				signer: new httpAuthSchemes_1.AwsSdkSigV4ASigner()
			}],
			logger: config?.logger ?? new smithy_client_1.NoOpLogger(),
			protocol: config?.protocol ?? middleware_sdk_s3_1.S3RestXmlProtocol,
			protocolSettings: config?.protocolSettings ?? {
				defaultNamespace: "com.amazonaws.s3",
				errorTypeRegistries: schemas_0_1.errorTypeRegistries,
				xmlNamespace: "http://s3.amazonaws.com/doc/2006-03-01/",
				version: "2006-03-01",
				serviceTarget: "AmazonS3"
			},
			sdkStreamMixin: config?.sdkStreamMixin ?? util_stream_1.sdkStreamMixin,
			serviceId: config?.serviceId ?? "S3",
			signerConstructor: config?.signerConstructor ?? signature_v4_multi_region_1.SignatureV4MultiRegion,
			signingEscapePath: config?.signingEscapePath ?? false,
			urlParser: config?.urlParser ?? url_parser_1.parseUrl,
			useArnRegion: config?.useArnRegion ?? void 0,
			utf8Decoder: config?.utf8Decoder ?? util_utf8_1.fromUtf8,
			utf8Encoder: config?.utf8Encoder ?? util_utf8_1.toUtf8
		};
	};
	exports.getRuntimeConfig = getRuntimeConfig;
}));
//#endregion
//#region node_modules/@aws-sdk/client-s3/dist-cjs/runtimeConfig.js
var require_runtimeConfig = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.getRuntimeConfig = void 0;
	const package_json_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports)).__importDefault(require_package());
	const client_1 = (init_client(), __toCommonJS(client_exports));
	const httpAuthSchemes_1 = (init_httpAuthSchemes(), __toCommonJS(httpAuthSchemes_exports));
	const credential_provider_node_1 = __require("@aws-sdk/credential-provider-node");
	const middleware_bucket_endpoint_1 = require_dist_cjs$21();
	const middleware_flexible_checksums_1 = require_dist_cjs$35();
	const middleware_sdk_s3_1 = (init_dist_es(), __toCommonJS(dist_es_exports));
	const util_user_agent_node_1 = require_dist_cjs$20();
	const config_resolver_1 = require_dist_cjs$30();
	const eventstream_serde_node_1 = require_dist_cjs$19();
	const hash_node_1 = require_dist_cjs$18();
	const hash_stream_node_1 = require_dist_cjs$17();
	const middleware_retry_1 = require_dist_cjs$26();
	const node_config_provider_1 = require_dist_cjs$16();
	const node_http_handler_1 = require_dist_cjs$15();
	const smithy_client_1 = require_dist_cjs$25();
	const util_body_length_node_1 = require_dist_cjs$14();
	const util_defaults_mode_node_1 = require_dist_cjs$13();
	const util_retry_1 = require_dist_cjs$12();
	const runtimeConfig_shared_1 = require_runtimeConfig_shared();
	const getRuntimeConfig = (config) => {
		(0, smithy_client_1.emitWarningIfUnsupportedVersion)(process.version);
		const defaultsMode = (0, util_defaults_mode_node_1.resolveDefaultsModeConfig)(config);
		const defaultConfigProvider = () => defaultsMode().then(smithy_client_1.loadConfigsForDefaultMode);
		const clientSharedValues = (0, runtimeConfig_shared_1.getRuntimeConfig)(config);
		(0, client_1.emitWarningIfUnsupportedVersion)(process.version);
		const loaderConfig = {
			profile: config?.profile,
			logger: clientSharedValues.logger
		};
		return {
			...clientSharedValues,
			...config,
			runtime: "node",
			defaultsMode,
			authSchemePreference: config?.authSchemePreference ?? (0, node_config_provider_1.loadConfig)(httpAuthSchemes_1.NODE_AUTH_SCHEME_PREFERENCE_OPTIONS, loaderConfig),
			bodyLengthChecker: config?.bodyLengthChecker ?? util_body_length_node_1.calculateBodyLength,
			credentialDefaultProvider: config?.credentialDefaultProvider ?? credential_provider_node_1.defaultProvider,
			defaultUserAgentProvider: config?.defaultUserAgentProvider ?? (0, util_user_agent_node_1.createDefaultUserAgentProvider)({
				serviceId: clientSharedValues.serviceId,
				clientVersion: package_json_1.default.version
			}),
			disableS3ExpressSessionAuth: config?.disableS3ExpressSessionAuth ?? (0, node_config_provider_1.loadConfig)(middleware_sdk_s3_1.NODE_DISABLE_S3_EXPRESS_SESSION_AUTH_OPTIONS, loaderConfig),
			eventStreamSerdeProvider: config?.eventStreamSerdeProvider ?? eventstream_serde_node_1.eventStreamSerdeProvider,
			maxAttempts: config?.maxAttempts ?? (0, node_config_provider_1.loadConfig)(middleware_retry_1.NODE_MAX_ATTEMPT_CONFIG_OPTIONS, config),
			md5: config?.md5 ?? hash_node_1.Hash.bind(null, "md5"),
			region: config?.region ?? (0, node_config_provider_1.loadConfig)(config_resolver_1.NODE_REGION_CONFIG_OPTIONS, {
				...config_resolver_1.NODE_REGION_CONFIG_FILE_OPTIONS,
				...loaderConfig
			}),
			requestChecksumCalculation: config?.requestChecksumCalculation ?? (0, node_config_provider_1.loadConfig)(middleware_flexible_checksums_1.NODE_REQUEST_CHECKSUM_CALCULATION_CONFIG_OPTIONS, loaderConfig),
			requestHandler: node_http_handler_1.NodeHttpHandler.create(config?.requestHandler ?? defaultConfigProvider),
			responseChecksumValidation: config?.responseChecksumValidation ?? (0, node_config_provider_1.loadConfig)(middleware_flexible_checksums_1.NODE_RESPONSE_CHECKSUM_VALIDATION_CONFIG_OPTIONS, loaderConfig),
			retryMode: config?.retryMode ?? (0, node_config_provider_1.loadConfig)({
				...middleware_retry_1.NODE_RETRY_MODE_CONFIG_OPTIONS,
				default: async () => (await defaultConfigProvider()).retryMode || util_retry_1.DEFAULT_RETRY_MODE
			}, config),
			sha1: config?.sha1 ?? hash_node_1.Hash.bind(null, "sha1"),
			sha256: config?.sha256 ?? hash_node_1.Hash.bind(null, "sha256"),
			sigv4aSigningRegionSet: config?.sigv4aSigningRegionSet ?? (0, node_config_provider_1.loadConfig)(httpAuthSchemes_1.NODE_SIGV4A_CONFIG_OPTIONS, loaderConfig),
			streamCollector: config?.streamCollector ?? node_http_handler_1.streamCollector,
			streamHasher: config?.streamHasher ?? hash_stream_node_1.readableStreamHasher,
			useArnRegion: config?.useArnRegion ?? (0, node_config_provider_1.loadConfig)(middleware_bucket_endpoint_1.NODE_USE_ARN_REGION_CONFIG_OPTIONS, loaderConfig),
			useDualstackEndpoint: config?.useDualstackEndpoint ?? (0, node_config_provider_1.loadConfig)(config_resolver_1.NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS, loaderConfig),
			useFipsEndpoint: config?.useFipsEndpoint ?? (0, node_config_provider_1.loadConfig)(config_resolver_1.NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS, loaderConfig),
			userAgentAppId: config?.userAgentAppId ?? (0, node_config_provider_1.loadConfig)(util_user_agent_node_1.NODE_APP_ID_CONFIG_OPTIONS, loaderConfig)
		};
	};
	exports.getRuntimeConfig = getRuntimeConfig;
}));
//#endregion
//#region node_modules/@aws-sdk/region-config-resolver/dist-cjs/index.js
var require_dist_cjs$7 = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { NODE_REGION_CONFIG_FILE_OPTIONS, NODE_REGION_CONFIG_OPTIONS, REGION_ENV_NAME, REGION_INI_NAME, getAwsRegionExtensionConfiguration, resolveAwsRegionExtensionConfiguration, resolveRegionConfig, stsRegionDefaultResolver, stsRegionWarning: warning } = (init_client(), __toCommonJS(client_exports));
	exports.NODE_REGION_CONFIG_FILE_OPTIONS = NODE_REGION_CONFIG_FILE_OPTIONS;
	exports.NODE_REGION_CONFIG_OPTIONS = NODE_REGION_CONFIG_OPTIONS;
	exports.REGION_ENV_NAME = REGION_ENV_NAME;
	exports.REGION_INI_NAME = REGION_INI_NAME;
	exports.getAwsRegionExtensionConfiguration = getAwsRegionExtensionConfiguration;
	exports.resolveAwsRegionExtensionConfiguration = resolveAwsRegionExtensionConfiguration;
	exports.resolveRegionConfig = resolveRegionConfig;
	exports.stsRegionDefaultResolver = stsRegionDefaultResolver;
	exports.warning = warning;
}));
//#endregion
//#region node_modules/@smithy/protocol-http/dist-cjs/index.js
var require_dist_cjs$6 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.resolveHttpHandlerRuntimeConfig = exports.getHttpHandlerExtensionConfiguration = exports.isValidHostname = exports.HttpResponse = exports.HttpRequest = exports.Fields = exports.Field = void 0;
	var protocols_1 = (init_protocols$1(), __toCommonJS(protocols_exports));
	Object.defineProperty(exports, "Field", {
		enumerable: true,
		get: function() {
			return protocols_1.Field;
		}
	});
	Object.defineProperty(exports, "Fields", {
		enumerable: true,
		get: function() {
			return protocols_1.Fields;
		}
	});
	Object.defineProperty(exports, "HttpRequest", {
		enumerable: true,
		get: function() {
			return protocols_1.HttpRequest;
		}
	});
	Object.defineProperty(exports, "HttpResponse", {
		enumerable: true,
		get: function() {
			return protocols_1.HttpResponse;
		}
	});
	Object.defineProperty(exports, "isValidHostname", {
		enumerable: true,
		get: function() {
			return protocols_1.isValidHostname;
		}
	});
	Object.defineProperty(exports, "getHttpHandlerExtensionConfiguration", {
		enumerable: true,
		get: function() {
			return protocols_1.getHttpHandlerExtensionConfiguration;
		}
	});
	Object.defineProperty(exports, "resolveHttpHandlerRuntimeConfig", {
		enumerable: true,
		get: function() {
			return protocols_1.resolveHttpHandlerRuntimeConfig;
		}
	});
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-ssec/dist-cjs/index.js
var require_dist_cjs$5 = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { getSsecPlugin, isValidBase64EncodedSSECustomerKey, ssecMiddleware, ssecMiddlewareOptions } = (init_s3(), __toCommonJS(s3_exports));
	exports.getSsecPlugin = getSsecPlugin;
	exports.isValidBase64EncodedSSECustomerKey = isValidBase64EncodedSSECustomerKey;
	exports.ssecMiddleware = ssecMiddleware;
	exports.ssecMiddlewareOptions = ssecMiddlewareOptions;
}));
//#endregion
//#region node_modules/@aws-sdk/middleware-location-constraint/dist-cjs/index.js
var require_dist_cjs$4 = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { getLocationConstraintPlugin, locationConstraintMiddleware, locationConstraintMiddlewareOptions } = (init_s3(), __toCommonJS(s3_exports));
	exports.getLocationConstraintPlugin = getLocationConstraintPlugin;
	exports.locationConstraintMiddleware = locationConstraintMiddleware;
	exports.locationConstraintMiddlewareOptions = locationConstraintMiddlewareOptions;
}));
//#endregion
//#region node_modules/@smithy/util-waiter/dist-cjs/index.js
var require_dist_cjs$3 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.checkExceptions = exports.WaiterState = exports.waiterServiceDefaults = exports.createWaiter = void 0;
	var client_1 = (init_client$1(), __toCommonJS(client_exports$1));
	Object.defineProperty(exports, "createWaiter", {
		enumerable: true,
		get: function() {
			return client_1.createWaiter;
		}
	});
	Object.defineProperty(exports, "waiterServiceDefaults", {
		enumerable: true,
		get: function() {
			return client_1.waiterServiceDefaults;
		}
	});
	Object.defineProperty(exports, "WaiterState", {
		enumerable: true,
		get: function() {
			return client_1.WaiterState;
		}
	});
	Object.defineProperty(exports, "checkExceptions", {
		enumerable: true,
		get: function() {
			return client_1.checkExceptions;
		}
	});
}));
//#endregion
//#region node_modules/@aws-sdk/client-s3/dist-cjs/index.js
var require_dist_cjs$2 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var middlewareExpectContinue = require_dist_cjs$36();
	var middlewareFlexibleChecksums = require_dist_cjs$35();
	var middlewareHostHeader = require_dist_cjs$34();
	var middlewareLogger = require_dist_cjs$33();
	var middlewareRecursionDetection = require_dist_cjs$32();
	var middlewareSdkS3 = (init_dist_es(), __toCommonJS(dist_es_exports));
	var middlewareUserAgent = require_dist_cjs$31();
	var configResolver = require_dist_cjs$30();
	var core = (init_dist_es$1(), __toCommonJS(dist_es_exports$1));
	var schema = (init_schema(), __toCommonJS(schema_exports));
	var eventstreamSerdeConfigResolver = require_dist_cjs$29();
	var middlewareContentLength = require_dist_cjs$28();
	var middlewareEndpoint = require_dist_cjs$27();
	var middlewareRetry = require_dist_cjs$26();
	var smithyClient = require_dist_cjs$25();
	var httpAuthSchemeProvider = require_httpAuthSchemeProvider();
	var schemas_0 = require_schemas_0();
	var runtimeConfig = require_runtimeConfig();
	var regionConfigResolver = require_dist_cjs$7();
	var protocolHttp = require_dist_cjs$6();
	var middlewareSsec = require_dist_cjs$5();
	var middlewareLocationConstraint = require_dist_cjs$4();
	var utilWaiter = require_dist_cjs$3();
	var errors = require_errors();
	var S3ServiceException = require_S3ServiceException();
	const resolveClientEndpointParameters = (options) => {
		return Object.assign(options, {
			useFipsEndpoint: options.useFipsEndpoint ?? false,
			useDualstackEndpoint: options.useDualstackEndpoint ?? false,
			forcePathStyle: options.forcePathStyle ?? false,
			useAccelerateEndpoint: options.useAccelerateEndpoint ?? false,
			useGlobalEndpoint: options.useGlobalEndpoint ?? false,
			disableMultiregionAccessPoints: options.disableMultiregionAccessPoints ?? false,
			defaultSigningName: "s3",
			clientContextParams: options.clientContextParams ?? {}
		});
	};
	const commonParams = {
		ForcePathStyle: {
			type: "clientContextParams",
			name: "forcePathStyle"
		},
		UseArnRegion: {
			type: "clientContextParams",
			name: "useArnRegion"
		},
		DisableMultiRegionAccessPoints: {
			type: "clientContextParams",
			name: "disableMultiregionAccessPoints"
		},
		Accelerate: {
			type: "clientContextParams",
			name: "useAccelerateEndpoint"
		},
		DisableS3ExpressSessionAuth: {
			type: "clientContextParams",
			name: "disableS3ExpressSessionAuth"
		},
		UseGlobalEndpoint: {
			type: "builtInParams",
			name: "useGlobalEndpoint"
		},
		UseFIPS: {
			type: "builtInParams",
			name: "useFipsEndpoint"
		},
		Endpoint: {
			type: "builtInParams",
			name: "endpoint"
		},
		Region: {
			type: "builtInParams",
			name: "region"
		},
		UseDualStack: {
			type: "builtInParams",
			name: "useDualstackEndpoint"
		}
	};
	var CreateSessionCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		DisableS3ExpressSessionAuth: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "CreateSession", {}).n("S3Client", "CreateSessionCommand").sc(schemas_0.CreateSession$).build() {};
	const getHttpAuthExtensionConfiguration = (runtimeConfig) => {
		const _httpAuthSchemes = runtimeConfig.httpAuthSchemes;
		let _httpAuthSchemeProvider = runtimeConfig.httpAuthSchemeProvider;
		let _credentials = runtimeConfig.credentials;
		return {
			setHttpAuthScheme(httpAuthScheme) {
				const index = _httpAuthSchemes.findIndex((scheme) => scheme.schemeId === httpAuthScheme.schemeId);
				if (index === -1) _httpAuthSchemes.push(httpAuthScheme);
				else _httpAuthSchemes.splice(index, 1, httpAuthScheme);
			},
			httpAuthSchemes() {
				return _httpAuthSchemes;
			},
			setHttpAuthSchemeProvider(httpAuthSchemeProvider) {
				_httpAuthSchemeProvider = httpAuthSchemeProvider;
			},
			httpAuthSchemeProvider() {
				return _httpAuthSchemeProvider;
			},
			setCredentials(credentials) {
				_credentials = credentials;
			},
			credentials() {
				return _credentials;
			}
		};
	};
	const resolveHttpAuthRuntimeConfig = (config) => {
		return {
			httpAuthSchemes: config.httpAuthSchemes(),
			httpAuthSchemeProvider: config.httpAuthSchemeProvider(),
			credentials: config.credentials()
		};
	};
	const resolveRuntimeExtensions = (runtimeConfig, extensions) => {
		const extensionConfiguration = Object.assign(regionConfigResolver.getAwsRegionExtensionConfiguration(runtimeConfig), smithyClient.getDefaultExtensionConfiguration(runtimeConfig), protocolHttp.getHttpHandlerExtensionConfiguration(runtimeConfig), getHttpAuthExtensionConfiguration(runtimeConfig));
		extensions.forEach((extension) => extension.configure(extensionConfiguration));
		return Object.assign(runtimeConfig, regionConfigResolver.resolveAwsRegionExtensionConfiguration(extensionConfiguration), smithyClient.resolveDefaultRuntimeConfig(extensionConfiguration), protocolHttp.resolveHttpHandlerRuntimeConfig(extensionConfiguration), resolveHttpAuthRuntimeConfig(extensionConfiguration));
	};
	var S3Client = class extends smithyClient.Client {
		config;
		constructor(...[configuration]) {
			const _config_0 = runtimeConfig.getRuntimeConfig(configuration || {});
			super(_config_0);
			this.initConfig = _config_0;
			const _config_1 = resolveClientEndpointParameters(_config_0);
			const _config_2 = middlewareUserAgent.resolveUserAgentConfig(_config_1);
			const _config_3 = middlewareFlexibleChecksums.resolveFlexibleChecksumsConfig(_config_2);
			const _config_4 = middlewareRetry.resolveRetryConfig(_config_3);
			const _config_5 = configResolver.resolveRegionConfig(_config_4);
			const _config_6 = middlewareHostHeader.resolveHostHeaderConfig(_config_5);
			const _config_7 = middlewareEndpoint.resolveEndpointConfig(_config_6);
			const _config_8 = eventstreamSerdeConfigResolver.resolveEventStreamSerdeConfig(_config_7);
			const _config_9 = httpAuthSchemeProvider.resolveHttpAuthSchemeConfig(_config_8);
			this.config = resolveRuntimeExtensions(middlewareSdkS3.resolveS3Config(_config_9, { session: [() => this, CreateSessionCommand] }), configuration?.extensions || []);
			this.middlewareStack.use(schema.getSchemaSerdePlugin(this.config));
			this.middlewareStack.use(middlewareUserAgent.getUserAgentPlugin(this.config));
			this.middlewareStack.use(middlewareRetry.getRetryPlugin(this.config));
			this.middlewareStack.use(middlewareContentLength.getContentLengthPlugin(this.config));
			this.middlewareStack.use(middlewareHostHeader.getHostHeaderPlugin(this.config));
			this.middlewareStack.use(middlewareLogger.getLoggerPlugin(this.config));
			this.middlewareStack.use(middlewareRecursionDetection.getRecursionDetectionPlugin(this.config));
			this.middlewareStack.use(core.getHttpAuthSchemeEndpointRuleSetPlugin(this.config, {
				httpAuthSchemeParametersProvider: httpAuthSchemeProvider.defaultS3HttpAuthSchemeParametersProvider,
				identityProviderConfigProvider: async (config) => new core.DefaultIdentityProviderConfig({
					"aws.auth#sigv4": config.credentials,
					"aws.auth#sigv4a": config.credentials
				})
			}));
			this.middlewareStack.use(core.getHttpSigningPlugin(this.config));
			this.middlewareStack.use(middlewareSdkS3.getValidateBucketNamePlugin(this.config));
			this.middlewareStack.use(middlewareExpectContinue.getAddExpectContinuePlugin(this.config));
			this.middlewareStack.use(middlewareSdkS3.getRegionRedirectMiddlewarePlugin(this.config));
			this.middlewareStack.use(middlewareSdkS3.getS3ExpressPlugin(this.config));
			this.middlewareStack.use(middlewareSdkS3.getS3ExpressHttpSigningPlugin(this.config));
		}
		destroy() {
			super.destroy();
		}
	};
	var AbortMultipartUploadCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		},
		Key: {
			type: "contextParams",
			name: "Key"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "AbortMultipartUpload", {}).n("S3Client", "AbortMultipartUploadCommand").sc(schemas_0.AbortMultipartUpload$).build() {};
	var CompleteMultipartUploadCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		},
		Key: {
			type: "contextParams",
			name: "Key"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config),
			middlewareSsec.getSsecPlugin(config)
		];
	}).s("AmazonS3", "CompleteMultipartUpload", {}).n("S3Client", "CompleteMultipartUploadCommand").sc(schemas_0.CompleteMultipartUpload$).build() {};
	var CopyObjectCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		DisableS3ExpressSessionAuth: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		},
		Key: {
			type: "contextParams",
			name: "Key"
		},
		CopySource: {
			type: "contextParams",
			name: "CopySource"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config),
			middlewareSsec.getSsecPlugin(config)
		];
	}).s("AmazonS3", "CopyObject", {}).n("S3Client", "CopyObjectCommand").sc(schemas_0.CopyObject$).build() {};
	var CreateBucketCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		DisableAccessPoints: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config),
			middlewareLocationConstraint.getLocationConstraintPlugin(config)
		];
	}).s("AmazonS3", "CreateBucket", {}).n("S3Client", "CreateBucketCommand").sc(schemas_0.CreateBucket$).build() {};
	var CreateBucketMetadataConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
			requestAlgorithmMember: {
				"httpHeader": "x-amz-sdk-checksum-algorithm",
				"name": "ChecksumAlgorithm"
			},
			requestChecksumRequired: true
		})];
	}).s("AmazonS3", "CreateBucketMetadataConfiguration", {}).n("S3Client", "CreateBucketMetadataConfigurationCommand").sc(schemas_0.CreateBucketMetadataConfiguration$).build() {};
	var CreateBucketMetadataTableConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
			requestAlgorithmMember: {
				"httpHeader": "x-amz-sdk-checksum-algorithm",
				"name": "ChecksumAlgorithm"
			},
			requestChecksumRequired: true
		})];
	}).s("AmazonS3", "CreateBucketMetadataTableConfiguration", {}).n("S3Client", "CreateBucketMetadataTableConfigurationCommand").sc(schemas_0.CreateBucketMetadataTableConfiguration$).build() {};
	var CreateMultipartUploadCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		},
		Key: {
			type: "contextParams",
			name: "Key"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config),
			middlewareSsec.getSsecPlugin(config)
		];
	}).s("AmazonS3", "CreateMultipartUpload", {}).n("S3Client", "CreateMultipartUploadCommand").sc(schemas_0.CreateMultipartUpload$).build() {};
	var DeleteBucketAnalyticsConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "DeleteBucketAnalyticsConfiguration", {}).n("S3Client", "DeleteBucketAnalyticsConfigurationCommand").sc(schemas_0.DeleteBucketAnalyticsConfiguration$).build() {};
	var DeleteBucketCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "DeleteBucket", {}).n("S3Client", "DeleteBucketCommand").sc(schemas_0.DeleteBucket$).build() {};
	var DeleteBucketCorsCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "DeleteBucketCors", {}).n("S3Client", "DeleteBucketCorsCommand").sc(schemas_0.DeleteBucketCors$).build() {};
	var DeleteBucketEncryptionCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "DeleteBucketEncryption", {}).n("S3Client", "DeleteBucketEncryptionCommand").sc(schemas_0.DeleteBucketEncryption$).build() {};
	var DeleteBucketIntelligentTieringConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "DeleteBucketIntelligentTieringConfiguration", {}).n("S3Client", "DeleteBucketIntelligentTieringConfigurationCommand").sc(schemas_0.DeleteBucketIntelligentTieringConfiguration$).build() {};
	var DeleteBucketInventoryConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "DeleteBucketInventoryConfiguration", {}).n("S3Client", "DeleteBucketInventoryConfigurationCommand").sc(schemas_0.DeleteBucketInventoryConfiguration$).build() {};
	var DeleteBucketLifecycleCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "DeleteBucketLifecycle", {}).n("S3Client", "DeleteBucketLifecycleCommand").sc(schemas_0.DeleteBucketLifecycle$).build() {};
	var DeleteBucketMetadataConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "DeleteBucketMetadataConfiguration", {}).n("S3Client", "DeleteBucketMetadataConfigurationCommand").sc(schemas_0.DeleteBucketMetadataConfiguration$).build() {};
	var DeleteBucketMetadataTableConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "DeleteBucketMetadataTableConfiguration", {}).n("S3Client", "DeleteBucketMetadataTableConfigurationCommand").sc(schemas_0.DeleteBucketMetadataTableConfiguration$).build() {};
	var DeleteBucketMetricsConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "DeleteBucketMetricsConfiguration", {}).n("S3Client", "DeleteBucketMetricsConfigurationCommand").sc(schemas_0.DeleteBucketMetricsConfiguration$).build() {};
	var DeleteBucketOwnershipControlsCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "DeleteBucketOwnershipControls", {}).n("S3Client", "DeleteBucketOwnershipControlsCommand").sc(schemas_0.DeleteBucketOwnershipControls$).build() {};
	var DeleteBucketPolicyCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "DeleteBucketPolicy", {}).n("S3Client", "DeleteBucketPolicyCommand").sc(schemas_0.DeleteBucketPolicy$).build() {};
	var DeleteBucketReplicationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "DeleteBucketReplication", {}).n("S3Client", "DeleteBucketReplicationCommand").sc(schemas_0.DeleteBucketReplication$).build() {};
	var DeleteBucketTaggingCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "DeleteBucketTagging", {}).n("S3Client", "DeleteBucketTaggingCommand").sc(schemas_0.DeleteBucketTagging$).build() {};
	var DeleteBucketWebsiteCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "DeleteBucketWebsite", {}).n("S3Client", "DeleteBucketWebsiteCommand").sc(schemas_0.DeleteBucketWebsite$).build() {};
	var DeleteObjectCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		},
		Key: {
			type: "contextParams",
			name: "Key"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "DeleteObject", {}).n("S3Client", "DeleteObjectCommand").sc(schemas_0.DeleteObject$).build() {};
	var DeleteObjectsCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
				requestAlgorithmMember: {
					"httpHeader": "x-amz-sdk-checksum-algorithm",
					"name": "ChecksumAlgorithm"
				},
				requestChecksumRequired: true
			}),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config)
		];
	}).s("AmazonS3", "DeleteObjects", {}).n("S3Client", "DeleteObjectsCommand").sc(schemas_0.DeleteObjects$).build() {};
	var DeleteObjectTaggingCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "DeleteObjectTagging", {}).n("S3Client", "DeleteObjectTaggingCommand").sc(schemas_0.DeleteObjectTagging$).build() {};
	var DeletePublicAccessBlockCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "DeletePublicAccessBlock", {}).n("S3Client", "DeletePublicAccessBlockCommand").sc(schemas_0.DeletePublicAccessBlock$).build() {};
	var GetBucketAbacCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketAbac", {}).n("S3Client", "GetBucketAbacCommand").sc(schemas_0.GetBucketAbac$).build() {};
	var GetBucketAccelerateConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketAccelerateConfiguration", {}).n("S3Client", "GetBucketAccelerateConfigurationCommand").sc(schemas_0.GetBucketAccelerateConfiguration$).build() {};
	var GetBucketAclCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketAcl", {}).n("S3Client", "GetBucketAclCommand").sc(schemas_0.GetBucketAcl$).build() {};
	var GetBucketAnalyticsConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketAnalyticsConfiguration", {}).n("S3Client", "GetBucketAnalyticsConfigurationCommand").sc(schemas_0.GetBucketAnalyticsConfiguration$).build() {};
	var GetBucketCorsCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketCors", {}).n("S3Client", "GetBucketCorsCommand").sc(schemas_0.GetBucketCors$).build() {};
	var GetBucketEncryptionCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketEncryption", {}).n("S3Client", "GetBucketEncryptionCommand").sc(schemas_0.GetBucketEncryption$).build() {};
	var GetBucketIntelligentTieringConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketIntelligentTieringConfiguration", {}).n("S3Client", "GetBucketIntelligentTieringConfigurationCommand").sc(schemas_0.GetBucketIntelligentTieringConfiguration$).build() {};
	var GetBucketInventoryConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketInventoryConfiguration", {}).n("S3Client", "GetBucketInventoryConfigurationCommand").sc(schemas_0.GetBucketInventoryConfiguration$).build() {};
	var GetBucketLifecycleConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketLifecycleConfiguration", {}).n("S3Client", "GetBucketLifecycleConfigurationCommand").sc(schemas_0.GetBucketLifecycleConfiguration$).build() {};
	var GetBucketLocationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketLocation", {}).n("S3Client", "GetBucketLocationCommand").sc(schemas_0.GetBucketLocation$).build() {};
	var GetBucketLoggingCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketLogging", {}).n("S3Client", "GetBucketLoggingCommand").sc(schemas_0.GetBucketLogging$).build() {};
	var GetBucketMetadataConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketMetadataConfiguration", {}).n("S3Client", "GetBucketMetadataConfigurationCommand").sc(schemas_0.GetBucketMetadataConfiguration$).build() {};
	var GetBucketMetadataTableConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketMetadataTableConfiguration", {}).n("S3Client", "GetBucketMetadataTableConfigurationCommand").sc(schemas_0.GetBucketMetadataTableConfiguration$).build() {};
	var GetBucketMetricsConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketMetricsConfiguration", {}).n("S3Client", "GetBucketMetricsConfigurationCommand").sc(schemas_0.GetBucketMetricsConfiguration$).build() {};
	var GetBucketNotificationConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketNotificationConfiguration", {}).n("S3Client", "GetBucketNotificationConfigurationCommand").sc(schemas_0.GetBucketNotificationConfiguration$).build() {};
	var GetBucketOwnershipControlsCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketOwnershipControls", {}).n("S3Client", "GetBucketOwnershipControlsCommand").sc(schemas_0.GetBucketOwnershipControls$).build() {};
	var GetBucketPolicyCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "GetBucketPolicy", {}).n("S3Client", "GetBucketPolicyCommand").sc(schemas_0.GetBucketPolicy$).build() {};
	var GetBucketPolicyStatusCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketPolicyStatus", {}).n("S3Client", "GetBucketPolicyStatusCommand").sc(schemas_0.GetBucketPolicyStatus$).build() {};
	var GetBucketReplicationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketReplication", {}).n("S3Client", "GetBucketReplicationCommand").sc(schemas_0.GetBucketReplication$).build() {};
	var GetBucketRequestPaymentCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketRequestPayment", {}).n("S3Client", "GetBucketRequestPaymentCommand").sc(schemas_0.GetBucketRequestPayment$).build() {};
	var GetBucketTaggingCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketTagging", {}).n("S3Client", "GetBucketTaggingCommand").sc(schemas_0.GetBucketTagging$).build() {};
	var GetBucketVersioningCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketVersioning", {}).n("S3Client", "GetBucketVersioningCommand").sc(schemas_0.GetBucketVersioning$).build() {};
	var GetBucketWebsiteCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetBucketWebsite", {}).n("S3Client", "GetBucketWebsiteCommand").sc(schemas_0.GetBucketWebsite$).build() {};
	var GetObjectAclCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		},
		Key: {
			type: "contextParams",
			name: "Key"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetObjectAcl", {}).n("S3Client", "GetObjectAclCommand").sc(schemas_0.GetObjectAcl$).build() {};
	var GetObjectAttributesCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config),
			middlewareSsec.getSsecPlugin(config)
		];
	}).s("AmazonS3", "GetObjectAttributes", {}).n("S3Client", "GetObjectAttributesCommand").sc(schemas_0.GetObjectAttributes$).build() {};
	var GetObjectCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		},
		Key: {
			type: "contextParams",
			name: "Key"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
				requestChecksumRequired: false,
				requestValidationModeMember: "ChecksumMode",
				"responseAlgorithms": [
					"CRC64NVME",
					"CRC32",
					"CRC32C",
					"SHA256",
					"SHA1",
					"SHA512",
					"MD5",
					"XXHASH64",
					"XXHASH3",
					"XXHASH128"
				]
			}),
			middlewareSsec.getSsecPlugin(config),
			middlewareSdkS3.getS3ExpiresMiddlewarePlugin(config)
		];
	}).s("AmazonS3", "GetObject", {}).n("S3Client", "GetObjectCommand").sc(schemas_0.GetObject$).build() {};
	var GetObjectLegalHoldCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetObjectLegalHold", {}).n("S3Client", "GetObjectLegalHoldCommand").sc(schemas_0.GetObjectLegalHold$).build() {};
	var GetObjectLockConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetObjectLockConfiguration", {}).n("S3Client", "GetObjectLockConfigurationCommand").sc(schemas_0.GetObjectLockConfiguration$).build() {};
	var GetObjectRetentionCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetObjectRetention", {}).n("S3Client", "GetObjectRetentionCommand").sc(schemas_0.GetObjectRetention$).build() {};
	var GetObjectTaggingCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetObjectTagging", {}).n("S3Client", "GetObjectTaggingCommand").sc(schemas_0.GetObjectTagging$).build() {};
	var GetObjectTorrentCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "GetObjectTorrent", {}).n("S3Client", "GetObjectTorrentCommand").sc(schemas_0.GetObjectTorrent$).build() {};
	var GetPublicAccessBlockCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "GetPublicAccessBlock", {}).n("S3Client", "GetPublicAccessBlockCommand").sc(schemas_0.GetPublicAccessBlock$).build() {};
	var HeadBucketCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "HeadBucket", {}).n("S3Client", "HeadBucketCommand").sc(schemas_0.HeadBucket$).build() {};
	var HeadObjectCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		},
		Key: {
			type: "contextParams",
			name: "Key"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config),
			middlewareSsec.getSsecPlugin(config),
			middlewareSdkS3.getS3ExpiresMiddlewarePlugin(config)
		];
	}).s("AmazonS3", "HeadObject", {}).n("S3Client", "HeadObjectCommand").sc(schemas_0.HeadObject$).build() {};
	var ListBucketAnalyticsConfigurationsCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "ListBucketAnalyticsConfigurations", {}).n("S3Client", "ListBucketAnalyticsConfigurationsCommand").sc(schemas_0.ListBucketAnalyticsConfigurations$).build() {};
	var ListBucketIntelligentTieringConfigurationsCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "ListBucketIntelligentTieringConfigurations", {}).n("S3Client", "ListBucketIntelligentTieringConfigurationsCommand").sc(schemas_0.ListBucketIntelligentTieringConfigurations$).build() {};
	var ListBucketInventoryConfigurationsCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "ListBucketInventoryConfigurations", {}).n("S3Client", "ListBucketInventoryConfigurationsCommand").sc(schemas_0.ListBucketInventoryConfigurations$).build() {};
	var ListBucketMetricsConfigurationsCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "ListBucketMetricsConfigurations", {}).n("S3Client", "ListBucketMetricsConfigurationsCommand").sc(schemas_0.ListBucketMetricsConfigurations$).build() {};
	var ListBucketsCommand = class extends smithyClient.Command.classBuilder().ep(commonParams).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "ListBuckets", {}).n("S3Client", "ListBucketsCommand").sc(schemas_0.ListBuckets$).build() {};
	var ListDirectoryBucketsCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "ListDirectoryBuckets", {}).n("S3Client", "ListDirectoryBucketsCommand").sc(schemas_0.ListDirectoryBuckets$).build() {};
	var ListMultipartUploadsCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		},
		Prefix: {
			type: "contextParams",
			name: "Prefix"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "ListMultipartUploads", {}).n("S3Client", "ListMultipartUploadsCommand").sc(schemas_0.ListMultipartUploads$).build() {};
	var ListObjectsCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		},
		Prefix: {
			type: "contextParams",
			name: "Prefix"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "ListObjects", {}).n("S3Client", "ListObjectsCommand").sc(schemas_0.ListObjects$).build() {};
	var ListObjectsV2Command = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		},
		Prefix: {
			type: "contextParams",
			name: "Prefix"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "ListObjectsV2", {}).n("S3Client", "ListObjectsV2Command").sc(schemas_0.ListObjectsV2$).build() {};
	var ListObjectVersionsCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		},
		Prefix: {
			type: "contextParams",
			name: "Prefix"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "ListObjectVersions", {}).n("S3Client", "ListObjectVersionsCommand").sc(schemas_0.ListObjectVersions$).build() {};
	var ListPartsCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		},
		Key: {
			type: "contextParams",
			name: "Key"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config),
			middlewareSsec.getSsecPlugin(config)
		];
	}).s("AmazonS3", "ListParts", {}).n("S3Client", "ListPartsCommand").sc(schemas_0.ListParts$).build() {};
	var PutBucketAbacCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
			requestAlgorithmMember: {
				"httpHeader": "x-amz-sdk-checksum-algorithm",
				"name": "ChecksumAlgorithm"
			},
			requestChecksumRequired: false
		})];
	}).s("AmazonS3", "PutBucketAbac", {}).n("S3Client", "PutBucketAbacCommand").sc(schemas_0.PutBucketAbac$).build() {};
	var PutBucketAccelerateConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
			requestAlgorithmMember: {
				"httpHeader": "x-amz-sdk-checksum-algorithm",
				"name": "ChecksumAlgorithm"
			},
			requestChecksumRequired: false
		})];
	}).s("AmazonS3", "PutBucketAccelerateConfiguration", {}).n("S3Client", "PutBucketAccelerateConfigurationCommand").sc(schemas_0.PutBucketAccelerateConfiguration$).build() {};
	var PutBucketAclCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
			requestAlgorithmMember: {
				"httpHeader": "x-amz-sdk-checksum-algorithm",
				"name": "ChecksumAlgorithm"
			},
			requestChecksumRequired: true
		})];
	}).s("AmazonS3", "PutBucketAcl", {}).n("S3Client", "PutBucketAclCommand").sc(schemas_0.PutBucketAcl$).build() {};
	var PutBucketAnalyticsConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "PutBucketAnalyticsConfiguration", {}).n("S3Client", "PutBucketAnalyticsConfigurationCommand").sc(schemas_0.PutBucketAnalyticsConfiguration$).build() {};
	var PutBucketCorsCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
			requestAlgorithmMember: {
				"httpHeader": "x-amz-sdk-checksum-algorithm",
				"name": "ChecksumAlgorithm"
			},
			requestChecksumRequired: true
		})];
	}).s("AmazonS3", "PutBucketCors", {}).n("S3Client", "PutBucketCorsCommand").sc(schemas_0.PutBucketCors$).build() {};
	var PutBucketEncryptionCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
			requestAlgorithmMember: {
				"httpHeader": "x-amz-sdk-checksum-algorithm",
				"name": "ChecksumAlgorithm"
			},
			requestChecksumRequired: true
		})];
	}).s("AmazonS3", "PutBucketEncryption", {}).n("S3Client", "PutBucketEncryptionCommand").sc(schemas_0.PutBucketEncryption$).build() {};
	var PutBucketIntelligentTieringConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "PutBucketIntelligentTieringConfiguration", {}).n("S3Client", "PutBucketIntelligentTieringConfigurationCommand").sc(schemas_0.PutBucketIntelligentTieringConfiguration$).build() {};
	var PutBucketInventoryConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "PutBucketInventoryConfiguration", {}).n("S3Client", "PutBucketInventoryConfigurationCommand").sc(schemas_0.PutBucketInventoryConfiguration$).build() {};
	var PutBucketLifecycleConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
				requestAlgorithmMember: {
					"httpHeader": "x-amz-sdk-checksum-algorithm",
					"name": "ChecksumAlgorithm"
				},
				requestChecksumRequired: true
			}),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config)
		];
	}).s("AmazonS3", "PutBucketLifecycleConfiguration", {}).n("S3Client", "PutBucketLifecycleConfigurationCommand").sc(schemas_0.PutBucketLifecycleConfiguration$).build() {};
	var PutBucketLoggingCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
			requestAlgorithmMember: {
				"httpHeader": "x-amz-sdk-checksum-algorithm",
				"name": "ChecksumAlgorithm"
			},
			requestChecksumRequired: true
		})];
	}).s("AmazonS3", "PutBucketLogging", {}).n("S3Client", "PutBucketLoggingCommand").sc(schemas_0.PutBucketLogging$).build() {};
	var PutBucketMetricsConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "PutBucketMetricsConfiguration", {}).n("S3Client", "PutBucketMetricsConfigurationCommand").sc(schemas_0.PutBucketMetricsConfiguration$).build() {};
	var PutBucketNotificationConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "PutBucketNotificationConfiguration", {}).n("S3Client", "PutBucketNotificationConfigurationCommand").sc(schemas_0.PutBucketNotificationConfiguration$).build() {};
	var PutBucketOwnershipControlsCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
			requestAlgorithmMember: {
				"httpHeader": "x-amz-sdk-checksum-algorithm",
				"name": "ChecksumAlgorithm"
			},
			requestChecksumRequired: true
		})];
	}).s("AmazonS3", "PutBucketOwnershipControls", {}).n("S3Client", "PutBucketOwnershipControlsCommand").sc(schemas_0.PutBucketOwnershipControls$).build() {};
	var PutBucketPolicyCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
			requestAlgorithmMember: {
				"httpHeader": "x-amz-sdk-checksum-algorithm",
				"name": "ChecksumAlgorithm"
			},
			requestChecksumRequired: true
		})];
	}).s("AmazonS3", "PutBucketPolicy", {}).n("S3Client", "PutBucketPolicyCommand").sc(schemas_0.PutBucketPolicy$).build() {};
	var PutBucketReplicationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
			requestAlgorithmMember: {
				"httpHeader": "x-amz-sdk-checksum-algorithm",
				"name": "ChecksumAlgorithm"
			},
			requestChecksumRequired: true
		})];
	}).s("AmazonS3", "PutBucketReplication", {}).n("S3Client", "PutBucketReplicationCommand").sc(schemas_0.PutBucketReplication$).build() {};
	var PutBucketRequestPaymentCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
			requestAlgorithmMember: {
				"httpHeader": "x-amz-sdk-checksum-algorithm",
				"name": "ChecksumAlgorithm"
			},
			requestChecksumRequired: true
		})];
	}).s("AmazonS3", "PutBucketRequestPayment", {}).n("S3Client", "PutBucketRequestPaymentCommand").sc(schemas_0.PutBucketRequestPayment$).build() {};
	var PutBucketTaggingCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
			requestAlgorithmMember: {
				"httpHeader": "x-amz-sdk-checksum-algorithm",
				"name": "ChecksumAlgorithm"
			},
			requestChecksumRequired: true
		})];
	}).s("AmazonS3", "PutBucketTagging", {}).n("S3Client", "PutBucketTaggingCommand").sc(schemas_0.PutBucketTagging$).build() {};
	var PutBucketVersioningCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
			requestAlgorithmMember: {
				"httpHeader": "x-amz-sdk-checksum-algorithm",
				"name": "ChecksumAlgorithm"
			},
			requestChecksumRequired: true
		})];
	}).s("AmazonS3", "PutBucketVersioning", {}).n("S3Client", "PutBucketVersioningCommand").sc(schemas_0.PutBucketVersioning$).build() {};
	var PutBucketWebsiteCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
			requestAlgorithmMember: {
				"httpHeader": "x-amz-sdk-checksum-algorithm",
				"name": "ChecksumAlgorithm"
			},
			requestChecksumRequired: true
		})];
	}).s("AmazonS3", "PutBucketWebsite", {}).n("S3Client", "PutBucketWebsiteCommand").sc(schemas_0.PutBucketWebsite$).build() {};
	var PutObjectAclCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		},
		Key: {
			type: "contextParams",
			name: "Key"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
				requestAlgorithmMember: {
					"httpHeader": "x-amz-sdk-checksum-algorithm",
					"name": "ChecksumAlgorithm"
				},
				requestChecksumRequired: true
			}),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config)
		];
	}).s("AmazonS3", "PutObjectAcl", {}).n("S3Client", "PutObjectAclCommand").sc(schemas_0.PutObjectAcl$).build() {};
	var PutObjectCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		},
		Key: {
			type: "contextParams",
			name: "Key"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
				requestAlgorithmMember: {
					"httpHeader": "x-amz-sdk-checksum-algorithm",
					"name": "ChecksumAlgorithm"
				},
				requestChecksumRequired: false
			}),
			middlewareSdkS3.getCheckContentLengthHeaderPlugin(config),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config),
			middlewareSsec.getSsecPlugin(config)
		];
	}).s("AmazonS3", "PutObject", {}).n("S3Client", "PutObjectCommand").sc(schemas_0.PutObject$).build() {};
	var PutObjectLegalHoldCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
				requestAlgorithmMember: {
					"httpHeader": "x-amz-sdk-checksum-algorithm",
					"name": "ChecksumAlgorithm"
				},
				requestChecksumRequired: true
			}),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config)
		];
	}).s("AmazonS3", "PutObjectLegalHold", {}).n("S3Client", "PutObjectLegalHoldCommand").sc(schemas_0.PutObjectLegalHold$).build() {};
	var PutObjectLockConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
				requestAlgorithmMember: {
					"httpHeader": "x-amz-sdk-checksum-algorithm",
					"name": "ChecksumAlgorithm"
				},
				requestChecksumRequired: true
			}),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config)
		];
	}).s("AmazonS3", "PutObjectLockConfiguration", {}).n("S3Client", "PutObjectLockConfigurationCommand").sc(schemas_0.PutObjectLockConfiguration$).build() {};
	var PutObjectRetentionCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
				requestAlgorithmMember: {
					"httpHeader": "x-amz-sdk-checksum-algorithm",
					"name": "ChecksumAlgorithm"
				},
				requestChecksumRequired: true
			}),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config)
		];
	}).s("AmazonS3", "PutObjectRetention", {}).n("S3Client", "PutObjectRetentionCommand").sc(schemas_0.PutObjectRetention$).build() {};
	var PutObjectTaggingCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
				requestAlgorithmMember: {
					"httpHeader": "x-amz-sdk-checksum-algorithm",
					"name": "ChecksumAlgorithm"
				},
				requestChecksumRequired: true
			}),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config)
		];
	}).s("AmazonS3", "PutObjectTagging", {}).n("S3Client", "PutObjectTaggingCommand").sc(schemas_0.PutObjectTagging$).build() {};
	var PutPublicAccessBlockCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
			requestAlgorithmMember: {
				"httpHeader": "x-amz-sdk-checksum-algorithm",
				"name": "ChecksumAlgorithm"
			},
			requestChecksumRequired: true
		})];
	}).s("AmazonS3", "PutPublicAccessBlock", {}).n("S3Client", "PutPublicAccessBlockCommand").sc(schemas_0.PutPublicAccessBlock$).build() {};
	var RenameObjectCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		},
		Key: {
			type: "contextParams",
			name: "Key"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSdkS3.getThrow200ExceptionsPlugin(config)];
	}).s("AmazonS3", "RenameObject", {}).n("S3Client", "RenameObjectCommand").sc(schemas_0.RenameObject$).build() {};
	var RestoreObjectCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
				requestAlgorithmMember: {
					"httpHeader": "x-amz-sdk-checksum-algorithm",
					"name": "ChecksumAlgorithm"
				},
				requestChecksumRequired: false
			}),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config)
		];
	}).s("AmazonS3", "RestoreObject", {}).n("S3Client", "RestoreObjectCommand").sc(schemas_0.RestoreObject$).build() {};
	var SelectObjectContentCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareSsec.getSsecPlugin(config)];
	}).s("AmazonS3", "SelectObjectContent", { eventStream: { output: true } }).n("S3Client", "SelectObjectContentCommand").sc(schemas_0.SelectObjectContent$).build() {};
	var UpdateBucketMetadataInventoryTableConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
			requestAlgorithmMember: {
				"httpHeader": "x-amz-sdk-checksum-algorithm",
				"name": "ChecksumAlgorithm"
			},
			requestChecksumRequired: true
		})];
	}).s("AmazonS3", "UpdateBucketMetadataInventoryTableConfiguration", {}).n("S3Client", "UpdateBucketMetadataInventoryTableConfigurationCommand").sc(schemas_0.UpdateBucketMetadataInventoryTableConfiguration$).build() {};
	var UpdateBucketMetadataJournalTableConfigurationCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseS3ExpressControlEndpoint: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()), middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
			requestAlgorithmMember: {
				"httpHeader": "x-amz-sdk-checksum-algorithm",
				"name": "ChecksumAlgorithm"
			},
			requestChecksumRequired: true
		})];
	}).s("AmazonS3", "UpdateBucketMetadataJournalTableConfiguration", {}).n("S3Client", "UpdateBucketMetadataJournalTableConfigurationCommand").sc(schemas_0.UpdateBucketMetadataJournalTableConfiguration$).build() {};
	var UpdateObjectEncryptionCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
				requestAlgorithmMember: {
					"httpHeader": "x-amz-sdk-checksum-algorithm",
					"name": "ChecksumAlgorithm"
				},
				requestChecksumRequired: true
			}),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config)
		];
	}).s("AmazonS3", "UpdateObjectEncryption", {}).n("S3Client", "UpdateObjectEncryptionCommand").sc(schemas_0.UpdateObjectEncryption$).build() {};
	var UploadPartCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		},
		Key: {
			type: "contextParams",
			name: "Key"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareFlexibleChecksums.getFlexibleChecksumsPlugin(config, {
				requestAlgorithmMember: {
					"httpHeader": "x-amz-sdk-checksum-algorithm",
					"name": "ChecksumAlgorithm"
				},
				requestChecksumRequired: false
			}),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config),
			middlewareSsec.getSsecPlugin(config)
		];
	}).s("AmazonS3", "UploadPart", {}).n("S3Client", "UploadPartCommand").sc(schemas_0.UploadPart$).build() {};
	var UploadPartCopyCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		DisableS3ExpressSessionAuth: {
			type: "staticContextParams",
			value: true
		},
		Bucket: {
			type: "contextParams",
			name: "Bucket"
		}
	}).m(function(Command, cs, config, o) {
		return [
			middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions()),
			middlewareSdkS3.getThrow200ExceptionsPlugin(config),
			middlewareSsec.getSsecPlugin(config)
		];
	}).s("AmazonS3", "UploadPartCopy", {}).n("S3Client", "UploadPartCopyCommand").sc(schemas_0.UploadPartCopy$).build() {};
	var WriteGetObjectResponseCommand = class extends smithyClient.Command.classBuilder().ep({
		...commonParams,
		UseObjectLambdaEndpoint: {
			type: "staticContextParams",
			value: true
		}
	}).m(function(Command, cs, config, o) {
		return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
	}).s("AmazonS3", "WriteGetObjectResponse", {}).n("S3Client", "WriteGetObjectResponseCommand").sc(schemas_0.WriteGetObjectResponse$).build() {};
	const paginateListBuckets = core.createPaginator(S3Client, ListBucketsCommand, "ContinuationToken", "ContinuationToken", "MaxBuckets");
	const paginateListDirectoryBuckets = core.createPaginator(S3Client, ListDirectoryBucketsCommand, "ContinuationToken", "ContinuationToken", "MaxDirectoryBuckets");
	const paginateListObjectsV2 = core.createPaginator(S3Client, ListObjectsV2Command, "ContinuationToken", "NextContinuationToken", "MaxKeys");
	const paginateListParts = core.createPaginator(S3Client, ListPartsCommand, "PartNumberMarker", "NextPartNumberMarker", "MaxParts");
	const checkState$3 = async (client, input) => {
		let reason;
		try {
			reason = await client.send(new HeadBucketCommand(input));
			return {
				state: utilWaiter.WaiterState.SUCCESS,
				reason
			};
		} catch (exception) {
			reason = exception;
			if (exception.name === "NotFound") return {
				state: utilWaiter.WaiterState.RETRY,
				reason
			};
		}
		return {
			state: utilWaiter.WaiterState.RETRY,
			reason
		};
	};
	const waitForBucketExists = async (params, input) => {
		return utilWaiter.createWaiter({
			minDelay: 5,
			maxDelay: 120,
			...params
		}, input, checkState$3);
	};
	const waitUntilBucketExists = async (params, input) => {
		const result = await utilWaiter.createWaiter({
			minDelay: 5,
			maxDelay: 120,
			...params
		}, input, checkState$3);
		return utilWaiter.checkExceptions(result);
	};
	const checkState$2 = async (client, input) => {
		let reason;
		try {
			reason = await client.send(new HeadBucketCommand(input));
		} catch (exception) {
			reason = exception;
			if (exception.name === "NotFound") return {
				state: utilWaiter.WaiterState.SUCCESS,
				reason
			};
		}
		return {
			state: utilWaiter.WaiterState.RETRY,
			reason
		};
	};
	const waitForBucketNotExists = async (params, input) => {
		return utilWaiter.createWaiter({
			minDelay: 5,
			maxDelay: 120,
			...params
		}, input, checkState$2);
	};
	const waitUntilBucketNotExists = async (params, input) => {
		const result = await utilWaiter.createWaiter({
			minDelay: 5,
			maxDelay: 120,
			...params
		}, input, checkState$2);
		return utilWaiter.checkExceptions(result);
	};
	const checkState$1 = async (client, input) => {
		let reason;
		try {
			reason = await client.send(new HeadObjectCommand(input));
			return {
				state: utilWaiter.WaiterState.SUCCESS,
				reason
			};
		} catch (exception) {
			reason = exception;
			if (exception.name === "NotFound") return {
				state: utilWaiter.WaiterState.RETRY,
				reason
			};
		}
		return {
			state: utilWaiter.WaiterState.RETRY,
			reason
		};
	};
	const waitForObjectExists = async (params, input) => {
		return utilWaiter.createWaiter({
			minDelay: 5,
			maxDelay: 120,
			...params
		}, input, checkState$1);
	};
	const waitUntilObjectExists = async (params, input) => {
		const result = await utilWaiter.createWaiter({
			minDelay: 5,
			maxDelay: 120,
			...params
		}, input, checkState$1);
		return utilWaiter.checkExceptions(result);
	};
	const checkState = async (client, input) => {
		let reason;
		try {
			reason = await client.send(new HeadObjectCommand(input));
		} catch (exception) {
			reason = exception;
			if (exception.name === "NotFound") return {
				state: utilWaiter.WaiterState.SUCCESS,
				reason
			};
		}
		return {
			state: utilWaiter.WaiterState.RETRY,
			reason
		};
	};
	const waitForObjectNotExists = async (params, input) => {
		return utilWaiter.createWaiter({
			minDelay: 5,
			maxDelay: 120,
			...params
		}, input, checkState);
	};
	const waitUntilObjectNotExists = async (params, input) => {
		const result = await utilWaiter.createWaiter({
			minDelay: 5,
			maxDelay: 120,
			...params
		}, input, checkState);
		return utilWaiter.checkExceptions(result);
	};
	const commands = {
		AbortMultipartUploadCommand,
		CompleteMultipartUploadCommand,
		CopyObjectCommand,
		CreateBucketCommand,
		CreateBucketMetadataConfigurationCommand,
		CreateBucketMetadataTableConfigurationCommand,
		CreateMultipartUploadCommand,
		CreateSessionCommand,
		DeleteBucketCommand,
		DeleteBucketAnalyticsConfigurationCommand,
		DeleteBucketCorsCommand,
		DeleteBucketEncryptionCommand,
		DeleteBucketIntelligentTieringConfigurationCommand,
		DeleteBucketInventoryConfigurationCommand,
		DeleteBucketLifecycleCommand,
		DeleteBucketMetadataConfigurationCommand,
		DeleteBucketMetadataTableConfigurationCommand,
		DeleteBucketMetricsConfigurationCommand,
		DeleteBucketOwnershipControlsCommand,
		DeleteBucketPolicyCommand,
		DeleteBucketReplicationCommand,
		DeleteBucketTaggingCommand,
		DeleteBucketWebsiteCommand,
		DeleteObjectCommand,
		DeleteObjectsCommand,
		DeleteObjectTaggingCommand,
		DeletePublicAccessBlockCommand,
		GetBucketAbacCommand,
		GetBucketAccelerateConfigurationCommand,
		GetBucketAclCommand,
		GetBucketAnalyticsConfigurationCommand,
		GetBucketCorsCommand,
		GetBucketEncryptionCommand,
		GetBucketIntelligentTieringConfigurationCommand,
		GetBucketInventoryConfigurationCommand,
		GetBucketLifecycleConfigurationCommand,
		GetBucketLocationCommand,
		GetBucketLoggingCommand,
		GetBucketMetadataConfigurationCommand,
		GetBucketMetadataTableConfigurationCommand,
		GetBucketMetricsConfigurationCommand,
		GetBucketNotificationConfigurationCommand,
		GetBucketOwnershipControlsCommand,
		GetBucketPolicyCommand,
		GetBucketPolicyStatusCommand,
		GetBucketReplicationCommand,
		GetBucketRequestPaymentCommand,
		GetBucketTaggingCommand,
		GetBucketVersioningCommand,
		GetBucketWebsiteCommand,
		GetObjectCommand,
		GetObjectAclCommand,
		GetObjectAttributesCommand,
		GetObjectLegalHoldCommand,
		GetObjectLockConfigurationCommand,
		GetObjectRetentionCommand,
		GetObjectTaggingCommand,
		GetObjectTorrentCommand,
		GetPublicAccessBlockCommand,
		HeadBucketCommand,
		HeadObjectCommand,
		ListBucketAnalyticsConfigurationsCommand,
		ListBucketIntelligentTieringConfigurationsCommand,
		ListBucketInventoryConfigurationsCommand,
		ListBucketMetricsConfigurationsCommand,
		ListBucketsCommand,
		ListDirectoryBucketsCommand,
		ListMultipartUploadsCommand,
		ListObjectsCommand,
		ListObjectsV2Command,
		ListObjectVersionsCommand,
		ListPartsCommand,
		PutBucketAbacCommand,
		PutBucketAccelerateConfigurationCommand,
		PutBucketAclCommand,
		PutBucketAnalyticsConfigurationCommand,
		PutBucketCorsCommand,
		PutBucketEncryptionCommand,
		PutBucketIntelligentTieringConfigurationCommand,
		PutBucketInventoryConfigurationCommand,
		PutBucketLifecycleConfigurationCommand,
		PutBucketLoggingCommand,
		PutBucketMetricsConfigurationCommand,
		PutBucketNotificationConfigurationCommand,
		PutBucketOwnershipControlsCommand,
		PutBucketPolicyCommand,
		PutBucketReplicationCommand,
		PutBucketRequestPaymentCommand,
		PutBucketTaggingCommand,
		PutBucketVersioningCommand,
		PutBucketWebsiteCommand,
		PutObjectCommand,
		PutObjectAclCommand,
		PutObjectLegalHoldCommand,
		PutObjectLockConfigurationCommand,
		PutObjectRetentionCommand,
		PutObjectTaggingCommand,
		PutPublicAccessBlockCommand,
		RenameObjectCommand,
		RestoreObjectCommand,
		SelectObjectContentCommand,
		UpdateBucketMetadataInventoryTableConfigurationCommand,
		UpdateBucketMetadataJournalTableConfigurationCommand,
		UpdateObjectEncryptionCommand,
		UploadPartCommand,
		UploadPartCopyCommand,
		WriteGetObjectResponseCommand
	};
	const paginators = {
		paginateListBuckets,
		paginateListDirectoryBuckets,
		paginateListObjectsV2,
		paginateListParts
	};
	const waiters = {
		waitUntilBucketExists,
		waitUntilBucketNotExists,
		waitUntilObjectExists,
		waitUntilObjectNotExists
	};
	var S3 = class extends S3Client {};
	smithyClient.createAggregatedClient(commands, S3, {
		paginators,
		waiters
	});
	const BucketAbacStatus = {
		Disabled: "Disabled",
		Enabled: "Enabled"
	};
	const RequestCharged = { requester: "requester" };
	const RequestPayer = { requester: "requester" };
	const BucketAccelerateStatus = {
		Enabled: "Enabled",
		Suspended: "Suspended"
	};
	const Type = {
		AmazonCustomerByEmail: "AmazonCustomerByEmail",
		CanonicalUser: "CanonicalUser",
		Group: "Group"
	};
	const Permission = {
		FULL_CONTROL: "FULL_CONTROL",
		READ: "READ",
		READ_ACP: "READ_ACP",
		WRITE: "WRITE",
		WRITE_ACP: "WRITE_ACP"
	};
	const OwnerOverride = { Destination: "Destination" };
	const ChecksumType = {
		COMPOSITE: "COMPOSITE",
		FULL_OBJECT: "FULL_OBJECT"
	};
	const ServerSideEncryption = {
		AES256: "AES256",
		aws_fsx: "aws:fsx",
		aws_kms: "aws:kms",
		aws_kms_dsse: "aws:kms:dsse"
	};
	const ObjectCannedACL = {
		authenticated_read: "authenticated-read",
		aws_exec_read: "aws-exec-read",
		bucket_owner_full_control: "bucket-owner-full-control",
		bucket_owner_read: "bucket-owner-read",
		private: "private",
		public_read: "public-read",
		public_read_write: "public-read-write"
	};
	const ChecksumAlgorithm = {
		CRC32: "CRC32",
		CRC32C: "CRC32C",
		CRC64NVME: "CRC64NVME",
		MD5: "MD5",
		SHA1: "SHA1",
		SHA256: "SHA256",
		SHA512: "SHA512",
		XXHASH128: "XXHASH128",
		XXHASH3: "XXHASH3",
		XXHASH64: "XXHASH64"
	};
	const MetadataDirective = {
		COPY: "COPY",
		REPLACE: "REPLACE"
	};
	const ObjectLockLegalHoldStatus = {
		OFF: "OFF",
		ON: "ON"
	};
	const ObjectLockMode = {
		COMPLIANCE: "COMPLIANCE",
		GOVERNANCE: "GOVERNANCE"
	};
	const StorageClass = {
		DEEP_ARCHIVE: "DEEP_ARCHIVE",
		EXPRESS_ONEZONE: "EXPRESS_ONEZONE",
		FSX_ONTAP: "FSX_ONTAP",
		FSX_OPENZFS: "FSX_OPENZFS",
		GLACIER: "GLACIER",
		GLACIER_IR: "GLACIER_IR",
		INTELLIGENT_TIERING: "INTELLIGENT_TIERING",
		ONEZONE_IA: "ONEZONE_IA",
		OUTPOSTS: "OUTPOSTS",
		REDUCED_REDUNDANCY: "REDUCED_REDUNDANCY",
		SNOW: "SNOW",
		STANDARD: "STANDARD",
		STANDARD_IA: "STANDARD_IA"
	};
	const TaggingDirective = {
		COPY: "COPY",
		REPLACE: "REPLACE"
	};
	const BucketCannedACL = {
		authenticated_read: "authenticated-read",
		private: "private",
		public_read: "public-read",
		public_read_write: "public-read-write"
	};
	const BucketNamespace = {
		ACCOUNT_REGIONAL: "account-regional",
		GLOBAL: "global"
	};
	const DataRedundancy = {
		SingleAvailabilityZone: "SingleAvailabilityZone",
		SingleLocalZone: "SingleLocalZone"
	};
	const BucketType = { Directory: "Directory" };
	const LocationType = {
		AvailabilityZone: "AvailabilityZone",
		LocalZone: "LocalZone"
	};
	const BucketLocationConstraint = {
		EU: "EU",
		af_south_1: "af-south-1",
		ap_east_1: "ap-east-1",
		ap_east_2: "ap-east-2",
		ap_northeast_1: "ap-northeast-1",
		ap_northeast_2: "ap-northeast-2",
		ap_northeast_3: "ap-northeast-3",
		ap_south_1: "ap-south-1",
		ap_south_2: "ap-south-2",
		ap_southeast_1: "ap-southeast-1",
		ap_southeast_2: "ap-southeast-2",
		ap_southeast_3: "ap-southeast-3",
		ap_southeast_4: "ap-southeast-4",
		ap_southeast_5: "ap-southeast-5",
		ap_southeast_6: "ap-southeast-6",
		ap_southeast_7: "ap-southeast-7",
		ca_central_1: "ca-central-1",
		ca_west_1: "ca-west-1",
		cn_north_1: "cn-north-1",
		cn_northwest_1: "cn-northwest-1",
		eu_central_1: "eu-central-1",
		eu_central_2: "eu-central-2",
		eu_north_1: "eu-north-1",
		eu_south_1: "eu-south-1",
		eu_south_2: "eu-south-2",
		eu_west_1: "eu-west-1",
		eu_west_2: "eu-west-2",
		eu_west_3: "eu-west-3",
		il_central_1: "il-central-1",
		me_central_1: "me-central-1",
		me_south_1: "me-south-1",
		mx_central_1: "mx-central-1",
		sa_east_1: "sa-east-1",
		us_east_2: "us-east-2",
		us_gov_east_1: "us-gov-east-1",
		us_gov_west_1: "us-gov-west-1",
		us_west_1: "us-west-1",
		us_west_2: "us-west-2"
	};
	const ObjectOwnership = {
		BucketOwnerEnforced: "BucketOwnerEnforced",
		BucketOwnerPreferred: "BucketOwnerPreferred",
		ObjectWriter: "ObjectWriter"
	};
	const InventoryConfigurationState = {
		DISABLED: "DISABLED",
		ENABLED: "ENABLED"
	};
	const TableSseAlgorithm = {
		AES256: "AES256",
		aws_kms: "aws:kms"
	};
	const ExpirationState = {
		DISABLED: "DISABLED",
		ENABLED: "ENABLED"
	};
	const SessionMode = {
		ReadOnly: "ReadOnly",
		ReadWrite: "ReadWrite"
	};
	const AnalyticsS3ExportFileFormat = { CSV: "CSV" };
	const StorageClassAnalysisSchemaVersion = { V_1: "V_1" };
	const EncryptionType = {
		NONE: "NONE",
		SSE_C: "SSE-C"
	};
	const IntelligentTieringStatus = {
		Disabled: "Disabled",
		Enabled: "Enabled"
	};
	const IntelligentTieringAccessTier = {
		ARCHIVE_ACCESS: "ARCHIVE_ACCESS",
		DEEP_ARCHIVE_ACCESS: "DEEP_ARCHIVE_ACCESS"
	};
	const InventoryFormat = {
		CSV: "CSV",
		ORC: "ORC",
		Parquet: "Parquet"
	};
	const InventoryIncludedObjectVersions = {
		All: "All",
		Current: "Current"
	};
	const InventoryOptionalField = {
		BucketKeyStatus: "BucketKeyStatus",
		ChecksumAlgorithm: "ChecksumAlgorithm",
		ETag: "ETag",
		EncryptionStatus: "EncryptionStatus",
		IntelligentTieringAccessTier: "IntelligentTieringAccessTier",
		IsMultipartUploaded: "IsMultipartUploaded",
		LastModifiedDate: "LastModifiedDate",
		LifecycleExpirationDate: "LifecycleExpirationDate",
		ObjectAccessControlList: "ObjectAccessControlList",
		ObjectLockLegalHoldStatus: "ObjectLockLegalHoldStatus",
		ObjectLockMode: "ObjectLockMode",
		ObjectLockRetainUntilDate: "ObjectLockRetainUntilDate",
		ObjectOwner: "ObjectOwner",
		ReplicationStatus: "ReplicationStatus",
		Size: "Size",
		StorageClass: "StorageClass"
	};
	const InventoryFrequency = {
		Daily: "Daily",
		Weekly: "Weekly"
	};
	const TransitionStorageClass = {
		DEEP_ARCHIVE: "DEEP_ARCHIVE",
		GLACIER: "GLACIER",
		GLACIER_IR: "GLACIER_IR",
		INTELLIGENT_TIERING: "INTELLIGENT_TIERING",
		ONEZONE_IA: "ONEZONE_IA",
		STANDARD_IA: "STANDARD_IA"
	};
	const ExpirationStatus = {
		Disabled: "Disabled",
		Enabled: "Enabled"
	};
	const TransitionDefaultMinimumObjectSize = {
		all_storage_classes_128K: "all_storage_classes_128K",
		varies_by_storage_class: "varies_by_storage_class"
	};
	const BucketLogsPermission = {
		FULL_CONTROL: "FULL_CONTROL",
		READ: "READ",
		WRITE: "WRITE"
	};
	const PartitionDateSource = {
		DeliveryTime: "DeliveryTime",
		EventTime: "EventTime"
	};
	const S3TablesBucketType = {
		aws: "aws",
		customer: "customer"
	};
	const Event = {
		s3_IntelligentTiering: "s3:IntelligentTiering",
		s3_LifecycleExpiration_: "s3:LifecycleExpiration:*",
		s3_LifecycleExpiration_Delete: "s3:LifecycleExpiration:Delete",
		s3_LifecycleExpiration_DeleteMarkerCreated: "s3:LifecycleExpiration:DeleteMarkerCreated",
		s3_LifecycleTransition: "s3:LifecycleTransition",
		s3_ObjectAcl_Put: "s3:ObjectAcl:Put",
		s3_ObjectCreated_: "s3:ObjectCreated:*",
		s3_ObjectCreated_CompleteMultipartUpload: "s3:ObjectCreated:CompleteMultipartUpload",
		s3_ObjectCreated_Copy: "s3:ObjectCreated:Copy",
		s3_ObjectCreated_Post: "s3:ObjectCreated:Post",
		s3_ObjectCreated_Put: "s3:ObjectCreated:Put",
		s3_ObjectRemoved_: "s3:ObjectRemoved:*",
		s3_ObjectRemoved_Delete: "s3:ObjectRemoved:Delete",
		s3_ObjectRemoved_DeleteMarkerCreated: "s3:ObjectRemoved:DeleteMarkerCreated",
		s3_ObjectRestore_: "s3:ObjectRestore:*",
		s3_ObjectRestore_Completed: "s3:ObjectRestore:Completed",
		s3_ObjectRestore_Delete: "s3:ObjectRestore:Delete",
		s3_ObjectRestore_Post: "s3:ObjectRestore:Post",
		s3_ObjectTagging_: "s3:ObjectTagging:*",
		s3_ObjectTagging_Delete: "s3:ObjectTagging:Delete",
		s3_ObjectTagging_Put: "s3:ObjectTagging:Put",
		s3_ReducedRedundancyLostObject: "s3:ReducedRedundancyLostObject",
		s3_Replication_: "s3:Replication:*",
		s3_Replication_OperationFailedReplication: "s3:Replication:OperationFailedReplication",
		s3_Replication_OperationMissedThreshold: "s3:Replication:OperationMissedThreshold",
		s3_Replication_OperationNotTracked: "s3:Replication:OperationNotTracked",
		s3_Replication_OperationReplicatedAfterThreshold: "s3:Replication:OperationReplicatedAfterThreshold"
	};
	const FilterRuleName = {
		prefix: "prefix",
		suffix: "suffix"
	};
	const DeleteMarkerReplicationStatus = {
		Disabled: "Disabled",
		Enabled: "Enabled"
	};
	const MetricsStatus = {
		Disabled: "Disabled",
		Enabled: "Enabled"
	};
	const ReplicationTimeStatus = {
		Disabled: "Disabled",
		Enabled: "Enabled"
	};
	const ExistingObjectReplicationStatus = {
		Disabled: "Disabled",
		Enabled: "Enabled"
	};
	const ReplicaModificationsStatus = {
		Disabled: "Disabled",
		Enabled: "Enabled"
	};
	const SseKmsEncryptedObjectsStatus = {
		Disabled: "Disabled",
		Enabled: "Enabled"
	};
	const ReplicationRuleStatus = {
		Disabled: "Disabled",
		Enabled: "Enabled"
	};
	const Payer = {
		BucketOwner: "BucketOwner",
		Requester: "Requester"
	};
	const MFADeleteStatus = {
		Disabled: "Disabled",
		Enabled: "Enabled"
	};
	const BucketVersioningStatus = {
		Enabled: "Enabled",
		Suspended: "Suspended"
	};
	const Protocol = {
		http: "http",
		https: "https"
	};
	const ReplicationStatus = {
		COMPLETE: "COMPLETE",
		COMPLETED: "COMPLETED",
		FAILED: "FAILED",
		PENDING: "PENDING",
		REPLICA: "REPLICA"
	};
	const ChecksumMode = { ENABLED: "ENABLED" };
	const ObjectAttributes = {
		CHECKSUM: "Checksum",
		ETAG: "ETag",
		OBJECT_PARTS: "ObjectParts",
		OBJECT_SIZE: "ObjectSize",
		STORAGE_CLASS: "StorageClass"
	};
	const ObjectLockEnabled = { Enabled: "Enabled" };
	const ObjectLockRetentionMode = {
		COMPLIANCE: "COMPLIANCE",
		GOVERNANCE: "GOVERNANCE"
	};
	const ArchiveStatus = {
		ARCHIVE_ACCESS: "ARCHIVE_ACCESS",
		DEEP_ARCHIVE_ACCESS: "DEEP_ARCHIVE_ACCESS"
	};
	const EncodingType = { url: "url" };
	const ObjectStorageClass = {
		DEEP_ARCHIVE: "DEEP_ARCHIVE",
		EXPRESS_ONEZONE: "EXPRESS_ONEZONE",
		FSX_ONTAP: "FSX_ONTAP",
		FSX_OPENZFS: "FSX_OPENZFS",
		GLACIER: "GLACIER",
		GLACIER_IR: "GLACIER_IR",
		INTELLIGENT_TIERING: "INTELLIGENT_TIERING",
		ONEZONE_IA: "ONEZONE_IA",
		OUTPOSTS: "OUTPOSTS",
		REDUCED_REDUNDANCY: "REDUCED_REDUNDANCY",
		SNOW: "SNOW",
		STANDARD: "STANDARD",
		STANDARD_IA: "STANDARD_IA"
	};
	const OptionalObjectAttributes = { RESTORE_STATUS: "RestoreStatus" };
	const ObjectVersionStorageClass = { STANDARD: "STANDARD" };
	const MFADelete = {
		Disabled: "Disabled",
		Enabled: "Enabled"
	};
	const Tier = {
		Bulk: "Bulk",
		Expedited: "Expedited",
		Standard: "Standard"
	};
	const ExpressionType = { SQL: "SQL" };
	const CompressionType = {
		BZIP2: "BZIP2",
		GZIP: "GZIP",
		NONE: "NONE"
	};
	const FileHeaderInfo = {
		IGNORE: "IGNORE",
		NONE: "NONE",
		USE: "USE"
	};
	const JSONType = {
		DOCUMENT: "DOCUMENT",
		LINES: "LINES"
	};
	const QuoteFields = {
		ALWAYS: "ALWAYS",
		ASNEEDED: "ASNEEDED"
	};
	const RestoreRequestType = { SELECT: "SELECT" };
	exports.$Command = smithyClient.Command;
	exports.__Client = smithyClient.Client;
	exports.S3ServiceException = S3ServiceException.S3ServiceException;
	exports.AbortMultipartUploadCommand = AbortMultipartUploadCommand;
	exports.AnalyticsS3ExportFileFormat = AnalyticsS3ExportFileFormat;
	exports.ArchiveStatus = ArchiveStatus;
	exports.BucketAbacStatus = BucketAbacStatus;
	exports.BucketAccelerateStatus = BucketAccelerateStatus;
	exports.BucketCannedACL = BucketCannedACL;
	exports.BucketLocationConstraint = BucketLocationConstraint;
	exports.BucketLogsPermission = BucketLogsPermission;
	exports.BucketNamespace = BucketNamespace;
	exports.BucketType = BucketType;
	exports.BucketVersioningStatus = BucketVersioningStatus;
	exports.ChecksumAlgorithm = ChecksumAlgorithm;
	exports.ChecksumMode = ChecksumMode;
	exports.ChecksumType = ChecksumType;
	exports.CompleteMultipartUploadCommand = CompleteMultipartUploadCommand;
	exports.CompressionType = CompressionType;
	exports.CopyObjectCommand = CopyObjectCommand;
	exports.CreateBucketCommand = CreateBucketCommand;
	exports.CreateBucketMetadataConfigurationCommand = CreateBucketMetadataConfigurationCommand;
	exports.CreateBucketMetadataTableConfigurationCommand = CreateBucketMetadataTableConfigurationCommand;
	exports.CreateMultipartUploadCommand = CreateMultipartUploadCommand;
	exports.CreateSessionCommand = CreateSessionCommand;
	exports.DataRedundancy = DataRedundancy;
	exports.DeleteBucketAnalyticsConfigurationCommand = DeleteBucketAnalyticsConfigurationCommand;
	exports.DeleteBucketCommand = DeleteBucketCommand;
	exports.DeleteBucketCorsCommand = DeleteBucketCorsCommand;
	exports.DeleteBucketEncryptionCommand = DeleteBucketEncryptionCommand;
	exports.DeleteBucketIntelligentTieringConfigurationCommand = DeleteBucketIntelligentTieringConfigurationCommand;
	exports.DeleteBucketInventoryConfigurationCommand = DeleteBucketInventoryConfigurationCommand;
	exports.DeleteBucketLifecycleCommand = DeleteBucketLifecycleCommand;
	exports.DeleteBucketMetadataConfigurationCommand = DeleteBucketMetadataConfigurationCommand;
	exports.DeleteBucketMetadataTableConfigurationCommand = DeleteBucketMetadataTableConfigurationCommand;
	exports.DeleteBucketMetricsConfigurationCommand = DeleteBucketMetricsConfigurationCommand;
	exports.DeleteBucketOwnershipControlsCommand = DeleteBucketOwnershipControlsCommand;
	exports.DeleteBucketPolicyCommand = DeleteBucketPolicyCommand;
	exports.DeleteBucketReplicationCommand = DeleteBucketReplicationCommand;
	exports.DeleteBucketTaggingCommand = DeleteBucketTaggingCommand;
	exports.DeleteBucketWebsiteCommand = DeleteBucketWebsiteCommand;
	exports.DeleteMarkerReplicationStatus = DeleteMarkerReplicationStatus;
	exports.DeleteObjectCommand = DeleteObjectCommand;
	exports.DeleteObjectTaggingCommand = DeleteObjectTaggingCommand;
	exports.DeleteObjectsCommand = DeleteObjectsCommand;
	exports.DeletePublicAccessBlockCommand = DeletePublicAccessBlockCommand;
	exports.EncodingType = EncodingType;
	exports.EncryptionType = EncryptionType;
	exports.Event = Event;
	exports.ExistingObjectReplicationStatus = ExistingObjectReplicationStatus;
	exports.ExpirationState = ExpirationState;
	exports.ExpirationStatus = ExpirationStatus;
	exports.ExpressionType = ExpressionType;
	exports.FileHeaderInfo = FileHeaderInfo;
	exports.FilterRuleName = FilterRuleName;
	exports.GetBucketAbacCommand = GetBucketAbacCommand;
	exports.GetBucketAccelerateConfigurationCommand = GetBucketAccelerateConfigurationCommand;
	exports.GetBucketAclCommand = GetBucketAclCommand;
	exports.GetBucketAnalyticsConfigurationCommand = GetBucketAnalyticsConfigurationCommand;
	exports.GetBucketCorsCommand = GetBucketCorsCommand;
	exports.GetBucketEncryptionCommand = GetBucketEncryptionCommand;
	exports.GetBucketIntelligentTieringConfigurationCommand = GetBucketIntelligentTieringConfigurationCommand;
	exports.GetBucketInventoryConfigurationCommand = GetBucketInventoryConfigurationCommand;
	exports.GetBucketLifecycleConfigurationCommand = GetBucketLifecycleConfigurationCommand;
	exports.GetBucketLocationCommand = GetBucketLocationCommand;
	exports.GetBucketLoggingCommand = GetBucketLoggingCommand;
	exports.GetBucketMetadataConfigurationCommand = GetBucketMetadataConfigurationCommand;
	exports.GetBucketMetadataTableConfigurationCommand = GetBucketMetadataTableConfigurationCommand;
	exports.GetBucketMetricsConfigurationCommand = GetBucketMetricsConfigurationCommand;
	exports.GetBucketNotificationConfigurationCommand = GetBucketNotificationConfigurationCommand;
	exports.GetBucketOwnershipControlsCommand = GetBucketOwnershipControlsCommand;
	exports.GetBucketPolicyCommand = GetBucketPolicyCommand;
	exports.GetBucketPolicyStatusCommand = GetBucketPolicyStatusCommand;
	exports.GetBucketReplicationCommand = GetBucketReplicationCommand;
	exports.GetBucketRequestPaymentCommand = GetBucketRequestPaymentCommand;
	exports.GetBucketTaggingCommand = GetBucketTaggingCommand;
	exports.GetBucketVersioningCommand = GetBucketVersioningCommand;
	exports.GetBucketWebsiteCommand = GetBucketWebsiteCommand;
	exports.GetObjectAclCommand = GetObjectAclCommand;
	exports.GetObjectAttributesCommand = GetObjectAttributesCommand;
	exports.GetObjectCommand = GetObjectCommand;
	exports.GetObjectLegalHoldCommand = GetObjectLegalHoldCommand;
	exports.GetObjectLockConfigurationCommand = GetObjectLockConfigurationCommand;
	exports.GetObjectRetentionCommand = GetObjectRetentionCommand;
	exports.GetObjectTaggingCommand = GetObjectTaggingCommand;
	exports.GetObjectTorrentCommand = GetObjectTorrentCommand;
	exports.GetPublicAccessBlockCommand = GetPublicAccessBlockCommand;
	exports.HeadBucketCommand = HeadBucketCommand;
	exports.HeadObjectCommand = HeadObjectCommand;
	exports.IntelligentTieringAccessTier = IntelligentTieringAccessTier;
	exports.IntelligentTieringStatus = IntelligentTieringStatus;
	exports.InventoryConfigurationState = InventoryConfigurationState;
	exports.InventoryFormat = InventoryFormat;
	exports.InventoryFrequency = InventoryFrequency;
	exports.InventoryIncludedObjectVersions = InventoryIncludedObjectVersions;
	exports.InventoryOptionalField = InventoryOptionalField;
	exports.JSONType = JSONType;
	exports.ListBucketAnalyticsConfigurationsCommand = ListBucketAnalyticsConfigurationsCommand;
	exports.ListBucketIntelligentTieringConfigurationsCommand = ListBucketIntelligentTieringConfigurationsCommand;
	exports.ListBucketInventoryConfigurationsCommand = ListBucketInventoryConfigurationsCommand;
	exports.ListBucketMetricsConfigurationsCommand = ListBucketMetricsConfigurationsCommand;
	exports.ListBucketsCommand = ListBucketsCommand;
	exports.ListDirectoryBucketsCommand = ListDirectoryBucketsCommand;
	exports.ListMultipartUploadsCommand = ListMultipartUploadsCommand;
	exports.ListObjectVersionsCommand = ListObjectVersionsCommand;
	exports.ListObjectsCommand = ListObjectsCommand;
	exports.ListObjectsV2Command = ListObjectsV2Command;
	exports.ListPartsCommand = ListPartsCommand;
	exports.LocationType = LocationType;
	exports.MFADelete = MFADelete;
	exports.MFADeleteStatus = MFADeleteStatus;
	exports.MetadataDirective = MetadataDirective;
	exports.MetricsStatus = MetricsStatus;
	exports.ObjectAttributes = ObjectAttributes;
	exports.ObjectCannedACL = ObjectCannedACL;
	exports.ObjectLockEnabled = ObjectLockEnabled;
	exports.ObjectLockLegalHoldStatus = ObjectLockLegalHoldStatus;
	exports.ObjectLockMode = ObjectLockMode;
	exports.ObjectLockRetentionMode = ObjectLockRetentionMode;
	exports.ObjectOwnership = ObjectOwnership;
	exports.ObjectStorageClass = ObjectStorageClass;
	exports.ObjectVersionStorageClass = ObjectVersionStorageClass;
	exports.OptionalObjectAttributes = OptionalObjectAttributes;
	exports.OwnerOverride = OwnerOverride;
	exports.PartitionDateSource = PartitionDateSource;
	exports.Payer = Payer;
	exports.Permission = Permission;
	exports.Protocol = Protocol;
	exports.PutBucketAbacCommand = PutBucketAbacCommand;
	exports.PutBucketAccelerateConfigurationCommand = PutBucketAccelerateConfigurationCommand;
	exports.PutBucketAclCommand = PutBucketAclCommand;
	exports.PutBucketAnalyticsConfigurationCommand = PutBucketAnalyticsConfigurationCommand;
	exports.PutBucketCorsCommand = PutBucketCorsCommand;
	exports.PutBucketEncryptionCommand = PutBucketEncryptionCommand;
	exports.PutBucketIntelligentTieringConfigurationCommand = PutBucketIntelligentTieringConfigurationCommand;
	exports.PutBucketInventoryConfigurationCommand = PutBucketInventoryConfigurationCommand;
	exports.PutBucketLifecycleConfigurationCommand = PutBucketLifecycleConfigurationCommand;
	exports.PutBucketLoggingCommand = PutBucketLoggingCommand;
	exports.PutBucketMetricsConfigurationCommand = PutBucketMetricsConfigurationCommand;
	exports.PutBucketNotificationConfigurationCommand = PutBucketNotificationConfigurationCommand;
	exports.PutBucketOwnershipControlsCommand = PutBucketOwnershipControlsCommand;
	exports.PutBucketPolicyCommand = PutBucketPolicyCommand;
	exports.PutBucketReplicationCommand = PutBucketReplicationCommand;
	exports.PutBucketRequestPaymentCommand = PutBucketRequestPaymentCommand;
	exports.PutBucketTaggingCommand = PutBucketTaggingCommand;
	exports.PutBucketVersioningCommand = PutBucketVersioningCommand;
	exports.PutBucketWebsiteCommand = PutBucketWebsiteCommand;
	exports.PutObjectAclCommand = PutObjectAclCommand;
	exports.PutObjectCommand = PutObjectCommand;
	exports.PutObjectLegalHoldCommand = PutObjectLegalHoldCommand;
	exports.PutObjectLockConfigurationCommand = PutObjectLockConfigurationCommand;
	exports.PutObjectRetentionCommand = PutObjectRetentionCommand;
	exports.PutObjectTaggingCommand = PutObjectTaggingCommand;
	exports.PutPublicAccessBlockCommand = PutPublicAccessBlockCommand;
	exports.QuoteFields = QuoteFields;
	exports.RenameObjectCommand = RenameObjectCommand;
	exports.ReplicaModificationsStatus = ReplicaModificationsStatus;
	exports.ReplicationRuleStatus = ReplicationRuleStatus;
	exports.ReplicationStatus = ReplicationStatus;
	exports.ReplicationTimeStatus = ReplicationTimeStatus;
	exports.RequestCharged = RequestCharged;
	exports.RequestPayer = RequestPayer;
	exports.RestoreObjectCommand = RestoreObjectCommand;
	exports.RestoreRequestType = RestoreRequestType;
	exports.S3 = S3;
	exports.S3Client = S3Client;
	exports.S3TablesBucketType = S3TablesBucketType;
	exports.SelectObjectContentCommand = SelectObjectContentCommand;
	exports.ServerSideEncryption = ServerSideEncryption;
	exports.SessionMode = SessionMode;
	exports.SseKmsEncryptedObjectsStatus = SseKmsEncryptedObjectsStatus;
	exports.StorageClass = StorageClass;
	exports.StorageClassAnalysisSchemaVersion = StorageClassAnalysisSchemaVersion;
	exports.TableSseAlgorithm = TableSseAlgorithm;
	exports.TaggingDirective = TaggingDirective;
	exports.Tier = Tier;
	exports.TransitionDefaultMinimumObjectSize = TransitionDefaultMinimumObjectSize;
	exports.TransitionStorageClass = TransitionStorageClass;
	exports.Type = Type;
	exports.UpdateBucketMetadataInventoryTableConfigurationCommand = UpdateBucketMetadataInventoryTableConfigurationCommand;
	exports.UpdateBucketMetadataJournalTableConfigurationCommand = UpdateBucketMetadataJournalTableConfigurationCommand;
	exports.UpdateObjectEncryptionCommand = UpdateObjectEncryptionCommand;
	exports.UploadPartCommand = UploadPartCommand;
	exports.UploadPartCopyCommand = UploadPartCopyCommand;
	exports.WriteGetObjectResponseCommand = WriteGetObjectResponseCommand;
	exports.paginateListBuckets = paginateListBuckets;
	exports.paginateListDirectoryBuckets = paginateListDirectoryBuckets;
	exports.paginateListObjectsV2 = paginateListObjectsV2;
	exports.paginateListParts = paginateListParts;
	exports.waitForBucketExists = waitForBucketExists;
	exports.waitForBucketNotExists = waitForBucketNotExists;
	exports.waitForObjectExists = waitForObjectExists;
	exports.waitForObjectNotExists = waitForObjectNotExists;
	exports.waitUntilBucketExists = waitUntilBucketExists;
	exports.waitUntilBucketNotExists = waitUntilBucketNotExists;
	exports.waitUntilObjectExists = waitUntilObjectExists;
	exports.waitUntilObjectNotExists = waitUntilObjectNotExists;
	Object.prototype.hasOwnProperty.call(schemas_0, "__proto__") && !Object.prototype.hasOwnProperty.call(exports, "__proto__") && Object.defineProperty(exports, "__proto__", {
		enumerable: true,
		value: schemas_0["__proto__"]
	});
	Object.keys(schemas_0).forEach(function(k) {
		if (k !== "default" && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = schemas_0[k];
	});
	Object.prototype.hasOwnProperty.call(errors, "__proto__") && !Object.prototype.hasOwnProperty.call(exports, "__proto__") && Object.defineProperty(exports, "__proto__", {
		enumerable: true,
		value: errors["__proto__"]
	});
	Object.keys(errors).forEach(function(k) {
		if (k !== "default" && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = errors[k];
	});
}));
//#endregion
//#region node_modules/@aws-sdk/util-format-url/dist-cjs/index.js
var require_dist_cjs$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { formatUrl } = (init_util(), __toCommonJS(util_exports));
	exports.formatUrl = formatUrl;
}));
//#endregion
//#region node_modules/@aws-sdk/s3-request-presigner/dist-cjs/index.js
var require_dist_cjs = /* @__PURE__ */ __commonJSMin(((exports) => {
	var utilFormatUrl = require_dist_cjs$1();
	var middlewareEndpoint = require_dist_cjs$27();
	var protocolHttp = require_dist_cjs$6();
	var signatureV4MultiRegion = require_dist_cjs$38();
	const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
	const SHA256_HEADER = "X-Amz-Content-Sha256";
	var S3RequestPresigner = class {
		signer;
		constructor(options) {
			const resolvedOptions = {
				service: options.signingName || options.service || "s3",
				uriEscapePath: options.uriEscapePath || false,
				applyChecksum: options.applyChecksum || false,
				...options
			};
			this.signer = new signatureV4MultiRegion.SignatureV4MultiRegion(resolvedOptions);
		}
		presign(requestToSign, { unsignableHeaders = /* @__PURE__ */ new Set(), hoistableHeaders = /* @__PURE__ */ new Set(), unhoistableHeaders = /* @__PURE__ */ new Set(), ...options } = {}) {
			this.prepareRequest(requestToSign, {
				unsignableHeaders,
				unhoistableHeaders,
				hoistableHeaders
			});
			return this.signer.presign(requestToSign, {
				expiresIn: 900,
				unsignableHeaders,
				unhoistableHeaders,
				...options
			});
		}
		presignWithCredentials(requestToSign, credentials, { unsignableHeaders = /* @__PURE__ */ new Set(), hoistableHeaders = /* @__PURE__ */ new Set(), unhoistableHeaders = /* @__PURE__ */ new Set(), ...options } = {}) {
			this.prepareRequest(requestToSign, {
				unsignableHeaders,
				unhoistableHeaders,
				hoistableHeaders
			});
			return this.signer.presignWithCredentials(requestToSign, credentials, {
				expiresIn: 900,
				unsignableHeaders,
				unhoistableHeaders,
				...options
			});
		}
		prepareRequest(requestToSign, { unsignableHeaders = /* @__PURE__ */ new Set(), unhoistableHeaders = /* @__PURE__ */ new Set(), hoistableHeaders = /* @__PURE__ */ new Set() } = {}) {
			unsignableHeaders.add("content-type");
			Object.keys(requestToSign.headers).map((header) => header.toLowerCase()).filter((header) => header.startsWith("x-amz-server-side-encryption")).forEach((header) => {
				if (!hoistableHeaders.has(header)) unhoistableHeaders.add(header);
			});
			requestToSign.headers[SHA256_HEADER] = UNSIGNED_PAYLOAD;
			const currentHostHeader = requestToSign.headers.host;
			const port = requestToSign.port;
			const expectedHostHeader = `${requestToSign.hostname}${requestToSign.port != null ? ":" + port : ""}`;
			if (!currentHostHeader || currentHostHeader === requestToSign.hostname && requestToSign.port != null) requestToSign.headers.host = expectedHostHeader;
		}
	};
	const getSignedUrl = async (client, command, options = {}) => {
		let s3Presigner;
		let region;
		if (typeof client.config.endpointProvider === "function") {
			const authScheme = (await middlewareEndpoint.getEndpointFromInstructions(command.input, command.constructor, client.config)).properties?.authSchemes?.[0];
			if (authScheme?.name === "sigv4a") region = authScheme?.signingRegionSet?.join(",");
			else region = authScheme?.signingRegion;
			s3Presigner = new S3RequestPresigner({
				...client.config,
				signingName: authScheme?.signingName,
				region: async () => region
			});
		} else s3Presigner = new S3RequestPresigner(client.config);
		const presignInterceptMiddleware = (next, context) => async (args) => {
			const { request } = args;
			if (!protocolHttp.HttpRequest.isInstance(request)) throw new Error("Request to be presigned is not an valid HTTP request.");
			delete request.headers["amz-sdk-invocation-id"];
			delete request.headers["amz-sdk-request"];
			delete request.headers["x-amz-user-agent"];
			let presigned;
			const presignerOptions = {
				...options,
				signingRegion: options.signingRegion ?? context["signing_region"] ?? region,
				signingService: options.signingService ?? context["signing_service"]
			};
			if (context.s3ExpressIdentity) presigned = await s3Presigner.presignWithCredentials(request, context.s3ExpressIdentity, presignerOptions);
			else presigned = await s3Presigner.presign(request, presignerOptions);
			return {
				response: {},
				output: {
					$metadata: { httpStatusCode: 200 },
					presigned
				}
			};
		};
		const middlewareName = "presignInterceptMiddleware";
		const clientStack = client.middlewareStack.clone();
		clientStack.addRelativeTo(presignInterceptMiddleware, {
			name: middlewareName,
			relation: "before",
			toMiddleware: "awsAuthMiddleware",
			override: true
		});
		const { output } = await command.resolveMiddleware(clientStack, client.config, {})({ input: command.input });
		const { presigned } = output;
		return utilFormatUrl.formatUrl(presigned);
	};
	exports.getSignedUrl = getSignedUrl;
}));
//#endregion
//#region extensions/tlon/src/tlon-api.ts
var import_dist_cjs = require_dist_cjs$2();
var import_dist_cjs$1 = require_dist_cjs();
const MEMEX_BASE_URL = "https://memex.tlon.network";
const mimeToExt = {
	"image/gif": ".gif",
	"image/heic": ".heic",
	"image/heif": ".heif",
	"image/jpeg": ".jpg",
	"image/jpg": ".jpg",
	"image/png": ".png",
	"image/webp": ".webp"
};
let currentClientConfig = null;
function configureClient(params) {
	currentClientConfig = {
		...params,
		shipName: params.shipName.replace(/^~/, "")
	};
}
function requireClientConfig() {
	if (!currentClientConfig) throw new Error("Tlon client not configured");
	return currentClientConfig;
}
function getExtensionFromMimeType(mimeType) {
	if (!mimeType) return ".jpg";
	return mimeToExt[normalizeLowercaseStringOrEmpty$1(mimeType)] || ".jpg";
}
function hasCustomS3Creds(credentials) {
	return Boolean(credentials?.accessKeyId && credentials?.endpoint && credentials?.secretAccessKey);
}
function isStorageCredentials(value) {
	if (!value || typeof value !== "object") return false;
	const record = value;
	return typeof record.endpoint === "string" && typeof record.accessKeyId === "string" && typeof record.secretAccessKey === "string";
}
function hostnameMatchesDomainBoundary(hostname, domain) {
	return hostname === domain || hostname.endsWith(`.${domain}`);
}
function isHostedShipUrl(shipUrl) {
	const hostname = extractShipHostname(shipUrl);
	return hostname !== null && isHostedTlonHostname(hostname);
}
function extractShipHostname(shipUrl) {
	const trimmed = shipUrl.trim();
	if (!trimmed) return null;
	const normalized = /^[a-zA-Z][\w+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
	try {
		return new URL(normalized).hostname;
	} catch {
		return null;
	}
}
function isHostedTlonHostname(hostname) {
	return hostnameMatchesDomainBoundary(hostname, "tlon.network") || hostnameMatchesDomainBoundary(hostname, "test.tlon.systems");
}
function assertTrustedMemexUploadUrl(rawUrl, label) {
	let parsed;
	try {
		parsed = new URL(rawUrl);
	} catch {
		throw new Error(`${label} must be a valid https URL`);
	}
	if (parsed.protocol !== "https:") throw new Error(`${label} must use https`);
	if (!isHostedTlonHostname(parsed.hostname)) throw new Error(`${label} must target a trusted hosted Tlon domain`);
	if (parsed.port && parsed.port !== "443") throw new Error(`${label} must not specify a non-standard port`);
	return parsed.toString();
}
function assertSafeUploadResultUrl(rawUrl, label) {
	let parsed;
	try {
		parsed = new URL(rawUrl);
	} catch {
		throw new Error(`${label} must be a valid http(s) URL`);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error(`${label} must use http or https`);
	return parsed.toString();
}
function prefixEndpoint(endpoint) {
	return /https?:\/\//.test(endpoint) ? endpoint : `https://${endpoint}`;
}
function sanitizeFileName(fileName) {
	return fileName.split(/[/\\]/).pop() || fileName;
}
async function getAuthCookie(config) {
	return await authenticate(config.shipUrl, await config.getCode(), { ssrfPolicy: ssrfPolicyFromDangerouslyAllowPrivateNetwork(config.dangerouslyAllowPrivateNetwork) });
}
async function scryJson(config, cookie, path) {
	return await scryUrbitPath({
		baseUrl: config.shipUrl,
		cookie,
		ssrfPolicy: ssrfPolicyFromDangerouslyAllowPrivateNetwork(config.dangerouslyAllowPrivateNetwork)
	}, {
		path,
		auditContext: "tlon-storage-scry"
	});
}
async function getStorageConfiguration(config, cookie) {
	const result = await scryJson(config, cookie, "/storage/configuration.json");
	if ("storage-update" in result && result["storage-update"]?.configuration) return result["storage-update"].configuration;
	if ("currentBucket" in result) return result;
	throw new Error("Invalid storage configuration response");
}
async function getStorageCredentials(config, cookie) {
	const result = await scryJson(config, cookie, "/storage/credentials.json");
	if ("storage-update" in result) return result["storage-update"]?.credentials ?? null;
	if (isStorageCredentials(result)) return result;
	return null;
}
async function getMemexUploadUrl(params) {
	const token = await scryJson(params.config, params.cookie, "/genuine/secret.json");
	const resolvedToken = typeof token === "string" ? token : token.secret;
	if (!resolvedToken) throw new Error("Missing genuine secret");
	const endpoint = `${MEMEX_BASE_URL}/v1/${params.config.shipName}/upload`;
	let release;
	try {
		const guarded = await fetchWithSsrFGuard({
			url: endpoint,
			init: {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					token: resolvedToken,
					contentLength: params.contentLength,
					contentType: params.contentType,
					fileName: params.fileName
				})
			},
			auditContext: "tlon-memex-upload-url",
			capture: false,
			maxRedirects: 0
		});
		release = guarded.release;
		if (!guarded.response.ok) throw new Error(`Memex upload request failed: ${guarded.response.status}`);
		const data = await guarded.response.json();
		if (!data?.url || !data.filePath) throw new Error("Invalid response from Memex");
		return {
			hostedUrl: data.filePath,
			uploadUrl: data.url
		};
	} finally {
		await release?.();
	}
}
async function uploadFile(params) {
	const config = requireClientConfig();
	const cookie = await getAuthCookie(config);
	const privateNetworkPolicy = ssrfPolicyFromDangerouslyAllowPrivateNetwork(config.dangerouslyAllowPrivateNetwork);
	const [storageConfig, credentials] = await Promise.all([getStorageConfiguration(config, cookie), getStorageCredentials(config, cookie)]);
	const contentType = params.contentType || params.blob.type || "application/octet-stream";
	const extension = getExtensionFromMimeType(contentType);
	const fileName = sanitizeFileName(params.fileName || `upload${extension}`);
	const fileKey = `${config.shipName}/${Date.now()}-${crypto.randomUUID()}-${fileName}`;
	if (isHostedShipUrl(config.shipUrl) && (storageConfig.service === "presigned-url" || !hasCustomS3Creds(credentials))) {
		const { hostedUrl, uploadUrl } = await getMemexUploadUrl({
			config,
			cookie,
			contentLength: params.blob.size,
			contentType,
			fileName: fileKey
		});
		const trustedUploadUrl = assertTrustedMemexUploadUrl(uploadUrl, "Memex upload URL");
		let release;
		try {
			const guarded = await fetchWithSsrFGuard({
				url: trustedUploadUrl,
				init: {
					method: "PUT",
					body: params.blob,
					headers: {
						"Cache-Control": "public, max-age=3600",
						"Content-Type": contentType
					}
				},
				auditContext: "tlon-memex-upload",
				capture: false,
				maxRedirects: 0
			});
			release = guarded.release;
			assertTrustedMemexUploadUrl(guarded.finalUrl, "Memex final upload URL");
			if (!guarded.response.ok) throw new Error(`Upload failed: ${guarded.response.status}`);
		} finally {
			await release?.();
		}
		return { url: assertTrustedMemexUploadUrl(hostedUrl, "Memex hosted URL") };
	}
	if (!hasCustomS3Creds(credentials)) throw new Error("No storage credentials configured");
	const endpoint = new URL(prefixEndpoint(credentials.endpoint));
	const client = new import_dist_cjs.S3Client({
		endpoint: {
			protocol: endpoint.protocol.slice(0, -1),
			hostname: endpoint.host,
			path: endpoint.pathname || "/"
		},
		region: storageConfig.region || "us-east-1",
		credentials: {
			accessKeyId: credentials.accessKeyId,
			secretAccessKey: credentials.secretAccessKey
		},
		forcePathStyle: true
	});
	const headers = {
		"Cache-Control": "public, max-age=3600",
		"Content-Type": contentType,
		"x-amz-acl": "public-read"
	};
	const signedUrl = await (0, import_dist_cjs$1.getSignedUrl)(client, new import_dist_cjs.PutObjectCommand({
		Bucket: storageConfig.currentBucket,
		Key: fileKey,
		ContentType: headers["Content-Type"],
		CacheControl: headers["Cache-Control"],
		ACL: "public-read"
	}), {
		expiresIn: 3600,
		signableHeaders: new Set(Object.keys(headers))
	});
	let release;
	try {
		const guarded = await fetchWithSsrFGuard({
			url: signedUrl,
			init: {
				method: "PUT",
				body: params.blob,
				headers: signedUrl.includes("digitaloceanspaces.com") ? headers : void 0
			},
			auditContext: "tlon-custom-s3-upload",
			capture: false,
			maxRedirects: 0,
			policy: privateNetworkPolicy
		});
		release = guarded.release;
		if (!guarded.response.ok) throw new Error(`Upload failed: ${guarded.response.status}`);
	} finally {
		await release?.();
	}
	return { url: assertSafeUploadResultUrl(storageConfig.publicUrlBase ? new URL(fileKey, storageConfig.publicUrlBase).toString() : signedUrl.split("?")[0], "Upload result URL") };
}
//#endregion
//#region extensions/tlon/src/urbit/upload.ts
/**
* Upload an image from a URL to Tlon storage.
*/
/**
* Fetch an image from a URL and upload it to Tlon storage.
* Returns the uploaded URL, or falls back to the original URL on error.
*
* Note: configureClient must be called before using this function.
*/
async function uploadImageFromUrl(imageUrl) {
	try {
		const url = new URL(imageUrl);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			console.warn(`[tlon] Rejected non-http(s) URL: ${imageUrl}`);
			return imageUrl;
		}
		const { response, release } = await fetchWithSsrFGuard({
			url: imageUrl,
			init: { method: "GET" },
			policy: /* @__PURE__ */ getDefaultSsrFPolicy(),
			auditContext: "tlon-upload-image"
		});
		try {
			if (!response.ok) {
				console.warn(`[tlon] Failed to fetch image from ${imageUrl}: ${response.status}`);
				return imageUrl;
			}
			const contentType = response.headers.get("content-type") || "image/png";
			return (await uploadFile({
				blob: await response.blob(),
				fileName: new URL(imageUrl).pathname.split("/").pop() || `upload-${Date.now()}.png`,
				contentType
			})).url;
		} finally {
			await release();
		}
	} catch (err) {
		console.warn(`[tlon] Failed to upload image, using original URL: ${String(err)}`);
		return imageUrl;
	}
}
//#endregion
//#region extensions/tlon/src/channel.runtime.ts
async function createHttpPokeApi(params) {
	const ssrfPolicy = ssrfPolicyFromDangerouslyAllowPrivateNetwork(params.dangerouslyAllowPrivateNetwork);
	const cookie = await authenticate(params.url, params.code, { ssrfPolicy });
	const channelPath = `/~/channel/${`${Math.floor(Date.now() / 1e3)}-${crypto.randomUUID()}`}`;
	const shipName = params.ship.replace(/^~/, "");
	return {
		poke: async (pokeParams) => {
			const pokeId = Date.now();
			const pokeData = {
				id: pokeId,
				action: "poke",
				ship: shipName,
				app: pokeParams.app,
				mark: pokeParams.mark,
				json: pokeParams.json
			};
			const { response, release } = await urbitFetch({
				baseUrl: params.url,
				path: channelPath,
				init: {
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Cookie: cookie.split(";")[0]
					},
					body: JSON.stringify([pokeData])
				},
				ssrfPolicy,
				auditContext: "tlon-poke"
			});
			try {
				if (!response.ok && response.status !== 204) {
					const errorText = await response.text();
					throw new Error(`Poke failed: ${response.status} - ${errorText}`);
				}
				return pokeId;
			} finally {
				await release();
			}
		},
		delete: async () => {}
	};
}
function resolveOutboundContext(params) {
	const account = resolveTlonAccount(params.cfg, params.accountId ?? void 0);
	if (!account.configured || !account.ship || !account.url || !account.code) throw new Error("Tlon account not configured");
	const parsed = parseTlonTarget(params.to);
	if (!parsed) throw new Error(`Invalid Tlon target. Use ${formatTargetHint()}`);
	return {
		account,
		parsed
	};
}
function resolveReplyId(replyToId, threadId) {
	return replyToId ?? threadId ? String(replyToId ?? threadId) : void 0;
}
async function withHttpPokeAccountApi(account, run) {
	const api = await createHttpPokeApi({
		url: account.url,
		ship: account.ship,
		code: account.code,
		dangerouslyAllowPrivateNetwork: account.dangerouslyAllowPrivateNetwork ?? void 0
	});
	try {
		return await run(api);
	} finally {
		try {
			await api.delete();
		} catch {}
	}
}
const tlonRuntimeOutbound = {
	deliveryMode: "direct",
	textChunkLimit: 1e4,
	resolveTarget: ({ to }) => resolveTlonOutboundTarget(to),
	sendText: async ({ cfg, to, text, accountId, replyToId, threadId }) => {
		const { account, parsed } = resolveOutboundContext({
			cfg,
			accountId,
			to
		});
		return withHttpPokeAccountApi(account, async (api) => {
			const fromShip = normalizeShip(account.ship);
			if (parsed.kind === "dm") return await sendDm({
				api,
				fromShip,
				toShip: parsed.ship,
				text
			});
			return await sendGroupMessage({
				api,
				fromShip,
				hostShip: parsed.hostShip,
				channelName: parsed.channelName,
				text,
				replyToId: resolveReplyId(replyToId, threadId)
			});
		});
	},
	sendMedia: async ({ cfg, to, text, mediaUrl, accountId, replyToId, threadId }) => {
		const { account, parsed } = resolveOutboundContext({
			cfg,
			accountId,
			to
		});
		configureClient({
			shipUrl: account.url,
			shipName: account.ship.replace(/^~/, ""),
			verbose: false,
			getCode: async () => account.code,
			dangerouslyAllowPrivateNetwork: account.dangerouslyAllowPrivateNetwork ?? void 0
		});
		const uploadedUrl = mediaUrl ? await uploadImageFromUrl(mediaUrl) : void 0;
		return withHttpPokeAccountApi(account, async (api) => {
			const fromShip = normalizeShip(account.ship);
			const story = buildMediaStory(text, uploadedUrl);
			if (parsed.kind === "dm") return await sendDmWithStory({
				api,
				fromShip,
				toShip: parsed.ship,
				story
			});
			return await sendGroupMessageWithStory({
				api,
				fromShip,
				hostShip: parsed.hostShip,
				channelName: parsed.channelName,
				story,
				replyToId: resolveReplyId(replyToId, threadId)
			});
		});
	}
};
async function probeTlonAccount(account) {
	try {
		const ssrfPolicy = ssrfPolicyFromDangerouslyAllowPrivateNetwork(account.dangerouslyAllowPrivateNetwork);
		const cookie = await authenticate(account.url, account.code, { ssrfPolicy });
		const { response, release } = await urbitFetch({
			baseUrl: account.url,
			path: "/~/name",
			init: {
				method: "GET",
				headers: { Cookie: cookie }
			},
			ssrfPolicy,
			timeoutMs: 3e4,
			auditContext: "tlon-probe-account"
		});
		try {
			if (!response.ok) return {
				ok: false,
				error: `Name request failed: ${response.status}`
			};
			return { ok: true };
		} finally {
			await release();
		}
	} catch (error) {
		return {
			ok: false,
			error: error?.message ?? String(error)
		};
	}
}
async function startTlonGatewayAccount(ctx) {
	const account = ctx.account;
	ctx.setStatus({
		accountId: account.accountId,
		ship: account.ship,
		url: account.url
	});
	ctx.log?.info(`[${account.accountId}] starting Tlon provider for ${account.ship ?? "tlon"}`);
	return monitorTlonProvider({
		runtime: ctx.runtime,
		abortSignal: ctx.abortSignal,
		accountId: account.accountId
	});
}
//#endregion
export { probeTlonAccount, startTlonGatewayAccount, tlonRuntimeOutbound, tlonSetupWizard };
