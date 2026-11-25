import type { ConfigReplaceResult, MutateConfigFileParams, MutateConfigFileResult, ReplaceConfigFileParams } from "./mutate.types.js";
export type { ConfigMutationBase, ConfigReplaceAfterWritePolicy, ConfigReplaceResult, } from "./mutate.types.js";
export declare class ConfigMutationConflictError extends Error {
    readonly currentHash: string | null;
    constructor(message: string, params: {
        currentHash: string | null;
    });
}
export declare function replaceConfigFile(params: ReplaceConfigFileParams): Promise<ConfigReplaceResult>;
export declare function mutateConfigFile<T = void>(params: MutateConfigFileParams<T>): Promise<MutateConfigFileResult<T>>;
