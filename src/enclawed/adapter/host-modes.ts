// enclawed adapter kit: how permissive a host's permission modes are.
//
// A host's permission modes (for example a read-only planning mode, a
// default asking mode, a mode that accepts edits, a mode that skips every
// prompt) differ in what the host lets run
// without a person's answer. The adapter declares their order as host data
// (HostModeOrder); the kit decides with it:
//
//   - the mode binding (transport.ts contextMatches): a headless session
//     cannot switch modes, so a hook that reports another mode than the
//     launch's is refused, unless that mode is narrower than the launch's:
//     the host fell back to a stricter mode by itself (a host may start in
//     its default mode when the requested one is unavailable for the model,
//     the account or the settings). That session runs less permissively than launched; it is
//     accepted and the caller records the downgrade. A wider or incomparable
//     mode stays a mismatch, and so does a mode in which a person answers an
//     ask when the launch's mode has nobody to answer (noPersonModes: the
//     kit decides an ask there as a denial, so such a "downgrade" would
//     loosen the kit's own decision).
//   - the person-held modes (host-prompt.ts, repo-config-hold.ts): a mode
//     counts as the person's only when it is the narrowest mode in which the
//     host prompts at all. A mode a person can switch into is a path, not a
//     rank: the plan mode (reached through wider modes, and on some hosts
//     acting as bypass when bypass is available) never counts.

/** The order of a host's permission modes (host data). */
export type HostModeOrder = Readonly<{
  /**
   * Each mode's rank: a lower rank lets no more run without a person's
   * answer than a higher one. A mode missing here is compared by equality
   * only.
   */
  rank: Readonly<Record<string, number>>;
  /**
   * [mode, ceiling] pairs where mode, although ranked lower or equal, allows
   * something ceiling does not (for example a mode that accepts every edit
   * against a mode that puts edits to the host's classifier), so mode is
   * not within ceiling.
   */
  notWithin?: readonly (readonly [string, string])[];
  /** Modes narrower than the other modes of their rank (for example a mode that denies what the default mode asks). */
  narrowestOfRank?: readonly string[];
  /** The host's read-only planning mode, ranked lowest but entered through wider modes. */
  planMode?: string | null;
  /** The host's mode that skips its own prompts. */
  bypassMode?: string | null;
  /** The plan mode runs as the bypass mode when bypass is available (host data: some hosts do). */
  planIsBypassWhenAvailable?: boolean;
  /**
   * Modes in which no person answers an ask (the adapter decides them with
   * approvalRoute "no-person", which turns an ask into a denial). A mode
   * outside them is never a downgrade from one inside: it would turn the
   * kit's denial back into an ask.
   */
  noPersonModes?: readonly string[];
}>;

export type ModeComparison = "same" | "narrower" | "not-within";

/** Is `mode` within (same or no more permissive than) `ceiling`? Unranked modes are within only themselves. */
function within(mode: string, ceiling: string, order: HostModeOrder): boolean {
  if (mode === ceiling) {
    return true;
  }
  const a = Object.hasOwn(order.rank, mode) ? order.rank[mode] : undefined;
  const b = Object.hasOwn(order.rank, ceiling) ? order.rank[ceiling] : undefined;
  if (
    typeof a !== "number" ||
    typeof b !== "number" ||
    !Number.isFinite(a) ||
    !Number.isFinite(b)
  ) {
    return false;
  }
  if ((order.notWithin ?? []).some(([m, c]) => m === mode && c === ceiling)) {
    return false;
  }
  return a <= b;
}

/**
 * How `mode` compares with `ceiling`: the same mode, strictly narrower, or
 * not within it (wider, incomparable, or unknown). With bypass available, a
 * plan mode that runs as bypass compares as the bypass mode.
 */
export function compareHostMode(
  mode: string,
  ceiling: string,
  order: HostModeOrder,
  o: Readonly<{ bypassAvailable: boolean }>,
): ModeComparison {
  if (mode === ceiling) {
    return "same";
  }
  const asRun = (m: string) =>
    order.planIsBypassWhenAvailable &&
    o.bypassAvailable &&
    order.planMode &&
    order.bypassMode &&
    m === order.planMode
      ? order.bypassMode
      : m;
  const m = asRun(mode);
  const c = asRun(ceiling);
  if (m === c) {
    return "same";
  }
  // Who answers an ask must not change: a person-route mode is not within a no-person one.
  const noPerson = (x: string) => (order.noPersonModes ?? []).includes(x);
  if (noPerson(c) && !noPerson(m)) {
    return "not-within";
  }
  if (!within(m, c, order)) {
    return "not-within";
  }
  // Equal rank both ways: narrower only when declared the narrowest of its rank.
  return (order.narrowestOfRank ?? []).includes(m) || !within(c, m, order)
    ? "narrower"
    : "not-within";
}

/**
 * Is `mode` one in which a pending ask waits for the person? It must be
 * declared (personModes) and, with an order, be the narrowest rank of the
 * modes other than the plan mode: a declared mode wider than another
 * prompting mode lets the host approve by itself what the narrower one
 * asks, and the plan mode is entered through wider modes.
 */
export function isPersonHeldMode(
  mode: string | null | undefined,
  personModes: readonly string[],
  order?: HostModeOrder | null,
): boolean {
  if (typeof mode !== "string" || !personModes.includes(mode)) {
    return false;
  }
  if (!order) {
    return true;
  }
  if (mode === order.planMode || !Object.hasOwn(order.rank, mode)) {
    return false;
  }
  const ranks = Object.entries(order.rank)
    .filter(([m, r]) => m !== order.planMode && typeof r === "number" && Number.isFinite(r))
    .map(([, r]) => r);
  return ranks.length > 0 && order.rank[mode] === Math.min(...ranks);
}

/** The person-held modes of a declaration, in declared order (for messages). */
export function personHeldModes(
  personModes: readonly string[],
  order?: HostModeOrder | null,
): string[] {
  return personModes.filter((m) => isPersonHeldMode(m, personModes, order));
}
