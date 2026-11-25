export type EnvClass = "destination" | "trust" | "credential" | "load" | "telemetry"
/** Selects the user's own provider (a provider switch, a region, a project id), with no endpoint and no credential: started, and recorded. */
 | "provider" | "benign";
/** Classes whose repository-supplied value refuses the launch. */
export declare const REFUSED_ENV_CLASSES: readonly EnvClass[];
/**
 * Loader-injection variables: they make the dynamic loader map a library into
 * the host CLI itself and every process it starts. Removed from what the
 * launcher starts unless an administrator grants them. LD_LIBRARY_PATH and the
 * DYLD_*_PATH search paths are not here (module systems set them for real
 * work); from a repository they are refused like every other `load` variable.
 */
export declare const LOADER_INJECTION_ENV: readonly string[];
/** Host-specific additions: names a host reads that the generic rules would not classify. */
export type EnvClassExtra = Readonly<{
    /** Benign despite a matching segment (what the host reports about itself, or a plain switch). */
    benign?: readonly string[];
    /** The host's provider switches and request-body passthroughs (where the session's traffic goes). */
    destination?: readonly string[];
    /** The host's settings-source switches (what is trusted). */
    trust?: readonly string[];
    /**
     * The host's provider switches that only select a provider the user's own
     * credentials reach (no endpoint, no credential): accepted from a
     * repository with an on/off value, and recorded.
     */
    providerSwitches?: readonly string[];
}>;
/**
 * Known hosts' own names, kept here (in Enclawed) rather than in each
 * adapter, so an adapter that forgets one does not weaken the check. Keyed by
 * the adapter's host id.
 */
export declare const KNOWN_HOST_ENV: Readonly<Record<string, EnvClassExtra>>;
/** The extra names for a host: its known table merged with the adapter's own additions. */
export declare function hostEnvExtra(host: string, own?: EnvClassExtra): EnvClassExtra;
/** Is `name` credential-shaped (its value is never written to the audit log)? */
export declare function credentialLike(name: string, extra?: EnvClassExtra): boolean;
export type EnvClassification = Readonly<{
    class: EnvClass;
    why: string;
}>;
/** The class of one variable; only model variables look at the value. */
export declare function classifyEnv(name: string, value?: string, extra?: EnvClassExtra): EnvClassification;
export declare function isRefusedEnvClass(c: EnvClass): boolean;
/** What the audit log may hold of a value: userinfo removed from URLs, bounded; credentials as a digest only. */
export declare function recordableEnvValue(name: string, value: unknown): {
    value?: string;
    digest: string;
};
/**
 * Names that change what the commands the gate treats as read-only would do
 * (a PATH, a shell startup file, a pager, an interpreter option). When a
 * lower settings file sets one the launcher did not pin, even a read-only
 * command is irreversible (the engine's `shellEnvRisk`).
 */
export declare function changesShellCommands(name: string, hostPrefixes?: readonly string[]): boolean;
/** One settings source's env block. */
export type EnvSource = Readonly<{
    /** Where it comes from, for the message and the record (a file path, "shell", ...). */
    origin: string;
    env: Readonly<Record<string, unknown>>;
}>;
export type RepositoryEnvInput = Readonly<{
    /**
     * The repository's settings env blocks, LOWEST rank first (a later block
     * overrides an earlier one for the same name, as the host merges them).
     */
    repository: readonly EnvSource[];
    /** Sources that outrank the repository (managed settings, the launcher's own settings flag): a name set there never takes effect from the repository. */
    higher: readonly EnvSource[];
    /** The user's own values (shell environment, user settings): a repository value equal to one of them changes nothing. */
    user: readonly EnvSource[];
    /** Names the launcher pins to its own value anyway (they cannot take effect); destination, trust and credential names are never exempt. */
    launcherPinned?: (name: string) => boolean;
    extra?: EnvClassExtra;
}>;
export type EnvRefusal = Readonly<{
    origin: string;
    name: string;
    class: EnvClass;
    why: string;
}>;
export type EnvOrigin = Readonly<{
    name: string;
    origin: string;
    class: EnvClass;
    outcome: "kept" | "shadowed" | "same-as-user" | "accepted";
    value?: string;
    digest: string;
}>;
/**
 * Decide the repository's env: every refused name (the launch must not
 * start while any remains), and what each source sets of the recorded
 * classes (for the session-start record).
 */
