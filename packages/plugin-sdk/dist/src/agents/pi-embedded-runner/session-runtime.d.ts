import type { StreamFn } from "@mariozechner/pi-agent-core";
import { DefaultResourceLoader, type ExtensionFactory, type ModelRuntime, type SettingsManager } from "@mariozechner/pi-coding-agent";
import { ENCLAWED_PI_CLIENT_IDENTITY } from "../pi-client-identity.js";
/**
 * Preamble pi records in the session transcript's structured system prompt.
 *
 * pi-coding-agent >= 0.87 persists its own prompt sections as system messages
 * in the session file. Enclawed replaces the whole prompt at request time
 * (applySystemPromptOverrideToSession), so the transcript copy is never sent.
 * A fixed preamble keeps pi's default coding-assistant prompt (and its docs
 * paths) out of Enclawed transcripts and keeps the recorded sections stable
 * across runs, so pi does not append a new prompt patch on every run.
 */
export declare const EMBEDDED_PI_TRANSCRIPT_PREAMBLE = "Enclawed embedded agent session. The request system prompt is supplied by Enclawed.";
/**
 * Resource loader for embedded pi sessions: Enclawed's inline extension
 * factories and nothing discovered from disk.
 *
 * Without this, pi's DefaultResourceLoader autoloads extensions, skills,
 * prompt templates and themes from `<cwd>/.pi/` and the agent dir, settings
 * `packages` (which it may install with npm/git), `SYSTEM.md` /
 * `APPEND_SYSTEM.md`, and AGENTS.md/CLAUDE.md context files from the
 * workspace up to the filesystem root. Enclawed builds its own prompt, tools
 * and skills, so every one of those sources is disabled; the overrides below
 * also drop anything a settings file could still name.
 */
export declare function createEmbeddedPiResourceLoader(params: {
    cwd: string;
    agentDir: string;
    settingsManager: SettingsManager;
    extensionFactories: ExtensionFactory[];
}): Promise<DefaultResourceLoader>;
type EmbeddedSessionRequestSettings = Pick<SettingsManager, "getProviderRetrySettings" | "getHttpIdleTimeoutMs" | "getWebSocketConnectTimeoutMs">;
/**
 * Base stream function for embedded sessions, replacing the one
 * createAgentSession installs.
 *
 * pi's default applies the session's request settings, then overwrites the
 * request identity with pi's own (detailed host User-Agent plus attribution
 * while pi install telemetry is on) and starts pi's background cache warmer,
 * which sends extra provider requests outside Enclawed's wrappers. This keeps
 * the same request settings, resolves auth through the Enclawed-seeded model
 * runtime, and sends Enclawed's identity.
 */
export declare function createEmbeddedSessionBaseStreamFn(params: {
    modelRuntime: Pick<ModelRuntime, "streamSimple">;
    settingsManager: EmbeddedSessionRequestSettings;
}): StreamFn;
/** Request identity every embedded agent loop forwards to its stream function. */
export declare function applyEnclawedAgentIdentity(agent: {
    identity?: typeof ENCLAWED_PI_CLIENT_IDENTITY;
}): void;
export {};
