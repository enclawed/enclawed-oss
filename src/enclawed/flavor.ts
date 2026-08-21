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
// Selection precedence: explicit ENCLAWED_FLAVOR env var > package.json
// "enclawed.flavor" build pin > default ("open"). The flavor is read once
// at boot and cached on the runtime singleton.

export type Flavor = "open" | "enclaved";

const SECURE_ALIASES = new Set(["enclaved", "secure", "classified", "high-side"]);
const OPEN_ALIASES = new Set(["open", "enclawed-compat", "permissive", "default"]);

export function parseFlavor(raw: string | undefined | null): Flavor | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (SECURE_ALIASES.has(v)) return "enclaved";
  if (OPEN_ALIASES.has(v)) return "open";
  return null;
}

export function getFlavor(env: NodeJS.ProcessEnv = process.env): Flavor {
  const explicit = parseFlavor(env.ENCLAWED_FLAVOR);
  if (explicit) return explicit;
  // Default is "open" so a fresh checkout behaves like upstream Enclawed.
  // Lab deployments must pin ENCLAWED_FLAVOR=enclaved in the systemd unit
  // or container env file.
  return "open";
}

export function isEnclaved(env?: NodeJS.ProcessEnv): boolean {
  return getFlavor(env) === "enclaved";
}
