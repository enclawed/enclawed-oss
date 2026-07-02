import { isPlainObject } from "./infra/plain-object.js";
import { type WorkspaceDirResolution } from "./infra/workspace-dir.js";
import { formatTerminalLink } from "./terminal/terminal-link.js";
export declare function ensureDir(dir: string): Promise<void>;
/**
 * Check if a file or directory exists at the given path.
 */
export declare function pathExists(targetPath: string): Promise<boolean>;
export declare function clampNumber(value: number, min: number, max: number): number;
export declare function clampInt(value: number, min: number, max: number): number;
/** Alias for clampNumber (shorter, more common name) */
export declare const clamp: typeof clampNumber;
/**
 * Escapes special regex characters in a string so it can be used in a RegExp constructor.
 */
export declare function escapeRegExp(value: string): string;
/**
 * Safely parse JSON, returning null on error instead of throwing.
 */
export declare function safeParseJson<T>(raw: string): T | null;
export { formatTerminalLink, isPlainObject };
/**
 * Type guard for Record<string, unknown> (less strict than isPlainObject).
 * Accepts any non-null object that isn't an array.
 */
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function normalizeE164(number: string): string;
export declare function sleep(ms: number): Promise<unknown>;
export declare function sliceUtf16Safe(input: string, start: number, end?: number): string;
export declare function truncateUtf16Safe(input: string, maxLen: number): string;
export declare function resolveUserPath(input: string, env?: NodeJS.ProcessEnv, homedir?: () => string): string;
/**
 * Resolve the user workspace / state directory. The enclawed fork defaults to
 * `~/.enclawed/`, with `~/.enclawed/` preserved as a portability fallback for
 * existing installs and upstream Enclawed users. See
 * `src/infra/workspace-dir.ts` for the full precedence rules.
 */
export declare function resolveConfigDir(env?: NodeJS.ProcessEnv, homedir?: () => string): string;
/**
 * Like `resolveConfigDir`, but also reports the rule that fired. Useful for
 * diagnostics; consumers that only need the path should keep calling
 * `resolveConfigDir`.
 */
export declare function resolveConfigDirInfo(env?: NodeJS.ProcessEnv, homedir?: () => string): WorkspaceDirResolution;
/**
 * Resolve the default config file path (`enclawed.json` in the new tree,
 * `enclawed.json` for legacy installs). Re-exported here so callers that
 * already pull from `utils` don't have to learn a second module path.
 */
export declare function resolveDefaultConfigPath(env?: NodeJS.ProcessEnv, homedir?: () => string): string;
export declare function resolveHomeDir(): string | undefined;
export declare function shortenHomePath(input: string): string;
export declare function shortenHomeInString(input: string): string;
export declare function displayPath(input: string): string;
export declare function displayString(input: string): string;
export declare const CONFIG_DIR: string;
