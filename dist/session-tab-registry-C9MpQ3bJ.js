import { i as normalizeLowercaseStringOrEmpty, o as normalizeOptionalLowercaseString } from "./string-coerce-BUSzWgUA.js";
import "./text-runtime-a81Cxtqz.js";
//#region extensions/browser/src/browser/session-tab-registry.ts
let defaultTrackedBrowserTabCloser;
function setDefaultTrackedBrowserTabCloser(closer) {
	defaultTrackedBrowserTabCloser = closer;
}
const trackedTabsBySession = /* @__PURE__ */ new Map();
function normalizeSessionKey(raw) {
	return normalizeOptionalLowercaseString(raw) ?? "";
}
function normalizeTargetId(raw) {
	return raw.trim();
}
function normalizeProfile(raw) {
	return normalizeOptionalLowercaseString(raw);
}
function normalizeBaseUrl(raw) {
	if (!raw) return;
	const trimmed = raw.trim();
	return trimmed ? trimmed : void 0;
}
function toTrackedTabId(params) {
	return `${params.targetId}\u0000${params.baseUrl ?? ""}\u0000${params.profile ?? ""}`;
}
function resolveTrackedTabIdentity(params) {
	const sessionKeyRaw = params.sessionKey?.trim();
	const targetIdRaw = params.targetId?.trim();
	if (!sessionKeyRaw || !targetIdRaw) return;
	return {
		sessionKey: normalizeSessionKey(sessionKeyRaw),
		targetId: normalizeTargetId(targetIdRaw),
		baseUrl: normalizeBaseUrl(params.baseUrl),
		profile: normalizeProfile(params.profile)
	};
}
function isIgnorableCloseError(err) {
	const message = normalizeLowercaseStringOrEmpty(String(err));
	return message.includes("tab not found") || message.includes("target closed") || message.includes("target not found") || message.includes("no such target");
}
function trackSessionBrowserTab(params) {
	const identity = resolveTrackedTabIdentity(params);
	if (!identity) return;
	const now = Date.now();
	const tracked = {
		...identity,
		trackedAt: now,
		lastUsedAt: now
	};
	const trackedId = toTrackedTabId(tracked);
	let trackedForSession = trackedTabsBySession.get(identity.sessionKey);
	if (!trackedForSession) {
		trackedForSession = /* @__PURE__ */ new Map();
		trackedTabsBySession.set(identity.sessionKey, trackedForSession);
	}
	const existing = trackedForSession.get(trackedId);
	trackedForSession.set(trackedId, {
		...tracked,
		trackedAt: existing?.trackedAt ?? tracked.trackedAt
	});
}
function touchSessionBrowserTab(params) {
	const identity = resolveTrackedTabIdentity(params);
	if (!identity) return;
	const trackedForSession = trackedTabsBySession.get(identity.sessionKey);
	if (!trackedForSession) return;
	const trackedId = toTrackedTabId(identity);
	const tracked = trackedForSession.get(trackedId);
	if (!tracked) return;
	trackedForSession.set(trackedId, {
		...tracked,
		lastUsedAt: params.now ?? Date.now()
	});
}
function untrackSessionBrowserTab(params) {
	const identity = resolveTrackedTabIdentity(params);
	if (!identity) return;
	const trackedForSession = trackedTabsBySession.get(identity.sessionKey);
	if (!trackedForSession) return;
	const trackedId = toTrackedTabId(identity);
	trackedForSession.delete(trackedId);
	if (trackedForSession.size === 0) trackedTabsBySession.delete(identity.sessionKey);
}
function takeTrackedTabsForSessionKeys(sessionKeys) {
	const uniqueSessionKeys = /* @__PURE__ */ new Set();
	for (const key of sessionKeys) {
		if (!key?.trim()) continue;
		uniqueSessionKeys.add(normalizeSessionKey(key));
	}
	if (uniqueSessionKeys.size === 0) return [];
	const seenTrackedIds = /* @__PURE__ */ new Set();
	const tabs = [];
	for (const sessionKey of uniqueSessionKeys) {
		const trackedForSession = trackedTabsBySession.get(sessionKey);
		if (!trackedForSession || trackedForSession.size === 0) continue;
		trackedTabsBySession.delete(sessionKey);
		for (const tracked of trackedForSession.values()) {
			const trackedId = toTrackedTabId(tracked);
			if (seenTrackedIds.has(trackedId)) continue;
			seenTrackedIds.add(trackedId);
			tabs.push(tracked);
		}
	}
	return tabs;
}
async function closeTrackedTabs(params) {
	if (params.tabs.length === 0) return 0;
	const closeTab = params.closeTab ?? defaultTrackedBrowserTabCloser;
	if (!closeTab) {
		params.onWarn?.(`no browser tab closer installed; dropped ${params.tabs.length} tracked browser tab(s)`);
		return 0;
	}
	let closed = 0;
	for (const tab of params.tabs) try {
		await closeTab({
			targetId: tab.targetId,
			baseUrl: tab.baseUrl,
			profile: tab.profile
		});
		closed += 1;
	} catch (err) {
		if (!isIgnorableCloseError(err)) params.onWarn?.(`failed to close tracked browser tab ${tab.targetId}: ${String(err)}`);
	}
	return closed;
}
async function closeTrackedBrowserTabsForSessions(params) {
	return await closeTrackedTabs({
		tabs: takeTrackedTabsForSessionKeys(params.sessionKeys),
		closeTab: params.closeTab,
		onWarn: params.onWarn
	});
}
function takeStaleTrackedTabs(params) {
	const tabsToClose = [];
	const takenIdsBySession = /* @__PURE__ */ new Map();
	const mark = (sessionKey, trackedId, tracked) => {
		let takenForSession = takenIdsBySession.get(sessionKey);
		if (!takenForSession) {
			takenForSession = /* @__PURE__ */ new Set();
			takenIdsBySession.set(sessionKey, takenForSession);
		}
		if (takenForSession.has(trackedId)) return;
		takenForSession.add(trackedId);
		tabsToClose.push(tracked);
	};
	for (const [sessionKey, trackedForSession] of trackedTabsBySession) {
		if (params.sessionFilter && !params.sessionFilter(sessionKey)) continue;
		const entries = [...trackedForSession.entries()].toSorted((a, b) => a[1].lastUsedAt - b[1].lastUsedAt || a[1].trackedAt - b[1].trackedAt);
		if (params.idleMs && params.idleMs > 0) {
			for (const [trackedId, tracked] of entries) if (params.now - tracked.lastUsedAt >= params.idleMs) mark(sessionKey, trackedId, tracked);
		}
		const remainingEntries = entries.filter(([trackedId]) => !takenIdsBySession.get(sessionKey)?.has(trackedId));
		if (params.maxTabsPerSession && params.maxTabsPerSession > 0 && remainingEntries.length > params.maxTabsPerSession) {
			const excess = remainingEntries.length - params.maxTabsPerSession;
			for (const [trackedId, tracked] of remainingEntries.slice(0, excess)) mark(sessionKey, trackedId, tracked);
		}
	}
	for (const [sessionKey, trackedIds] of takenIdsBySession) {
		const trackedForSession = trackedTabsBySession.get(sessionKey);
		if (!trackedForSession) continue;
		for (const trackedId of trackedIds) trackedForSession.delete(trackedId);
		if (trackedForSession.size === 0) trackedTabsBySession.delete(sessionKey);
	}
	return tabsToClose;
}
async function sweepTrackedBrowserTabs(params) {
	return await closeTrackedTabs({
		tabs: takeStaleTrackedTabs({
			now: params.now ?? Date.now(),
			idleMs: params.idleMs,
			maxTabsPerSession: params.maxTabsPerSession,
			sessionFilter: params.sessionFilter
		}),
		closeTab: params.closeTab,
		onWarn: params.onWarn
	});
}
//#endregion
export { trackSessionBrowserTab as a, touchSessionBrowserTab as i, setDefaultTrackedBrowserTabCloser as n, untrackSessionBrowserTab as o, sweepTrackedBrowserTabs as r, closeTrackedBrowserTabsForSessions as t };
