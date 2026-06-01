// .mjs twin of src/enclawed/flavor.ts. Standalone canonical reference for
// the node:test suite under enclawed/test/.

const SECURE_ALIASES = new Set(['enclaved', 'secure', 'classified', 'high-side']);
const OPEN_ALIASES = new Set(['open', 'enclawed-compat', 'permissive', 'default']);

export function parseFlavor(raw) {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (SECURE_ALIASES.has(v)) return 'enclaved';
  if (OPEN_ALIASES.has(v)) return 'open';
  return null;
}

export function getFlavor(env = process.env) {
  const explicit = parseFlavor(env.ENCLAWED_FLAVOR);
  if (explicit) return explicit;
  return 'open';
}

export function isEnclaved(env) {
  return getFlavor(env) === 'enclaved';
}
