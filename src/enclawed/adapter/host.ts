// enclawed adapter kit: what a host CLI's capabilities mean for an adapter
// (portability requirements R1–R4 of the codenclawed paper). Pure.

import type { HostCapabilities, PortabilityAssessment, PortabilityRequirement } from "./types.js";

/**
 * Assess a host. R1 is necessary: without a pre-tool hook that can deny
 * every call there is no reference monitor, and the host is not supported.
 * Every other shortfall is a gap the adapter must cover, said in plain words.
 */
export function assessHost(c: HostCapabilities): PortabilityAssessment {
  const met: PortabilityRequirement[] = [];
  const gaps: string[] = [];
  const h = c.preToolHook;
  const r1 = h.canDeny && h.coversAllTools;
  if (r1) {
    met.push("R1");
    if (h.onFailure !== "blocks" && h.onFailure !== "blocks-when-configured") {
      gaps.push(
        "a hook that crashes or times out lets the call run: keep the hook bounded and linear-time, and stop the session at the first call the transcript shows without a decision",
      );
    } else if (h.onFailure === "blocks-when-configured") {
      gaps.push(
        "the hook fails closed only when configured to: the adapter must always set that option",
      );
    }
    if (h.coversSubagents !== "yes") {
      gaps.push(
        "the hook is not documented to see subagents' calls: refuse to start subagents, or confirm coverage with a test against the host",
      );
    }
    if (h.delivery === "in-process-plugin") {
      gaps.push(
        "the hook is a plugin inside the host process: forward each call to Enclawed's external hook, and refuse at launch any project plugin, which would share that process",
      );
    }
  } else {
    gaps.push(
      h.canDeny
        ? "the pre-tool hook does not see every kind of call (built-in, shell, file and MCP), so some calls would run unchecked"
        : "the host has no pre-tool hook that can deny a call, so it cannot be governed without modifying it",
    );
  }
  const cleanerApplies = c.outputRewrite === "full";
  if (cleanerApplies) {
    met.push("R2");
  } else {
    gaps.push(
      "the host cannot replace a tool's result before the model reads it, so hidden instructions in results cannot be removed (the action gate still decides every call)",
    );
  }
  const s = c.settingsInjection;
  if (
    (s.channel === "flag" || s.channel === "environment") &&
    s.ranksAboveRepository === "yes" &&
    s.projectHooksVisible === "yes"
  ) {
    met.push("R3");
  } else {
    gaps.push(
      "a repository can add or outrank hooks and command settings: the launcher must find and refuse them before every start",
    );
  }
  const t = c.transcript;
  if (t.onDisk === "yes" && t.stableCallIds === "yes") {
    met.push("R4");
    if (t.formatStable !== "yes") {
      gaps.push(
        "the transcript format may change between host versions: pin the versions the adapter's parser was tested with",
      );
    }
  } else {
    gaps.push(
      "there is no transcript with stable call ids: a call that ran without a decision, or a forged decision, is detected later or not at all",
    );
  }
  return { supported: r1, met, gaps, cleanerApplies };
}