export declare function decideRepositoryEnv(input: RepositoryEnvInput): {
    refusals: EnvRefusal[];
    origins: EnvOrigin[];
};
/** The refusal message for the first refusal, in plain words. */
export declare function repositoryEnvMessage(refusals: readonly EnvRefusal[], app?: string): string;
/** `env` without the loader-injection variables, except those an administrator granted (exact upper-case name). */
export declare function scrubLoaderEnv(env: Readonly<Record<string, string | undefined>>, granted?: readonly string[]): {
    env: Record<string, string | undefined>;
    removed: string[];
    granted: string[];
};
/**
 * Where a hook comes from. Every hook a host would run besides Enclawed's own
 * runs outside Enclawed's checks, so whatever its scope it must be granted by
 * digest, or the launch does not start. Only the administrator's managed
 * settings are exempt (they are the administrator's decision already).
 */
export type HookScope = "managed" | "user" | "project" | "local" | "plugin" | "settings-flag" | "frontmatter" | "other";
export type HookEntry = Readonly<{
    scope: HookScope;
    /** The file it is defined in (absolute), or a label for a settings value. */
    file: string;
    event: string;
    matcher?: unknown;
    /** The whole hook entry as the host reads it. */
    value: unknown;
    /**
     * The words the host expands before it runs a hook command: `~` and $HOME
     * (when `home` is given) and each named variable ($NAME, ${NAME}) at the
     * start of a word, bound to the path it stands for in this entry (for
     * example a project-folder variable). The digest then covers the
     * files the command really runs. The variable names are host data.
     */
    expand?: HookExpansion;
}>;
export type HookExpansion = Readonly<{
    home?: string | null;
    vars?: Readonly<Record<string, string | null | undefined>>;
}>;
/**
 * Every string in `value` with the leading shell words the host expands
 * replaced by the absolute paths they name (see HookEntry.expand). Only the
 * words change; separators stay.
 */
export declare function expandHookWords(value: unknown, x: HookExpansion): unknown;
/** A grant: one hook, by digest; repository grants also name the repository. */
export type HookGrant = Readonly<{
    digest: string;
    repo?: string;
    scope?: HookScope;
}>;
export type HookRefusal = Readonly<{
    scope: HookScope;
    file: string;
    event: string;
    digest: string | null;
    why: string;
    /** The grant an administrator adds to allow exactly this hook (a changed hook needs a new one). */
    grant: HookGrant | null;
}>;
/** Canonical JSON (object keys sorted, recursively): the form every grant digest hashes. */
export declare function canonicalOf(v: unknown): string;
/**
 * Files a hook command names inside `base`, with their
 * digests: editing the script a hook runs needs a new grant too.
 */
export declare function referencedFilesIn(value: unknown, base: string, projectVar: string[]): {
    path: string;
    sha256: string;
}[];
/**
 * The grant digest of one hook: its scope, its file (relative to the project
 * for repository hooks), its event and matcher, its whole value, and the
 * content of every file it names.
 */
export declare function hookDigest(h: HookEntry, o: {
    projectDir: string;
    projectVars?: readonly string[];
}): string;
/**
 * Hook admission for a launch: every hook from any scope but the
 * administrator's managed settings must be granted by digest (repository
 * hooks by a grant for this repository). Any refusal: the launch must not
 * start. Enclawed's own hook is never in `hooks` (the adapter adds it after
 * this decision, in a file of its own session).
 */
export declare function decideHooks(hooks: readonly HookEntry[], grants: readonly HookGrant[], o: {
    projectDir: string;
    projectVars?: readonly string[];
}): {
    ok: boolean;
    refusals: HookRefusal[];
};
/**
 * Grants that match no hook present now (their hook changed, its digest
 * rule changed, or it is gone): an administrator removes them, and adds the
 * grant decideHooks names for the hook as it is now. `hooks` is every hook
 * the host would run from any scope, as for decideHooks; grants for another
 * repository are left out.
 */
export declare function staleHookGrants(hooks: readonly HookEntry[], grants: readonly HookGrant[], o: {
    projectDir: string;
    projectVars?: readonly string[];
}): HookGrant[];
/** The refusals in plain words, with the grant to add for each. */
export declare function hooksMessage(refusals: readonly HookRefusal[]): string;
