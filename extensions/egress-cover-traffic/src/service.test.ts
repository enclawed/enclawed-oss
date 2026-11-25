import {
  resetEgressHostSeams,
  setOutboundEmitter,
  type CoverTrafficMessage,
} from "@enclawed/egress-core";
import type {
  EnclawedConfig,
  EnclawedPluginServiceContext,
  PluginLogger,
} from "@enclawed/plugin-sdk/core";
import { afterEach, describe, expect, it } from "vitest";
import { createCoverTrafficService, defaultCoverTrafficConfig } from "./service.js";

afterEach(() => resetEgressHostSeams());

/**
 * A minimal EnclawedPluginServiceContext.
 *
 * start/stop take a context; these tests were written against an earlier
 * zero-argument shape and called them bare, which no longer typechecks. The
 * cover-traffic service reads none of these fields -- it takes its settings from
 * the configProvider passed to the factory -- so a minimal stub is honest here
 * rather than a mock pretending to be a host.
 */
function serviceCtx(): EnclawedPluginServiceContext {
  return {
    config: {} as EnclawedConfig,
    stateDir: "/tmp/enclawed-cover-traffic-test",
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    } as unknown as PluginLogger,
  };
}

function harness(config: Partial<typeof defaultCoverTrafficConfig>) {
  const sent: CoverTrafficMessage[] = [];
  setOutboundEmitter(async (m) => {
    sent.push(m);
  });
  let captured: (() => void) | null = null;
  const clock = { now: 1_000_000 };
  const service = createCoverTrafficService(() => ({ ...defaultCoverTrafficConfig, ...config }), {
    now: () => clock.now,
    rng: () => 0.5,
    setTimer: (fn) => {
      captured = fn;
      return 1;
    },
    clearTimer: () => {},
  });
  return { sent, service, clock, ctx: serviceCtx(), tick: () => captured?.() };
}

describe("cover-traffic service", () => {
  it("does nothing when disabled", () => {
    const { service, sent, tick, ctx } = harness({ enabled: false });
    void service.start(ctx);
    tick();
    expect(sent).toHaveLength(0);
  });

  it("does nothing when enabled without a target", () => {
    const { service, sent, tick, ctx } = harness({ enabled: true });
    void service.start(ctx);
    tick();
    expect(sent).toHaveLength(0);
  });

  it("emits cover traffic on an idle channel when enabled with a target", () => {
    const { service, sent, tick, ctx } = harness({
      enabled: true,
      mode: "constant",
      meanIntervalMs: 1000,
      coverContent: "[keepalive]",
      target: { to: "ops-room", channel: "slack" },
    });
    void service.start(ctx);
    tick();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "ops-room", content: "[keepalive]", channel: "slack" });
  });

  it("stops emitting after stop()", () => {
    const { service, sent, tick, ctx } = harness({
      enabled: true,
      mode: "constant",
      meanIntervalMs: 1000,
      target: { to: "ops-room" },
    });
    void service.start(ctx);
    void service.stop?.(ctx);
    tick();
    expect(sent).toHaveLength(0);
  });

  it("suppresses filler while real egress is flowing, resumes once idle", () => {
    const { service, sent, tick, ctx, clock } = harness({
      enabled: true,
      mode: "constant",
      meanIntervalMs: 1000,
      target: { to: "ops-room", channel: "slack" },
    });
    void service.start(ctx);
    service.noteRealEgress();
    clock.now += 500;
    tick();
    expect(sent).toHaveLength(0);
    service.noteRealEgress();
    clock.now += 999;
    tick();
    expect(sent).toHaveLength(0);
    clock.now += 1;
    tick();
    expect(sent).toHaveLength(1);
  });

  it("counts real egress seen before start()", () => {
    const { service, sent, tick, ctx } = harness({
      enabled: true,
      mode: "constant",
      meanIntervalMs: 1000,
      target: { to: "ops-room", channel: "slack" },
    });
    service.noteRealEgress();
    void service.start(ctx);
    tick();
    expect(sent).toHaveLength(0);
  });
});
