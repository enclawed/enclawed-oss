// The device-unlock ticket signer (credential role "device-unlock-signer"): the key an
// adapter makes to sign device-unlock tickets in its device-factor store (Enclawed Code's
// device activation). It is no second factor: it verifies a ticket only on the framework's
// device-unlock path, only in a device-factor store, and only when the device-counted grant
// bound to that ticket is then spent. Everywhere else it is refused. No real device: a
// stand-in answers the public host protocol with a per-test key.

import { createHash, generateKeyPairSync, sign as edSign, type KeyObject } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FLAGS, authData, coseFor, signWith } from "../auth/fixtures.test-support.js";
import { TransportDouble } from "../auth/fixtures.test-support.js";
import {
  type AuthAuditEvent,
  type AuthContext,
  SecondFactorError,
  assertSecondFactor,
  assertSessionStartForDeviceUnlock,
  enrollSecurityKey,
  removeSecurityKey,
  secondFactorStatus,
  unlockForHeadlessStart,
} from "../auth/gate.js";
import { readAuthStore, type EnrolledCredential } from "../auth/store.js";
import {
  currentBinding,
  newTicketBody,
  ticketChallenge,
  writeSignedTicket,
} from "../auth/ticket.js";
import { testPackedTrust } from "../auth/vectors.test-support.js";
import { b64url } from "../auth/webauthn.js";
import {
  TAG_UNLOCK_GRANT,
  TAG_UNLOCK_STATE,
  TAG_UNLOCK_USE,
} from "../hardware-root/device-factors.js";
import type { LatchFrameDevice } from "../hardware-root/device-latch.js";
import {
  activateSession,
  deviceActivation,
  frameworkDeviceTotp,
  issueDeviceUnlock,
  unlockTicketBinding,
  type DeviceTotpSeam,
} from "./session.js";

const RP = "enclawed.local";
const ORIGIN = `enclawed-cli://${RP}`;
const JOB = {
  name: "test-job",
  measurementDigest: "1".repeat(64),
  policyDigest: "2".repeat(64),
  projectDigest: "3".repeat(64),
  kind: "headless:print",
};
const BOUND = currentBinding();

let stateDir: string;
let events: AuthAuditEvent[];

beforeEach(() => {
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-unlock-signer-"));
  events = [];
});
afterEach(() => {
  fs.rmSync(stateDir, { recursive: true, force: true });
});

const authDir = () => path.join(stateDir, "auth");

function fakeDevice(o: { code?: string; uses?: number; replay?: boolean } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = Buffer.from(publicKey.export({ format: "der", type: "spki" }).subarray(12));
  const uid = Buffer.alloc(12, 7);
  let grant: { gid: bigint; uses: number; used: number; scope: Buffer } | null = null;
  let lastUse: Buffer | null = null;
  const body = (kind: number, state: number, scope: Buffer, useIndex: number) => {
    const b = Buffer.alloc(100);
    b[0] = 1;
    b[1] = state;
    b[3] = kind;
    b.writeUInt16LE(grant?.uses ?? 0, 4);
    b.writeUInt16LE(grant?.used ?? 0, 6);
    b.writeBigUInt64LE(grant?.gid ?? 0n, 8);
    b.writeBigUInt64LE(3n, 16);
    b.writeUInt32LE(60000, 24);
    b.writeBigUInt64LE(BigInt(Math.floor(Date.now() / 1000)), 40);
    b.writeUInt16LE(useIndex, 52);
    uid.copy(b, 56);
    scope.copy(b, 68);
    return b;
  };
  const answer = (status: number, tag: Buffer, nonce: Buffer, b: Buffer) =>
    Buffer.concat([
      Buffer.from([status]),
      b,
      edSign(null, Buffer.concat([tag, nonce, b]), privateKey),
    ]);
  const dev: LatchFrameDevice = {
    async request(type, _id, payload = Buffer.alloc(0)) {
      const nonce = payload.subarray(0, 32);
      if (type === 0x30) {
        const code = String(payload.readUInt32LE(32)).padStart(6, "0");
        if (code !== (o.code ?? "123456")) {
          return { payload: Buffer.from([5, 0, 0, 0, 0]) };
        }
        const scope = Buffer.from(payload.subarray(32 + 4 + 8 + 2 + 4, 32 + 4 + 8 + 2 + 4 + 32));
        grant = { gid: 42n, uses: payload.readUInt16LE(44), used: 0, scope };
        return { payload: answer(0, TAG_UNLOCK_GRANT, nonce, body(1, 1, scope, 0)) };
      }
      if (type === 0x31) {
        const gid = payload.readBigUInt64LE(32);
        const scope = Buffer.from(payload.subarray(48, 80));
        if (!grant || grant.used >= grant.uses) {
          return { payload: answer(2, TAG_UNLOCK_STATE, nonce, body(3, 2, scope, 0)) };
        }
        if (gid !== grant.gid || !scope.equals(grant.scope)) {
          return { payload: Buffer.from([5]) };
        }
        if (o.replay && lastUse) {
          // A relay replaying the device's earlier receipt instead of asking it.
          return { payload: lastUse };
        }
        grant.used++;
        lastUse = answer(0, TAG_UNLOCK_USE, nonce, body(2, 1, scope, grant.used));
        return { payload: lastUse };
      }
      return null;
    },
  };
  const seam: DeviceTotpSeam = {
    ...frameworkDeviceTotp,
    access: () => ({ pubkeyRaw: pub, uid, cert: Buffer.alloc(0), run: (fn) => fn(dev) }),
    enrolled: async () => true,
  };
  return { seam, used: () => grant?.used ?? 0 };
}

