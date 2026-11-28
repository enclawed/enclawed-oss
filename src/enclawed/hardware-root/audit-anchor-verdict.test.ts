import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  decideAuditAnchorVerdict,
  launchRootClaims,
  launchRootClaimsInFiles,
} from "./audit-anchor-verdict.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anchor-verdict-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const held = { type: "host.launch", payload: { hardware: "held" } };
const soft = { type: "host.launch", payload: { hardware: "software-only" } };

describe("audit verify with the hardware root held", () => {
  it("finds launch records that held or required the root, host-neutrally", () => {
    expect(launchRootClaims([soft, { type: "x", payload: { hardware: "held" } }])).toEqual([]);
    expect(launchRootClaims([soft, held])).toEqual([
      { line: 2, type: "host.launch", hardware: "held" },
    ]);
    expect(launchRootClaims([{ type: "launch", payload: { rootRequired: true } }])).toHaveLength(1);
    expect(
      launchRootClaims([{ type: "a.launch", payload: { hardware: "required" } }]),
    ).toHaveLength(1);
    const f = path.join(dir, "a.jsonl");
    fs.writeFileSync(f, `${JSON.stringify(soft)}\nnot json\n${JSON.stringify(held)}\n`);
    expect(launchRootClaimsInFiles([f])).toEqual([
      { line: 3, type: "host.launch", hardware: "held" },
    ]);
  });

  it("attack: a held-root log whose device anchor is unavailable, never anchored it, or only a stored copy matched FAILS", () => {
    const claims = launchRootClaims([held]);
    for (const device of ["unavailable", "unanchored", null] as const) {
      expect(decideAuditAnchorVerdict({ claims, device })).toMatchObject({
        ok: false,
        code: "anchor-read-unproven",
      });
    }
    // Matched, but with no fresh read over verify's own nonce (firmware before 0.5, or an owner
    // answering "unsupported"): not proven.
    expect(decideAuditAnchorVerdict({ claims, device: "matched" })).toMatchObject({
      ok: false,
      code: "anchor-read-unproven",
    });
    expect(
      decideAuditAnchorVerdict({
        claims,
        device: "matched",
        attestation: { fresh: false, counter: "3", sess: "2", version: 3, bind: "00".repeat(32) },
        activations: [],
      }),
    ).toMatchObject({ ok: false, code: "anchor-read-unproven" });
    expect(
      decideAuditAnchorVerdict({ claims, device: null, chainAnchor: "matched-offline" }).ok,
    ).toBe(false);
    expect(decideAuditAnchorVerdict({ claims, device: null, chainAnchor: "absent" }).ok).toBe(
      false,
    );
    for (const device of ["MISMATCH", "superseded"] as const) {
      expect(decideAuditAnchorVerdict({ claims: [], device })).toMatchObject({
        ok: false,
        code: "anchor-mismatch",
      });
    }
  });

  it("false positive: a device-matched held log, or a log that never held the root, verifies", () => {
    const claims = launchRootClaims([
      held,
      {
        type: "host.auth.device-factor",
        payload: { outcome: "verified", via: "device-unlock", gid: "7", useIndex: 1 },
      },
    ]);
    const bind = Buffer.alloc(32);
    bind[0] = 1;
    bind.writeUInt16LE(1, 2);
    bind.writeBigUInt64LE(7n, 8);
    const fresh = {
      fresh: true,
      counter: "3",
      sess: "2",
      version: 3 as const,
      bind: bind.toString("hex"),
    };
    const activations = [{ kind: "unlock-use" as const, gid: 7n, useIndex: 1 }];
    expect(
      decideAuditAnchorVerdict({ claims, device: "matched", attestation: fresh, activations }).ok,
    ).toBe(true);
    expect(
      decideAuditAnchorVerdict({
        claims,
        device: null,
        chainAnchor: "matched",
        attestation: fresh,
        activations,
      }).ok,
    ).toBe(true);
    expect(decideAuditAnchorVerdict({ claims: [], device: "unavailable" }).ok).toBe(true);
    expect(decideAuditAnchorVerdict({ claims: [], device: null, chainAnchor: "absent" }).ok).toBe(
      true,
    );
  });
});
