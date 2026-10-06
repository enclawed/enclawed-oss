import type { EnclawedConfig } from "../config/types.js";
import type { ChatCommandDefinition, CommandDetection, CommandNormalizeOptions } from "./commands-registry.types.js";
export declare function normalizeCommandBody(raw: string, options?: CommandNormalizeOptions): string;
export declare function getCommandDetection(_cfg?: EnclawedConfig): CommandDetection;
export declare function maybeResolveTextAlias(raw: string, cfg?: EnclawedConfig): string | null;
export declare function resolveTextCommand(raw: string, cfg?: EnclawedConfig): {
    command: ChatCommandDefinition;
    args?: string;
} | null;
