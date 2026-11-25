// Whether a session may run with the audit anchor it has: the kit's decision, not an adapter's.
//
// A session bound to a hardware root anchors its audit log's head in the device, and only the
// authenticated anchor session (record v2: an exchange the device signs with its certified key,
// MAC'd sets) keeps other processes of the user from anchoring a log of their choosing. So a
// bound session whose device cannot open an authenticated session is REFUSED, never run with a
// weaker anchor and a note: a device offering only the bare set (anchorSet without anchorOpen),
// or no anchor at all, or no certified key to open it against. A session with no hardware root
// bound has no device anchor to require ("none"). The relayed device of a client of the
// machine's owner (relayed-anchor.ts) qualifies: it opens the session end to end through the
// owner.

import type { AnchorCapableDevice } from "./head-anchor.js";

export type SessionAnchorRefusal = "anchor-unauthenticated" | "anchor-unavailable";

export type SessionAnchorDecision =
  | Readonly<{
      ok: true;
      mode: "authenticated";
      device: AnchorCapableDevice;
      devicePublicKey: Buffer;
      relayed: boolean;
    }>
  | Readonly<{ ok: true; mode: "none" }>
  | Readonly<{ ok: false; code: SessionAnchorRefusal; reason: string }>;

export class SessionAnchorRefused extends Error {
  constructor(
    readonly code: SessionAnchorRefusal,
    message: string,
  ) {
    super(message);
    this.name = "SessionAnchorRefused";
  }
}

function hasFn(o: unknown, name: string): boolean {
  return (
    typeof o === "object" &&
    o !== null &&
    typeof (o as Record<string, unknown>)[name] === "function"
  );
}

/**
 * Decide a session's anchor. `bound`: a hardware root is bound to this session (this process
 * owns the devices, or is a client of the owner). `device`: what anchors for it, and
 * `devicePublicKey` the certified key a session is opened against.
 */
export function decideSessionAnchor(input: {
  bound: boolean;
  device: unknown;
  devicePublicKey: Buffer | null;
  relayed?: boolean;
}): SessionAnchorDecision {
  if (!input.bound) {
    return { ok: true, mode: "none" };
  }
  const d = input.device;
  if (hasFn(d, "anchorOpen") && hasFn(d, "anchorGet")) {
    if (!input.devicePublicKey || input.devicePublicKey.length !== 32) {
      return {
        ok: false,
        code: "anchor-unavailable",
        reason:
          "the session's hardware root has no certified device key to open the audit anchor against",
      };
    }
    return {
      ok: true,
      mode: "authenticated",
      device: d as AnchorCapableDevice,
      devicePublicKey: Buffer.from(input.devicePublicKey),
      relayed: input.relayed === true,
    };
  }
  if (hasFn(d, "anchorSet")) {
    return {
      ok: false,
      code: "anchor-unauthenticated",
      reason:
        "the session's hardware root can only anchor without authentication, which any process of this user could use to anchor a log of its choosing: refusing the session",
    };
  }
  return {
    ok: false,
    code: "anchor-unavailable",
    reason:
      "the session's hardware root offers no authenticated audit anchor (the device is not CLEAN, or nothing relays it): refusing the session",
  };
}

/** The decision, or SessionAnchorRefused for a bound session that cannot anchor with authentication. */
export function requireSessionAnchor(
  decision: SessionAnchorDecision,
): Exclude<SessionAnchorDecision, { ok: false }> {
  if (!decision.ok) {
    throw new SessionAnchorRefused(decision.code, decision.reason);
  }
  return decision;
}