/** The signer as an adapter makes it (Enclawed Code deviceTicketSigner), with its role. */
function makeSigner(role: EnrolledCredential["role"] = "device-unlock-signer") {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const aaguid = "00000000-0000-0000-0000-0000000ec0d0";
  const credential: EnrolledCredential = {
    id: "ec0d0001",
    label: "device-unlock ticket signer (not a factor)",
    credentialId: b64url(createHash("sha256").update("signer").digest()),
    ...(role ? { role } : {}),
    alg: -7,
    publicKeyCose: b64url(coseFor(publicKey)),
    signCount: 1,
    aaguid,
    attestation: {
      fmt: "packed",
      aaguid,
      certSha256: "0".repeat(64),
      certSubject: "CN=Enclawed Code device-unlock ticket signer",
      certIssuer: "CN=Enclawed Code",
      allowedAs: null,
    },
    enrolledAt: Date.now(),
    lastUsedAt: null,
  };
  return { credential, privateKey };
}

function writeStore(credentials: EnrolledCredential[]): void {
  fs.mkdirSync(authDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(authDir(), "factors.json"),
    JSON.stringify({ v: 1, rpId: RP, credentials, failures: 0, lockedUntil: null }),
    { mode: 0o600 },
  );
}

/** A session-start ticket signed by the signer's key (no prompt), as the adapter writes it. */
function signTicket(s: { credential: EnrolledCredential; privateKey: KeyObject }, uses = 3) {
  const body = newTicketBody({
    rpId: RP,
    binding: BOUND!,
    minutes: 10,
    uses,
    credential: s.credential,
    now: Date.now(),
  });
  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: "webauthn.get",
      challenge: b64url(ticketChallenge(body)),
      origin: ORIGIN,
    }),
  );
  const raw = authData({ rpId: RP, flags: FLAGS.UP | FLAGS.UV, signCount: 2 });
  const cdh = createHash("sha256").update(clientDataJSON).digest();
  writeSignedTicket(authDir(), {
    body,
    clientDataJSON,
    authDataRaw: raw,
    signature: signWith(s.privateKey, Buffer.concat([raw, cdh])),
  });
  return body;
}

function ctx(extra: Partial<AuthContext> = {}): AuthContext {
  return {
    stateDir,
    transport: new TransportDouble(),
    audit: async (e) => {
      events.push(e);
    },
    interactive: false,
    say: () => {},
    packedTrust: testPackedTrust(),
    ...extra,
  };
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof SecondFactorError) {
      return err.code;
    }
    return `error:${(err as Error).message}`;
  }
  return "no-error";
}

async function grantFor(d: ReturnType<typeof fakeDevice>, body: ReturnType<typeof signTicket>) {
  const g = await issueDeviceUnlock({
    host: "h",
    ticket: unlockTicketBinding(body),
    job: JOB,
    code: "123456",
    uses: 3,
    leaseS: 600,
    device: d.seam,
  });
  if (!g.ok) {
    throw new Error("grant");
  }
  return g.grant;
}

