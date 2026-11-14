// Swarm principals and the keys they sign with.
//
// Two kinds of key:
//   device    the key lives in an Enclaweder and never leaves it. Signatures
//             go through the hardware-root driver and verify against the
//             public key from the device identity.
//   software  an in-process Ed25519 key, for development and tests. A genesis
//             with requireDeviceKeys refuses these for coordinators and admins.
//
// Only ever hand a device signer digests this process built itself, never a
// value chosen by a remote party: whatever the device signs is a signature
// someone else can reuse.

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  type KeyObject,
} from "node:crypto";
import { rawEd25519ToPem, verifyChallenge } from "../hardware-root/enclaweder-hid.js";

export type KeyKind = "device" | "software";

export type SwarmPrincipalKey = {
  id: string;
  kind: KeyKind;
  /** Raw 32-byte Ed25519 public key, hex. */
  publicKey: string;
  /** Device uid (12 bytes, hex); required for device keys, part of what the device signs. */
  uid?: string;
  /**
   * Further Enclaweders of the same principal (a node with several devices
   * signs through all of them, for throughput). Any one of them may sign for
   * the principal; the admin approval of the key covers the whole list.
   */
  members?: DeviceMemberKey[];
};

/** One more device of a multi-device principal. */
export type DeviceMemberKey = { publicKey: string; uid: string };

/** At most this many devices per principal. */
export const MAX_DEVICE_MEMBERS = 16;

export interface SwarmSigner {
  readonly key: SwarmPrincipalKey;
  /** Sign a digest this process built. Returns the signature as hex. */
  sign(digest32: Buffer): Promise<string>;
}

const SOFTWARE_TAG = Buffer.from("ENCLAWED-SWARM-SW-01");
const HEX64 = /^[0-9a-f]{64}$/;
const HEX24 = /^[0-9a-f]{24}$/;

function rawPublicKey(pub: KeyObject): Buffer {
  const jwk = pub.export({ format: "jwk" });
  return Buffer.from(String(jwk.x), "base64url");
}

/** In-process Ed25519 signer. Development and tests only. */
export function softwareSigner(
  id: string,
  privateKeyPem?: string,
): SwarmSigner & { privateKeyPem: string } {
  let priv: KeyObject;
  if (privateKeyPem) {
    priv = createPrivateKey(privateKeyPem);
  } else {
    priv = generateKeyPairSync("ed25519").privateKey;
  }
  const key: SwarmPrincipalKey = {
    id,
    kind: "software",
    publicKey: rawPublicKey(createPublicKey(priv)).toString("hex"),
  };
  return {
    key,
    privateKeyPem: priv.export({ format: "pem", type: "pkcs8" }),
    async sign(digest32) {
      return edSign(null, Buffer.concat([SOFTWARE_TAG, digest32]), priv).toString("hex");
    },
  };
}

/** The slice of an Enclaweder a device signer needs. `Enclaweder` satisfies it. */
export type SigningDevice = {
  getIdentity(): Promise<{ uid: Buffer; pubkeyRaw: Buffer }>;
  challenge(nonce32: Buffer): Promise<{ uid: Buffer; sig: Buffer }>;
};

/** Signer whose key is held by an Enclaweder. */
export async function deviceSigner(id: string, device: SigningDevice): Promise<SwarmSigner> {
  const ident = await device.getIdentity();
  const key: SwarmPrincipalKey = {
    id,
    kind: "device",
    publicKey: ident.pubkeyRaw.toString("hex"),
    uid: ident.uid.toString("hex"),
  };
  return {
    key,
    async sign(digest32) {
      const res = await device.challenge(digest32);
      if (!res.uid.equals(ident.uid)) {
        throw new Error("swarm device signer: device uid changed mid-session");
      }
      return res.sig.toString("hex");
    },
  };
}

/**
 * Several Enclaweders bound as one, as Enclawed's bootstrap binds them: each
 * call runs on the least-loaded CLEAN member.
 */
export type SigningFleet = {
  readonly members: readonly { uid: string; pubkey: string }[];
  run<T>(fn: (dev: SigningDevice) => Promise<T>): Promise<T>;
};

