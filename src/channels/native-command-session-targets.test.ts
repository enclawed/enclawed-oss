import { describe, expect, it } from "vitest";
import { resolveNativeCommandSessionTargets } from "./native-command-session-targets.js";

describe("resolveNativeCommandSessionTargets", () => {
  it("uses the bound session for both targets when present", () => {
    expect(
      resolveNativeCommandSessionTargets({
        agentId: "codex",
        sessionPrefix: "discord:slash",
        userId: "user-1",
        targetSessionKey: "agent:codex:discord:channel:chan-1",
        boundSessionKey: "agent:codex:acp:binding:discord:default:seed",
      }),
    ).toEqual({
      sessionKey: "agent:codex:acp:binding:discord:default:seed",
      commandTargetSessionKey: "agent:codex:acp:binding:discord:default:seed",
    });
  });

  it("falls back to the routed session target when unbound", () => {
    expect(
      resolveNativeCommandSessionTargets({
        agentId: "coder",
        sessionPrefix: "telegram:slash",
        userId: "user-1",
        targetSessionKey: "agent:coder:telegram:direct:user-1",
      }),
    ).toEqual({
      sessionKey: "agent:coder:telegram:slash:user-1",
      commandTargetSessionKey: "agent:coder:telegram:direct:user-1",
    });
  });

  it("supports lowercase session keys for providers that already normalize", () => {
    expect(
      resolveNativeCommandSessionTargets({
        agentId: "Coder",
        sessionPrefix: "Slack:Slash",
        userId: "U123",
        targetSessionKey: "agent:coder:slack:channel:c1",
        lowercaseSessionKey: true,
      }),
    ).toEqual({
      sessionKey: "agent:coder:slack:slash:u123",
      commandTargetSessionKey: "agent:coder:slack:channel:c1",
    });
  });
});
