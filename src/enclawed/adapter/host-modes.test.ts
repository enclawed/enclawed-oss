// The order of a host's permission modes (./host-modes.ts) and the two places
// the kit decides with it: the headless mode binding (contextMatches,
// CallLedger) and the person-held modes (isPersonHeldMode).
//
// The order is Claude Code 2.1.326's own (its bundled JavaScript, read only):
// a rank table {plan:0, default:1, dontAsk:1, acceptEdits:2, auto:3,
// bypassPermissions:4}; acceptEdits is not within auto (it allows edits auto
// puts to its classifier); dontAsk is narrower than default (it denies what
// default asks); plan runs as bypassPermissions when bypass is available.
// When auto is unavailable (the model, the plan, the settings or fast mode),
// Claude Code starts a session launched in auto in default, and its hooks
// report permission_mode "default".
//
// Attacks: a wider mode than launched (default -> acceptEdits, auto ->
// bypassPermissions, auto -> acceptEdits, plan-as-bypass, dontAsk ->
// default, an unknown mode) stays a mismatch. False positives: the host's
// own fallback to a narrower mode (auto -> default, acceptEdits -> default,
// default -> dontAsk) is accepted and reported as a downgrade.

import { describe, expect, it } from "vitest";
import { bindingOf } from "./approval.js";
import { compareHostMode, isPersonHeldMode, type HostModeOrder } from "./host-modes.js";
import { CallLedger, contextMatches, type LaunchContext } from "./transport.js";

const ORDER: HostModeOrder = {
  rank: { plan: 0, default: 1, dontAsk: 1, acceptEdits: 2, auto: 3, bypassPermissions: 4 },
  notWithin: [["acceptEdits", "auto"]],
  narrowestOfRank: ["dontAsk"],
  planMode: "plan",
  bypassMode: "bypassPermissions",
  planIsBypassWhenAvailable: true,
  noPersonModes: ["bypassPermissions"],
};
const MODES = Object.keys(ORDER.rank);

describe("compareHostMode: Claude Code's order", () => {
  const cmp = (m: string, c: string, bypassAvailable = false) =>
    compareHostMode(m, c, ORDER, { bypassAvailable });

  it("narrower: every mode below auto other than acceptEdits; default and plan below acceptEdits; dontAsk below default", () => {
    expect(cmp("default", "auto")).toBe("narrower");
    expect(cmp("dontAsk", "auto")).toBe("narrower");
    expect(cmp("plan", "auto")).toBe("narrower");
    expect(cmp("default", "acceptEdits")).toBe("narrower");
    expect(cmp("plan", "default")).toBe("narrower");
    expect(cmp("dontAsk", "default")).toBe("narrower");
    expect(cmp("default", "default")).toBe("same");
  });

  it("not within: wider modes, acceptEdits under auto, default under dontAsk, unknown modes", () => {
    expect(cmp("acceptEdits", "default")).toBe("not-within");
    expect(cmp("auto", "default")).toBe("not-within");
    expect(cmp("bypassPermissions", "auto")).toBe("not-within");
    expect(cmp("acceptEdits", "auto")).toBe("not-within");
    expect(cmp("default", "dontAsk")).toBe("not-within");
    expect(cmp("default", "plan")).toBe("not-within");
    expect(cmp("yolo", "auto")).toBe("not-within");
    expect(cmp("default", "yolo")).toBe("not-within");
    expect(cmp("__proto__", "auto")).toBe("not-within");
    // Out of bypass (nobody answers an ask, so the kit denies it) into a mode
    // where a person answers: the kit's denial would become an ask.
    expect(cmp("auto", "bypassPermissions")).toBe("not-within");
    expect(cmp("default", "bypassPermissions")).toBe("not-within");
    // Without the no-person declaration, the rank alone would call it narrower.
    expect(
      compareHostMode(
        "default",
        "bypassPermissions",
        { ...ORDER, noPersonModes: [] },
        { bypassAvailable: true },
      ),
    ).toBe("narrower");
  });

  it("plan runs as bypassPermissions when bypass is available: not within anything else", () => {
    expect(cmp("plan", "auto", true)).toBe("not-within");
    expect(cmp("plan", "default", true)).toBe("not-within");
    expect(cmp("plan", "bypassPermissions", true)).toBe("same");
    expect(cmp("plan", "bypassPermissions")).toBe("not-within");
  });
});

