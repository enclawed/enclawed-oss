// Provenance / taint store.
//
// At ingress a sensitive value (a secret read from config, a tool result, a
// private record) is `tag`ged into a scope. The store keeps the value's k-gram
// shingle fingerprints — not the value itself. At egress, payload text is
// `check`ed: if it contains nearly all of a tagged value's shingles, the value
// is leaving the boundary even if it has been lightly reformatted, and the
// payload is tainted.
//
// Entropy scanning catches *unknown* high-density encodings; taint tracking
// catches *known* sensitive values regardless of how low-entropy they are.
// The two are complementary.

export type TaintCheck = {
  tainted: boolean;
  /** Best shingle-overlap ratio observed against any tagged value. */
  overlap: number;
  /** Labels of tagged values that matched. */
  matched: string[];
};

export type TaintStore = {
  /** Register a sensitive value under a scope (e.g. a conversation id). */
  tag(scope: string, value: string, label?: string): void;
  /** Test whether `text` carries any tagged value for `scope`. */
  check(scope: string, text: string): TaintCheck;
  clear(): void;
  size(): number;
};

export type TaintStoreOptions = {
  shingleSize?: number;
  minValueLength?: number;
  matchThreshold?: number;
  maxScopes?: number;
  maxValuesPerScope?: number;
};

/** FNV-1a 32-bit hash — compact, fast, good enough for shingle fingerprints. */
function hashShingle(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function shingleSet(value: string, k: number): Set<number> {
  const norm = value.toLowerCase();
  const set = new Set<number>();
  if (norm.length <= k) {
    set.add(hashShingle(norm));
    return set;
  }
  for (let i = 0; i + k <= norm.length; i++) {
    set.add(hashShingle(norm.slice(i, i + k)));
  }
  return set;
}

export function createTaintStore(options?: TaintStoreOptions): TaintStore {
  const k = options?.shingleSize ?? 8;
  const minValueLength = options?.minValueLength ?? 8;
  const matchThreshold = options?.matchThreshold ?? 0.85;
  const maxScopes = options?.maxScopes ?? 1024;
  const maxValuesPerScope = options?.maxValuesPerScope ?? 256;

  type Entry = { label: string; shingles: Set<number> };
  const scopes = new Map<string, Entry[]>();

  return {
    tag(scope: string, value: string, label = "tainted-value"): void {
      if (value.length < minValueLength) {
        return;
      }
      if (!scopes.has(scope) && scopes.size >= maxScopes) {
        scopes.clear();
      }
      const list = scopes.get(scope) ?? [];
      if (list.length >= maxValuesPerScope) {
        list.shift();
      }
      list.push({ label, shingles: shingleSet(value, k) });
      scopes.set(scope, list);
    },

    check(scope: string, text: string): TaintCheck {
      const list = scopes.get(scope);
      if (!list || list.length === 0) {
        return { tainted: false, overlap: 0, matched: [] };
      }
      const textShingles = shingleSet(text, k);
      let best = 0;
      const matched: string[] = [];
      for (const entry of list) {
        if (entry.shingles.size === 0) {
          continue;
        }
        let hit = 0;
        for (const sh of entry.shingles) {
          if (textShingles.has(sh)) {
            hit++;
          }
        }
        const overlap = hit / entry.shingles.size;
        best = Math.max(best, overlap);
        if (overlap >= matchThreshold) {
          matched.push(entry.label);
        }
      }
      return { tainted: matched.length > 0, overlap: best, matched };
    },

    clear(): void {
      scopes.clear();
    },
    size(): number {
      return scopes.size;
    },
  };
}

// Process-wide shared store so a host ingress hook and the egress stage see the
// same taint state regardless of how the package is bundled.
const STORE_KEY = Symbol.for("enclawed.egress-taint.shared-store");

/**
 * Scope whose tagged values are checked at every sink. Use it for a value
 * that must never leave, whatever the conversation (a session's canary
 * secret, a deployment credential).
 */
export const TAINT_SCOPE_ALL = "*";

export function sharedTaintStore(): TaintStore {
  const globals = globalThis as unknown as Record<symbol, TaintStore | undefined>;
  let store = globals[STORE_KEY];
  if (!store) {
    store = createTaintStore();
    globals[STORE_KEY] = store;
  }
  return store;
}

export type TagSensitiveValueOptions = {
  /**
   * Conversation (or sink) id the value belongs to. The stage checks a
   * payload against its sink's conversation id, else the sink id. Omit to tag
   * the value for every sink (`TAINT_SCOPE_ALL`).
   */
  scope?: string;
  /** Label reported in findings when the value is seen leaving. */
  label?: string;
};

/**
 * Mark a value as sensitive in the shared taint store, so the taint-tracker
 * stage blocks (in enforce mode) any egress payload that carries it, even
 * lightly reformatted. Values shorter than 8 characters are ignored: their
 * fingerprints would match ordinary text.
 */
export function tagSensitiveValue(value: string, options: TagSensitiveValueOptions = {}): void {
  sharedTaintStore().tag(options.scope ?? TAINT_SCOPE_ALL, value, options.label);
}
