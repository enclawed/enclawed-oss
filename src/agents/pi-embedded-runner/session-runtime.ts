import type { StreamFn } from "@mariozechner/pi-agent-core";
import {
  DefaultResourceLoader,
  type ExtensionFactory,
  type ModelRuntime,
  type SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { ENCLAWED_PI_CLIENT_IDENTITY, withEnclawedClientIdentity } from "../pi-client-identity.js";

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
export const EMBEDDED_PI_TRANSCRIPT_PREAMBLE =
  "Enclawed embedded agent session. The request system prompt is supplied by Enclawed.";

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
export async function createEmbeddedPiResourceLoader(params: {
  cwd: string;
  agentDir: string;
  settingsManager: SettingsManager;
  extensionFactories: ExtensionFactory[];
}): Promise<DefaultResourceLoader> {
  const loader = new DefaultResourceLoader({
    cwd: params.cwd,
    agentDir: params.agentDir,
    settingsManager: params.settingsManager,
    extensionFactories: params.extensionFactories,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    appendSystemPrompt: [],
    // Inline factories load under "<inline:N>" paths; anything else came from
    // disk or a package and is refused.
    extensionsOverride: (base) => ({
      ...base,
      extensions: base.extensions.filter((extension) => extension.path.startsWith("<inline:")),
    }),
    skillsOverride: () => ({ skills: [], diagnostics: [] }),
    promptsOverride: () => ({ prompts: [], diagnostics: [] }),
    themesOverride: () => ({ themes: [], diagnostics: [] }),
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    systemPromptOverride: () => EMBEDDED_PI_TRANSCRIPT_PREAMBLE,
    appendSystemPromptOverride: () => [],
  });
  await loader.reload();
  return loader;
}

type EmbeddedSessionRequestSettings = Pick<
  SettingsManager,
  "getProviderRetrySettings" | "getHttpIdleTimeoutMs" | "getWebSocketConnectTimeoutMs"
>;

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
export function createEmbeddedSessionBaseStreamFn(params: {
  modelRuntime: Pick<ModelRuntime, "streamSimple">;
  settingsManager: EmbeddedSessionRequestSettings;
}): StreamFn {
  const { modelRuntime, settingsManager } = params;
  return (model, context, options) => {
    const retry = settingsManager.getProviderRetrySettings();
    const httpIdleTimeoutMs = settingsManager.getHttpIdleTimeoutMs();
    // Provider SDKs treat timeout=0 as an immediate timeout, so 0 ("no idle
    // timeout") maps to the largest int32, as pi does.
    const idleTimeoutMs = httpIdleTimeoutMs === 0 ? 2_147_483_647 : httpIdleTimeoutMs;
    return modelRuntime.streamSimple(
      model,
      context,
      withEnclawedClientIdentity({
        ...options,
        timeoutMs: options?.timeoutMs ?? retry.timeoutMs ?? idleTimeoutMs,
        websocketConnectTimeoutMs:
          options?.websocketConnectTimeoutMs ?? settingsManager.getWebSocketConnectTimeoutMs(),
        maxRetries: options?.maxRetries ?? retry.maxRetries,
        maxRetryDelayMs: options?.maxRetryDelayMs ?? retry.maxRetryDelayMs,
      }),
    );
  };
}

/** Request identity every embedded agent loop forwards to its stream function. */
export function applyEnclawedAgentIdentity(agent: {
  identity?: typeof ENCLAWED_PI_CLIENT_IDENTITY;
}) {
  agent.identity = { ...ENCLAWED_PI_CLIENT_IDENTITY };
}