describe.skipIf(BOUND === null)("the device-unlock ticket signer (not a second factor)", () => {
  it("the one allowed use: a headless launch whose device-counted grant bound to the signer's ticket is spent", async () => {
    const s = makeSigner();
    writeStore([s.credential]);
    const body = signTicket(s);
    const d = fakeDevice({ uses: 3 });
    const grant = await grantFor(d, body);
    const r = await activateSession(ctx(), {
      device: d.seam,
      bound: true,
      unlock: grant,
      job: JOB,
      host: "h",
    });
    expect(r.via).toBe("ticket");
    expect(r.device).toBe("device-unlock");
    expect(d.used()).toBe(1);
    const verified = events.find((e) => e.type === "auth.second-factor");
    expect(verified?.payload).toMatchObject({ deviceUnlockSigner: true, credential: "ec0d0001" });
  });

  it("refused without the device's grant: no grant, a grant for another ticket, no device, or the gate's result used alone", async () => {
    const s = makeSigner();
    writeStore([s.credential]);
    const body = signTicket(s);
    const d = fakeDevice({ uses: 3 });
    // No stored grant: the ordinary gate, where the signer is no credential at all.
    expect(
      await codeOf(
        activateSession(ctx(), { device: d.seam, bound: true, unlock: null, host: "h" }),
      ),
    ).toBe("no-ticket");
    // A grant bound to another ticket: the device refuses the scope, nothing is spent.
    const other = await grantFor(d, { ...body, nonce: "f".repeat(32) });
    signTicket(s);
    expect(
      await codeOf(
        activateSession(ctx(), { device: d.seam, bound: true, unlock: other, job: JOB, host: "h" }),
      ),
    ).toBe("no-ticket");
    // The gate's result for a signer ticket, handed to deviceActivation without a device or grant.
    const body2 = signTicket(s);
    const grant2 = await grantFor(d, body2);
    const r = await assertSessionStartForDeviceUnlock(
      ctx({
        deviceFactor: {
          kind: "device-totp",
          label: "d",
          enrolled: async () => true,
          verify: async () => ({ ok: false, code: "x" }),
        },
      }),
      {},
    );
    expect(r.deviceUnlockSigner).toBe(true);
    await expect(
      deviceActivation(r, ctx(), { seam: null, host: "h", unlock: grant2 }),
    ).rejects.toThrow(/not a second factor/);
    await expect(
      deviceActivation(r, ctx(), {
        seam: { ...d.seam, access: () => null },
        host: "h",
        unlock: grant2,
      }),
    ).rejects.toThrow(/not a second factor/);
    await expect(
      deviceActivation(r, ctx(), { seam: d.seam, host: "h", unlock: null }),
    ).rejects.toThrow(/not a second factor/);
    await expect(
      deviceActivation({ ...r, via: "fido2" }, ctx(), { seam: d.seam, host: "h", unlock: grant2 }),
    ).rejects.toThrow(/not a second factor/);
  });

  it("the ordinary gate refuses a signer ticket for every purpose, headless or not", async () => {
    const s = makeSigner();
    writeStore([s.credential]);
    signTicket(s);
    const device = {
      kind: "device-totp" as const,
      label: "d",
      enrolled: async () => true,
      verify: async () => ({ ok: false as const, code: "wrong" }),
    };
    expect(
      await codeOf(assertSecondFactor(ctx({ deviceFactor: device }), { purpose: "session-start" })),
    ).toBe("no-ticket");
    for (const purpose of [
      "policy-change",
      "admin",
      "recovery",
      "auth-change",
      "history-restore",
    ] as const) {
      expect(await codeOf(assertSecondFactor(ctx(), { purpose })), purpose).toBe("not-enrolled");
      expect(
        await codeOf(assertSecondFactor(ctx({ interactive: true }), { purpose })),
        purpose,
      ).toBe("not-enrolled");
    }
  });

  it("only in a device-factor store: beside a counted credential the signer verifies nothing", async () => {
    // A counted security key (test trust) and the signer in one store.
    await enrollSecurityKey(ctx({ interactive: true }), { label: "person" });
    const s = makeSigner();
    writeStore([...readAuthStore(authDir(), RP).credentials, s.credential]);
    const body = signTicket(s);
    const d = fakeDevice({ uses: 3 });
    const grant = await grantFor(d, body);
    expect(
      await codeOf(
        activateSession(ctx(), { device: d.seam, bound: true, unlock: grant, job: JOB, host: "h" }),
      ),
    ).toBe("no-ticket");
    expect(d.used()).toBe(0);
  });

  it("never a factor elsewhere: no unlock, no enrollment authorization, no removal, not reported as a legacy enrollment", async () => {
    const s = makeSigner();
    writeStore([s.credential]);
    // Unlock without the device: nothing counted can sign a ticket.
    expect(await codeOf(unlockForHeadlessStart(ctx({ interactive: true }), { minutes: 5 }))).toBe(
      "not-enrolled",
    );
    // It is no legacy credential: it authorizes no enrollment (first-enrollment rules, no auth-change).
    events = [];
    await enrollSecurityKey(ctx({ interactive: true }), { label: "person" });
    expect(events.some((e) => e.payload.purpose === "auth-change")).toBe(false);
    expect(events.at(-1)?.payload).not.toHaveProperty("authorizedByLegacyCredential");
    // The enrolled credential has no role: enrollment never makes a signer.
    const enrolled = readAuthStore(authDir(), RP).credentials.find((c) => c.id !== "ec0d0001");
    expect(enrolled?.role).toBeUndefined();
    // Status names no "not a second factor" refusal for it, and does not count it.
    const st = await secondFactorStatus(ctx());
    expect(st.warnings.join("\n")).not.toMatch(/ec0d0001/);
    expect(st.warnings.join("\n")).toMatch(/only one security key is enrolled/);
    // Removing the person's only key is still refused as the last factor (the signer does not count).
    const person = enrolled!.id;
    expect(await codeOf(removeSecurityKey(ctx({ interactive: true }), { id: person }))).toBe(
      "last-factor",
    );
  });

  it("a store with an unknown role is refused as malformed", async () => {
    const s = makeSigner();
    writeStore([{ ...s.credential, role: "factor" as never }]);
    expect(await codeOf(assertSecondFactor(ctx(), { purpose: "admin" }))).toBe("store-invalid");
  });
});
