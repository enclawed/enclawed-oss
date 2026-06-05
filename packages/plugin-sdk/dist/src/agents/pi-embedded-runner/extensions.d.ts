import type { ExtensionFactory, SessionManager } from "@mariozechner/pi-coding-agent";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { ProviderRuntimeModel } from "../../plugins/provider-runtime-model.types.js";
import { ensurePiCompactionReserveTokens } from "../pi-settings.js";
export declare function buildEmbeddedExtensionFactories(params: {
    cfg: EnclawedConfig | undefined;
    sessionManager: SessionManager;
    provider: string;
    modelId: string;
    model: ProviderRuntimeModel | undefined;
}): ExtensionFactory[];
export { ensurePiCompactionReserveTokens };
