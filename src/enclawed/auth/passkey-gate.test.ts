// The gate with a device-bound passkey reached through the loopback page.
// The ceremony is a test double holding software keys (like
// TransportDouble): it answers in the browser's wire format, so the gate's
// policy is exercised end to end (enrollment, assertion, counters, origin and
// RP binding, replay, tickets, auditing). The platform attestation formats
// themselves are verified in attestation-platform.test.ts; the double attests
// with "packed" under the test CA, which the gate accepts through the page
// like any other attested authenticator.

import { createHash, generateKeyPairSync, type KeyObject, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseAuthConfig } from "./config.js";
import {
  FLAGS,
  TransportDouble,
  authData,
  cborEncode,
  coseFor,
  signWith,
  testLeafDer,
  testLeafKey,
} from "./fixtures.test-support.js";
import {
  type AuthAuditEvent,
  type AuthContext,
  SecondFactorError,
  assertSecondFactor,
  enrollPasskey,
  enrollSecurityKey,
  unlockForHeadlessStart,
} from "./gate.js";
import type { LoopbackCeremonyRequest, LoopbackCeremonyResult } from "./loopback-ceremony.js";
import { type PasskeyCeremony, PasskeyUnavailableError } from "./passkey.js";
import { PLATFORM_VECTORS } from "./platform-vectors.test-support.js";
import { readAuthStore } from "./store.js";
import { currentBinding } from "./ticket.js";
import { TEST_AAGUID } from "./vectors.test-support.js";

type Held = { id: Uint8Array; key: KeyObject; counter: number };

/** A platform authenticator behind the loopback page, as a test double. */
class PlatformDouble {
  readonly held: Held[] = [];
  readonly answers: LoopbackCeremonyResult[] = [];
  port = 40000 + Math.floor(Math.random() * 20000);
  flags = FLAGS.UP | FLAGS.UV;
  counterStep = 1;
  rpId = "localhost";
  /** Origin the page reports (the server's) and origin the client data names (the browser's). */
  reportedOrigin: string | null = null;
  clientOrigin: string | null = null;
  replay: LoopbackCeremonyResult | null = null;
  unavailable = false;
  readonly requests: LoopbackCeremonyRequest[] = [];

  get origin(): string {
    return `http://localhost:${this.port}`;
  }

  ceremony: PasskeyCeremony = async (req) => {
    this.requests.push(req);
    if (this.unavailable) {
      throw new PasskeyUnavailableError("no browser can reach the page");
    }
    if (this.replay) {
      return this.replay;
    }
    const origin = this.reportedOrigin ?? this.origin;
    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: req.kind === "create" ? "webauthn.create" : "webauthn.get",
        challenge: Buffer.from(req.challenge).toString("base64url"),
        origin: this.clientOrigin ?? this.origin,
        crossOrigin: false,
      }),
    );
    const cdh = createHash("sha256").update(clientDataJSON).digest();
    let out: LoopbackCeremonyResult;
    if (req.kind === "create") {
      const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
      const id = new Uint8Array(randomBytes(32));
      this.held.push({ id, key: pair.privateKey, counter: 0 });
      const raw = authData({
        rpId: this.rpId,
        flags: this.flags | FLAGS.AT,
        signCount: 0,
        attested: { aaguid: TEST_AAGUID, credentialId: id, cose: coseFor(pair.publicKey) },
      });
      const sig = signWith(testLeafKey(), Buffer.concat([raw, cdh]));
      const attestationObject = cborEncode(
        new Map<string, Parameters<typeof cborEncode>[0]>([
          ["fmt", "packed"],
          [
            "attStmt",
            new Map<string, Parameters<typeof cborEncode>[0]>([
              ["alg", -7],
              ["sig", sig],
              ["x5c", [testLeafDer()]],
            ]),
          ],
          ["authData", raw],
        ]),
      );
      out = { kind: "create", origin, credentialId: id, clientDataJSON, attestationObject };
    } else {
      const h = this.held.find((x) =>
        req.allowCredentialIds.some((a) => Buffer.compare(Buffer.from(a), Buffer.from(x.id)) === 0),
      );
      if (!h) {
        throw new Error("no matching passkey");
      }
      h.counter += this.counterStep;
      const raw = authData({ rpId: this.rpId, flags: this.flags, signCount: h.counter });
      out = {
        kind: "get",
        origin,
        credentialId: h.id,
        clientDataJSON,
        authenticatorData: raw,
        signature: signWith(h.key, Buffer.concat([raw, cdh])),
      };
    }
    this.answers.push(out);
    return out;
  };
}

let stateDir: string;
let events: AuthAuditEvent[];
let platform: PlatformDouble;

function ctx(extra: Partial<AuthContext> = {}): AuthContext {
  return {
    stateDir,
    transport: new TransportDouble(),
    passkey: platform.ceremony,
    audit: async (e) => {
      events.push(e);
    },
    interactive: true,
    config: parseAuthConfig(undefined),
    say: () => {},
    deviceFactor: null,
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
    throw err;
  }
  return "no-error";
}

