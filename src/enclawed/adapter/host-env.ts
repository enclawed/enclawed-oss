// enclawed adapter kit: the environment the host agent CLI starts with
// (M6, credential custody).
//
// Built from an ALLOWLIST, never by removing names from the user's shell:
// only the framework's own variables (FRAMEWORK_ENV_ALLOW, via frameworkEnv),
// the names the host declares it needs (PATH, HOME, TERM, its own config
// switches: host data), and credential HANDLES. Everything else the shell
// holds (cloud keys, tokens, CI secrets) never reaches the host, so it never
// reaches a command the agent runs.
//
// A credential the host needs (its provider key) is a handle bound to the
// destinations it may go to. A declared name that is credential-shaped but
// not declared as a handle is refused (dropped and reported). The engine
// gets the bound handles (EngineOptions.credentials): a tool call that sends
// a handle's value anywhere but its destinations is refused, a command that
// names the handle's variable asks a person, and the value is removed from
// every tool result before the model reads it.

import type { HardwareRootMode } from "../hardware-root/root-mode.js";
import { credentialLike, type EnvClassExtra } from "./env-trust.js";
import { frameworkEnv, type Flavor } from "./session.js";

/** A credential the host needs, and the hosts it may be sent to. */
export type CredentialHandle = Readonly<{ name: string; destinations: readonly string[] }>;

/** A handle with its value, for the engine (kept in memory only, never recorded). */
export type BoundCredential = Readonly<{
  name: string;
  value: string;
  destinations: readonly string[];
}>;

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
/** A credential value shorter than this is not matched in text (too many false matches). */
export const MIN_HANDLE_VALUE = 12;

export type HostEnvironment = Readonly<{
  env: Record<string, string>;
  /** Names the shell set that the host does not get (no values). */
  dropped: readonly string[];
  /** Declared names refused because they hold credentials without a handle. */
  refused: readonly string[];
  credentials: readonly BoundCredential[];
  loaderRemoved: readonly string[];
}>;

/**
 * The host's environment. `declared`: the names the host needs, exactly;
 * `declaredPrefixes`: name prefixes it needs (LC_). Throws on a malformed
 * handle (no destinations, or a destination that is not a hostname).
 */
export function hostEnvironment(
  shell: Readonly<Record<string, string | undefined>>,
  o: {
    declared: readonly string[];
    declaredPrefixes?: readonly string[];
    credentials?: readonly CredentialHandle[];
    extra?: EnvClassExtra;
    hardwareRoot: HardwareRootMode;
    flavor?: Flavor | null;
    forensicWebhook?: string | null;
    loaderGranted?: readonly string[];
  },
): HostEnvironment {
  const handles = new Map<string, CredentialHandle>();
  for (const h of o.credentials ?? []) {
    if (
      !h.destinations.length ||
      h.destinations.some((d) => typeof d !== "string" || !HOSTNAME.test(d))
    ) {
      throw new Error(
        `the credential ${h.name} needs the hostnames it may be sent to (it is bound to its destinations)`,
      );
    }
    handles.set(h.name, h);
  }
  const fw = frameworkEnv(shell, {
    hardwareRoot: o.hardwareRoot,
    flavor: o.flavor ?? null,
    forensicWebhook: o.forensicWebhook ?? null,
    loaderGranted: o.loaderGranted,
  });
  const declared = new Set(o.declared);
  const prefixes = o.declaredPrefixes ?? [];
  const env: Record<string, string> = {};
  const dropped: string[] = [];
  const refused: string[] = [];
  const credentials: BoundCredential[] = [];
  for (const [k, v] of Object.entries(fw.env)) {
    if (typeof v !== "string") {
      continue;
    }
    const framework = /^(ENCLAWED_|ENCLAWEDER_)/.test(k);
    const handle = handles.get(k);
    if (handle) {
      env[k] = v;
      credentials.push({ name: k, value: v, destinations: handle.destinations });
      continue;
    }
    const wanted = framework || declared.has(k) || prefixes.some((p) => k.startsWith(p));
    if (!wanted) {
      dropped.push(k);
      continue;
    }
    if (!framework && credentialLike(k, o.extra)) {
      refused.push(k);
      continue;
    }
    env[k] = v;
  }
  return {
    env,
    dropped: dropped.toSorted(),
    refused: refused.toSorted(),
    credentials,
    loaderRemoved: fw.loaderRemoved,
  };
}

/** Is `host` one of a handle's destinations (or below one)? */
export function destinationAllowed(handle: BoundCredential, host: string | null): boolean {
  if (!host) {
    return false;
  }
  const h = host.toLowerCase().replace(/\.$/, "");
  return handle.destinations.some((d) => h === d || h.endsWith(`.${d}`));
}

/** The handles whose value a text carries (values shorter than MIN_HANDLE_VALUE are not matched). */
export function handlesIn(text: string, handles: readonly BoundCredential[]): BoundCredential[] {
  return handles.filter((h) => h.value.length >= MIN_HANDLE_VALUE && text.includes(h.value));
}

/** The handles a command names by variable ($NAME, ${NAME}, $env:NAME, %NAME%) or carries by value. */
export function commandNamesHandle(
  command: string,
  handles: readonly BoundCredential[],
): BoundCredential | null {
  for (const h of handles) {
    const n = h.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const named = new RegExp(`\\$\\{?${n}\\b|\\$env:${n}\\b|%${n}%`, "i").test(command);
    if (named || (h.value.length >= MIN_HANDLE_VALUE && command.includes(h.value))) {
      return h;
    }
  }
  return null;
}

export const HANDLE_PLACEHOLDER = "[credential removed by Enclawed]";

/** Remove every handle's value from a string. */
export function redactHandles(
  text: string,
  handles: readonly BoundCredential[],
): { text: string; removed: number } {
  let out = text;
  let removed = 0;
  for (const h of handles) {
    if (h.value.length < MIN_HANDLE_VALUE) {
      continue;
    }
    const parts = out.split(h.value);
    removed += parts.length - 1;
    out = parts.join(HANDLE_PLACEHOLDER);
  }
  return { text: out, removed };
}