describe("the headless mode binding", () => {
  const launch = (launchedMode: string, o: Partial<LaunchContext> = {}): LaunchContext => ({
    cwd: "/proj",
    realpath: (p) => p,
    modes: MODES,
    bypassMode: "bypassPermissions",
    bypassAvailable: launchedMode === "bypassPermissions",
    planMode: "plan",
    headless: true,
    launchedMode,
    modeOrder: ORDER,
    ...o,
  });
  const ctx = (mode: string) => ({ cwd: "/proj", mode, scratchpadDir: null, sessionId: "s1" });

  it("FP: launched in auto, the host fell back to default (auto unavailable for the model): accepted, reported as a downgrade", () => {
    expect(contextMatches(ctx("default"), null, launch("auto"))).toEqual({
      ok: true,
      downgraded: { launched: "auto", reported: "default" },
    });
    expect(contextMatches(ctx("default"), null, launch("acceptEdits")).ok).toBe(true);
    expect(contextMatches(ctx("dontAsk"), null, launch("default")).ok).toBe(true);
    // The launched mode itself: no downgrade.
    expect(contextMatches(ctx("auto"), null, launch("auto"))).toEqual({ ok: true });
  });

  it("attack: a more permissive mode than launched stays a mismatch", () => {
    for (const [reported, launched] of [
      ["acceptEdits", "default"],
      ["auto", "default"],
      ["auto", "acceptEdits"],
      ["acceptEdits", "auto"],
      ["default", "dontAsk"],
      ["bypassPermissions", "auto"],
    ] as const) {
      const c = contextMatches(ctx(reported), null, launch(launched));
      expect(c.ok, `${reported} in a session launched ${launched}`).toBe(false);
    }
    // Bypass reported where it is not available, and plan-as-bypass under auto.
    expect(contextMatches(ctx("bypassPermissions"), null, launch("auto")).ok).toBe(false);
    // Launched in bypass (no person answers; asks are denied), reported default: a forged route to an ask.
    expect(contextMatches(ctx("default"), null, launch("bypassPermissions")).ok).toBe(false);
    expect(contextMatches(ctx("plan"), null, launch("auto", { bypassAvailable: true })).ok).toBe(
      false,
    );
  });

  it("without the host's order, any other mode is a mismatch (the order is what makes a downgrade)", () => {
    expect(contextMatches(ctx("default"), null, launch("auto", { modeOrder: null })).ok).toBe(
      false,
    );
  });

  it("interactive sessions are not bound to the launched mode (a person switches modes)", () => {
    expect(
      contextMatches(ctx("acceptEdits"), null, launch("default", { headless: false })),
    ).toEqual({ ok: true });
  });

  it("CallLedger: a downgraded decision is accepted and recorded; a widened one is a mismatch", () => {
    let launched = "auto";
    const l = new CallLedger({ cwd: "/proj", home: "/h", context: () => launch(launched) });
    const use = (id: string) =>
      l.noteUse({ id, name: "Read", input: { file_path: "a" }, cwd: "/proj", sessionId: "s1" });
    const report = (mode: string) => ({
      tool: "Read",
      binding: bindingOf({ file_path: "a" }),
      context: ctx(mode),
    });
    use("t1");
    expect(l.pre("t1", report("default"))).toEqual({ ok: true });
    expect(l.downgrades).toEqual([{ id: "t1", launched: "auto", reported: "default" }]);
    launched = "default";
    use("t2");
    const v = l.pre("t2", report("acceptEdits"));
    expect(v.ok).toBe(false);
    expect(l.mismatches.map((m) => m.code)).toEqual(["context-mismatch"]);
    expect(l.downgrades).toHaveLength(1);
  });
});

describe("person-held modes follow the same order", () => {
  it("only the narrowest prompting rank counts; never the plan mode; never a wider declared mode", () => {
    expect(isPersonHeldMode("default", ["default"], ORDER)).toBe(true);
    expect(isPersonHeldMode("plan", ["default", "plan"], ORDER)).toBe(false);
    expect(isPersonHeldMode("acceptEdits", ["default", "acceptEdits"], ORDER)).toBe(false);
    expect(isPersonHeldMode("auto", ["auto"], ORDER)).toBe(false);
    expect(isPersonHeldMode("default", [], ORDER)).toBe(false);
    expect(isPersonHeldMode(null, ["default"], ORDER)).toBe(false);
    // A host that ranks its plan mode with its prompting modes: still never person-held.
    expect(
      isPersonHeldMode("plan", ["default", "plan"], { ...ORDER, rank: { ...ORDER.rank, plan: 1 } }),
    ).toBe(false);
    // Without an order the declaration alone decides (earlier adapters).
    expect(isPersonHeldMode("plan", ["default", "plan"])).toBe(true);
  });
});
