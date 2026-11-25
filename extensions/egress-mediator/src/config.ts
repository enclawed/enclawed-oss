// Mediator configuration: which chokepoints run the egress pipeline, and with
// which per-stage posture.
//
// Chokepoints:
//   - channel     (`message_sending`): on whenever the plugin is enabled, as
//                  in every Enclawed build;
//   - tool-call   (`before_tool_call`): outbound arguments of tools that send
//                  data off the host;
//   - model-input (agent tool-result middleware + `before_dispatch`): tool
//                  results and inbound channel messages before they enter
//                  the model context;
//   - media       (`media_sending`): outbound attachments, through the
//                  media-scrambler registry and canonical media order. On
//                  whenever the plugin is enabled, like channel; inert until
//                  a media scrambler is registered or media ordering is set
//                  to enforce.
// tool-call and model-input are off by default in the open posture and on by
// default in the hardened posture (the bootstrapped runtime's flavor, else
// ENCLAWED_FLAVOR; see isHardenedFlavor).
// Explicit plugin config always wins.

import {
  createPluginConfigReader,
  DEFAULT_STAGE_MODES,
  defaultEgressConfig,
  mergeEgressConfig,
  resolveStageMode,
  type EgressConfig,
  type EgressMode,
  type PluginConfigReader,
} from "@enclawed/egress-core";

/** Tools whose arguments leave the host whenever the tool runs. */
export const DEFAULT_EGRESS_TOOLS: readonly string[] = [
  "message",
  "sessions_send",
  "web_fetch",
  "web_search",
  "x_search",
  "browser",
  // Channel tools that send from their own code (direct messages, posts).
  "tlon",
];

/**
 * Shell tools. Their `command` argument is mediated only when it invokes a
 * network client (see `isNetworkCommand`); a local command is left alone so
 * the pipeline cannot rewrite ordinary shell use.
 */
export const DEFAULT_COMMAND_TOOLS: readonly string[] = ["exec", "bash"];

export type EgressMediatorConfig = {
  egress: EgressConfig;
  /** Enforcing (hardened) profile: every stage enforces, every surface is on. */
  hardened: boolean;
  toolCall: { enabled: boolean; tools: readonly string[]; commandTools: readonly string[] };
  modelInput: { enabled: boolean; toolResults: boolean; inbound: boolean };
  llm: { enabled: boolean; provider?: string; model?: string; timeoutMs: number };
  coverTraffic: { enabled: boolean };
  media: { enabled: boolean };
};

const HARDENED_FLAVOR_ALIASES = new Set(["enclaved", "secure", "classified", "high-side"]);

// The host publishes the bootstrapped runtime (with the flavor it actually
// enforces: env and admin policy already resolved) on this globalThis slot
// (src/enclawed/runtime.ts). Read through the slot, not an import, so the
// extension stays inside its package boundary.
const RUNTIME_KEY = Symbol.for("enclawed.runtime");

function runtimeFlavor(): string | null {
  const rt = (globalThis as unknown as Record<symbol, { flavor?: unknown } | undefined>)[
    RUNTIME_KEY
  ];
  return typeof rt?.flavor === "string" ? rt.flavor : null;
}

/**
 * Whether the process runs the hardened posture.
 *
 * 1. The bootstrapped runtime's flavor, when present, decides: it already
 *    honors the admin policy (for example "flavor": "enclaved" in
 *    /etc/enclawed/policy.json), which ENCLAWED_FLAVOR alone does not show.
 * 2. Before bootstrap (tests, embedding apps), ENCLAWED_FLAVOR. This package
 *    ships no flavor pin, so its default is the open flavor, like the host's.
 */
export function isHardenedFlavor(env: NodeJS.ProcessEnv = process.env): boolean {
  const fromRuntime = runtimeFlavor();
  if (fromRuntime !== null) {
    return fromRuntime !== "open";
  }
  const raw = env.ENCLAWED_FLAVOR;
  return typeof raw === "string" && HARDENED_FLAVOR_ALIASES.has(raw.trim().toLowerCase());
}

/** Top-level keys the manifest schema declares. */
const TOP_LEVEL_KEYS = [
  "enabled",
  "posture",
  "stages",
  "ledger",
  "toolCall",
  "modelInput",
  "llm",
  "coverTraffic",
  "media",
] as const;

const MODES: readonly EgressMode[] = ["enforce", "audit", "off"];
const MAX_TIMEOUT_MS = 600_000;

function resolveStages(r: PluginConfigReader): Record<string, { mode: EgressMode }> {
  const stages: Record<string, { mode: EgressMode }> = {};
  // `posture: "enforce"` escalates every stage; per-stage entries still win.
  if (r.oneOf("posture", ["default", "enforce"], "default") === "enforce") {
    for (const id of Object.keys(DEFAULT_STAGE_MODES)) {
      stages[id] = { mode: "enforce" };
    }
  }
  for (const [id, entry] of r.entries("stages", ["mode"])) {
    // A misspelled stage id would silently leave the real stage at its
    // default, so only the built-in stage ids are accepted.
    if (!Object.hasOwn(DEFAULT_STAGE_MODES, id)) {
      r.fail(
        `stages.${id} is not a known stage (known: ${Object.keys(DEFAULT_STAGE_MODES).join(", ")})`,
      );
    }
    if (!entry.has("mode")) {
      r.fail(`stages.${id}.mode is required`);
    }
    stages[id] = { mode: entry.oneOf("mode", MODES, "audit") };
  }
  return stages;
}

