// Broker policies (paper §4.4).
//
// Four named brokers cover the deployment shapes the paper enumerates:
//   - deny-all:    deny every irreversible request. Fail-safe default.
//   - policy:      mechanical decision over an out-of-band allow/deny rule
//                  document the LLM cannot reach.
//   - interactive: prompt a human; default-deny on timeout.
//   - webhook:     delegate to a remote service holding the operator's policy.
//
// The broker is the only component that can hand back an "approve" decision
// for an irreversible call; the gate (skill-gate.ts) routes through it.

import type { CapabilityCall, CapabilityToken } from "./skill-capabilities.js";

export type BrokerDecision =
  | { decision: "approve"; reason?: string }
  | { decision: "deny"; reason: string };

export type BrokerRequest = Readonly<{
  requestId: string;
  call: CapabilityCall;
  skillId: string;
  ts: number;
}>;

export interface Broker {
  readonly id: string;
  decide(req: BrokerRequest): Promise<BrokerDecision>;
}

export function denyAllBroker(): Broker {
  return {
    id: "deny-all",
    decide: async () => ({ decision: "deny", reason: "deny-all broker" }),
  };
}

export type PolicyRule = Readonly<{
  cap: CapabilityToken;
  // RegExp matched against call.target. A bare string is matched as exact.
  target: string | RegExp;
  effect: "allow" | "deny";
}>;

// Policy broker: walks rules in order, first match wins. Deny if no match.
// Rules MUST come from an out-of-band document the LLM cannot author; the
// caller is responsible for that.
export function policyBroker(input: {
  rules: ReadonlyArray<PolicyRule>;
  // Hard upper bound: rule list cap, prevents accidental ReDoS through a
  // pathological rule file.
  maxRules?: number;
}): Broker {
  const max = input.maxRules ?? 4096;
  if (input.rules.length > max) {
    throw new Error(`policyBroker: too many rules (${input.rules.length} > ${max})`);
  }
  const rules = input.rules.map((r) => Object.freeze({ ...r }));
  return {
    id: "policy",
    decide: async (req) => {
      for (const r of rules) {
        if (r.cap !== req.call.cap) continue;
        const match =
          typeof r.target === "string"
            ? r.target === req.call.target
            : r.target.test(req.call.target);
        if (match) {
          return r.effect === "allow"
            ? { decision: "approve", reason: "policy rule matched" }
            : { decision: "deny", reason: "policy rule denied" };
        }
      }
      return { decision: "deny", reason: "policy: no matching rule" };
    },
  };
}

// Interactive broker: hands the request to an injected prompt function
// (terminal, message bus, webhook responder) and applies a deny-on-timeout
// safety net. The prompt function MUST be the only path that can hand back
// "approve"; nothing on the agent's side of the gate gets a vote.
export function interactiveBroker(input: {
  prompt: (req: BrokerRequest) => Promise<BrokerDecision>;
  timeoutMs?: number;
  clock?: () => number;
}): Broker {
  const timeoutMs = input.timeoutMs ?? 60_000;
  const clock = input.clock ?? Date.now.bind(Date);
  return {
    id: "interactive",
    decide: async (req) => {
      const deadline = clock() + timeoutMs;
      const timer = new Promise<BrokerDecision>((resolve) => {
        const ms = Math.max(0, deadline - clock());
        const t = setTimeout(
          () => resolve({ decision: "deny", reason: "interactive broker: timeout" }),
          ms,
        );
        // Allow the host to exit cleanly even if the prompt never resolves.
        if (typeof t === "object" && t !== null && "unref" in t) {
          (t as { unref: () => void }).unref();
        }
      });
      try {
        return await Promise.race([input.prompt(req), timer]);
      } catch (err) {
        return { decision: "deny", reason: `interactive broker: ${(err as Error).message}` };
      }
    },
  };
}

// Webhook broker: POST the request to a URL, expect a JSON body
// {decision: "approve"|"deny", reason?: string}. Any non-200 response or
// malformed body results in deny.
export function webhookBroker(input: {
  url: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  // Optional shared-secret header so the remote can verify the request
  // originated in the runtime (out-of-band agreement).
  authHeader?: { name: string; value: string };
}): Broker {
  const fetcher = input.fetchFn ?? globalThis.fetch;
  if (!fetcher) {
    throw new Error("webhookBroker: no fetch implementation");
  }
  const timeoutMs = input.timeoutMs ?? 5_000;
  return {
    id: "webhook",
    decide: async (req) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      if (typeof t === "object" && t !== null && "unref" in t) {
        (t as { unref: () => void }).unref();
      }
      try {
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (input.authHeader) headers[input.authHeader.name] = input.authHeader.value;
        const res = await fetcher(input.url, {
          method: "POST",
          headers,
          body: JSON.stringify(req),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          return { decision: "deny", reason: `webhook: HTTP ${res.status}` };
        }
        const body = (await res.json()) as { decision?: string; reason?: string };
        if (body.decision === "approve") {
          return { decision: "approve", reason: body.reason };
        }
        if (body.decision === "deny") {
          return { decision: "deny", reason: body.reason ?? "webhook denied" };
        }
        return { decision: "deny", reason: "webhook: malformed body" };
      } catch (err) {
        return { decision: "deny", reason: `webhook: ${(err as Error).message}` };
      } finally {
        clearTimeout(t);
      }
    },
  };
}
