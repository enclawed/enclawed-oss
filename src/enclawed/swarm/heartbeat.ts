// Device-signed node heartbeats.
//
// A node signs each heartbeat with its Enclaweder, so a heartbeat proves the
// genuine device was present when it was sent. A heartbeat reporting DIRTY is
// self-incriminating evidence: any coordinator can put it on chain to evict the
// node, and every other coordinator can check it without trusting the sender.

import { digest, TAG } from "./codec.js";
import { verifyDigest, type SwarmPrincipalKey, type SwarmSigner } from "./signer.js";
import type { HeartbeatBody, SignedHeartbeat } from "./types.js";

export function heartbeatDigest(body: HeartbeatBody): Buffer {
  return digest(TAG.heartbeat, body);
}

export async function signHeartbeat(
  signer: SwarmSigner,
  body: HeartbeatBody,
): Promise<SignedHeartbeat> {
  if (body.nodeId !== signer.key.id) {
    throw new Error("swarm heartbeat: nodeId does not match the signing key");
  }
  return { body, sig: await signer.sign(heartbeatDigest(body)) };
}

export function verifyHeartbeat(key: SwarmPrincipalKey, hb: SignedHeartbeat): boolean {
  if (!hb || typeof hb !== "object" || !hb.body || hb.body.nodeId !== key.id) {
    return false;
  }
  const b = hb.body;
  if (
    !Number.isSafeInteger(b.seq) ||
    b.seq < 0 ||
    !Number.isSafeInteger(b.epoch) ||
    !Number.isFinite(b.time) ||
    (b.status !== "CLEAN" && b.status !== "DIRTY")
  ) {
    return false;
  }
  return verifyDigest(key, heartbeatDigest(b), hb.sig);
}
