// Text-domain measurement: every content channel is driven through the full
// stage pipeline behind the real egress mediator, at a real plugin-host
// chokepoint, and the receiver decodes whatever the chokepoint delivered.

import {
  buildBehavioralInvariantsStage,
  createBehavioralMonitor,
  resolveBehavioralOptions,
  type BehavioralOptions,
} from "../../../extensions/egress-behavioral-invariants/api.js";
import { buildCanonicalizerStage } from "../../../extensions/egress-canonicalizer/api.js";
import { buildEntropyScannerStage } from "../../../extensions/egress-entropy-scanner/api.js";
import {
  createEgressMediator,
  registerEgressStage,
  resetEgressRegistry,
  resolveEgressMediatorConfig,
  type EgressMediatorConfig,
} from "../../../extensions/egress-mediator/api.js";
import { buildNoiseInjectorStage } from "../../../extensions/egress-noise-injector/api.js";
import { buildReplaySentinelStage } from "../../../extensions/egress-replay-sentinel/api.js";
import { buildSemanticScramblerStage } from "../../../extensions/egress-semantic-scrambler/api.js";
import {
  buildTaintTrackerStage,
  createTaintStore,
} from "../../../extensions/egress-taint-tracker/api.js";
import { accuracyPct, makeRng, mutualInformationBits, randomBits, type Bit } from "./stats.js";
import { CONTENT_CHANNELS, type CovertChannel } from "./text-channels.js";

/** Where the payload enters the pipeline. */
export type Chokepoint = "channel" | "tool-call" | "tool-result" | "inbound";

export type Posture = "default" | "enforce";

export type ChannelStats = {
  name: string;
  family: string;
  encodedBits: number;
  accuracyPct: number;
  residualBitsPerTrial: number;
  reductionPct: number;
  detectedPct: number;
  blockedPct: number;
};

/**
 * The paper's postures. "enforce" also pins the ledger so the budget binds.
 * Both go through the mediator's plugin-config resolver, so the measured
 * settings are exactly what an operator can configure.
 */
export function postureConfig(posture: Posture): EgressMediatorConfig {
  const common = {
    toolCall: { enabled: true },
    modelInput: { enabled: true },
    llm: { enabled: false },
    coverTraffic: { enabled: false },
  };
  if (posture === "default") {
    return resolveEgressMediatorConfig(common);
  }
  return resolveEgressMediatorConfig({
    ...common,
    // A 64-bit lifetime budget per destination: refill 0 means no refill.
    ledger: { capacityBits: 64, refillBitsPerSec: 0 },
    stages: Object.fromEntries(
      [
        "egress-canonicalizer",
        "egress-taint-tracker",
        "egress-entropy-scanner",
        "egress-replay-sentinel",
        "egress-noise-injector",
        "egress-semantic-scrambler",
        "egress-behavioral-invariants",
      ].map((id) => [id, { mode: "enforce" }]),
    ),
  });
}

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;
type Middleware = (event: unknown, ctx: unknown) => Promise<unknown>;

type Outcome = { delivered: string; cancelled: boolean; findings: number };

/** Fresh seven-stage pipeline + mediator; returns a runner for one chokepoint. */
export function makeRunner(config: EgressMediatorConfig, chokepoint: Chokepoint) {
  resetEgressRegistry();
  registerEgressStage(buildCanonicalizerStage());
  registerEgressStage(buildTaintTrackerStage({ store: createTaintStore() }));
  registerEgressStage(buildEntropyScannerStage());
  registerEgressStage(buildReplaySentinelStage());
  registerEgressStage(buildNoiseInjectorStage());
  registerEgressStage(buildSemanticScramblerStage());
  registerEgressStage(buildBehavioralInvariantsStage());

  const hooks = new Map<string, Handler>();
  let middleware: Middleware | undefined;
  const api = {
    on: (name: string, handler: Handler) => hooks.set(name, handler),
    registerAgentToolResultMiddleware: (handler: Middleware) => {
      middleware = handler;
    },
    logger: { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} },
  };
  // Delays are simulated, not slept: the timing channel is measured separately.
  const mediator = createEgressMediator(api as never, { config, sleep: async () => {} });

  return async (payload: string): Promise<Outcome> => {
    const before = mediator.audit.records().length;
    let delivered = payload;
    let cancelled = false;
    if (chokepoint === "channel") {
      const r = (await hooks.get("message_sending")!(
        { to: "u1", content: payload },
        { channelId: "c1", conversationId: "c1" },
      )) as { cancel?: boolean; content?: string } | undefined;
      cancelled = r?.cancel === true;
      delivered = r?.content ?? payload;
    } else if (chokepoint === "tool-call") {
      const r = (await hooks.get("before_tool_call")!(
        { toolName: "message", params: { to: "u1", text: payload } },
        { toolName: "message" },
      )) as { block?: boolean; params?: { text?: string } } | undefined;
      cancelled = r?.block === true;
      delivered = r?.params?.text ?? payload;
    } else if (chokepoint === "tool-result") {
      const r = (await middleware!(
        {
          toolCallId: "t1",
          toolName: "web_fetch",
          args: {},
          result: { content: [{ type: "text", text: payload }], details: {} },
        },
        { runtime: "pi" },
      )) as { result?: { content: Array<{ text?: string }> } } | undefined;
      const text = r?.result?.content?.[0]?.text;
      cancelled = typeof text === "string" && text.startsWith("[egress-mediator: content withheld");
      delivered = text ?? payload;
    } else {
      const r = (await hooks.get("before_dispatch")!(
        { content: payload, body: payload, channel: "c1" },
        { channelId: "c1", conversationId: "c1" },
      )) as { handled?: boolean; body?: string } | undefined;
      cancelled = r?.handled === true;
      delivered = r?.body ?? payload;
    }
    const findings = mediator.audit.records().length - before;
    return { delivered: cancelled ? "" : delivered, cancelled, findings };
  };
}