/**
 * Stage modes in an enforcing (hardened) profile (settings audit X2 and the
 * audit-mode follow-up): audit mode passes the payload through unchanged, so
 * there every stage enforces. `posture: "enforce"` and a per-stage `enforce`
 * are accepted (they say what the profile already does); `posture: "default"`
 * and a stage mode of `audit` or `off` would loosen it and are refused.
 */
function resolveHardenedStages(
  r: PluginConfigReader,
  hardened: boolean,
): Record<string, { mode: EgressMode }> {
  if (!hardened) {
    return resolveStages(r);
  }
  if (r.has("posture") && r.oneOf("posture", ["default", "enforce"], "enforce") !== "enforce") {
    r.fail('posture cannot be "default" in an enforcing profile (every stage enforces)');
  }
  const configured = resolveStages(r);
  const stages: Record<string, { mode: EgressMode }> = {};
  for (const id of Object.keys(DEFAULT_STAGE_MODES)) {
    stages[id] = { mode: "enforce" };
  }
  for (const [id, entry] of Object.entries(configured)) {
    if (entry.mode !== "enforce") {
      r.fail(`stages.${id}.mode cannot be "${entry.mode}" in an enforcing profile`);
    }
  }
  return stages;
}

/**
 * The mode a stage runs in. In an enforcing profile every stage enforces,
 * including a stage id this build does not list (a third-party stage would
 * otherwise fall back to audit and pass its payloads through).
 */
export function effectiveStageMode(config: EgressMediatorConfig, stageId: string): EgressMode {
  return config.hardened ? "enforce" : resolveStageMode(config.egress, stageId);
}

/**
 * In an enforcing profile a surface switch may only stay on: `false` would
 * leave that surface unmediated, so it is refused rather than honored.
 */
function hardenedBool(
  r: PluginConfigReader,
  key: string,
  fallback: boolean,
  hardened: boolean,
  label: string,
): boolean {
  const value = r.bool(key, fallback);
  if (hardened && !value) {
    r.fail(`${label} cannot be false in an enforcing profile`);
  }
  return value;
}

/**
 * Resolve the mediator's plugin config. Fail-closed like the stage plugins:
 * an unknown key, a wrong type or an out-of-range value throws, so the
 * plugin loader refuses the plugin instead of running a monitor weaker than
 * the operator configured. An omitted key keeps its default.
 */
export function resolveEgressMediatorConfig(
  pluginConfig: unknown,
  env: NodeJS.ProcessEnv = process.env,
): EgressMediatorConfig {
  const r = createPluginConfigReader("egress-mediator", pluginConfig, TOP_LEVEL_KEYS);
  const hardened = isHardenedFlavor(env);
  const ledgerReader = r.section("ledger", ["capacityBits", "refillBitsPerSec"]);
  const ledger: Partial<EgressConfig["ledger"]> = {};
  // Tighten-only: the shipped budget is the most a destination may get.
  // A larger value would raise the covert-bit budget, so it is refused.
  const capacityBits = ledgerReader.optionalNumber("capacityBits", {
    above: 0,
    max: defaultEgressConfig.ledger.capacityBits,
  });
  // 0 means no refill at all: a fixed lifetime budget per destination.
  const refillBitsPerSec = ledgerReader.optionalNumber("refillBitsPerSec", {
    min: 0,
    max: defaultEgressConfig.ledger.refillBitsPerSec,
  });
  if (capacityBits !== undefined) {
    ledger.capacityBits = capacityBits;
  }
  if (refillBitsPerSec !== undefined) {
    ledger.refillBitsPerSec = refillBitsPerSec;
  }
  const toolCall = r.section("toolCall", ["enabled", "tools", "commandTools"]);
  const modelInput = r.section("modelInput", ["enabled", "toolResults", "inbound"]);
  const llm = r.section("llm", ["enabled", "provider", "model", "timeoutMs"]);
  const coverTraffic = r.section("coverTraffic", ["enabled"]);
  const media = r.section("media", ["enabled"]);
  return {
    egress: mergeEgressConfig({
      enabled: hardenedBool(r, "enabled", true, hardened, "enabled"),
      ledger: ledger as EgressConfig["ledger"],
      stages: resolveHardenedStages(r, hardened),
    }),
    hardened,
    toolCall: {
      enabled: hardenedBool(toolCall, "enabled", hardened, hardened, "toolCall.enabled"),
      tools: toolCall.stringList("tools", DEFAULT_EGRESS_TOOLS),
      commandTools: toolCall.stringList("commandTools", DEFAULT_COMMAND_TOOLS),
    },
    modelInput: {
      enabled: hardenedBool(modelInput, "enabled", hardened, hardened, "modelInput.enabled"),
      toolResults: hardenedBool(
        modelInput,
        "toolResults",
        true,
        hardened,
        "modelInput.toolResults",
      ),
      inbound: hardenedBool(modelInput, "inbound", true, hardened, "modelInput.inbound"),
    },
    llm: {
      // Not a weakening switch: without the completer the LLM scrambler
      // stage blocks every payload in enforce mode (it never passes one
      // through unrephrased), so `false` stays accepted.
      enabled: llm.bool("enabled", true),
      provider: llm.optionalString("provider"),
      model: llm.optionalString("model"),
      timeoutMs: llm.number("timeoutMs", 30_000, {
        integer: true,
        above: 0,
        max: MAX_TIMEOUT_MS,
      }),
    },
    coverTraffic: {
      enabled: hardenedBool(coverTraffic, "enabled", true, hardened, "coverTraffic.enabled"),
    },
    media: { enabled: hardenedBool(media, "enabled", true, hardened, "media.enabled") },
  };
}
