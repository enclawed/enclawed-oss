import { type ZodTypeAny } from "zod";
import type { PluginConfigUiHint } from "./manifest-types.js";
import type { EnclawedPluginConfigSchema } from "./types.js";
type BuildPluginConfigSchemaOptions = {
    uiHints?: Record<string, PluginConfigUiHint>;
    safeParse?: EnclawedPluginConfigSchema["safeParse"];
};
export declare function buildPluginConfigSchema(schema: ZodTypeAny, options?: BuildPluginConfigSchemaOptions): EnclawedPluginConfigSchema & {
    safeParse: NonNullable<EnclawedPluginConfigSchema["safeParse"]>;
};
export declare function emptyPluginConfigSchema(): EnclawedPluginConfigSchema;
export {};
