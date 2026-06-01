import { n as resolvePreferredEnclawedTmpDir } from "./tmp-enclawed-dir-BTrLrKyp.js";
import "./temp-path-CGkochzA.js";
import { i as createPatchedAccountSetupAdapter } from "./setup-helpers-DOTBbn4V.js";
import { a as createDelegatedSetupWizardProxy } from "./setup-wizard-proxy-C9oibAtI.js";
import "./setup-runtime-DH-6YnyR.js";
import path from "node:path";
import fs from "node:fs/promises";
//#region extensions/zalouser/src/qr-temp-file.ts
async function writeQrDataUrlToTempFile(qrDataUrl, profile) {
	const base64 = (qrDataUrl.trim().match(/^data:image\/png;base64,(.+)$/i)?.[1] ?? "").trim();
	if (!base64) return null;
	const safeProfile = profile.replace(/[^a-zA-Z0-9_-]+/g, "-") || "default";
	const filePath = path.join(resolvePreferredEnclawedTmpDir(), `enclawed-zalouser-qr-${safeProfile}.png`);
	await fs.writeFile(filePath, Buffer.from(base64, "base64"));
	return filePath;
}
//#endregion
//#region extensions/zalouser/src/setup-core.ts
const channel = "zalouser";
const zalouserSetupAdapter = createPatchedAccountSetupAdapter({
	channelKey: channel,
	validateInput: () => null,
	buildPatch: () => ({})
});
function createZalouserSetupWizardProxy(loadWizard) {
	return createDelegatedSetupWizardProxy({
		channel,
		loadWizard,
		status: {
			configuredLabel: "logged in",
			unconfiguredLabel: "needs QR login",
			configuredHint: "recommended · logged in",
			unconfiguredHint: "recommended · QR login",
			configuredScore: 1,
			unconfiguredScore: 15
		},
		credentials: [],
		delegatePrepare: true,
		delegateFinalize: true
	});
}
//#endregion
export { zalouserSetupAdapter as n, writeQrDataUrlToTempFile as r, createZalouserSetupWizardProxy as t };
