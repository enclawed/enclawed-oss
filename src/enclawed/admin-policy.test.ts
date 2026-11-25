import { generateKeyPairSync } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkRootOwnedFile,
  isInitialUidMap,
  loadAdminPolicy,
  signAdminPolicy,
} from "./admin-policy.js";

const uid = process.getuid?.() ?? 0;
const unix = process.platform !== "win32";

let dir: string;
let sys: string;

function write(file: string, body: unknown, mode = 0o644): void {
  writeFileSync(file, typeof body === "string" ? body : JSON.stringify(body));
  chmodSync(file, mode);
}

function orgKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    pub: publicKey.export({ format: "pem", type: "spki" }),
    priv: privateKey.export({ format: "pem", type: "pkcs8" }),
  };
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "admin-policy-"));
  chmodSync(dir, 0o755);
  sys = path.join(dir, "etc-enclawed");
  mkdirSync(sys, { mode: 0o755 });
  chmodSync(sys, 0o755);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// These tests also run inside `unshare -r -m` (the hermetic hardware-root isolation). There the
// loader rightly refuses every ownership proof, and files owned by the real root appear as the
// overflow uid. Only in that case do the tests inject the initial-namespace uid map and trust the
// overflow uid; the refusal itself is asserted explicitly below.
const INITIAL_UID_MAP = "         0          0 4294967295\n";
const inUserNs = (() => {
  try {
    return (
      process.platform === "linux" && !isInitialUidMap(readFileSync("/proc/self/uid_map", "utf8"))
    );
  } catch {
    return false;
  }
})();
const trusted = inUserNs ? [uid, 65534] : [uid];
const nsOpts = inUserNs ? { uidMap: INITIAL_UID_MAP } : {};
const opts = () => ({ systemDir: sys, trustedUids: trusted, ...nsOpts });

describe.skipIf(!unix)("checkRootOwnedFile", () => {
  it("accepts a trusted-owner file at 0644 in a non-writable directory", () => {
    write(path.join(sys, "policy.json"), { v: 1 });
    expect(checkRootOwnedFile(path.join(sys, "policy.json"), trusted, nsOpts)).toEqual({
      ok: true,
    });
  });

  it("refuses a file owned by an untrusted uid (a user-owned file is not root-owned)", () => {
    write(path.join(sys, "policy.json"), { v: 1 });
    const res = checkRootOwnedFile(path.join(sys, "policy.json"), [uid + 12345], nsOpts);
    expect(res.ok).toBe(false);
  });

  it("refuses a mode wider than 0644", () => {
    write(path.join(sys, "policy.json"), { v: 1 }, 0o664);
    expect(checkRootOwnedFile(path.join(sys, "policy.json"), trusted, nsOpts)).toMatchObject({
      ok: false,
    });
  });

  it("refuses a symlinked file and a group-writable directory", () => {
    write(path.join(dir, "real.json"), { v: 1 });
    symlinkSync(path.join(dir, "real.json"), path.join(sys, "policy.json"));
    expect(checkRootOwnedFile(path.join(sys, "policy.json"), trusted, nsOpts)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/symlink/),
    });
    rmSync(path.join(sys, "policy.json"));
    write(path.join(sys, "policy.json"), { v: 1 });
    chmodSync(sys, 0o775);
    expect(checkRootOwnedFile(path.join(sys, "policy.json"), trusted, nsOpts)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/writable by group or other/),
    });
  });

  it("refuses inside a non-initial user namespace (unshare -r maps the user to uid 0)", () => {
    write(path.join(sys, "policy.json"), { v: 1 });
    expect(
      checkRootOwnedFile(path.join(sys, "policy.json"), [uid], {
        uidMap: "         0       1000          1\n",
      }),
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/user namespace/) });
    expect(isInitialUidMap("         0          0 4294967295\n")).toBe(true);
  });
});

describe.skipIf(!unix)("loadAdminPolicy", () => {
  it("returns none when nothing is provisioned", () => {
    expect(loadAdminPolicy(opts())).toEqual({ admin: null, ignored: [], invalid: null });
  });

  it("loads the root-owned file", () => {
    write(path.join(sys, "policy.json"), { v: 1, flavor: "enclaved", fipsRequired: true });
    const load = loadAdminPolicy(opts());
    expect(load.admin?.source.kind).toBe("root-file");
    expect(load.admin?.doc.flavor).toBe("enclaved");
  });

  it("ignores (and reports) an insecure file instead of loosening anything", () => {
    write(path.join(sys, "policy.json"), { v: 1, flavor: "open" }, 0o666);
    const load = loadAdminPolicy(opts());
    expect(load.admin).toBeNull();
    expect(load.ignored.join("\n")).toMatch(/wider than 0644/);
  });

  it("reports a secure but malformed file as invalid", () => {
    write(path.join(sys, "policy.json"), { v: 1, flavr: "open" });
    expect(loadAdminPolicy(opts()).invalid).toMatch(/not a known setting/);
  });

  it("accepts an org-signed document from the user state dir, and refuses forgeries and expired ones", () => {
    const key = orgKey();
    write(path.join(sys, "org-keys.json"), {
      v: 1,
      keys: [{ keyId: "org-1", publicKeyPem: key.pub }],
    });
    const state = path.join(dir, "state");
    mkdirSync(state);
    const doc = { v: 1 as const, flavor: "open" as const, expiresAt: "2099-01-01T00:00:00Z" };
    const env = signAdminPolicy(doc, "org-1", key.priv);
    write(path.join(state, "policy.signed.json"), env);
    const good = loadAdminPolicy({ ...opts(), stateDir: state });
    expect(good.admin?.source).toMatchObject({ kind: "signed", keyId: "org-1" });

    // Tampered payload: the attacker edits the signed document.
    const forged = {
      ...env,
      payload: Buffer.from(JSON.stringify({ ...doc, fipsRequired: false })).toString("base64"),
    };
    write(path.join(state, "policy.signed.json"), forged);
    const bad = loadAdminPolicy({ ...opts(), stateDir: state });
    expect(bad.admin).toBeNull();
    expect(bad.ignored.join("\n")).toMatch(/signature does not verify/);

    // Signed by a key that is not an org key.
    const other = orgKey();
    write(path.join(state, "policy.signed.json"), signAdminPolicy(doc, "org-1", other.priv));
    expect(loadAdminPolicy({ ...opts(), stateDir: state }).admin).toBeNull();

    // Expired.
    write(
      path.join(state, "policy.signed.json"),
      signAdminPolicy({ ...doc, expiresAt: "2001-01-01T00:00:00Z" }, "org-1", key.priv),
    );
    expect(loadAdminPolicy({ ...opts(), stateDir: state }).ignored.join("\n")).toMatch(/expired/);
  });

  it("does not trust org keys from a user-writable file", () => {
    const key = orgKey();
    write(
      path.join(sys, "org-keys.json"),
      { v: 1, keys: [{ keyId: "org-1", publicKeyPem: key.pub }] },
      0o666,
    );
    const state = path.join(dir, "state");
    mkdirSync(state);
    write(
      path.join(state, "policy.signed.json"),
      signAdminPolicy(
        { v: 1, flavor: "open", expiresAt: "2099-01-01T00:00:00Z" },
        "org-1",
        key.priv,
      ),
    );
    expect(loadAdminPolicy({ ...opts(), stateDir: state }).admin).toBeNull();
  });
});
