// enclawed ships in two flavors:
//
//   - "open"     : Enclawed-compatible. All upstream modules loadable. The
//                  classification framework is still active (audit, DLP,
//                  egress visibility, label types) but allowlists are
//                  permissive and module signatures are warn-only.
//
//   - "enclaved" : Classified-enclave deployment. Strict deny-by-default
//                  channel/provider/tool/host allowlists, FIPS asserted at
//                  boot, ALL modules MUST present a valid signature from a
//                  trust-root signer approved for the module's declared
//                  clearance level. Unsigned modules are rejected hard.
//
// Selection: the admin policy's "flavor" (the root-owned
// /etc/enclawed/policy.json or an org-signed policy, see ./admin-policy.ts) is
// authoritative; ENCLAWED_FLAVOR may only TIGHTEN it (ENCLAWED_FLAVOR=open over
// an admin "enclaved" is refused, and bootstrap warns and audits the refusal).
// Without an admin policy, ENCLAWED_FLAVOR selects, default "open". The flavor
// is read once at boot and cached on the runtime singleton.

import { getActiveAdminPolicy } from "./admin-policy.js";

export type Flavor = "open" | "enclaved";

const SECURE_ALIASES = new Set(["enclaved", "secure", "classified", "high-side"]);
const OPEN_ALIASES = new Set(["open", "enclawed-compat", "permissive", "default"]);

export function parseFlavor(raw: string | undefined | null): Flavor | null {
  if (typeof raw !== "string") {
    return null;
  }
  const v = raw.trim().toLowerCase();
  if (SECURE_ALIASES.has(v)) {
    return "enclaved";
  }
  if (OPEN_ALIASES.has(v)) {
    return "open";
  }
  return null;
}

export type FlavorResolution = {
  flavor: Flavor;
  source: "env" | "admin-policy" | "default";
  /** ENCLAWED_FLAVOR value refused because it would loosen the admin flavor, else null. */
  refusedEnvValue: string | null;
};

export function resolveFlavor(
  env: NodeJS.ProcessEnv = process.env,
  opts: { adminFlavor?: Flavor | null } = {},
): FlavorResolution {
  const adminFlavor =
    opts.adminFlavor === undefined
      ? (getActiveAdminPolicy()?.doc.flavor ?? null)
      : opts.adminFlavor;
  const explicit = parseFlavor(env.ENCLAWED_FLAVOR);
  if (explicit === "open" && adminFlavor === "enclaved") {
    return {
      flavor: "enclaved",
      source: "admin-policy",
      refusedEnvValue: env.ENCLAWED_FLAVOR ?? null,
    };
  }
  if (explicit) {
    return { flavor: explicit, source: "env", refusedEnvValue: null };
  }
  if (adminFlavor) {
    return { flavor: adminFlavor, source: "admin-policy", refusedEnvValue: null };
  }
  // Default is "open" so a fresh checkout behaves like upstream Enclawed.
  // Lab deployments must set "flavor": "enclaved" in the admin policy (or
  // ENCLAWED_FLAVOR=enclaved in the service environment).
  return { flavor: "open", source: "default", refusedEnvValue: null };
}

export function getFlavor(
  env: NodeJS.ProcessEnv = process.env,
  opts?: { adminFlavor?: Flavor | null },
): Flavor {
  return resolveFlavor(env, opts).flavor;
}

export function isEnclaved(env?: NodeJS.ProcessEnv): boolean {
  return getFlavor(env) === "enclaved";
}
