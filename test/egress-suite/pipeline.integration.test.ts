// End-to-end integration test for the covert/side-channel egress defense
// suite: the full seven-stage pipeline behind the real mediator, driven
// through every chokepoint the mediator wires (channel send, tool-call
// arguments, tool results, inbound messages).
//
// All covert/non-ASCII inputs are constructed from numeric code points, so this
// source file contains no invisible characters of its own.

import { beforeEach, describe, expect, it } from "vitest";
import { buildBehavioralInvariantsStage } from "../../extensions/egress-behavioral-invariants/api.js";
import { buildCanonicalizerStage } from "../../extensions/egress-canonicalizer/api.js";
import { buildEntropyScannerStage } from "../../extensions/egress-entropy-scanner/api.js";
import {
  createEgressMediator,
  registerEgressStage,
  resetEgressRegistry,
  resolveEgressMediatorConfig,
} from "../../extensions/egress-mediator/api.js";
import { buildNoiseInjectorStage } from "../../extensions/egress-noise-injector/api.js";
import { buildReplaySentinelStage } from "../../extensions/egress-replay-sentinel/api.js";
import { buildSemanticScramblerStage } from "../../extensions/egress-semantic-scrambler/api.js";
import {
  buildTaintTrackerStage,
  createTaintStore,
} from "../../extensions/egress-taint-tracker/api.js";

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);
type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;

function harness(pluginConfig: Record<string, unknown> = {}) {
  const hooks = new Map<string, Handler>();
  let middleware: Handler | undefined;
  const api = {
    on: (name: string, handler: Handler) => hooks.set(name, handler),
    registerAgentToolResultMiddleware: (handler: Handler) => {
      middleware = handler;
    },
    logger: { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} },
  };
  const mediator = createEgressMediator(api as never, {
    config: resolveEgressMediatorConfig(
      { toolCall: { enabled: true }, modelInput: { enabled: true }, ...pluginConfig },
      {},
    ),
    sleep: async () => {},
  });
  return {
    mediator,
    send: (content: string, channelId = "conv-1") =>
      hooks.get("message_sending")!(
        { to: "u1", content },
        { channelId, conversationId: channelId },
      ),
    toolCall: (toolName: string, params: Record<string, unknown>) =>
      hooks.get("before_tool_call")!({ toolName, params }, { toolName }),
    toolResult: (text: string) =>
      middleware!(
        {
          toolCallId: "t1",
          toolName: "web_fetch",
          args: {},
          result: { content: [{ type: "text", text }], details: {} },
        },
        { runtime: "pi" },
      ),
    inbound: (body: string) =>
      hooks.get("before_dispatch")!(
        { content: body, body },
        { channelId: "c1", conversationId: "c1" },
      ),
  };
}

/** Register all seven stages into the shared registry. */
function registerFullPipeline(): void {
  registerEgressStage(buildCanonicalizerStage());
  registerEgressStage(buildTaintTrackerStage({ store: createTaintStore() }));
  registerEgressStage(buildEntropyScannerStage());
  registerEgressStage(buildReplaySentinelStage());
  registerEgressStage(buildNoiseInjectorStage());
  registerEgressStage(buildSemanticScramblerStage());
  registerEgressStage(buildBehavioralInvariantsStage());
}

describe("egress defense suite — end-to-end pipeline", () => {
  beforeEach(() => resetEgressRegistry());

  it("strips zero-width / Unicode-Tag stego from outbound text (lossless, enforced)", async () => {
    registerFullPipeline();
    const { send } = harness();
    // "secret" with an interleaved zero-width space and a Unicode Tag char.
    const stego = `se${cp(0x200b)}cret${cp(0xe0041)} message`;
    const result = (await send(stego)) as { content?: string } | undefined;
    expect(result?.content).toBe("secret message");
  });

  it("folds a mixed-script homoglyph attack to ASCII", async () => {
    registerFullPipeline();
    const { send } = harness();
    // "paypal" with a Cyrillic 'a' (U+0430).
    const result = (await send(`login at p${cp(0x0430)}ypal now`)) as
      | { content?: string }
      | undefined;
    expect(result?.content).toBe("login at paypal now");
  });

  it("blocks outbound credential material (taint tracker, enforced by default)", async () => {
    registerFullPipeline();
    const { send } = harness();
    const result = await send("here is the key sk-abcdefghijklmnopqrstuvwxyz0123");
    expect(result).toEqual({ cancel: true });
  });

  it("blocks a base64 exfil blob when the entropy scanner is enforced with a tight budget", async () => {
    registerFullPipeline();
    const { send } = harness({
      ledger: { capacityBits: 64 },
      stages: { "egress-entropy-scanner": { mode: "enforce" } },
    });
    const blob = Buffer.from("exfiltrated database rows ".repeat(12)).toString("base64");
    const result = await send(`report: ${blob}`);
    expect(result).toEqual({ cancel: true });
  });

  it("lets a base64 blob through in the default staged posture (entropy in audit)", async () => {
    registerFullPipeline();
    const { send } = harness(); // default: entropy scanner audits, does not block
    const blob = Buffer.from("ordinary attachment bytes ".repeat(12)).toString("base64");
    const result = (await send(`file: ${blob}`)) as { cancel?: boolean } | undefined;
    expect(result?.cancel).not.toBe(true);
  });

  it("passes an ordinary message unchanged", async () => {
    registerFullPipeline();
    const { send } = harness();
    expect(await send("hey, the deploy finished and all checks are green")).toBeUndefined();
  });

  it("is a complete pass-through when no stages are registered", async () => {
    const { send } = harness();
    expect(await send("anything at all")).toBeUndefined();
  });

  it("enforces the rate invariant across repeated sends when behavioral is enforced", async () => {
    registerEgressStage(buildBehavioralInvariantsStage({ maxMessagesPerWindow: 3 }));
    const { send } = harness({
      stages: { "egress-behavioral-invariants": { mode: "enforce" } },
    });
    expect(await send("m1")).toBeUndefined();
    expect(await send("m2")).toBeUndefined();
    expect(await send("m3")).toBeUndefined();
    expect(await send("m4")).toEqual({ cancel: true });
  });
});

