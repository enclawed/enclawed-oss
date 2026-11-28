import { n as defaultRuntime } from "./runtime-1ULlIz69.js";
import { t as formatCliCommand } from "./command-format-Dyt7cO_V.js";
import { o as success, t as danger } from "./globals-CFCun_tB.js";
import { r as logInfo } from "./logger-CxYwkFNY.js";
import { i as getRuntimeConfig } from "./io-B2MO_b-F.js";
import "./runtime-env-COg6YcJg.js";
import "./runtime-config-snapshot-BU_bTVnz.js";
import "./text-runtime-a81Cxtqz.js";
import "./cli-runtime-C4BYE0ee.js";
import { a as resolveWhatsAppAccount } from "./accounts-fwCguyqz.js";
import { y as restoreCredsFromBackupIfNeeded } from "./auth-store-FEH7HxtI.js";
import { a as waitForWhatsAppLoginResult, i as closeWaSocketSoon, l as resolveWhatsAppSocketTiming, o as createWaSocket } from "./connection-controller-7pa1ZSzW.js";
//#region extensions/whatsapp/src/login.ts
async function loginWeb(verbose, waitForConnection, runtime = defaultRuntime, accountId) {
	const cfg = getRuntimeConfig();
	const account = resolveWhatsAppAccount({
		cfg,
		accountId
	});
	const socketTiming = resolveWhatsAppSocketTiming(cfg);
	const restoredFromBackup = await restoreCredsFromBackupIfNeeded(account.authDir);
	let sock = await createWaSocket(true, verbose, {
		authDir: account.authDir,
		...socketTiming
	});
	logInfo("Waiting for WhatsApp connection...", runtime);
	try {
		const result = await waitForWhatsAppLoginResult({
			sock,
			authDir: account.authDir,
			isLegacyAuthDir: account.isLegacyAuthDir,
			verbose,
			runtime,
			waitForConnection,
			socketTiming,
			onSocketReplaced: (replacementSock) => {
				sock = replacementSock;
			}
		});
		if (result.outcome === "connected") {
			console.log(success(result.restarted ? "✅ Linked after restart; web session ready." : restoredFromBackup ? "✅ Recovered from creds.json.bak; web session ready." : "✅ Linked! Credentials saved for future sends."));
			return;
		}
		if (result.outcome === "logged-out") {
			console.error(danger(`WhatsApp reported the session is logged out. Cleared cached web session; please rerun ${formatCliCommand("enclawed channels login")} and scan the QR again.`));
			throw new Error("Session logged out; cache cleared. Re-run login.", { cause: result.error });
		}
		console.error(danger(`WhatsApp Web connection ended before fully opening. ${result.message}`));
		throw new Error(result.message, { cause: result.error });
	} finally {
		closeWaSocketSoon(sock);
	}
}
//#endregion
export { loginWeb as t };
