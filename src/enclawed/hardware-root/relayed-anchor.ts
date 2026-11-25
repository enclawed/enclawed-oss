// The authenticated audit anchor for a CLIENT of the machine's device owner (the broker).
//
// A client drives no device: the owner relays for it. The owner is untrusted transport, so the
// client runs the whole authenticated anchor session itself (AnchorSession, enclaweder-hid.ts)
// over relayed frames:
//
//   open        the client's X25519 half and nonce go out; the device's answer is signed over a
//               transcript that carries both, under the PRIMARY member's certified key (verified
//               at connectRoot). An owner that relays to another device, replays an earlier
//               open, or answers itself fails the signature ("bad-signature"). The session key
//               is derived here and never crosses the wire: the owner sees no secret.
//   set         MAC'd under the session key; the device's record must be signed by the certified
//               key, name this session and carry this head ("bad-record" otherwise), so a record
//               the owner forges, replays from another session or for another head is refused.
//   keepalive,  MAC'd under the session key; only the device holding this session accepts them.
//   close
//   get         the device's current record, signed by the certified key. ANCHOR_GET carries
//               no nonce of the client's, so through a relay it is not fresh (an owner could
//               hand back an older genuine record): the relayed read reports itself unavailable,
//               and a reader falls back to its stored copy, marked "offline", never "device".
//   read        command set 0.5 (ANCHOR_READ): the current record signed over THIS client's
//               nonce, so the relayed read is fresh and the reader reports it as "device". A
//               device before 0.5 answers ERR_UNSUPPORTED and the reader falls back as above.
//   bound open  command set 0.5 (ANCHOR_OPEN_BOUND): presents this launch's activation nonce,
//               SEALED to the device (SEAL_OPEN / SEALED), so the owner never sees the nonce and
//               cannot spend the activation on a session of its own; the answer is signed over
//               the client's own X25519 half and nonce, as for open.
//
// Another process of the user that holds the device's anchor session makes the client's open
// fail with ERR_BUSY, and one that takes the channel over while the client holds it makes the
// client's next set fail with ERR_AUTH and its reopen skip a session id: the BUSY and HIJACKED
// alarms of head-anchor.ts, exactly as for a process that drives the device itself. Every frame
// re-checks that this client's view of the root is CLEAN, before and after the device answers: a
// DIRTY or lost root refuses.

import { CS05 } from "./activation.js";
import type { AnchorRelayType, RemoteRoot, RootHealth } from "./broker.js";
import { CS04, openSeal, sealFrame } from "./device-factors.js";
import {
  type AnchorFrameDevice,
  type AnchorResponse,
  AnchorSession,
  ANCHOR_OPEN_TIMEOUT_MS,
} from "./enclaweder-hid.js";
import type { AnchorCapableDevice } from "./head-anchor.js";

const RELAYED: ReadonlySet<number> = new Set([0x17, 0x19, 0x1a, 0x1b]);

/** What the relay needs from the client's connection to the owner. */
export type AnchorRelayRoot = Pick<RemoteRoot, "members" | "relayAnchor"> &
  Partial<Pick<RemoteRoot, "relaySealed">>;

/** A relayed anchor read cannot be fresh (see the header); the reader falls back to "offline". */
export class RelayedAnchorReadError extends Error {
  constructor() {
    super(
      "the device's anchor cannot be read freshly through the hardware root's owner (the read carries no nonce of this process)",
    );
    this.name = "RelayedAnchorReadError";
  }
}

export type RelayedAnchorDevice = AnchorCapableDevice & {
  readonly relayed: true;
  /** The certified primary member's key, the only key a session may be opened against. */
  readonly devicePublicKey: Buffer;
};

/**
 * The client's anchor device through the owner. `health` is this process's view of the root (it
 * must turn non-CLEAN when the owner is lost or replaced). Null when the root is not CLEAN or has
 * no certified primary member.
 */
export function relayedAnchorDevice(
  root: AnchorRelayRoot,
  health: () => RootHealth,
): RelayedAnchorDevice | null {
  const primary = root.members[0];
  if (!primary || health().status !== "CLEAN") {
    return null;
  }
  const certifiedPub = Buffer.from(primary.pubkey, "hex");
  const uid = Buffer.from(primary.uid, "hex");
  const assertClean = () => {
    const h = health();
    if (h.status !== "CLEAN") {
      throw new Error(`hardware root ${h.status}: ${h.reason}`);
    }
  };
  const frames: AnchorFrameDevice = {
    async request(type, _id, payload = Buffer.alloc(0)) {
      if (!RELAYED.has(type)) {
        throw new Error(
          `command 0x${type.toString(16)} is not relayed through the hardware root's owner`,
        );
      }
      assertClean();
      const ans = await root.relayAnchor(type as AnchorRelayType, payload);
      // A root that went DIRTY (or was lost) while the device answered refuses the answer too.
      assertClean();
      return ans.length === 0 ? null : { payload: ans };
    },
    sendNoWait(type, payload) {
      if (RELAYED.has(type)) {
        void root.relayAnchor(type as AnchorRelayType, payload).catch(() => undefined);
      }
    },
  };
  return {
    relayed: true,
    devicePublicKey: Buffer.from(certifiedPub),
    async anchorOpen(devicePublicKey: Buffer): Promise<AnchorSession> {
      if (!Buffer.from(devicePublicKey).equals(certifiedPub)) {
        throw new Error(
          "audit anchor: a session through the owner opens only against the certified primary member's key",
        );
      }
      assertClean();
      return AnchorSession.open(frames, certifiedPub, ANCHOR_OPEN_TIMEOUT_MS);
    },
    async anchorGet(): Promise<AnchorResponse | null> {
      throw new RelayedAnchorReadError();
    },
    async anchorRead(nonce32: Buffer): Promise<Buffer> {
      assertClean();
      const ans = await root.relayAnchor(CS05.ANCHOR_READ, nonce32);
      assertClean();
      return ans;
    },
    ...(root.relaySealed
      ? {
          async anchorOpenBound(devicePublicKey: Buffer, activationNonce: Buffer) {
            if (!Buffer.from(devicePublicKey).equals(certifiedPub)) {
              throw new Error(
                "audit anchor: a session through the owner opens only against the certified primary member's key",
              );
            }
            const relaySealed = root.relaySealed!;
            assertClean();
            return AnchorSession.openBound(frames, certifiedPub, activationNonce, {
              send: async (request) => {
                const seal = await openSeal(relaySealed, certifiedPub, uid);
                const ans = await relaySealed(
                  CS04.SEALED,
                  sealFrame(seal, CS05.ANCHOR_OPEN_BOUND, request),
                );
                assertClean();
                // A device before command set 0.5 refuses the sealed op (ERR_BAD_ARG): report it
                // as unsupported, so the logger opens plainly as before.
                return ans.length === 1 && ans[0] === 1 ? Buffer.from([8]) : ans;
              },
            });
          },
        }
      : {}),
  };
}
