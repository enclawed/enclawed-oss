import { describe, expect, it } from "vitest";
import { applyGatewayUrlLinkPolicy, decideGatewayUrlLink } from "./gateway-url-policy.ts";

const PAGE = "https://gateway-a.example/ui/overview";

describe("decideGatewayUrlLink", () => {
  it("refuses unparsable or non-websocket gateway URLs in every policy", () => {
    for (const policy of [null, "confirm", "allowlist", "unavailable"] as const) {
      for (const gatewayUrl of ["javascript:alert(1)", "file:///etc/passwd", "ws://"]) {
        expect(
          decideGatewayUrlLink({ gatewayUrl, policy, allowedGatewayOrigins: [], pageHref: PAGE }),
        ).toEqual({ kind: "refuse", reason: "unparsable" });
      }
    }
  });

  it("waits while the policy is unknown and refuses when it could not be loaded", () => {
    const gatewayUrl = "wss://gateway-b.example";
    expect(
      decideGatewayUrlLink({ gatewayUrl, policy: null, allowedGatewayOrigins: [], pageHref: PAGE }),
    ).toEqual({ kind: "pending" });
    expect(
      decideGatewayUrlLink({
        gatewayUrl,
        policy: "unavailable",
        allowedGatewayOrigins: [],
        pageHref: PAGE,
      }),
    ).toEqual({ kind: "refuse", reason: "policy-unavailable" });
  });

  it("open flavor asks for any parsable gateway", () => {
    expect(
      decideGatewayUrlLink({
        gatewayUrl: "wss://attacker.example",
        policy: "confirm",
        allowedGatewayOrigins: [],
        pageHref: PAGE,
      }),
    ).toEqual({ kind: "ask", origin: "wss://attacker.example:443" });
  });

  it("enclaved flavor refuses gateways the operator did not list", () => {
    for (const gatewayUrl of [
      "wss://attacker.example",
      "wss://gateway-b.example:8443", // listed host, other port
      "ws://gateway-b.example", // listed host, other scheme
      "wss://gateway-a.example.attacker.example",
    ]) {
      expect(
        decideGatewayUrlLink({
          gatewayUrl,
          policy: "allowlist",
          allowedGatewayOrigins: ["wss://gateway-b.example:443"],
          pageHref: PAGE,
        }),
        gatewayUrl,
      ).toEqual({ kind: "refuse", reason: "not-allowlisted" });
    }
  });

  it("enclaved flavor asks for listed, loopback and the serving gateway (no false positives)", () => {
    for (const gatewayUrl of [
      "wss://gateway-b.example/enclawed",
      "WSS://GATEWAY-B.EXAMPLE:443",
      "ws://127.0.0.1:18789",
      "ws://localhost:18789",
      "ws://[::1]:18789",
      "wss://gateway-a.example",
      "/ws",
    ]) {
      expect(
        decideGatewayUrlLink({
          gatewayUrl,
          policy: "allowlist",
          allowedGatewayOrigins: ["wss://gateway-b.example:443"],
          pageHref: PAGE,
        }).kind,
        gatewayUrl,
      ).toBe("ask");
    }
  });
});

describe("applyGatewayUrlLinkPolicy", () => {
  it("drops a refused link together with its token and records why", () => {
    const host = {
      pendingGatewayUrl: "wss://attacker.example",
      pendingGatewayToken: "link-token",
      gatewayUrlPolicy: "allowlist" as const,
      allowedGatewayOrigins: [],
      gatewayUrlLinkRefusal: null as string | null,
    };
    expect(applyGatewayUrlLinkPolicy(host, PAGE)?.kind).toBe("refuse");
    expect(host.pendingGatewayUrl).toBeNull();
    expect(host.pendingGatewayToken).toBeNull();
    expect(host.gatewayUrlLinkRefusal).toContain("wss://attacker.example");
  });

  it("keeps an allowed link pending for the confirmation", () => {
    const host = {
      pendingGatewayUrl: "wss://gateway-b.example",
      pendingGatewayToken: "link-token",
      gatewayUrlPolicy: "allowlist" as const,
      allowedGatewayOrigins: ["wss://gateway-b.example:443"],
      gatewayUrlLinkRefusal: null as string | null,
    };
    expect(applyGatewayUrlLinkPolicy(host, PAGE)?.kind).toBe("ask");
    expect(host.pendingGatewayUrl).toBe("wss://gateway-b.example");
    expect(host.pendingGatewayToken).toBe("link-token");
    expect(host.gatewayUrlLinkRefusal).toBeNull();
  });
});
