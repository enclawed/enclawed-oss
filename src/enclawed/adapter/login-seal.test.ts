// The host's login sealed at rest under the device (./login-seal.ts). Attack
// side: a copy of the sealed file taken before or after a session is
// ciphertext; a record sealed with a key a process of this user can read, or
// changed on disk, or for another label, is refused; a link or a prepared
// directory is not followed; nothing plaintext is left after a reseal or an
// erase; with a device bound, a keyring or file key never seals; a plaintext
// login next to a sealed one, or two of them, is refused at launch.
// False-positive side: seal, unseal, a token refreshed in the session is
// resealed, a fresh login is kept, a logout removes the sealed login, the
// first launch with a device seals the one plaintext login, and no device
// means no change.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tempTree } from "../containment/test-helpers.js";
import {
  credentialStoreKeys,
  type CredentialKeyDevice,
  type CredentialKeys,
} from "./credential-keys.js";
import {
  eraseSealedLogin,
  eraseSessionLogin,
  loginLaunchDecision,
  loginSealStatus,
  resealFromSession,
  sealLoginBytes,
  sealLoginFile,
  unsealLoginInto,
  unsealLoginToMemory,
} from "./login-seal.js";

const TOKEN = "login-token-0123456789abcdef-SECRET";
const LOGIN = JSON.stringify({ account: { accessToken: TOKEN, refreshToken: `r-${TOKEN}` } });

/** A stand-in device: a deterministic signature over the message (a secret of its own). */
const standIn = (secret: string, uid = "dev-uid-1"): CredentialKeyDevice => ({
  uid,
  sign: async (m) => createHash("sha512").update(secret).update(m).digest(),
});

let root: string;
let n = 0;
let device: CredentialKeys;
let fileOnly: CredentialKeys;

const fresh = () => {
  const d = path.join(root, `case-${++n}`);
  fs.mkdirSync(path.join(d, "session"), { recursive: true, mode: 0o700 });
  return {
    plain: path.join(d, "home", "login.json"),
    sealed: path.join(d, "state", "login.sealed.json"),
    session: path.join(d, "session", "secure", "login.json"),
    dir: d,
  };
};
const writePlain = (f: string, text = LOGIN) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text, { mode: 0o600 });
};
/** Every byte under `dir`, as text: the token must not be anywhere. */
const allBytes = (dir: string): string => {
  let out = "";
  const walk = (p: string) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const q = path.join(p, e.name);
      if (e.isDirectory()) {
        walk(q);
      } else if (e.isFile()) {
        out += fs.readFileSync(q, "latin1");
      }
    }
  };
  walk(dir);
  return out;
};

