// The host's login kept out of the host's own reach (managed-login-policy.ts,
// host-credential-watch.ts, oauth-code-login.ts).
// Attack side: a managed document that widens the organization pin or re-points
// the login directory, a login directory a user can write or that holds a
// file, a policy file that fails the administrator check: not installed. A
// plaintext login appearing with a device bound is moved out of the host's
// reach (sealed, or quarantined) within the watcher's bound; a link is removed
// and never followed; a pending directory that is a link erases the login
// rather than keep it there; a pasted code from another attempt is refused
// before any request.
// False-positive side: exactly the installed document is installed; no device
// bound leaves the person's ordinary login alone; the host's own transient
// write file is not taken while it is being written; a genuine pasted code
// signs in.

import { createHash } from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { tempTree } from "../containment/test-helpers.js";
import { createContainerCa } from "../containment/x509.js";
import type { AdminFileCheck } from "./admin-grants.js";
import {
  discardPendingCredential,
  findHostCredentials,
  pendingHostCredentials,
  secureHostCredential,
  watchHostCredentials,
  CREDENTIAL_WATCH_BOUND_MS,
} from "./host-credential-watch.js";
import {
  adminOnlyEmptyDirProblem,
  managedLoginPolicyDocument,
  managedLoginPolicyStatus,
  managedLoginPolicyText,
  planManagedLoginPolicy,
  type ManagedLoginPolicySpec,
} from "./managed-login-policy.js";
import { oauthCodeLogin } from "./oauth-code-login.js";

const me = typeof process.getuid === "function" ? process.getuid() : 0;
const okFile: AdminFileCheck = () => ({ ok: true });

function policyWorld() {
  const root = tempTree("login-policy");
  fs.chmodSync(root, 0o755);
  const managed = path.join(root, "managed");
  fs.mkdirSync(path.join(managed, "managed-settings.d"), { recursive: true, mode: 0o755 });
  const storage = path.join(managed, "no-login");
  fs.mkdirSync(storage, { mode: 0o555 });
  const spec: ManagedLoginPolicySpec = {
    orgPinKey: "forceLoginOrgUUID",
    envKey: "env",
    storageDirVar: "HOST_STORAGE_DIR",
    storageDir: storage,
    envPins: { HOST_DISABLE_LOGIN: "1" },
  };
  const policyFile = path.join(managed, "managed-settings.d", "90-login.json");
  fs.writeFileSync(policyFile, managedLoginPolicyText(spec));
  const docs = (extra: Array<{ file: string; doc: unknown; invalid?: boolean }> = []) => [
    ...extra,
    { file: policyFile, doc: JSON.parse(fs.readFileSync(policyFile, "utf8")) as unknown },
  ];
  const status = (d = docs(), fileCheck = okFile) =>
    managedLoginPolicyStatus(d, spec, {
      policyFile,
      fileCheck,
      dirProblem: (dir) => adminOnlyEmptyDirProblem(dir, [me]),
    });
  return { root, managed, storage, spec, policyFile, docs, status };
}

