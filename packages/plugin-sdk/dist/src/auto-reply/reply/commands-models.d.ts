import type { SessionEntry } from "../../config/sessions.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { ReplyPayload } from "../types.js";
import type { CommandHandler } from "./commands-types.js";
type ModelsCommandSessionEntry = Partial<Pick<SessionEntry, "authProfileOverride" | "modelProvider" | "model">>;
export type ModelsProviderData = {
    byProvider: Map<string, Set<string>>;
    providers: string[];
    resolvedDefault: {
        provider: string;
        model: string;
    };
    /** Map from provider/model to human-readable display name (when different from model ID). */
    modelNames: Map<string, string>;
    /**
     * Optional per-provider runtime selection choices used by model-picker UIs
     * (for example provider-native CLI vs the built-in Pi runtime). Keyed by
     * normalized provider id.
     */
    runtimeChoicesByProvider?: Map<string, Array<{
        id: string;
        label: string;
        description?: string;
    }>>;
};
/**
 * Build provider/model data from config and catalog.
 * Exported for reuse by callback handlers.
 */
export declare function buildModelsProviderData(cfg: EnclawedConfig, agentId?: string): Promise<ModelsProviderData>;
export declare function formatModelsAvailableHeader(params: {
    provider: string;
    total: number;
    cfg: EnclawedConfig;
    agentDir?: string;
    sessionEntry?: ModelsCommandSessionEntry;
}): string;
export declare function resolveModelsCommandReply(params: {
    cfg: EnclawedConfig;
    commandBodyNormalized: string;
    surface?: string;
    currentModel?: string;
    agentId?: string;
    agentDir?: string;
    sessionEntry?: ModelsCommandSessionEntry;
}): Promise<ReplyPayload | null>;
export declare const handleModelsCommand: CommandHandler;
export {};
