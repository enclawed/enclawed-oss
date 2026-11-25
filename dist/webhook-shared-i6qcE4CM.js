import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import "./text-runtime-DpDoI-Qm.js";
import { t as normalizeWebhookPath } from "./webhook-path-DdoGX7d0.js";
//#region extensions/bluebubbles/src/webhook-shared.ts
const DEFAULT_WEBHOOK_PATH = "/bluebubbles-webhook";
function resolveWebhookPathFromConfig(config) {
	const raw = normalizeOptionalString(config?.webhookPath);
	if (raw) return normalizeWebhookPath(raw);
	return DEFAULT_WEBHOOK_PATH;
}
//#endregion
export { resolveWebhookPathFromConfig as n, DEFAULT_WEBHOOK_PATH as t };
