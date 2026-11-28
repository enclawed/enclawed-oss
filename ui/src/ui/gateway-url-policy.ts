import type { ControlUiGatewayUrlPolicy } from "../../../src/gateway/control-ui-contract.js";
import { normalizeGatewayOrigin } from "../../../src/shared/device-auth.js";

/**
 * Link policy as the Control UI knows it:
 * - null        : the bootstrap config has not been loaded yet (decide later).
 * - unavailable : the bootstrap config could not be loaded, so the flavor is
 *                 unknown; links are refused (fail closed). Switching gateways
 *                 from the settings screen still works.
 */
export type GatewayUrlLinkPolicy = ControlUiGatewayUrlPolicy | "unavailable";

export type GatewayUrlLinkRefusal = "unparsable" | "not-allowlisted" | "policy-unavailable";

export type GatewayUrlLinkDecision =
  | { kind: "pending" }
  | { kind: "ask"; origin: string }
  | { kind: "refuse"; reason: GatewayUrlLinkRefusal };

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" || host === "[::1]" || host === "::1" || /^127\.\d+\.\d+\.\d+$/.test(host)
  );
}

/**
 * Decides a `gatewayUrl` taken from a link (query or fragment). The person is
 * asked only when the decision is "ask"; "refuse" drops the link without a
 * prompt. In the allowlist (enclaved) policy the gateway serving this page and
 * loopback gateways are always the person's own and are asked as before.
 */
export function decideGatewayUrlLink(params: {
  gatewayUrl: string;
  policy: GatewayUrlLinkPolicy | null;
  allowedGatewayOrigins: readonly string[];
  pageHref: string;
}): GatewayUrlLinkDecision {
  const origin = normalizeGatewayOrigin(params.gatewayUrl, params.pageHref);
  if (!origin) {
    return { kind: "refuse", reason: "unparsable" };
  }
  if (params.policy === null) {
    return { kind: "pending" };
  }
  if (params.policy === "unavailable") {
    return { kind: "refuse", reason: "policy-unavailable" };
  }
  if (params.policy === "confirm") {
    return { kind: "ask", origin };
  }
  const hostname = new URL(origin).hostname;
  const pageOrigin = normalizeGatewayOrigin(params.pageHref);
  if (
    isLoopbackHostname(hostname) ||
    origin === pageOrigin ||
    params.allowedGatewayOrigins.includes(origin)
  ) {
    return { kind: "ask", origin };
  }
  return { kind: "refuse", reason: "not-allowlisted" };
}

export function describeGatewayUrlRefusal(
  gatewayUrl: string,
  reason: GatewayUrlLinkRefusal,
): string {
  const messages: Record<GatewayUrlLinkRefusal, string> = {
    unparsable: `Ignored a link with an invalid gateway URL (${gatewayUrl}).`,
    "not-allowlisted": `Refused a link to gateway ${gatewayUrl}: it is not in gateway.controlUi.allowedGatewayUrls. Add it there or switch gateways from the settings screen.`,
    "policy-unavailable": `Refused a link to gateway ${gatewayUrl}: the gateway link policy could not be loaded. Switch gateways from the settings screen.`,
  };
  return messages[reason];
}

export type GatewayUrlLinkHost = {
  pendingGatewayUrl?: string | null;
  pendingGatewayToken?: string | null;
  gatewayUrlPolicy?: GatewayUrlLinkPolicy | null;
  allowedGatewayOrigins?: string[];
  /** Why the last link was refused (shown to the person), else null. */
  gatewayUrlLinkRefusal?: string | null;
};

/**
 * Applies the link policy to a parked `gatewayUrl` link. A refused link is
 * dropped together with any token it carried, and the reason is shown; the
 * person is never asked about it. Returns the decision for the caller.
 */
export function applyGatewayUrlLinkPolicy(
  host: GatewayUrlLinkHost,
  pageHref: string = typeof window !== "undefined" ? window.location.href : "",
): GatewayUrlLinkDecision | null {
  const gatewayUrl = host.pendingGatewayUrl;
  if (!gatewayUrl) {
    return null;
  }
  const decision = decideGatewayUrlLink({
    gatewayUrl,
    policy: host.gatewayUrlPolicy ?? null,
    allowedGatewayOrigins: host.allowedGatewayOrigins ?? [],
    pageHref,
  });
  if (decision.kind === "refuse") {
    host.pendingGatewayUrl = null;
    host.pendingGatewayToken = null;
    host.gatewayUrlLinkRefusal = describeGatewayUrlRefusal(gatewayUrl, decision.reason);
  }
  return decision;
}