beforeAll(async () => {
  root = tempTree("enclawed-login-seal");
  device = await credentialStoreKeys({
    keyFile: path.join(root, "keys", "k.key"),
    device: standIn("device-secret-A"),
  });
  fileOnly = await credentialStoreKeys({ keyFile: path.join(root, "keys", "file.key") });
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("login seal", () => {
  it("false positive: seal erases the plaintext; unseal opens it 0600 in a fresh 0700 directory", () => {
    const c = fresh();
    writePlain(c.plain);
    const s = sealLoginFile({
      plainFile: c.plain,
      sealedFile: c.sealed,
      keys: device,
      deviceBound: true,
    });
    expect(s).toMatchObject({ ok: true, plaintextErased: true });
    expect(device.write.source).toBe("device");
    expect(fs.existsSync(c.plain)).toBe(false);
    expect(fs.statSync(c.sealed).mode & 0o777).toBe(0o600);
    // The copy at rest is ciphertext.
    expect(allBytes(c.dir)).not.toContain(TOKEN);
    const rec = JSON.parse(fs.readFileSync(c.sealed, "utf8"));
    expect(Buffer.from(rec.data, "base64").toString("latin1")).not.toContain(TOKEN);
    expect(Object.keys(rec).toSorted()).toEqual(["data", "iv", "key", "kind", "label", "tag", "v"]);
    const u = unsealLoginInto({
      sealedFile: c.sealed,
      sessionFile: c.session,
      keys: device,
      deviceBound: true,
    });
    expect(u).toMatchObject({ ok: true, unsealed: true });
    expect(fs.readFileSync(c.session, "utf8")).toBe(LOGIN);
    expect(fs.statSync(c.session).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(c.session)).mode & 0o777).toBe(0o700);
  });

  it("false positive: a token the host refreshed in the session is resealed, and nothing plaintext is left", () => {
    const c = fresh();
    writePlain(c.plain);
    sealLoginFile({ plainFile: c.plain, sealedFile: c.sealed, keys: device, deviceBound: true });
    unsealLoginInto({
      sealedFile: c.sealed,
      sessionFile: c.session,
      keys: device,
      deviceBound: true,
    });
    const refreshed = LOGIN.replace(TOKEN, `${TOKEN}-REFRESHED`);
    // The host writes back atomically and may leave a temp file holding the login too.
    fs.writeFileSync(c.session, refreshed, { mode: 0o600 });
    fs.writeFileSync(`${c.session}.tmp.123`, refreshed, { mode: 0o600 });
    const r = resealFromSession({
      sessionFile: c.session,
      sealedFile: c.sealed,
      keys: device,
      deviceBound: true,
    });
    expect(r).toMatchObject({ ok: true, action: "resealed", remaining: [] });
    expect(r.erased).toHaveLength(2);
    expect(fs.existsSync(path.dirname(c.session))).toBe(false);
    expect(allBytes(c.dir)).not.toContain(TOKEN);
    // The next session gets the refreshed login.
    unsealLoginInto({
      sealedFile: c.sealed,
      sessionFile: c.session,
      keys: device,
      deviceBound: true,
    });
    expect(fs.readFileSync(c.session, "utf8")).toBe(refreshed);
  });

  it("false positive: no sealed login gives an empty private directory; a login made there is sealed at the end; a logout removes it", () => {
    const c = fresh();
    const u = unsealLoginInto({
      sealedFile: c.sealed,
      sessionFile: c.session,
      keys: device,
      deviceBound: true,
    });
    expect(u).toEqual({ ok: true, unsealed: false, keyId: null });
    expect(fs.statSync(path.dirname(c.session)).mode & 0o777).toBe(0o700);
    writePlain(c.session);
    expect(
      resealFromSession({
        sessionFile: c.session,
        sealedFile: c.sealed,
        keys: device,
        deviceBound: true,
      }),
    ).toMatchObject({ ok: true, action: "resealed" });
    expect(fs.existsSync(c.sealed)).toBe(true);
    // A session that logged out leaves no login: the sealed login goes too.
    unsealLoginInto({
      sealedFile: c.sealed,
      sessionFile: c.session,
      keys: device,
      deviceBound: true,
    });
    fs.rmSync(c.session);
    expect(
      resealFromSession({
        sessionFile: c.session,
        sealedFile: c.sealed,
        keys: device,
        deviceBound: true,
      }),
    ).toMatchObject({ ok: true, action: "removed" });
    expect(fs.existsSync(c.sealed)).toBe(false);
  });

  it("attack: a copy of the sealed login does not open without the device, nor with another device", async () => {
    const c = fresh();
    writePlain(c.plain);
    sealLoginFile({ plainFile: c.plain, sealedFile: c.sealed, keys: device, deviceBound: true });
    const copy = path.join(c.dir, "stolen.json");
    fs.copyFileSync(c.sealed, copy);
    expect(fs.readFileSync(copy, "utf8")).not.toContain(TOKEN);
    const other = await credentialStoreKeys({
      keyFile: path.join(c.dir, "o.key"),
      device: standIn("device-secret-B"),
    });
    expect(
      unsealLoginInto({ sealedFile: copy, sessionFile: c.session, keys: other, deviceBound: true }),
    ).toMatchObject({ ok: false, code: "key-unavailable" });
    // No device at all (the file key is what a thief would have).
    expect(
      unsealLoginInto({
        sealedFile: copy,
        sessionFile: c.session,
        keys: fileOnly,
        deviceBound: false,
      }),
    ).toMatchObject({ ok: false, code: "key-unavailable" });
    expect(fs.existsSync(c.session)).toBe(false);
  });

  it("attack: with a device bound, a keyring or file key never seals, and a record it sealed is never opened", () => {
    const c = fresh();
    writePlain(c.plain);
    expect(
      sealLoginFile({
        plainFile: c.plain,
        sealedFile: c.sealed,
        keys: fileOnly,
        deviceBound: true,
      }),
    ).toMatchObject({ ok: false, code: "device-key-required" });
    // Refused: the plaintext is left as it was, nothing sealed.
    expect(fs.readFileSync(c.plain, "utf8")).toBe(LOGIN);
    expect(fs.existsSync(c.sealed)).toBe(false);
    // A record sealed with a key this user can read (someone else's login planted) is not opened.
    expect(
      sealLoginFile({
        plainFile: c.plain,
        sealedFile: c.sealed,
        keys: fileOnly,
        deviceBound: false,
      }),
    ).toMatchObject({ ok: true });
    const both: CredentialKeys = { ...device, read: (id) => device.read(id) ?? fileOnly.read(id) };
    expect(
      unsealLoginInto({
        sealedFile: c.sealed,
        sessionFile: c.session,
        keys: both,
        deviceBound: true,
      }),
    ).toMatchObject({ ok: false, code: "not-device-sealed" });
    // A session reseal with no device key erases the plaintext and keeps the earlier sealed login.
    const before = fs.readFileSync(c.sealed, "utf8");
    fs.mkdirSync(path.dirname(c.session), { mode: 0o700 });
    writePlain(c.session);
    const r = resealFromSession({
      sessionFile: c.session,
      sealedFile: c.sealed,
      keys: fileOnly,
      deviceBound: true,
    });
    expect(r).toMatchObject({ ok: false, code: "device-key-required", remaining: [] });
    expect(fs.existsSync(c.session)).toBe(false);
    expect(fs.readFileSync(c.sealed, "utf8")).toBe(before);
  });

  it("attack: a sealed record changed on disk, or relabeled, is refused", () => {
    const c = fresh();
    writePlain(c.plain);
    sealLoginFile({ plainFile: c.plain, sealedFile: c.sealed, keys: device, deviceBound: true });
    const rec = JSON.parse(fs.readFileSync(c.sealed, "utf8"));
    const data = Buffer.from(rec.data, "base64");
    data[0] ^= 1;
    fs.writeFileSync(c.sealed, JSON.stringify({ ...rec, data: data.toString("base64") }));
    expect(
      unsealLoginInto({
        sealedFile: c.sealed,
        sessionFile: c.session,
        keys: device,
        deviceBound: true,
      }),
    ).toMatchObject({ ok: false, code: "sealed-does-not-open" });
    fs.writeFileSync(c.sealed, JSON.stringify({ ...rec, label: "other" }));
    expect(
      unsealLoginInto({
        sealedFile: c.sealed,
        sessionFile: c.session,
        keys: device,
        deviceBound: true,
      }),
    ).toMatchObject({ ok: false, code: "sealed-does-not-open" });
    expect(
      unsealLoginInto({
        sealedFile: c.sealed,
        sessionFile: c.session,
        keys: device,
        deviceBound: true,
        label: "other",
      }),
    ).toMatchObject({ ok: false, code: "sealed-does-not-open" });
    expect(fs.existsSync(path.dirname(c.session))).toBe(false);
  });

  it("attack: a prepared session directory, or a link at the login, is not used", () => {
    const c = fresh();
    writePlain(c.plain);
    sealLoginFile({ plainFile: c.plain, sealedFile: c.sealed, keys: device, deviceBound: true });
    // Someone made the directory first (and could read what lands there).
    fs.mkdirSync(path.dirname(c.session), { mode: 0o777 });
    expect(
      unsealLoginInto({
        sealedFile: c.sealed,
        sessionFile: c.session,
        keys: device,
        deviceBound: true,
      }),
    ).toMatchObject({ ok: false, code: "session-dir-exists" });
    fs.rmSync(path.dirname(c.session), { recursive: true });
    // A link where the session login is resealed from: not followed, removed.
    const target = path.join(c.dir, "elsewhere.json");
    fs.writeFileSync(target, "not a login");
    fs.mkdirSync(path.dirname(c.session), { mode: 0o700 });
    fs.symlinkSync(target, c.session);
    const before = fs.readFileSync(c.sealed, "utf8");
    expect(
      resealFromSession({
        sessionFile: c.session,
        sealedFile: c.sealed,
        keys: device,
        deviceBound: true,
      }),
    ).toMatchObject({ ok: false, code: "login-not-a-file" });
    expect(fs.readFileSync(c.sealed, "utf8")).toBe(before);
    expect(fs.readFileSync(target, "utf8")).toBe("not a login");
    expect(fs.existsSync(path.dirname(c.session))).toBe(false);
  });

  it("halt: the session's plaintext and the sealed login are erased", () => {
    const c = fresh();
    writePlain(c.plain);
    sealLoginFile({ plainFile: c.plain, sealedFile: c.sealed, keys: device, deviceBound: true });
    unsealLoginInto({
      sealedFile: c.sealed,
      sessionFile: c.session,
      keys: device,
      deviceBound: true,
    });
    expect(eraseSessionLogin({ sessionFile: c.session })).toEqual({
      erased: [c.session],
      remaining: [],
    });
    expect(eraseSealedLogin({ sealedFile: c.sealed })).toBe(true);
    expect(fs.existsSync(c.sealed)).toBe(false);
    expect(allBytes(c.dir)).not.toContain(TOKEN);
  });

  it("launch decision: plaintext next to a device is refused; a sealed login needs its device; no device and no seal passes", () => {
    const c = fresh();
    const status = () => loginSealStatus({ sealedFile: c.sealed, plainFiles: [c.plain, c.plain] });
    expect(loginLaunchDecision({ deviceBound: false, status: status() })).toEqual({
      action: "pass",
    });
    expect(loginLaunchDecision({ deviceBound: true, status: status() })).toEqual({
      action: "unseal",
    });
    writePlain(c.plain);
    expect(status().plaintext).toEqual([c.plain]);
    // The first launch with the device seals the login the host would have used anyway.
    expect(loginLaunchDecision({ deviceBound: true, status: status() })).toEqual({
      action: "seal-then-unseal",
      plainFile: c.plain,
    });
    // Two plaintext logins: which one is the login is not guessed.
    const second = path.join(c.dir, "home2", "login.json");
    writePlain(second);
    expect(
      loginLaunchDecision({
        deviceBound: true,
        status: loginSealStatus({ sealedFile: c.sealed, plainFiles: [c.plain, second] }),
      }),
    ).toMatchObject({ action: "refuse", code: "plaintext-unsealed" });
    expect(loginLaunchDecision({ deviceBound: false, status: status() })).toEqual({
      action: "pass",
    });
    sealLoginFile({ plainFile: c.plain, sealedFile: c.sealed, keys: device, deviceBound: true });
    expect(status().sealed).toMatchObject({ present: true, readable: true, keySource: "device" });
    expect(loginLaunchDecision({ deviceBound: true, status: status() })).toEqual({
      action: "unseal",
    });
    expect(loginLaunchDecision({ deviceBound: false, status: status() })).toMatchObject({
      action: "refuse",
      code: "device-required",
    });
    // A copy put back at the normal location bypasses the seal: refused, never adopted.
    writePlain(c.plain);
    expect(loginLaunchDecision({ deviceBound: true, status: status() })).toMatchObject({
      action: "refuse",
      code: "plaintext-beside-seal",
    });
  });
  it("memory: the login opens into memory only, and a renewed one is sealed from memory under the device alone", () => {
    const c = fresh();
    writePlain(c.plain);
    sealLoginFile({ plainFile: c.plain, sealedFile: c.sealed, keys: device, deviceBound: true });
    const m = unsealLoginToMemory({ sealedFile: c.sealed, keys: device, deviceBound: true });
    expect(m.ok && m.plain.toString("utf8")).toBe(LOGIN);
    expect(fs.existsSync(path.dirname(c.session))).toBe(false);
    const renewed = Buffer.from(LOGIN.replace(TOKEN, `${TOKEN}-RENEWED`));
    expect(
      sealLoginBytes({ plain: renewed, sealedFile: c.sealed, keys: fileOnly, deviceBound: true }),
    ).toMatchObject({ ok: false, code: "device-key-required" });
    expect(
      sealLoginBytes({ plain: renewed, sealedFile: c.sealed, keys: device, deviceBound: true }),
    ).toMatchObject({ ok: true });
    expect(allBytes(c.dir)).not.toContain(TOKEN);
    const again = unsealLoginToMemory({ sealedFile: c.sealed, keys: device, deviceBound: true });
    expect(again.ok && again.plain.equals(renewed)).toBe(true);
    expect(
      unsealLoginToMemory({
        sealedFile: path.join(c.dir, "none.json"),
        keys: device,
        deviceBound: true,
      }),
    ).toMatchObject({ ok: false, code: "no-login" });
    sealLoginFile({
      plainFile: (writePlain(c.plain), c.plain),
      sealedFile: c.sealed,
      keys: fileOnly,
      deviceBound: false,
    });
    expect(
      unsealLoginToMemory({
        sealedFile: c.sealed,
        keys: { ...device, read: (id) => device.read(id) ?? fileOnly.read(id) },
        deviceBound: true,
      }),
    ).toMatchObject({ ok: false, code: "not-device-sealed" });
  });
});
