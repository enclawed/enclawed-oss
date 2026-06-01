import { i as normalizeLowercaseStringOrEmpty, o as normalizeOptionalLowercaseString, s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { o as resolveGatewayAuth } from "./auth-DV2wOPrh.js";
import { i as getRuntimeConfig } from "./io-b4s6ivfp.js";
import { r as replaceConfigFile } from "./config-DDWYoiuw.js";
import "./text-runtime-BSsrP5ac.js";
import "./core-DBv8LeUb.js";
import "./plugin-config-runtime-DovolEWi.js";
import "./config-mutation-C6rVmDBS.js";
import "./runtime-config-snapshot-BUtCn0aI.js";
import { a as ensureGatewayStartupAuth } from "./nodes.helpers-CXE247_P.js";
import "./sdk-node-runtime-BxXA39zP.js";
import crypto from "node:crypto";
//#region extensions/browser/src/sdk-config.ts
const DEFAULT_BROWSER_CDP_PORT_RANGE_START = 18800;
const DEFAULT_BROWSER_CDP_PORT_RANGE_END = 18899;
const DEFAULT_BROWSER_CDP_PORT_RANGE_SPAN = DEFAULT_BROWSER_CDP_PORT_RANGE_END - DEFAULT_BROWSER_CDP_PORT_RANGE_START;
const DEFAULT_BROWSER_CONTROL_PORT = 18791;
function isValidPort(port) {
	return Number.isFinite(port) && port > 0 && port <= 65535;
}
function clampPort(port, fallback) {
	return isValidPort(port) ? port : fallback;
}
function derivePort(base, offset, fallback) {
	return clampPort(base + offset, fallback);
}
function deriveDefaultBrowserControlPort(gatewayPort) {
	return derivePort(gatewayPort, 2, DEFAULT_BROWSER_CONTROL_PORT);
}
function deriveDefaultBrowserCdpPortRange(browserControlPort) {
	const start = derivePort(browserControlPort, 9, DEFAULT_BROWSER_CDP_PORT_RANGE_START);
	const end = start + DEFAULT_BROWSER_CDP_PORT_RANGE_SPAN;
	if (end <= 65535) return {
		start,
		end
	};
	return {
		start: DEFAULT_BROWSER_CDP_PORT_RANGE_START,
		end: DEFAULT_BROWSER_CDP_PORT_RANGE_END
	};
}
const DEFAULT_TRUTHY = [
	"true",
	"1",
	"yes",
	"on"
];
const DEFAULT_FALSY = [
	"false",
	"0",
	"no",
	"off"
];
const DEFAULT_TRUTHY_SET = new Set(DEFAULT_TRUTHY);
const DEFAULT_FALSY_SET = new Set(DEFAULT_FALSY);
function parseBooleanValue(value, options = {}) {
	if (typeof value === "boolean") return value;
	if (typeof value !== "string") return;
	const normalized = normalizeOptionalLowercaseString(value);
	if (!normalized) return;
	const truthy = options.truthy ?? DEFAULT_TRUTHY;
	const falsy = options.falsy ?? DEFAULT_FALSY;
	const truthySet = truthy === DEFAULT_TRUTHY ? DEFAULT_TRUTHY_SET : new Set(truthy);
	const falsySet = falsy === DEFAULT_FALSY ? DEFAULT_FALSY_SET : new Set(falsy);
	if (truthySet.has(normalized)) return true;
	if (falsySet.has(normalized)) return false;
}
//#endregion
//#region extensions/browser/src/browser/control-auth.ts
function resolveBrowserControlAuth(cfg, env = process.env) {
	const auth = resolveGatewayAuth({
		authConfig: cfg?.gateway?.auth,
		env,
		tailscaleMode: cfg?.gateway?.tailscale?.mode
	});
	const token = normalizeOptionalString(auth.token) ?? "";
	const password = normalizeOptionalString(auth.password) ?? "";
	switch (auth.mode) {
		case "password":
		case "trusted-proxy": return { password: password || void 0 };
		case "token":
		case "none": return { token: token || void 0 };
		default: return {};
	}
}
function shouldAutoGenerateBrowserAuth(env) {
	if (normalizeLowercaseStringOrEmpty(env.NODE_ENV) === "test") return false;
	const vitest = normalizeLowercaseStringOrEmpty(env.VITEST);
	if (vitest && vitest !== "0" && vitest !== "false" && vitest !== "off") return false;
	return true;
}
function hasExplicitNonStringGatewayCredentialForMode(params) {
	const { cfg, mode } = params;
	const auth = cfg?.gateway?.auth;
	if (!auth) return false;
	if (mode === "none") return auth.token != null && typeof auth.token !== "string";
	return auth.password != null && typeof auth.password !== "string";
}
function generateBrowserControlToken() {
	return crypto.randomBytes(24).toString("hex");
}
async function generateAndPersistBrowserControlToken(params) {
	const token = generateBrowserControlToken();
	await replaceConfigFile({
		nextConfig: {
			...params.cfg,
			gateway: {
				...params.cfg.gateway,
				auth: {
					...params.cfg.gateway?.auth,
					token
				}
			}
		},
		afterWrite: { mode: "auto" }
	});
	const persistedAuth = resolveBrowserControlAuth(getRuntimeConfig(), params.env);
	if (persistedAuth.token || persistedAuth.password) return {
		auth: persistedAuth,
		generatedToken: persistedAuth.token === token ? token : void 0
	};
	return {
		auth: { token },
		generatedToken: token
	};
}
async function generateAndPersistBrowserControlPassword(params) {
	const password = generateBrowserControlToken();
	await replaceConfigFile({
		nextConfig: {
			...params.cfg,
			gateway: {
				...params.cfg.gateway,
				auth: {
					...params.cfg.gateway?.auth,
					password
				}
			}
		},
		afterWrite: { mode: "auto" }
	});
	const persistedAuth = resolveBrowserControlAuth(getRuntimeConfig(), params.env);
	if (persistedAuth.token || persistedAuth.password) return {
		auth: persistedAuth,
		generatedToken: persistedAuth.password === password ? password : void 0
	};
	return {
		auth: { password },
		generatedToken: password
	};
}
async function ensureBrowserControlAuth(params) {
	const env = params.env ?? process.env;
	const auth = resolveBrowserControlAuth(params.cfg, env);
	if (auth.token || auth.password) return { auth };
	if (!shouldAutoGenerateBrowserAuth(env)) return { auth };
	if (params.cfg.gateway?.auth?.mode === "password") return { auth };
	const latestCfg = getRuntimeConfig();
	const latestAuth = resolveBrowserControlAuth(latestCfg, env);
	if (latestAuth.token || latestAuth.password) return { auth: latestAuth };
	if (latestCfg.gateway?.auth?.mode === "password") return { auth: latestAuth };
	const latestMode = latestCfg.gateway?.auth?.mode;
	if (latestMode === "none" || latestMode === "trusted-proxy") {
		if (hasExplicitNonStringGatewayCredentialForMode({
			cfg: latestCfg,
			mode: latestMode
		})) return { auth: latestAuth };
		if (latestMode === "trusted-proxy") return await generateAndPersistBrowserControlPassword({
			cfg: latestCfg,
			env
		});
		return await generateAndPersistBrowserControlToken({
			cfg: latestCfg,
			env
		});
	}
	const ensured = await ensureGatewayStartupAuth({
		cfg: latestCfg,
		env,
		persist: true
	});
	return {
		auth: {
			token: ensured.auth.token,
			password: ensured.auth.password
		},
		generatedToken: ensured.generatedToken
	};
}
//#endregion
export { deriveDefaultBrowserCdpPortRange as a, DEFAULT_BROWSER_CONTROL_PORT as i, resolveBrowserControlAuth as n, deriveDefaultBrowserControlPort as o, shouldAutoGenerateBrowserAuth as r, parseBooleanValue as s, ensureBrowserControlAuth as t };
