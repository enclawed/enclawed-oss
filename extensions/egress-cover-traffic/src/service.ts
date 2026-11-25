// Cover-traffic service. Opt-in and OFF by default: emitting filler messages
// to a real recipient is intrusive, so a deployment must explicitly enable it
// and configure a target.
//
// The service emits through the host-injected outbound emitter
// (`@enclawed/egress-core` host-seams). With no emitter installed it runs in
// schedule-only mode — the scheduler still ticks, nothing is sent.
//
// Real traffic is its own cover: the plugin entry feeds every successful real
// channel send (`message_sent`) into `noteRealEgress`, so filler is only sent
// once the channel has been idle for a mean interval.

import { emitOutbound, hasOutboundEmitter } from "@enclawed/egress-core";
import type { EnclawedPluginService } from "@enclawed/plugin-sdk/plugin-entry";
import { createCoverScheduler, nextIntervalMs, type CoverTrafficMode } from "./scheduler.js";

export type CoverTrafficConfig = {
  enabled: boolean;
  mode: CoverTrafficMode;
  meanIntervalMs: number;
  coverContent: string;
  target?: { to: string; channel?: string };
};

export const defaultCoverTrafficConfig: CoverTrafficConfig = {
  enabled: false,
  mode: "poisson",
  meanIntervalMs: 60_000,
  coverContent: "[keepalive]",
};

export type CoverTrafficDeps = {
  now?: () => number;
  rng?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  log?: (message: string) => void;
};

export type CoverTrafficService = EnclawedPluginService & {
  /** Record a real outbound send so filler is suppressed while the agent is active. */
  noteRealEgress(): void;
};

/**
 * Build the cover-traffic plugin service.
 */
export function createCoverTrafficService(
  configProvider: () => CoverTrafficConfig,
  deps: CoverTrafficDeps = {},
): CoverTrafficService {
  const now = deps.now ?? Date.now;
  const rng = deps.rng ?? Math.random;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const log = deps.log ?? (() => {});

  let timer: unknown = null;
  let stopped = false;
  let scheduler: ReturnType<typeof createCoverScheduler> | null = null;
  // A real send seen before start() still counts once the scheduler exists.
  let pendingRealEgress: number | null = null;

  return {
    id: "egress-cover-traffic",
    noteRealEgress(): void {
      const ts = now();
      if (scheduler) {
        scheduler.noteRealEgress(ts);
      } else {
        pendingRealEgress = ts;
      }
    },
    start(): void {
      const config = configProvider();
      if (!config.enabled) {
        log("egress-cover-traffic: disabled");
        return;
      }
      if (!config.target) {
        log("egress-cover-traffic: enabled but no target configured — inactive");
        return;
      }
      if (!hasOutboundEmitter()) {
        log("egress-cover-traffic: no outbound emitter installed — schedule-only mode");
      }
      stopped = false;
      const active = createCoverScheduler({ meanIntervalMs: config.meanIntervalMs });
      if (pendingRealEgress !== null) {
        active.noteRealEgress(pendingRealEgress);
        pendingRealEgress = null;
      }
      scheduler = active;

      const tick = (): void => {
        if (stopped) {
          return;
        }
        if (active.shouldEmit(now()) && config.target) {
          // A failed send must not surface as an unhandled rejection.
          emitOutbound({
            to: config.target.to,
            content: config.coverContent,
            channel: config.target.channel,
          }).catch((err: unknown) => {
            log(
              `egress-cover-traffic: send failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
          active.noteRealEgress(now()); // a cover message also resets the idle clock
        }
        timer = setTimer(tick, nextIntervalMs(config.mode, config.meanIntervalMs, rng));
      };

      timer = setTimer(tick, nextIntervalMs(config.mode, config.meanIntervalMs, rng));
    },
    stop(): void {
      stopped = true;
      scheduler = null;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    },
  };
}
