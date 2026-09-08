import { n as resolveChannelAllowFromPath } from "./allow-from-store-read-BYQgiyTk.js";
import "./channel-pairing-paths-D5-F1yqA.js";
import { n as resolveDefaultTelegramAccountId } from "./account-selection-B3mcoWCO.js";
import fs from "node:fs";
//#region extensions/telegram/src/state-migrations.ts
function fileExists(pathValue) {
	try {
		return fs.existsSync(pathValue) && fs.statSync(pathValue).isFile();
	} catch {
		return false;
	}
}
function detectTelegramLegacyStateMigrations(params) {
	const legacyPath = resolveChannelAllowFromPath("telegram", params.env);
	if (!fileExists(legacyPath)) return [];
	const accountId = resolveDefaultTelegramAccountId(params.cfg);
	const targetPath = resolveChannelAllowFromPath("telegram", params.env, accountId);
	if (fileExists(targetPath)) return [];
	return [{
		kind: "copy",
		label: "Telegram pairing allowFrom",
		sourcePath: legacyPath,
		targetPath
	}];
}
//#endregion
export { detectTelegramLegacyStateMigrations as t };
