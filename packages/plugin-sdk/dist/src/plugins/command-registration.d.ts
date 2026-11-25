import { clearPluginCommands, clearPluginCommandsForPlugin, getPluginCommandSpecs, listProviderPluginCommandSpecs, type RegisteredPluginCommand } from "./command-registry-state.js";
import type { EnclawedPluginCommandDefinition } from "./types.js";
export type CommandRegistrationResult = {
    ok: boolean;
    error?: string;
};
export declare function validateCommandName(name: string): string | null;
/**
 * Validate a plugin command definition without registering it.
 * Returns an error message if invalid, or null if valid.
 * Shared by both the global registration path and snapshot (non-activating) loads.
 */
export declare function validatePluginCommandDefinition(command: EnclawedPluginCommandDefinition): string | null;
export declare function listPluginInvocationKeys(command: EnclawedPluginCommandDefinition): string[];
export declare function registerPluginCommand(pluginId: string, command: EnclawedPluginCommandDefinition, opts?: {
    pluginName?: string;
    pluginRoot?: string;
}): CommandRegistrationResult;
export { clearPluginCommands, clearPluginCommandsForPlugin, getPluginCommandSpecs, listProviderPluginCommandSpecs, };
export type { RegisteredPluginCommand };
