// Method B from the formal-verification paper: refinement-typed
// dispatch. The runtime's tool-dispatch entry is parameterised by the
// loaded skill's manifest; envelopes whose capability is not in
// M.caps are rejected at the type level (in TypeScript) or via a
// structurally identical runtime predicate at the .mjs surface.
//
// In Liquid Haskell / F* deployments the refinement is discharged at
// type-check time; in a JavaScript runtime the same refinement is
// expressible only as a runtime guard whose semantics match the type
// formula. We name that guard `assertRefinedDispatch` and treat it
// as the load-bearing primitive: by construction, no host API call
// reaches the host through the runtime without first passing through
// it. The proposed proof artefact (bundle, see skill-formal-bundle)
// pins (manifest hash, declared caps) so a downstream verifier can
// re-discharge the predicate against the same manifest the bundle
// was produced for.

// Mirror the parent paper's capability vocabulary; kept self-contained
// for tests that don't pull in the TS twin.
const ALL_CAPS = new Set([
  'net.egress',
  'fs.read',
  'fs.write.rev',
  'fs.write.irrev',
  'tool.invoke',
  'spawn.proc',
  'publish',
  'pay',
  'mutate.schema',
]);

export class RefinementError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RefinementError';
  }
}

/**
 * Validate a manifest's declared capabilities are well-formed: every
 * entry is a known capability token. Returns the normalised
 * (deduplicated, sorted) set.
 *
 * Throws RefinementError on any unknown token. This is the type-level
 * obligation that "M.caps : Set<CapabilityToken>" — at the JS surface
 * we discharge it dynamically.
 */
export function normaliseDeclaredCaps(caps) {
  if (!Array.isArray(caps) && !(caps instanceof Set)) {
    throw new RefinementError('manifest.caps must be an array or Set of capability tokens');
  }
  const out = new Set();
  for (const c of caps) {
    if (typeof c !== 'string') {
      throw new RefinementError('manifest.caps entries must be strings');
    }
    if (!ALL_CAPS.has(c)) {
      throw new RefinementError(`manifest.caps: unknown capability token "${c}"`);
    }
    out.add(c);
  }
  return Object.freeze([...out].sort());
}

/**
 * Build a dispatch refinement gate for a specific manifest. The
 * returned function is the .mjs analogue of the type signature
 *
 *   dispatch_M : { e : Envelope | cap(e) ∈ M.caps } -> Result
 *
 * Calling it with an envelope whose capability is outside M.caps
 * throws RefinementError synchronously — the same semantics the
 * type-level refinement would impose at compile time. Calling it
 * with an in-manifest envelope returns the envelope unchanged so
 * the surrounding gate can proceed.
 *
 * @param {{ caps: Iterable<string>, id?: string }} manifest
 * @returns {(envelope: { capability: string, [k:string]: unknown }) => typeof envelope}
 */
export function buildRefinedDispatch(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new RefinementError('buildRefinedDispatch: manifest required');
  }
  const declared = new Set(normaliseDeclaredCaps(manifest.caps ?? []));
  const skillId = typeof manifest.id === 'string' ? manifest.id : '<anonymous>';
  return Object.freeze(function refinedDispatch(envelope) {
    if (envelope === null || typeof envelope !== 'object') {
      throw new RefinementError(
        `dispatch_M(${skillId}): envelope must be an object`,
      );
    }
    const cap = envelope.capability;
    if (typeof cap !== 'string') {
      throw new RefinementError(
        `dispatch_M(${skillId}): envelope.capability must be a string`,
      );
    }
    if (!ALL_CAPS.has(cap)) {
      throw new RefinementError(
        `dispatch_M(${skillId}): unknown capability "${cap}" — not in the schema vocabulary`,
      );
    }
    if (!declared.has(cap)) {
      throw new RefinementError(
        `dispatch_M(${skillId}): out-of-manifest envelope rejected at refinement boundary; ` +
        `capability "${cap}" not in declared caps [${[...declared].sort().join(',')}]`,
      );
    }
    return envelope;
  });
}

/**
 * Predicate form: identical semantics to buildRefinedDispatch but
 * returns a boolean instead of throwing. Useful for callers that
 * want to express the refinement as a guard inside a larger control
 * flow without exception-handling.
 *
 * @param {{ caps: Iterable<string>, id?: string }} manifest
 * @param {{ capability: string, [k:string]: unknown }} envelope
 * @returns {boolean}
 */
export function isRefinedDispatchAdmissible(manifest, envelope) {
  try {
    const f = buildRefinedDispatch(manifest);
    f(envelope);
    return true;
  } catch (err) {
    if (err instanceof RefinementError) return false;
    throw err;
  }
}

/**
 * Method-B verdict object suitable for inclusion in a PCC bundle
 * (paper §8). The verdict pins:
 *   - the manifest's capability set, normalised
 *   - the skill id and version
 *   - the (algorithm, bound) the dispatch was discharged under
 *
 * The bundle re-checker (skill-formal-bundle.verifyFormalBundle)
 * re-builds the refinement gate from the manifest at bootstrap and
 * tests it against an enumerated probe envelope set; if the probe
 * outcomes match the bundle's, the verdict is reproduced.
 *
 * @param {{ caps: Iterable<string>, id?: string, version?: number }} manifest
 */
export function methodB({ manifest }) {
  if (!manifest) throw new RefinementError('methodB: manifest required');
  const declared = normaliseDeclaredCaps(manifest.caps ?? []);
  // Probe set: every capability in the schema vocabulary, with an
  // expected admit/deny verdict per the refinement.
  const probe = [];
  const declaredSet = new Set(declared);
  for (const c of [...ALL_CAPS].sort()) {
    probe.push({ capability: c, expected: declaredSet.has(c) ? 'admit' : 'deny' });
  }
  // Run the probe through a freshly-built refined dispatch and
  // record the actual outcomes.
  const refined = buildRefinedDispatch(manifest);
  for (const p of probe) {
    try {
      refined({ capability: p.capability });
      p.actual = 'admit';
    } catch (err) {
      if (!(err instanceof RefinementError)) throw err;
      p.actual = 'deny';
    }
    p.match = p.actual === p.expected;
  }
  const allMatch = probe.every((p) => p.match);
  return {
    method: 'B',
    contained: allMatch,
    skillId: manifest.id ?? null,
    skillVersion: manifest.version ?? null,
    declaredCaps: declared,
    schemaVocabulary: [...ALL_CAPS].sort(),
    probe,
    reason: allMatch
      ? 'refined-dispatch-rejects-out-of-manifest-envelopes'
      : 'refined-dispatch-disagreed-with-spec-on-probe-set',
  };
}

// Re-export for convenience and to keep the schema vocabulary
// reachable from a single import.
export { ALL_CAPS };
