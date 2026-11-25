import { createLedgerStore, DEFAULT_STAGE_MODES } from "@enclawed/egress-core";
import { describe, expect, it } from "vitest";
import { effectiveStageMode, resolveEgressMediatorConfig } from "./config.js";

describe("resolveEgressMediatorConfig: ledger", () => {
  it("keeps the defaults when unset", () => {
    expect(resolveEgressMediatorConfig({}, {}).egress.ledger).toEqual({
      capacityBits: 4096,
      refillBitsPerSec: 256,
    });
  });

  it("treats refillBitsPerSec 0 as zero refill, not unset", () => {
    const { egress } = resolveEgressMediatorConfig(
      { ledger: { capacityBits: 100, refillBitsPerSec: 0 } },
      {},
    );
    expect(egress.ledger).toEqual({ capacityBits: 100, refillBitsPerSec: 0 });
    let now = 0;
    const ledger = createLedgerStore({ ...egress.ledger, now: () => now }).get("sink");
    expect(ledger.tryConsume(100)).toBe(true);
    now += 3_600_000;
    expect(ledger.available()).toBe(0);
  });

  it("refuses a negative or non-numeric refill instead of falling back", () => {
    for (const refillBitsPerSec of [-1, "fast", Number.NaN]) {
      expect(() => resolveEgressMediatorConfig({ ledger: { refillBitsPerSec } }, {})).toThrow(
        /egress-mediator: invalid config: ledger\.refillBitsPerSec/,
      );
    }
  });

  it("refuses a ledger budget or rate above the shipped default (tighten-only)", () => {
    expect(() => resolveEgressMediatorConfig({ ledger: { capacityBits: 1e300 } }, {})).toThrow(
      /ledger\.capacityBits/,
    );
    expect(() => resolveEgressMediatorConfig({ ledger: { capacityBits: 4097 } }, {})).toThrow(
      /ledger\.capacityBits/,
    );
    expect(() => resolveEgressMediatorConfig({ ledger: { refillBitsPerSec: 257 } }, {})).toThrow(
      /ledger\.refillBitsPerSec/,
    );
    expect(
      resolveEgressMediatorConfig({ ledger: { capacityBits: 4096, refillBitsPerSec: 256 } }, {})
        .egress.ledger,
    ).toEqual({ capacityBits: 4096, refillBitsPerSec: 256 });
  });

  it("refuses turning the action batcher off in an enforcing profile", () => {
    const off = { stages: { "egress-action-batcher": { mode: "off" } } };
    expect(() => resolveEgressMediatorConfig(off, { ENCLAWED_FLAVOR: "enclaved" })).toThrow(
      /egress-action-batcher\.mode cannot be "off"/,
    );
    expect(() =>
      resolveEgressMediatorConfig(
        { stages: { "egress-action-batcher": { mode: "enforce" } } },
        {
          ENCLAWED_FLAVOR: "enclaved",
        },
      ),
    ).not.toThrow();
  });

  it("turns the media chokepoint on by default", () => {
    expect(resolveEgressMediatorConfig({}, {}).media).toEqual({ enabled: true });
    expect(resolveEgressMediatorConfig({ media: { enabled: false } }, {}).media).toEqual({
      enabled: false,
    });
  });
});

describe("resolveEgressMediatorConfig: fail-closed", () => {
  const refuses = (raw: unknown, pattern: RegExp) =>
    expect(() => resolveEgressMediatorConfig(raw, {})).toThrow(pattern);

  it("refuses unknown keys at every level", () => {
    refuses({ enable: true }, /unknown option\(s\): enable/);
    refuses({ toolCall: { enabled: true, tool: ["message"] } }, /toolCall\.tool/);
    refuses({ ledger: { capacity: 10 } }, /ledger\.capacity/);
    refuses({ stages: { "egress-canonicalizer": { mode: "enforce", x: 1 } } }, /x/);
  });

  it("refuses wrong types and out-of-range values", () => {
    refuses({ enabled: "yes" }, /enabled must be a boolean/);
    refuses({ posture: "strict" }, /posture must be one of default, enforce/);
    refuses({ ledger: { capacityBits: 0 } }, /ledger\.capacityBits must be a number > 0/);
    refuses({ toolCall: { tools: "message" } }, /toolCall\.tools must be a list/);
    refuses({ toolCall: { tools: ["message", ""] } }, /toolCall\.tools must be a list/);
    refuses({ llm: { timeoutMs: -5 } }, /llm\.timeoutMs/);
    refuses({ llm: { model: "" } }, /llm\.model must be a non-empty string/);
    refuses({ media: true }, /media must be an object/);
  });

  it("refuses unknown stage ids and invalid or missing modes", () => {
    refuses({ stages: { "egress-canonicaliser": { mode: "enforce" } } }, /not a known stage/);
    refuses({ stages: { "egress-noise-injector": { mode: "block" } } }, /mode must be one of/);
    refuses({ stages: { "egress-noise-injector": {} } }, /mode is required/);
  });

  it("accepts a full valid config", () => {
    const config = resolveEgressMediatorConfig(
      {
        enabled: true,
        posture: "enforce",
        stages: { "egress-noise-injector": { mode: "audit" } },
        ledger: { capacityBits: 512, refillBitsPerSec: 8 },
        toolCall: { enabled: true, tools: ["message"], commandTools: ["exec"] },
        modelInput: { enabled: true, toolResults: false, inbound: true },
        llm: { enabled: true, provider: "ollama", model: "m", timeoutMs: 1000 },
        coverTraffic: { enabled: false },
        media: { enabled: true },
      },
      {},
    );
    expect(config.egress.stages["egress-noise-injector"]).toEqual({ mode: "audit" });
    expect(config.egress.stages["egress-canonicalizer"]).toEqual({ mode: "enforce" });
    expect(config.toolCall.tools).toEqual(["message"]);
    expect(config.llm.provider).toBe("ollama");
    expect(config.modelInput.toolResults).toBe(false);
  });
});

