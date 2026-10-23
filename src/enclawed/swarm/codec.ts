// Canonical encoding and domain-separated digests for the swarm ledger.
//
// Every signed swarm object is hashed as sha256(tag || 0x00 || canonicalJson(value)).
// The tag keeps a signature over one kind of object from ever verifying as
// another, which matters because device keys sign raw 32-byte digests (see
// signer.ts).

import { createHash } from "node:crypto";

const PROTO_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** Sorted-key JSON. Refuses values that have no single canonical form. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("swarm codec: non-finite number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => !PROTO_KEYS.has(k) && obj[k] !== undefined)
      .toSorted();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
  }
  throw new TypeError(`swarm codec: cannot encode ${typeof value}`);
}

export function digest(tag: string, value: unknown): Buffer {
  return createHash("sha256").update(tag).update("\0").update(canonicalJson(value)).digest();
}

export function digestHex(tag: string, value: unknown): string {
  return digest(tag, value).toString("hex");
}

export const TAG = {
  genesis: "ENCLAWED-SWARM-GENESIS-01",
  block: "ENCLAWED-SWARM-BLOCK-01",
  txs: "ENCLAWED-SWARM-TXS-01",
  statement: "ENCLAWED-SWARM-STATEMENT-01",
  join: "ENCLAWED-SWARM-JOIN-01",
  approval: "ENCLAWED-SWARM-APPROVAL-01",
  heartbeat: "ENCLAWED-SWARM-HEARTBEAT-01",
  ready: "ENCLAWED-SWARM-READY-01",
  epoch: "ENCLAWED-SWARM-EPOCH-01",
} as const;

export const ZERO_HASH = "0".repeat(64);