const lastRefusal = () => events.findLast((e) => e.payload.outcome === "refused")?.payload.code;

beforeEach(() => {
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-passkey-test-"));
  events = [];
  platform = new PlatformDouble();
});

afterEach(() => {
  fs.rmSync(stateDir, { recursive: true, force: true });
});

describe("gate: device-bound passkeys through the loopback page", () => {
  it("enrolls a passkey as the first factor and passes the gate with it", async () => {
    const r = await enrollPasskey(ctx(), { label: "laptop" });
    expect(r.credential.kind).toBe("passkey");
    expect(platform.requests[0]).toMatchObject({ kind: "create" });
    const store = readAuthStore(path.join(stateDir, "auth"), "enclawed.local");
    expect(store.credentials).toHaveLength(1);
    expect(events.at(-1)?.payload).toMatchObject({ outcome: "enrolled", kind: "passkey" });
    const ok = await assertSecondFactor(ctx(), { purpose: "policy-change" });
    expect(ok).toEqual({ via: "passkey", credential: r.credential.id });
    expect(
      readAuthStore(path.join(stateDir, "auth"), "enclawed.local").credentials[0].signCount,
    ).toBe(1);
  });

  it("refuses at enrollment a backup-eligible passkey, one without UV, or one for another RP", async () => {
    for (const [mutate, want] of [
      [() => (platform.flags = FLAGS.UP | FLAGS.UV | FLAGS.BE), "backup-eligible"],
      [() => (platform.flags = FLAGS.UP), "no-user-verification"],
      [() => (platform.rpId = "enclawed.local"), "rp-mismatch"],
      [() => (platform.clientOrigin = "http://localhost:1"), "origin-mismatch"],
      [() => (platform.reportedOrigin = "https://evil.example"), "origin-mismatch"],
      [
        () => {
          // A consistent answer from a page that is not a loopback page.
          platform.reportedOrigin = "https://evil.example";
          platform.clientOrigin = "https://evil.example";
        },
        "origin-mismatch",
      ],
    ] as const) {
      platform = new PlatformDouble();
      events = [];
      mutate();
      expect(await codeOf(enrollPasskey(ctx(), { label: "laptop" }))).toBe("verification-failed");
      expect(lastRefusal()).toBe(want);
    }
    expect(readAuthStore(path.join(stateDir, "auth"), "enclawed.local").credentials).toHaveLength(
      0,
    );
  });

  it("refuses an assertion whose counter does not increase, and one that never counts", async () => {
    await enrollPasskey(ctx(), { label: "laptop" });
    platform.counterStep = 0;
    expect(await codeOf(assertSecondFactor(ctx(), { purpose: "admin" }))).toBe(
      "verification-failed",
    );
    expect(lastRefusal()).toBe("counter-unsupported");
    platform.counterStep = 1;
    await assertSecondFactor(ctx(), { purpose: "admin" });
    platform.held[0].counter -= 1;
    expect(await codeOf(assertSecondFactor(ctx(), { purpose: "admin" }))).toBe(
      "verification-failed",
    );
    expect(lastRefusal()).toBe("counter-regressed");
  });

  it("refuses a replayed ceremony, a foreign origin, another RP, a missing UV and an unknown passkey", async () => {
    await enrollPasskey(ctx(), { label: "laptop" });
    await assertSecondFactor(ctx(), { purpose: "admin" });
    const captured = platform.answers.at(-1)!;
    for (const [mutate, want] of [
      [() => (platform.replay = captured), "challenge-mismatch"],
      [() => (platform.clientOrigin = "http://localhost:2"), "origin-mismatch"],
      [() => (platform.reportedOrigin = "http://127.0.0.1:2"), "origin-mismatch"],
      [
        () => {
          platform.reportedOrigin = "http://127.0.0.1:2";
          platform.clientOrigin = "http://127.0.0.1:2";
        },
        "origin-mismatch",
      ],
      [() => (platform.rpId = "evil.example"), "rp-mismatch"],
      [() => (platform.flags = FLAGS.UP), "no-user-verification"],
      [() => (platform.flags = FLAGS.UP | FLAGS.UV | FLAGS.BE), "backup-eligible"],
      [
        () => {
          platform.replay = { ...captured, credentialId: new Uint8Array(32) };
        },
        "unknown-key",
      ],
    ] as const) {
      mutate();
      expect(await codeOf(assertSecondFactor(ctx(), { purpose: "admin" }))).toBe(
        "verification-failed",
      );
      expect(lastRefusal()).toBe(want);
      Object.assign(platform, {
        replay: null,
        clientOrigin: null,
        reportedOrigin: null,
        rpId: "localhost",
        flags: FLAGS.UP | FLAGS.UV,
      });
      // The genuine passkey still works after each refusal (and clears the failure count).
      expect((await assertSecondFactor(ctx(), { purpose: "admin" })).via).toBe("passkey");
    }
  });

  it("a stored counter exemption not backed by a verified TPM statement is refused; a packed passkey keeps the strict counter", async () => {
    const r = await enrollPasskey(ctx(), { label: "laptop" });
    expect(r.credential.counterPolicy).toBeUndefined();
    const dir = path.join(stateDir, "auth");
    const file = path.join(dir, "factors.json");
    const tamper = (extra: Record<string, unknown>) => {
      const st = JSON.parse(fs.readFileSync(file, "utf8")) as {
        credentials: Record<string, unknown>[];
      };
      st.credentials[0] = { ...st.credentials[0], ...extra };
      fs.writeFileSync(file, JSON.stringify(st));
    };
    platform.counterStep = 0;
    for (const extra of [
      { counterPolicy: "tpm-non-exportable" },
      {
        counterPolicy: "tpm-non-exportable",
        // A genuine Windows Hello statement, but for another credential and relying party.
        tpmCounterEvidence: {
          attestationObject: Buffer.from(
            PLATFORM_VECTORS.TPM_SURFACE_PRO_4.attestationObject,
            "base64",
          ).toString("base64url"),
          clientDataHash: Buffer.alloc(32).toString("base64url"),
        },
      },
    ]) {
      tamper(extra);
      expect(await codeOf(assertSecondFactor(ctx(), { purpose: "admin" }))).toBe(
        "verification-failed",
      );
      expect(lastRefusal()).toBe("attestation-invalid");
    }
    tamper({ counterPolicy: undefined, tpmCounterEvidence: undefined });
    expect(await codeOf(assertSecondFactor(ctx(), { purpose: "admin" }))).toBe(
      "verification-failed",
    );
    expect(lastRefusal()).toBe("counter-unsupported");
  });

  it("a page no browser can reach is not an attempt: refused as no-device, no failure counted", async () => {
    await enrollPasskey(ctx(), { label: "laptop" });
    platform.unavailable = true;
    expect(await codeOf(assertSecondFactor(ctx(), { purpose: "admin" }))).toBe("no-device");
    expect(readAuthStore(path.join(stateDir, "auth"), "enclawed.local").failures).toBe(0);
  });

  it("adding a passkey next to a security key needs the security key first", async () => {
    const transport = new TransportDouble();
    await enrollSecurityKey(ctx({ transport }), { label: "primary" });
    transport.plugged = false;
    // No key plugged in and no passkey yet: nothing can prove the existing factor.
    expect(await codeOf(enrollPasskey(ctx({ transport }), { label: "laptop" }))).toBe("no-device");
    transport.plugged = true;
    const r = await enrollPasskey(ctx({ transport }), { label: "laptop" });
    expect(r.total).toBe(2);
    expect(transport.calls).toContain("assert");
  });

  it("enrollment needs a person at the terminal", async () => {
    expect(await codeOf(enrollPasskey(ctx({ interactive: false }), { label: "laptop" }))).toBe(
      "headless",
    );
    expect(platform.requests).toHaveLength(0);
  });

  it.skipIf(currentBinding() === null)(
    "a passkey signs an unlock ticket that a headless session start spends",
    async () => {
      await enrollPasskey(ctx(), { label: "laptop" });
      const t = await unlockForHeadlessStart(ctx(), { minutes: 5, uses: 1 });
      expect(t.usesLeft).toBe(1);
      const r = await assertSecondFactor(ctx({ interactive: false }), { purpose: "session-start" });
      expect(r.via).toBe("ticket");
      expect(
        await codeOf(assertSecondFactor(ctx({ interactive: false }), { purpose: "session-start" })),
      ).toBe("no-ticket");
    },
  );

  it.skipIf(currentBinding() === null)(
    "a passkey ticket signed for any origin but a loopback page is refused",
    async () => {
      await enrollPasskey(ctx(), { label: "laptop" });
      await unlockForHeadlessStart(ctx(), { minutes: 5, uses: 1 });
      // Re-sign the genuine ticket's challenge with the passkey, as a page at another origin would.
      const file = path.join(stateDir, "auth", "unlock-ticket.json");
      const t = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>;
      const cd = JSON.parse(Buffer.from(t.clientDataJSON, "base64url").toString()) as Record<
        string,
        unknown
      >;
      for (const origin of [
        "https://evil.example",
        "http://127.0.0.1:4000",
        "enclawed-cli://enclawed.local",
      ]) {
        const clientDataJSON = Buffer.from(JSON.stringify({ ...cd, origin }));
        const raw = Buffer.from(t.authenticatorData, "base64url");
        const sig = signWith(
          platform.held[0].key,
          Buffer.concat([raw, createHash("sha256").update(clientDataJSON).digest()]),
        );
        fs.writeFileSync(
          file,
          JSON.stringify({
            ...t,
            clientDataJSON: clientDataJSON.toString("base64url"),
            signature: Buffer.from(sig).toString("base64url"),
          }),
        );
        expect(
          await codeOf(
            assertSecondFactor(ctx({ interactive: false }), { purpose: "session-start" }),
          ),
        ).toBe("no-ticket");
        expect(events.at(-1)?.payload).toMatchObject({
          outcome: "refused",
          ticket: "bad-signature",
        });
      }
    },
  );
});