/**
 * Signer whose principal is every device of a fleet: the first member's key
 * is the principal's primary key, the rest are its members, and each
 * signature comes from whichever device the fleet dispatches it to. A
 * signature by a member other than the primary carries that member's uid
 * ("uid:sig") so a verifier knows which key to check.
 */
export function fleetSigner(id: string, fleet: SigningFleet): SwarmSigner {
  const [primary, ...rest] = fleet.members;
  if (!primary) {
    throw new Error("swarm fleet signer: the fleet has no members");
  }
  if (rest.length > MAX_DEVICE_MEMBERS) {
    throw new Error(`swarm fleet signer: more than ${MAX_DEVICE_MEMBERS} devices`);
  }
  const known = new Set(fleet.members.map((m) => m.uid));
  const key: SwarmPrincipalKey = {
    id,
    kind: "device",
    publicKey: primary.pubkey,
    uid: primary.uid,
    ...(rest.length > 0 ? { members: rest.map((m) => ({ publicKey: m.pubkey, uid: m.uid })) } : {}),
  };
  return {
    key,
    async sign(digest32) {
      const res = await fleet.run((dev) => dev.challenge(digest32));
      const uid = res.uid.toString("hex");
      if (!known.has(uid)) {
        throw new Error("swarm fleet signer: a device outside the fleet answered");
      }
      const sig = res.sig.toString("hex");
      return uid === primary.uid ? sig : `${uid}:${sig}`;
    },
  };
}

/** Shape check for a principal key read off the wire or out of a genesis file. */
export function isPrincipalKey(value: unknown): value is SwarmPrincipalKey {
  if (!value || typeof value !== "object") {
    return false;
  }
  const k = value as Record<string, unknown>;
  if (typeof k.id !== "string" || k.id.length === 0 || k.id.length > 128) {
    return false;
  }
  if (typeof k.publicKey !== "string" || !HEX64.test(k.publicKey)) {
    return false;
  }
  if (k.kind === "device") {
    if (typeof k.uid !== "string" || !HEX24.test(k.uid)) {
      return false;
    }
    if (k.members === undefined) {
      return true;
    }
    if (
      !Array.isArray(k.members) ||
      k.members.length === 0 ||
      k.members.length > MAX_DEVICE_MEMBERS
    ) {
      return false;
    }
    const uids = new Set([k.uid]);
    for (const m of k.members as unknown[]) {
      const mm = m as Record<string, unknown> | null;
      if (
        !mm ||
        typeof mm.publicKey !== "string" ||
        !HEX64.test(mm.publicKey) ||
        typeof mm.uid !== "string" ||
        !HEX24.test(mm.uid) ||
        uids.has(mm.uid)
      ) {
        return false;
      }
      uids.add(mm.uid);
    }
    return true;
  }
  return k.kind === "software" && k.uid === undefined && k.members === undefined;
}

export function verifyDigest(key: SwarmPrincipalKey, digest32: Buffer, sigHex: string): boolean {
  if (typeof sigHex !== "string") {
    return false;
  }
  // "uid:sig" names the device of a multi-device principal that signed.
  const tagged = /^([0-9a-f]{24}):([0-9a-f]{128})$/.exec(sigHex);
  if (!tagged && !/^[0-9a-f]{128}$/.test(sigHex)) {
    return false;
  }
  if (tagged && key.kind !== "device") {
    return false;
  }
  const sig = Buffer.from(tagged ? tagged[2] : sigHex, "hex");
  try {
    if (key.kind === "device") {
      const member = tagged
        ? [{ publicKey: key.publicKey, uid: key.uid ?? "" }, ...(key.members ?? [])].find(
            (m) => m.uid === tagged[1],
          )
        : { publicKey: key.publicKey, uid: key.uid ?? "" };
      if (!member) {
        return false;
      }
      return verifyChallenge(
        Buffer.from(member.publicKey, "hex"),
        digest32,
        Buffer.from(member.uid, "hex"),
        sig,
      );
    }
    const pub = Buffer.from(key.publicKey, "hex");
    return edVerify(
      null,
      Buffer.concat([SOFTWARE_TAG, digest32]),
      createPublicKey(rawEd25519ToPem(pub)),
      sig,
    );
  } catch {
    return false;
  }
}