describe("managed login policy", () => {
  it("the installed document is installed; its bytes are stable and install is idempotent", () => {
    const w = policyWorld();
    expect(w.status()).toMatchObject({ installed: true, code: "installed" });
    expect(managedLoginPolicyDocument(w.spec)).toEqual({
      forceLoginOrgUUID: [],
      env: { HOST_STORAGE_DIR: w.storage, HOST_DISABLE_LOGIN: "1" },
    });
    expect(planManagedLoginPolicy(w.spec, { policyFile: w.policyFile })).toMatchObject({
      file: "none",
      dir: "none",
    });
    fs.writeFileSync(w.policyFile, "{}");
    expect(planManagedLoginPolicy(w.spec, { policyFile: w.policyFile }).file).toBe("write");
  });

  it("attack: another managed document admits an organization, or re-points the login directory: not installed", () => {
    const w = policyWorld();
    const other = path.join(w.managed, "managed-settings.json");
    expect(
      w.status(w.docs([{ file: other, doc: { forceLoginOrgUUID: ["org-1"] } }])),
    ).toMatchObject({ installed: false, code: "org-pin-widened", file: other });
    expect(w.status(w.docs([{ file: other, doc: { forceLoginOrgUUID: "org-1" } }])).code).toBe(
      "org-pin-widened",
    );
    expect(
      w.status(w.docs([{ file: other, doc: { env: { HOST_STORAGE_DIR: "/home/u/.host" } } }])),
    ).toMatchObject({ code: "env-pin-overridden", file: other });
    expect(w.status(w.docs([{ file: other, doc: { env: { HOST_DISABLE_LOGIN: "" } } }])).code).toBe(
      "env-pin-overridden",
    );
    expect(w.status(w.docs([{ file: other, doc: null, invalid: true }])).code).toBe(
      "invalid-document",
    );
    expect(
      w.status([
        {
          file: w.policyFile,
          doc: { env: { HOST_STORAGE_DIR: w.storage, HOST_DISABLE_LOGIN: "1" } },
        },
      ]).code,
    ).toBe("org-pin-missing");
    expect(
      w.status([
        {
          file: w.policyFile,
          doc: { forceLoginOrgUUID: [], env: { HOST_STORAGE_DIR: w.storage } },
        },
      ]).code,
    ).toBe("env-pin-missing");
    expect(w.status([]).code).toBe("no-managed-settings");
  });

  it("attack: the policy file fails the administrator check, or the login directory is not an administrator's empty directory", () => {
    const w = policyWorld();
    expect(
      w.status(w.docs(), () => ({ ok: false, reason: "owned by uid 1000, not root" })).code,
    ).toBe("policy-file-untrusted");
    fs.chmodSync(w.storage, 0o777);
    expect(w.status().code).toBe("storage-dir-unsafe");
    fs.chmodSync(w.storage, 0o755);
    fs.writeFileSync(path.join(w.storage, ".credentials.json"), "{}");
    expect(w.status()).toMatchObject({ code: "storage-dir-unsafe" });
    fs.rmSync(path.join(w.storage, ".credentials.json"));
    expect(w.status().installed).toBe(true);
    fs.rmSync(w.storage, { recursive: true });
    fs.symlinkSync(w.root, w.storage);
    expect(w.status().code).toBe("storage-dir-unsafe");
    expect(adminOnlyEmptyDirProblem(w.managed, [12345])).toMatch(/not an administrator/);
  });
});

const LOGIN = JSON.stringify({
  claudeAiOauth: { accessToken: "tok-SECRET-0123", refreshToken: "ref-SECRET" },
});

function credWorld() {
  const root = tempTree("host-cred");
  const store = path.join(root, "home", ".host");
  fs.mkdirSync(store, { recursive: true });
  const file = path.join(store, ".credentials.json");
  const pendingDir = path.join(root, "state", "pending");
  const spec = { files: [file], transientSuffixes: [".tmp."] };
  return { root, store, file, pendingDir, spec };
}

