export declare const ENCLAWED_DIR_NAME = ".enclawed";
export declare const OPENCLAW_DIR_NAME = ".openclaw";
export declare const ENCLAWED_CONFIG_FILENAME = "enclawed.json";
export declare const OPENCLAW_CONFIG_FILENAME = "openclaw.json";
export type WorkspaceDirRule = "env_state_dir" | "env_config_path" | "config_key" | "enclawed_exists" | "openclaw_fallback" | "new_install_default";
export interface WorkspaceDirResolution {
    /** Absolute path the runtime should use as the user workspace / state dir. */
    path: string;
    /** Which precedence rule fired. */
    rule: WorkspaceDirRule;
    /** Whether the resolver had to fall back to the legacy `~/.openclaw` dir. */
    usingLegacyDir: boolean;
}
export interface ResolveWorkspaceDirOptions {
    env?: NodeJS.ProcessEnv;
    homedir?: () => string;
    /** Filesystem probe — injected for tests. Defaults to `fs.existsSync`. */
    existsSync?: (target: string) => boolean;
    /** Slim JSON reader — injected for tests. Defaults to `fs.readFileSync`. */
    readFileSync?: (target: string, encoding: "utf8") => string;
}
/**
 * Resolve the user workspace / state directory. Returns the chosen absolute
 * path together with the rule that fired, so callers can log the decision.
 *
 * This function does not create the directory; if rule `new_install_default`
 * fires, the caller is responsible for creating `~/.enclawed/` on first use.
 */
export declare function resolveWorkspaceDirInfo(options?: ResolveWorkspaceDirOptions): WorkspaceDirResolution;
/**
 * Resolve the path to the default config file (`enclawed.json` in the new
 * tree, falling back to `openclaw.json` in the legacy `~/.openclaw` dir if
 * present). The chosen filename matches the directory: `~/.enclawed/` ->
 * `enclawed.json`, `~/.openclaw/` -> `openclaw.json`.
 *
 * Precedence:
 *   1. `~/.enclawed/enclawed.json` if it exists on disk.
 *   2. `~/.openclaw/openclaw.json` if it exists on disk and (1) does not.
 *   3. `<resolved workspace dir>/enclawed.json` (new-install default; same
 *      filename also applies if the resolver picked a custom directory via
 *      env var, since that directory does not commit to a legacy filename).
 *   4. If the resolved workspace is the legacy `~/.openclaw/` dir, prefer
 *      `openclaw.json` inside it so legacy installs keep their filename.
 */
export declare function resolveDefaultConfigPath(options?: ResolveWorkspaceDirOptions): {
    path: string;
    rule: WorkspaceDirRule | "explicit_enclawed_config" | "explicit_openclaw_config";
};
/** Human-readable rule -> short reason string for log messages. */
export declare function formatRuleReason(rule: WorkspaceDirResolution["rule"]): string;
/**
 * Reset the once-only log latch. Test-only.
 */
export declare function _resetWorkspaceDirLogStateForTesting(): void;
/**
 * Emit an info-level log line describing which workspace dir was chosen and
 * which rule fired. Idempotent: a second call is a no-op so we don't spam
 * downstream subsystems that import `utils.ts` lazily.
 *
 * The actual logger is injected to avoid a static circular import between
 * `utils.ts` (which exposes the resolver) and `logger.ts` (which imports
 * widely from the project).
 */
export declare function logWorkspaceDirResolution(resolution: WorkspaceDirResolution, logInfo: (message: string) => void): void;
