import { type ModelAliasIndex } from "../../agents/model-selection.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { InlineDirectives } from "./directive-handling.parse.js";
import { type ModelDirectiveSelection } from "./model-selection.js";
export declare function resolveModelSelectionFromDirective(params: {
    directives: InlineDirectives;
    cfg: EnclawedConfig;
    agentDir: string;
    defaultProvider: string;
    defaultModel: string;
    aliasIndex: ModelAliasIndex;
    allowedModelKeys: Set<string>;
    allowedModelCatalog: Array<{
        provider: string;
        id?: string;
        name?: string;
    }>;
    provider: string;
}): {
    modelSelection?: ModelDirectiveSelection;
    profileOverride?: string;
    errorText?: string;
};