describe("a plaintext login of the host appearing", () => {
  it("no device bound: the person's ordinary login is left alone", () => {
    const w = credWorld();
    fs.writeFileSync(w.file, LOGIN, { mode: 0o600 });
    const [found] = findHostCredentials(w.spec);
    expect(
      secureHostCredential({ found, sealBound: false, pendingDir: w.pendingDir, label: "login" }),
    ).toMatchObject({ ok: true, action: "left" });
    expect(fs.readFileSync(w.file, "utf8")).toBe(LOGIN);
  });

  it("device bound, no activation: quarantined out of the host's reach, 0600 in a 0700 directory; nothing left beside the host's file", () => {
    const w = credWorld();
    fs.writeFileSync(w.file, LOGIN, { mode: 0o600 });
    const [found] = findHostCredentials(w.spec);
    const r = secureHostCredential({
      found,
      sealBound: true,
      pendingDir: w.pendingDir,
      label: "login",
    });
    expect(r).toMatchObject({ ok: true, action: "quarantined" });
    expect(fs.existsSync(w.file)).toBe(false);
    expect(fs.readdirSync(w.store)).toEqual([]);
    const pending = pendingHostCredentials(w.pendingDir, "login");
    expect(pending).toHaveLength(1);
    expect(pending[0].sealed).toBe(false);
    expect(fs.readFileSync(pending[0].file, "utf8")).toBe(LOGIN);
    expect(fs.statSync(pending[0].file).mode & 0o777).toBe(0o600);
    expect(fs.statSync(w.pendingDir).mode & 0o777).toBe(0o700);
    expect(discardPendingCredential(pending[0].file)).toBe(true);
    expect(pendingHostCredentials(w.pendingDir, "login")).toEqual([]);
  });

  it("device bound with an activation: sealed into the pending directory by the caller's seal; the plaintext is gone", () => {
    const w = credWorld();
    fs.writeFileSync(w.file, LOGIN, { mode: 0o600 });
    const [found] = findHostCredentials(w.spec);
    const seal = (held: string, sealed: string) => {
      fs.writeFileSync(sealed, createHash("sha256").update(fs.readFileSync(held)).digest("hex"));
      fs.rmSync(held);
      return { ok: true, plaintextErased: true };
    };
    const r = secureHostCredential({
      found,
      sealBound: true,
      pendingDir: w.pendingDir,
      label: "login",
      seal,
    });
    expect(r).toMatchObject({ ok: true, action: "sealed" });
    expect(fs.readdirSync(w.store)).toEqual([]);
    expect(pendingHostCredentials(w.pendingDir, "login").map((p) => p.sealed)).toEqual([true]);
    // A seal that fails falls back to quarantine: never left where the host reads it.
    fs.writeFileSync(w.file, LOGIN, { mode: 0o600 });
    const r2 = secureHostCredential({
      found: findHostCredentials(w.spec)[0],
      sealBound: true,
      pendingDir: w.pendingDir,
      label: "login",
      seal: () => ({ ok: false }),
    });
    expect(r2).toMatchObject({ ok: true, action: "quarantined" });
    expect(fs.readdirSync(w.store)).toEqual([]);
  });

  it("attack: a link at the host's path is removed, never followed; a pending directory that is a link erases the login instead", () => {
    const w = credWorld();
    const target = path.join(w.root, "elsewhere.json");
    fs.writeFileSync(target, LOGIN);
    fs.symlinkSync(target, w.file);
    const [found] = findHostCredentials(w.spec);
    expect(found.kind).toBe("link");
    expect(
      secureHostCredential({ found, sealBound: true, pendingDir: w.pendingDir, label: "login" }),
    ).toMatchObject({ ok: true, action: "link-removed" });
    expect(fs.readFileSync(target, "utf8")).toBe(LOGIN);
    expect(fs.existsSync(w.file)).toBe(false);
    // The pending directory replaced by a link to a place the attacker reads.
    const loot = path.join(w.root, "loot");
    fs.mkdirSync(loot);
    fs.mkdirSync(path.dirname(w.pendingDir), { recursive: true });
    fs.symlinkSync(loot, w.pendingDir);
    fs.writeFileSync(w.file, LOGIN, { mode: 0o600 });
    const r = secureHostCredential({
      found: findHostCredentials(w.spec)[0],
      sealBound: true,
      pendingDir: w.pendingDir,
      label: "login",
    });
    expect(r).toMatchObject({ ok: false, code: "pending-dir" });
    expect(fs.readdirSync(loot)).toEqual([]);
    expect(fs.readdirSync(w.store)).toEqual([]);
  });

  it("a file moved aside and not finished (a crash) is found and finished", () => {
    const w = credWorld();
    const held = `${w.file}.enclawed-held.abc`;
    fs.writeFileSync(held, LOGIN, { mode: 0o600 });
    const [found] = findHostCredentials(w.spec);
    expect(found).toEqual({ file: held, kind: "held" });
    expect(
      secureHostCredential({ found, sealBound: true, pendingDir: w.pendingDir, label: "login" }),
    ).toMatchObject({ action: "quarantined" });
    expect(fs.readdirSync(w.store)).toEqual([]);
  });

  it("the watcher: a login written by the host is out of its reach within the bound; the host's own write in progress is not taken early", async () => {
    const w = credWorld();
    const events: string[] = [];
    const watch = watchHostCredentials({
      spec: w.spec,
      handle: (found) =>
        secureHostCredential({ found, sealBound: true, pendingDir: w.pendingDir, label: "login" }),
      onEvent: (e) =>
        events.push(`${e.found.kind}:${e.result.ok ? e.result.action : e.result.code}`),
    });
    try {
      // The host's atomic write: a young transient file, then the rename.
      const tmp = `${w.file}.tmp.1234`;
      fs.writeFileSync(tmp, LOGIN, { mode: 0o600 });
      await watch.sweep();
      expect(fs.existsSync(tmp)).toBe(true);
      fs.renameSync(tmp, w.file);
      const t0 = Date.now();
      while (fs.existsSync(w.file) && Date.now() - t0 < CREDENTIAL_WATCH_BOUND_MS * 2) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(fs.existsSync(w.file)).toBe(false);
      expect(Date.now() - t0).toBeLessThanOrEqual(CREDENTIAL_WATCH_BOUND_MS);
      expect(events).toContain("file:quarantined");
      expect(pendingHostCredentials(w.pendingDir, "login")).toHaveLength(1);
    } finally {
      watch.close();
    }
  });
});

