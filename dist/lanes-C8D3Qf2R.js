import { t as CommandLane } from "./lanes-DHUC1f2M.js";
//#region src/agents/pi-embedded-runner/lanes.ts
function resolveSessionLane(key) {
	const cleaned = key.trim() || CommandLane.Main;
	return cleaned.startsWith("session:") ? cleaned : `session:${cleaned}`;
}
function resolveGlobalLane(lane) {
	const cleaned = lane?.trim();
	if (cleaned === CommandLane.Cron) return CommandLane.Nested;
	return cleaned ? cleaned : CommandLane.Main;
}
function resolveEmbeddedSessionLane(key) {
	return resolveSessionLane(key);
}
//#endregion
export { resolveGlobalLane as n, resolveSessionLane as r, resolveEmbeddedSessionLane as t };
