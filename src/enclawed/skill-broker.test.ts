import { describe, expect, test } from "vitest";

import {
  denyAllBroker,
  interactiveBroker,
  policyBroker,
  webhookBroker,
  type BrokerRequest,
} from "./skill-broker.js";
import { CAPABILITY, makeCall } from "./skill-capabilities.js";

function req(overrides: Partial<BrokerRequest> = {}): BrokerRequest {
  return Object.freeze({
    requestId: "r1",
    skillId: "s1",
    ts: 0,
    call: makeCall({ cap: CAPABILITY.PUBLISH, target: "irc://#ops" }),
    ...overrides,
  });
}

describe("skill-broker", () => {
  test("deny-all denies everything", async () => {
    const b = denyAllBroker();
    const d = await b.decide(req());
    expect(d.decision).toBe("deny");
  });

  test("policy broker first-match-wins", async () => {
    const b = policyBroker({
      rules: [
        { cap: CAPABILITY.PUBLISH, target: "irc://#ops", effect: "allow" },
        { cap: CAPABILITY.PUBLISH, target: /.*/, effect: "deny" },
      ],
    });
    expect((await b.decide(req())).decision).toBe("approve");
    expect(
      (
        await b.decide(
          req({ call: makeCall({ cap: CAPABILITY.PUBLISH, target: "irc://#chat" }) }),
        )
      ).decision,
    ).toBe("deny");
  });

  test("policy broker denies on no match", async () => {
    const b = policyBroker({ rules: [] });
    const d = await b.decide(req());
    expect(d.decision).toBe("deny");
  });

  test("policy broker rejects pathologically large rule lists", () => {
    const huge = Array.from({ length: 10 }, () => ({
      cap: CAPABILITY.PUBLISH,
      target: ".*",
      effect: "deny" as const,
    }));
    expect(() => policyBroker({ rules: huge, maxRules: 5 })).toThrow(/too many rules/);
  });

  test("interactive broker times out to deny", async () => {
    const never = () => new Promise<never>(() => {});
    const b = interactiveBroker({ prompt: never, timeoutMs: 5 });
    const d = await b.decide(req());
    expect(d.decision).toBe("deny");
    expect(d.reason).toMatch(/timeout/);
  });

  test("interactive broker forwards an approve from the prompt", async () => {
    const b = interactiveBroker({
      prompt: async () => ({ decision: "approve", reason: "ok" }),
    });
    expect((await b.decide(req())).decision).toBe("approve");
  });

  test("webhook broker treats non-200 as deny", async () => {
    const fakeFetch: typeof fetch = (async () =>
      ({ ok: false, status: 500 } as unknown as Response));
    const b = webhookBroker({ url: "http://example", fetchFn: fakeFetch });
    const d = await b.decide(req());
    expect(d.decision).toBe("deny");
  });

  test("webhook broker treats malformed body as deny", async () => {
    const fakeFetch: typeof fetch = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ totally: "wrong" }),
      } as unknown as Response));
    const b = webhookBroker({ url: "http://example", fetchFn: fakeFetch });
    const d = await b.decide(req());
    expect(d.decision).toBe("deny");
  });

  test("webhook broker forwards approve", async () => {
    const fakeFetch: typeof fetch = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ decision: "approve", reason: "ok" }),
      } as unknown as Response));
    const b = webhookBroker({ url: "http://example", fetchFn: fakeFetch });
    expect((await b.decide(req())).decision).toBe("approve");
  });
});
