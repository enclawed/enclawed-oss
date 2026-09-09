import { readStringOrNumberParam, readStringParam } from "@enclawed/plugin-sdk/channel-actions";
import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";

export { resolveReactionMessageId } from "@enclawed/plugin-sdk/channel-actions";
export { handleWhatsAppAction } from "./action-runtime.js";
export { isWhatsAppGroupJid, normalizeWhatsAppTarget } from "./normalize.js";
export { readStringOrNumberParam, readStringParam, type EnclawedConfig };