export async function measureChannel(
  channel: CovertChannel,
  config: EgressMediatorConfig,
  trials: number,
  rand: () => number,
  chokepoint: Chokepoint = "channel",
): Promise<ChannelStats> {
  const pairs: Array<[Bit, Bit]> = [];
  let detected = 0;
  let blocked = 0;
  for (let trial = 0; trial < trials; trial++) {
    const run = makeRunner(config, chokepoint); // fresh pipeline + ledger per trial
    const secret = randomBits(channel.bits, rand);
    const outcome = await run(channel.encode(secret));
    const recovered = channel.decode(outcome.delivered);
    for (let i = 0; i < channel.bits; i++) {
      pairs.push([secret[i], recovered[i]]);
    }
    if (outcome.findings > 0 || outcome.cancelled) {
      detected++;
    }
    if (outcome.cancelled) {
      blocked++;
    }
  }
  const residualPerBit = mutualInformationBits(pairs);
  return {
    name: channel.name,
    family: channel.family,
    encodedBits: channel.bits,
    accuracyPct: accuracyPct(pairs),
    residualBitsPerTrial: residualPerBit * channel.bits,
    reductionPct: (1 - residualPerBit) * 100,
    detectedPct: (detected / trials) * 100,
    blockedPct: (blocked / trials) * 100,
  };
}

/** Timing side channel, measured against the behavioral monitor directly. */
export function measureTimingChannel(
  trials: number,
  rand: () => number,
  monitorOptions: Partial<BehavioralOptions> = { releaseCadenceMs: 2000 },
): ChannelStats {
  const bitsPerTrial = 16;
  const SLOT_MS = 1000; // attacker's nominal slot
  const SHORT = 120; // gap encoding bit 0
  const LONG = 640; // gap encoding bit 1
  const pairs: Array<[Bit, Bit]> = [];
  for (let trial = 0; trial < trials; trial++) {
    const secret = randomBits(bitsPerTrial, rand);
    // Constant-rate paced release pins every send onto a fixed cadence, so the
    // observed inter-send interval is independent of the attacker's gaps.
    // Through the plugin-config resolver: these are the operator-facing options.
    const monitor = createBehavioralMonitor(resolveBehavioralOptions(monitorOptions), rand);
    const observed: number[] = [];
    let intended = 1_000_000;
    for (let i = 0; i < bitsPerTrial; i++) {
      intended += SLOT_MS + (secret[i] === 1 ? LONG : SHORT);
      const evaluation = monitor.evaluate("sink", intended, 10, true);
      const delayMs = evaluation.decision.action === "delay" ? evaluation.decision.delayMs : 0;
      observed.push(intended + delayMs); // when the message actually leaves
    }
    for (let i = 1; i < bitsPerTrial; i++) {
      const gap = observed[i] - observed[i - 1];
      const guess: Bit = gap - SLOT_MS > (SHORT + LONG) / 2 ? 1 : 0;
      pairs.push([secret[i], guess]);
    }
  }
  const residualPerBit = mutualInformationBits(pairs);
  return {
    name: "timing-interval",
    family: "behavioral",
    encodedBits: bitsPerTrial,
    accuracyPct: accuracyPct(pairs),
    residualBitsPerTrial: residualPerBit * bitsPerTrial,
    reductionPct: (1 - residualPerBit) * 100,
    detectedPct: 0,
    blockedPct: 0,
  };
}

export type TextResults = {
  trials: number;
  defaultRows: ChannelStats[];
  enforceRows: ChannelStats[];
  timing: ChannelStats;
  /** Full-enforcement reduction per content channel at every chokepoint. */
  chokepoints: Array<{ name: string } & Record<Chokepoint, number>>;
};

export async function runTextBenchmark(trials = 20): Promise<TextResults> {
  const defaults = postureConfig("default");
  const enforce = postureConfig("enforce");
  const defaultRows: ChannelStats[] = [];
  const enforceRows: ChannelStats[] = [];
  const chokepoints: TextResults["chokepoints"] = [];
  for (const channel of CONTENT_CHANNELS) {
    defaultRows.push(await measureChannel(channel, defaults, trials, makeRng(0x1234)));
    const enforced = await measureChannel(channel, enforce, trials, makeRng(0x1234));
    enforceRows.push(enforced);
    const row = {
      name: channel.name,
      channel: enforced.reductionPct,
    } as TextResults["chokepoints"][number];
    for (const point of ["tool-call", "tool-result", "inbound"] as const) {
      row[point] = (
        await measureChannel(channel, enforce, trials, makeRng(0x1234), point)
      ).reductionPct;
    }
    chokepoints.push(row);
  }
  const timing = measureTimingChannel(trials, makeRng(0x5678));
  return { trials, defaultRows, enforceRows, timing, chokepoints };
}
