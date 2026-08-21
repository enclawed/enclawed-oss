import type { CliBackendConfig } from "../config/types.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
/**
 * Optional context handed to a CLI backend's `normalizeConfig` hook.
 *
 * Backends use this for context-aware normalization (for example, agent-scoped
 * security overrides) without taking a hard dependency on internal runtime
 * objects.
 */
export type CliBackendNormalizeConfigContext = {
    config?: EnclawedConfig;
    agentId?: string;
    /**
     * Backend id resolved by the CLI runner (for example `"claude-cli"`).
     * Provided so backends that register multiple compatibility backends can
     * specialize normalization per-backend without re-parsing the agent's
     * provider/model ref.
     */
    backendId?: string;
};
export type PluginTextReplacement = {
    from: string | RegExp;
    to: string;
};
export type PluginTextTransforms = {
    /** Rewrites applied to outbound prompt text before provider/CLI transport. */
    input?: PluginTextReplacement[];
    /** Rewrites applied to inbound assistant text before Enclawed consumes it. */
    output?: PluginTextReplacement[];
};
export type CliBundleMcpMode = "claude-config-file" | "codex-config-overrides" | "gemini-system-settings";
/** Plugin-owned CLI backend defaults used by the text-only CLI runner. */
export type CliBackendPlugin = {
    /** Provider id used in model refs, for example `claude-cli/opus`. */
    id: string;
    /** Default backend config before user overrides from `agents.defaults.cliBackends`. */
    config: CliBackendConfig;
    /**
     * Optional live-smoke metadata owned by the backend plugin.
     *
     * Keep provider-specific test wiring here instead of scattering it across
     * Docker wrappers, docs, and gateway live tests.
     */
    liveTest?: {
        defaultModelRef?: string;
        defaultImageProbe?: boolean;
        defaultMcpProbe?: boolean;
        docker?: {
            npmPackage?: string;
            binaryName?: string;
        };
    };
    /**
     * Whether Enclawed should inject bundle MCP config for this backend.
     *
     * Keep this opt-in. Only backends that explicitly consume Enclawed's bundle
     * MCP bridge should enable it.
     */
    bundleMcp?: boolean;
    /**
     * Provider-owned bundle MCP integration strategy.
     *
     * Different CLIs wire MCP through different surfaces:
     * - Claude: `--strict-mcp-config --mcp-config`
     * - Codex: `-c mcp_servers=...`
     * - Gemini: system-level `settings.json`
     */
    bundleMcpMode?: CliBundleMcpMode;
    /**
     * Native-tool integration policy for backends that ship their own tool
     * surface. `"always-on"` indicates the backend's native tools are wired in
     * for every run without per-agent opt-in.
     */
    nativeToolMode?: "always-on";
    /**
     * Optional config normalizer applied after user overrides merge.
     *
     * Use this for backend-specific compatibility rewrites when old config
     * shapes need to stay working.
     */
    normalizeConfig?: (config: CliBackendConfig, context?: CliBackendNormalizeConfigContext) => CliBackendConfig;
    /**
     * Backend-owned final system-prompt transform.
     *
     * Use this for tiny CLI-specific compatibility rewrites without replacing
     * the generic CLI runner or prompt builder.
     */
    transformSystemPrompt?: (ctx: {
        config?: EnclawedConfig;
        workspaceDir?: string;
        provider: string;
        modelId: string;
        modelDisplay: string;
        agentId?: string;
        systemPrompt: string;
    }) => string | null | undefined;
    /**
     * Backend-owned bidirectional text replacements.
     *
     * `input` applies to the system prompt and user prompt passed to the CLI.
     * `output` applies to parsed/streamed assistant text from the CLI.
     */
    textTransforms?: PluginTextTransforms;
};