describe("signing in without the host (OAuth code, pasted)", () => {
  const ca = createContainerCa("stand-in token endpoint", ["auth.provider.test"]);
  const leaf = ca.leafFor("auth.provider.test");
  const seen: Array<Record<string, unknown>> = [];
  let challenge = "";
  const server = https.createServer({ key: leaf.keyPem, cert: leaf.certPem }, (req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      const j = JSON.parse(b) as Record<string, unknown>;
      seen.push(j);
      const okVerifier =
        createHash("sha256").update(String(j.code_verifier)).digest("base64url") === challenge;
      res.writeHead(j.code === "good-code" && okVerifier ? 200 : 401, {
        "content-type": "application/json",
      });
      res.end(
        JSON.stringify({
          access_token: "acc-NEW",
          refresh_token: "ref-NEW",
          expires_in: 3600,
          scope: "user:inference user:profile",
          account: { uuid: "a-1" },
        }),
      );
    });
  });
  const port = new Promise<number>((r) =>
    server.listen(0, "127.0.0.1", () => r((server.address() as { port: number }).port)),
  );
  afterAll(() => server.close());
  const spec = {
    authorizeUrl: "https://auth.provider.test/oauth/authorize",
    tokenUrl: "https://auth.provider.test/v1/oauth/token",
    redirectUri: "https://auth.provider.test/oauth/code/callback",
    clientId: "client-1",
    scopes: ["user:inference", "user:profile"],
    authorizeParams: { code: "true" },
  };
  const run = async (paste: (state: string) => string) => {
    let url = "";
    return oauthCodeLogin(spec, {
      show: (u) => {
        url = u;
        challenge = new URL(u).searchParams.get("code_challenge") ?? "";
      },
      readCode: async () => paste(new URL(url).searchParams.get("state") ?? ""),
      trustForTest: ca.certPem,
      addressForTest: { host: "127.0.0.1", port: await port },
      now: () => 1000,
    });
  };

  it("a genuine pasted code signs in; the verifier matches the challenge (S256)", async () => {
    seen.length = 0;
    const r = await run((state) => `good-code#${state}`);
    expect(r).toMatchObject({
      ok: true,
      login: {
        accessToken: "acc-NEW",
        refreshToken: "ref-NEW",
        expiresAt: 1000 + 3600_000,
        scopes: ["user:inference", "user:profile"],
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      grant_type: "authorization_code",
      code: "good-code",
      client_id: "client-1",
      redirect_uri: spec.redirectUri,
    });
  });

  it("attack: a code from another attempt (state mismatch) is refused before any request; a refused code fails", async () => {
    seen.length = 0;
    expect(await run(() => "good-code#someone-elses-state")).toMatchObject({
      ok: false,
      code: "state-mismatch",
    });
    expect(await run(() => "")).toMatchObject({ ok: false, code: "no-code" });
    expect(seen).toHaveLength(0);
    expect(await run((state) => `bad-code#${state}`)).toMatchObject({
      ok: false,
      code: "exchange-failed",
    });
  });
});