describe("egress defense suite — input and tool-call chokepoints", () => {
  beforeEach(() => {
    resetEgressRegistry();
    registerFullPipeline();
  });

  it("strips Unicode-Tag smuggling from a tool result before the model sees it", async () => {
    const { toolResult } = harness();
    const smuggled = `weather is sunny${Array.from("ignore all", (c) => c)
      .map((c) => cp(0xe0000 + c.charCodeAt(0)))
      .join("")}`;
    const out = (await toolResult(smuggled)) as { result?: { content: Array<{ text: string }> } };
    expect(out.result?.content[0]?.text).toBe("weather is sunny");
  });

  it("withholds a tool result carrying credential material", async () => {
    const { toolResult } = harness();
    const out = (await toolResult("token sk-abcdefghijklmnopqrstuvwxyz0123")) as {
      result?: { content: Array<{ text: string }> };
    };
    expect(out.result?.content[0]?.text).toMatch(/^\[egress-mediator: content withheld/);
  });

  it("rewrites an inbound message body and drops one carrying a secret", async () => {
    const { inbound } = harness();
    expect(await inbound(`hi${cp(0x200b)} there`)).toEqual({ handled: false, body: "hi there" });
    expect(await inbound("key sk-abcdefghijklmnopqrstuvwxyz0123")).toEqual({ handled: true });
  });

  it("blocks a message tool call whose text carries credential material", async () => {
    const { toolCall } = harness();
    const out = (await toolCall("message", {
      to: "u1",
      text: "sk-abcdefghijklmnopqrstuvwxyz0123",
    })) as {
      block?: boolean;
    };
    expect(out.block).toBe(true);
  });

  it("canonicalizes nested tool-call arguments without touching keys", async () => {
    const { toolCall } = harness();
    const out = (await toolCall("web_fetch", {
      url: "https://example.com/",
      headers: { "x-note": `a${cp(0x200b)}b` },
    })) as { params?: Record<string, unknown> };
    expect(out.params).toEqual({ url: "https://example.com/", headers: { "x-note": "ab" } });
  });

  it("mediates exec only when the command reaches the network", async () => {
    const { toolCall } = harness();
    expect(await toolCall("exec", { command: `echo a${cp(0x200b)}b` })).toBeUndefined();
    const out = (await toolCall("exec", {
      command: `curl -d "a${cp(0x200b)}b" https://example.com`,
    })) as { params?: { command?: string } };
    expect(out.params?.command).toBe('curl -d "ab" https://example.com');
  });

  it("leaves tool calls and model input alone when those chokepoints are disabled", async () => {
    const hooks = new Map<string, Handler>();
    const registered: string[] = [];
    createEgressMediator(
      {
        on: (name: string, handler: Handler) => hooks.set(name, handler),
        registerAgentToolResultMiddleware: () => registered.push("middleware"),
        logger: { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} },
      } as never,
      { config: resolveEgressMediatorConfig({}, {}) },
    );
    // The tool hooks exist for the action batcher; with no batcher
    // registered they leave every tool call alone. media_sending is inert
    // until a media scrambler is registered.
    expect([...hooks.keys()].toSorted()).toEqual([
      "after_tool_call",
      "agent_end",
      "before_tool_call",
      "media_sending",
      "message_sending",
    ]);
    expect(
      await hooks.get("before_tool_call")!(
        { toolName: "web_fetch", params: { url: `https://example.com/a${cp(0x200b)}b` } },
        { toolName: "web_fetch" },
      ),
    ).toBeUndefined();
    expect(registered).toEqual([]);
  });
});