describe("resolveEgressMediatorConfig: enforcing profile (settings audit X2, audit mode)", () => {
  const HARDENED = { ENCLAWED_FLAVOR: "enclaved" };
  const OPEN = { ENCLAWED_FLAVOR: "open" };

  it("attack: every stage enforces, so audit mode cannot pass a payload through", () => {
    const config = resolveEgressMediatorConfig({}, HARDENED);
    for (const id of Object.keys(DEFAULT_STAGE_MODES)) {
      expect(effectiveStageMode(config, id)).toBe("enforce");
    }
    // A stage id this build does not list (a third-party stage) enforces too.
    expect(effectiveStageMode(config, "egress-third-party")).toBe("enforce");
  });

  it("attack: audit or off for any stage, or posture default, is refused", () => {
    for (const id of Object.keys(DEFAULT_STAGE_MODES)) {
      for (const mode of ["audit", "off"]) {
        expect(() => resolveEgressMediatorConfig({ stages: { [id]: { mode } } }, HARDENED)).toThrow(
          new RegExp(`stages\\.${id}\\.mode cannot be "${mode}" in an enforcing profile`),
        );
      }
    }
    expect(() => resolveEgressMediatorConfig({ posture: "default" }, HARDENED)).toThrow(
      /posture cannot be "default" in an enforcing profile/,
    );
  });

  it("attack: switching the mediator or a mediated surface off is refused", () => {
    const cases: Array<[unknown, RegExp]> = [
      [{ enabled: false }, /invalid config: enabled cannot be false/],
      [{ toolCall: { enabled: false } }, /toolCall\.enabled cannot be false/],
      [{ modelInput: { enabled: false } }, /modelInput\.enabled cannot be false/],
      [{ modelInput: { toolResults: false } }, /modelInput\.toolResults cannot be false/],
      [{ modelInput: { inbound: false } }, /modelInput\.inbound cannot be false/],
      [{ coverTraffic: { enabled: false } }, /coverTraffic\.enabled cannot be false/],
      [{ media: { enabled: false } }, /media\.enabled cannot be false/],
    ];
    for (const [raw, pattern] of cases) {
      expect(() => resolveEgressMediatorConfig(raw, HARDENED)).toThrow(pattern);
    }
  });

  it("FP: enforce settings, the explicit enforce posture, and llm.enabled:false are accepted", () => {
    const stages = Object.fromEntries(
      Object.keys(DEFAULT_STAGE_MODES).map((id) => [id, { mode: "enforce" }]),
    );
    expect(() =>
      resolveEgressMediatorConfig(
        {
          enabled: true,
          posture: "enforce",
          stages,
          toolCall: { enabled: true },
          modelInput: { enabled: true, toolResults: true, inbound: true },
          coverTraffic: { enabled: true },
          media: { enabled: true },
        },
        HARDENED,
      ),
    ).not.toThrow();
    // Without a completer the LLM scrambler blocks every payload in enforce
    // mode, so turning the completer off is not a weakening.
    expect(resolveEgressMediatorConfig({ llm: { enabled: false } }, HARDENED).llm.enabled).toBe(
      false,
    );
  });

  it("FP: the open profile keeps the staged defaults and honors audit/off", () => {
    const config = resolveEgressMediatorConfig(
      { stages: { "egress-entropy-scanner": { mode: "off" } }, toolCall: { enabled: false } },
      OPEN,
    );
    expect(config.hardened).toBe(false);
    expect(effectiveStageMode(config, "egress-entropy-scanner")).toBe("off");
    expect(effectiveStageMode(config, "egress-replay-sentinel")).toBe("audit");
    expect(effectiveStageMode(config, "egress-canonicalizer")).toBe("enforce");
    expect(config.toolCall.enabled).toBe(false);
  });
});
