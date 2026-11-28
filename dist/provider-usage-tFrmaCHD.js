import { i as normalizeLowercaseStringOrEmpty } from "./string-coerce-BUSzWgUA.js";
import { n as PROVIDER_LABELS, r as clampPercent } from "./provider-usage.shared-zgJVZtyU.js";
//#region src/infra/provider-usage.fetch.shared.ts
async function fetchJson(url, init, timeoutMs, fetchFn) {
	const controller = new AbortController();
	const timer = setTimeout(controller.abort.bind(controller), timeoutMs);
	try {
		return await fetchFn(url, {
			...init,
			signal: controller.signal
		});
	} finally {
		clearTimeout(timer);
	}
}
function buildUsageErrorSnapshot(provider, error) {
	return {
		provider,
		displayName: PROVIDER_LABELS[provider],
		windows: [],
		error
	};
}
function buildUsageHttpErrorSnapshot(options) {
	if ((options.tokenExpiredStatuses ?? []).includes(options.status)) return buildUsageErrorSnapshot(options.provider, "Token expired");
	const suffix = options.message?.trim() ? `: ${options.message.trim()}` : "";
	return buildUsageErrorSnapshot(options.provider, `HTTP ${options.status}${suffix}`);
}
//#endregion
//#region src/infra/provider-usage.fetch.claude.ts
function buildClaudeUsageWindows(data) {
	const windows = [];
	if (data.five_hour?.utilization !== void 0) windows.push({
		label: "5h",
		usedPercent: clampPercent(data.five_hour.utilization),
		resetAt: data.five_hour.resets_at ? new Date(data.five_hour.resets_at).getTime() : void 0
	});
	if (data.seven_day?.utilization !== void 0) windows.push({
		label: "Week",
		usedPercent: clampPercent(data.seven_day.utilization),
		resetAt: data.seven_day.resets_at ? new Date(data.seven_day.resets_at).getTime() : void 0
	});
	const modelWindow = data.seven_day_sonnet || data.seven_day_opus;
	if (modelWindow?.utilization !== void 0) windows.push({
		label: data.seven_day_sonnet ? "Sonnet" : "Opus",
		usedPercent: clampPercent(modelWindow.utilization)
	});
	return windows;
}
function resolveClaudeWebSessionKey() {
	const direct = process.env.CLAUDE_AI_SESSION_KEY?.trim() ?? process.env.CLAUDE_WEB_SESSION_KEY?.trim();
	if (direct?.startsWith("sk-ant-")) return direct;
	const cookieHeader = process.env.CLAUDE_WEB_COOKIE?.trim();
	if (!cookieHeader) return;
	const value = cookieHeader.replace(/^cookie:\s*/i, "").match(/(?:^|;\s*)sessionKey=([^;\s]+)/i)?.[1]?.trim();
	return value?.startsWith("sk-ant-") ? value : void 0;
}
async function fetchClaudeWebUsage(sessionKey, timeoutMs, fetchFn) {
	const headers = {
		Cookie: `sessionKey=${sessionKey}`,
		Accept: "application/json"
	};
	const orgRes = await fetchJson("https://claude.ai/api/organizations", { headers }, timeoutMs, fetchFn);
	if (!orgRes.ok) return null;
	const orgId = (await orgRes.json())?.[0]?.uuid?.trim();
	if (!orgId) return null;
	const usageRes = await fetchJson(`https://claude.ai/api/organizations/${orgId}/usage`, { headers }, timeoutMs, fetchFn);
	if (!usageRes.ok) return null;
	const windows = buildClaudeUsageWindows(await usageRes.json());
	if (windows.length === 0) return null;
	return {
		provider: "anthropic",
		displayName: PROVIDER_LABELS.anthropic,
		windows
	};
}
async function fetchClaudeUsage(token, timeoutMs, fetchFn) {
	const res = await fetchJson("https://api.anthropic.com/api/oauth/usage", { headers: {
		Authorization: `Bearer ${token}`,
		Accept: "application/json",
		"anthropic-version": "2023-06-01",
		"anthropic-beta": "oauth-2025-04-20"
	} }, timeoutMs, fetchFn);
	if (!res.ok) {
		let message;
		try {
			const raw = (await res.json())?.error?.message;
			if (typeof raw === "string" && raw.trim()) message = raw.trim();
		} catch {}
		if (res.status === 403 && message?.includes("scope requirement user:profile")) {
			const sessionKey = resolveClaudeWebSessionKey();
			if (sessionKey) {
				const web = await fetchClaudeWebUsage(sessionKey, timeoutMs, fetchFn);
				if (web) return web;
			}
		}
		return buildUsageHttpErrorSnapshot({
			provider: "anthropic",
			status: res.status,
			message
		});
	}
	const windows = buildClaudeUsageWindows(await res.json());
	return {
		provider: "anthropic",
		displayName: PROVIDER_LABELS.anthropic,
		windows
	};
}
//#endregion
//#region src/infra/provider-usage.fetch.codex.ts
const WEEKLY_RESET_GAP_SECONDS = 4320 * 60;
function resolveSecondaryWindowLabel(params) {
	if (params.windowHours >= 168) return "Week";
	if (params.windowHours < 24) return `${params.windowHours}h`;
	if (typeof params.secondaryResetAt === "number" && typeof params.primaryResetAt === "number" && params.secondaryResetAt - params.primaryResetAt >= WEEKLY_RESET_GAP_SECONDS) return "Week";
	return "Day";
}
async function fetchCodexUsage(token, accountId, timeoutMs, fetchFn) {
	const headers = {
		Authorization: `Bearer ${token}`,
		"User-Agent": "CodexBar",
		Accept: "application/json"
	};
	if (accountId) headers["ChatGPT-Account-Id"] = accountId;
	const res = await fetchJson("https://chatgpt.com/backend-api/wham/usage", {
		method: "GET",
		headers
	}, timeoutMs, fetchFn);
	if (!res.ok) return buildUsageHttpErrorSnapshot({
		provider: "openai-codex",
		status: res.status,
		tokenExpiredStatuses: [401, 403]
	});
	const data = await res.json();
	const windows = [];
	if (data.rate_limit?.primary_window) {
		const pw = data.rate_limit.primary_window;
		const windowHours = Math.round((pw.limit_window_seconds || 10800) / 3600);
		windows.push({
			label: `${windowHours}h`,
			usedPercent: clampPercent(pw.used_percent || 0),
			resetAt: pw.reset_at ? pw.reset_at * 1e3 : void 0
		});
	}
	if (data.rate_limit?.secondary_window) {
		const sw = data.rate_limit.secondary_window;
		const label = resolveSecondaryWindowLabel({
			windowHours: Math.round((sw.limit_window_seconds || 86400) / 3600),
			primaryResetAt: data.rate_limit?.primary_window?.reset_at,
			secondaryResetAt: sw.reset_at
		});
		windows.push({
			label,
			usedPercent: clampPercent(sw.used_percent || 0),
			resetAt: sw.reset_at ? sw.reset_at * 1e3 : void 0
		});
	}
	let plan = data.plan_type;
	if (data.credits?.balance !== void 0 && data.credits.balance !== null) {
		const balance = typeof data.credits.balance === "number" ? data.credits.balance : parseFloat(data.credits.balance) || 0;
		plan = plan ? `${plan} ($${balance.toFixed(2)})` : `$${balance.toFixed(2)}`;
	}
	return {
		provider: "openai-codex",
		displayName: PROVIDER_LABELS["openai-codex"],
		windows,
		plan
	};
}
//#endregion
//#region src/infra/provider-usage.fetch.gemini.ts
async function fetchGeminiUsage(token, timeoutMs, fetchFn, provider) {
	const res = await fetchJson("https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json"
		},
		body: "{}"
	}, timeoutMs, fetchFn);
	if (!res.ok) return buildUsageHttpErrorSnapshot({
		provider,
		status: res.status
	});
	const data = await res.json();
	const quotas = {};
	for (const bucket of data.buckets || []) {
		const model = bucket.modelId || "unknown";
		const frac = bucket.remainingFraction ?? 1;
		if (!quotas[model] || frac < quotas[model]) quotas[model] = frac;
	}
	const windows = [];
	let proMin = 1;
	let flashMin = 1;
	let hasPro = false;
	let hasFlash = false;
	for (const [model, frac] of Object.entries(quotas)) {
		const lower = normalizeLowercaseStringOrEmpty(model);
		if (lower.includes("pro")) {
			hasPro = true;
			if (frac < proMin) proMin = frac;
		}
		if (lower.includes("flash")) {
			hasFlash = true;
			if (frac < flashMin) flashMin = frac;
		}
	}
	if (hasPro) windows.push({
		label: "Pro",
		usedPercent: clampPercent((1 - proMin) * 100)
	});
	if (hasFlash) windows.push({
		label: "Flash",
		usedPercent: clampPercent((1 - flashMin) * 100)
	});
	return {
		provider,
		displayName: PROVIDER_LABELS[provider],
		windows
	};
}
//#endregion
export { buildUsageHttpErrorSnapshot as a, buildUsageErrorSnapshot as i, fetchCodexUsage as n, fetchJson as o, fetchClaudeUsage as r, fetchGeminiUsage as t };
