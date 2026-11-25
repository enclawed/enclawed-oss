// Credentials the session's tools make stay in the session (./tool-credentials.ts with
// ./context-seal.ts under the launch's tools box). Attack side: a gh / npm / aws / git login made
// in the session lands in the session's directory only and is sealed at its end (nothing in the
// person's home, nothing plaintext at rest); one a tool wrote into the person's own credential
// locations anyway (no variable for it, or one ignored) is swept into the store and erased; a
// floor file the session changed is restored; a new file with a credential's name or content in
// any dot-entry is swept; a key added to the ssh agent is removed; the keyring's bus is not in the
// session's environment. False-positive side: the person's own credentials are seeded into the
// session and untouched at home, the seed itself is never sealed, ordinary dotfile changes are
// left alone, and the next session (with the device) gets the session's logins back.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tempTree } from "../containment/test-helpers.js";
import {
  openContextInto,
  prepareContextDir,
  sealContextFrom,
  withContextLock,
} from "./context-seal.js";
import { sealBoxFromSeed } from "./sealed-box.js";
import {
  removeAddedSshIdentities,
  seedToolCredentials,
  snapshotCredentialFloor,
  sshAgentIdentities,
  sweepCredentialFloor,
  toolCredentialEnv,
  toolCredentialLayout,
} from "./tool-credentials.js";

const GH_TOKEN = "gho_SESSIONMADE0123456789abcdefABCDEF0123";
const NPM_TOKEN = "npm_SESSIONMADE0123456789abcdefABCDEF012";
const box = () =>
  sealBoxFromSeed(createHash("sha256").update("tools-seed").digest(), "device:u:box:tools");
let root: string;
let n = 0;

const fresh = () => {
  const d = path.join(root, `c${++n}`);
  const home = path.join(d, "home");
  fs.mkdirSync(path.join(home, ".config", "gh"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".config", "gh", "hosts.yml"),
    "github.com:\n  user: person\n  oauth_token: gho_PERSONOWN0123456789abcdefABCDEF0123\n",
  );
  fs.writeFileSync(path.join(home, ".npmrc"), "registry=https://registry.npmjs.org/\n");
  fs.mkdirSync(path.join(home, ".aws"));
  fs.writeFileSync(
    path.join(home, ".aws", "credentials"),
    "[default]\naws_secret_access_key=PERSONOWNAWS0123456789\n",
  );
  fs.writeFileSync(
    path.join(home, ".gitconfig"),
    "[user]\n\tname = Person\n[credential]\n\thelper = store\n",
  );
  fs.writeFileSync(path.join(home, ".bashrc"), "export A=1\n");
  fs.mkdirSync(path.join(d, "run"), { mode: 0o700 });
  return { d, home, run: path.join(d, "run"), sealed: path.join(d, "sealed") };
};
const allBytes = (dir: string): string => {
  let out = "";
  const walk = (p: string) => {
    const st = fs.lstatSync(p);
    if (st.isDirectory()) {
      fs.readdirSync(p).forEach((c) => walk(path.join(p, c)));
    } else if (st.isFile()) {
      out += fs.readFileSync(p, "latin1");
    }
  };
  if (fs.existsSync(dir)) {
    walk(dir);
  }
  return out;
};

async function launch(c: ReturnType<typeof fresh>, recorded: string | null) {
  const layout = toolCredentialLayout();
  const b = box();
  const p = prepareContextDir({ parent: c.run, layout });
  if (!p.ok) {
    throw new Error(p.message);
  }
  const o = await withContextLock(c.sealed, () =>
    openContextInto({ sealedDir: c.sealed, dir: p.dir, box: b, label: "tools", layout, recorded }),
  );
  b.close();
  if (!o.ok) {
    throw new Error(o.message);
  }
  const baseline = seedToolCredentials({ dir: p.dir, home: c.home, baseline: o.baseline });
  const env = toolCredentialEnv({
    dir: p.dir,
    home: c.home,
    env: { HOME: c.home, DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/bus", PATH: process.env.PATH },
  });
  const floor = snapshotCredentialFloor({ home: c.home, excluded: [".claude"] });
  const end = async () => {
    const swept = sweepCredentialFloor({ snapshot: floor, into: p.dir, excluded: [".claude"] });
    const r = await withContextLock(c.sealed, () =>
      sealContextFrom({
        dir: p.dir,
        sealedDir: c.sealed,
        box: b,
        label: "tools",
        layout,
        baseline,
      }),
    );
    if (!r.ok) {
      throw new Error(r.message);
    }
    return { swept, r };
  };
  return { dir: p.dir, env, end };
}

beforeAll(() => {
  root = tempTree("enclawed-tool-creds");
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("tool credentials made in a session", () => {
  it("land in the session's directory, are sealed at its end, and come back only into the next session", async () => {
    const c = fresh();
    const s = await launch(c, null);
    expect(s.env.DBUS_SESSION_BUS_ADDRESS).toBeUndefined();
    expect(s.env.GH_CONFIG_DIR).toBe(path.join(s.dir, ".config", "gh"));
    // The person's own configuration is seeded.
    expect(fs.readFileSync(path.join(s.env.GH_CONFIG_DIR!, "hosts.yml"), "utf8")).toContain(
      "PERSONOWN",
    );
    // Tools log in during the session (as gh and npm write).
    fs.writeFileSync(
      path.join(s.env.GH_CONFIG_DIR!, "hosts.yml"),
      `github.com:\n  user: agent\n  oauth_token: ${GH_TOKEN}\n`,
    );
    fs.appendFileSync(
      s.env.NPM_CONFIG_USERCONFIG!,
      `//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n`,
    );
    // git keeps credentials only in the session's store (the person's helpers reset).
    const git = spawnSync("git", ["config", "--global", "--get-all", "credential.helper"], {
      env: { ...s.env, HOME: c.home },
      encoding: "utf8",
    });
    expect(git.stdout.trim().split("\n").at(-1)).toContain(
      `store --file=${path.join(s.dir, ".git-credentials")}`,
    );
    expect(
      spawnSync("git", ["config", "--includes", "--global", "user.name"], {
        env: { ...s.env, HOME: c.home },
        encoding: "utf8",
      }).stdout.trim(),
    ).toBe("Person");
    const approve = spawnSync("git", ["credential", "approve"], {
      env: { ...s.env, HOME: c.home },
      input: "protocol=https\nhost=example.com\nusername=agent\npassword=GITSESSIONSECRET42\n\n",
      encoding: "utf8",
    });
    expect(approve.status).toBe(0);
    expect(fs.readFileSync(path.join(s.dir, ".git-credentials"), "utf8")).toContain(
      "GITSESSIONSECRET42",
    );
    const { r } = await s.end();
    expect(r.sealed).toBe(3);
    // The person's home is as it was; nothing of the session is plaintext anywhere at rest.
    expect(fs.readFileSync(path.join(c.home, ".config", "gh", "hosts.yml"), "utf8")).toContain(
      "PERSONOWN",
    );
    expect(fs.existsSync(path.join(c.home, ".git-credentials"))).toBe(false);
    const rest = allBytes(c.home) + allBytes(c.sealed) + allBytes(c.run);
    for (const secret of [GH_TOKEN, NPM_TOKEN, "GITSESSIONSECRET42"]) {
      expect(rest).not.toContain(secret);
    }
    // The person's own token is not copied into the store (the seed is never sealed).
    expect(fs.readdirSync(c.sealed).filter((x) => x.endsWith(".ctx"))).toHaveLength(3);
    // The next session gets the session's logins back.
    const s2 = await launch(c, r.digest);
    expect(fs.readFileSync(path.join(s2.env.GH_CONFIG_DIR!, "hosts.yml"), "utf8")).toContain(
      GH_TOKEN,
    );
    await s2.end();
  });

  it("sweeps a credential a tool wrote into the person's home anyway, and restores a changed floor file", async () => {
    const c = fresh();
    const s = await launch(c, null);
    fs.mkdirSync(path.join(c.home, ".aws", "sso", "cache"), { recursive: true });
    fs.writeFileSync(
      path.join(c.home, ".aws", "sso", "cache", "x.json"),
      '{"accessToken":"AWSSSOSECRET"}',
    );
    fs.writeFileSync(
      path.join(c.home, ".config", "gh", "hosts.yml"),
      `github.com:\n  oauth_token: ${GH_TOKEN}\n`,
    );
    fs.mkdirSync(path.join(c.home, ".newtool"), { recursive: true });
    fs.writeFileSync(path.join(c.home, ".newtool", "auth.json"), `{"token":"${GH_TOKEN}"}`);
    fs.mkdirSync(path.join(c.home, ".ssh"), { recursive: true });
    fs.writeFileSync(
      path.join(c.home, ".ssh", "id_ed25519"),
      "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----\n",
    );
    fs.appendFileSync(path.join(c.home, ".bashrc"), "export B=2\n");
    fs.writeFileSync(path.join(c.home, ".newtool", "prefs.json"), '{"color":"blue"}');
    const { swept } = await s.end();
    expect(swept.map((f) => `${f.change}:${f.rel}`)).toEqual([
      "new:.aws/sso/cache/x.json",
      "changed:.config/gh/hosts.yml",
      "new:.newtool/auth.json",
      "new:.ssh/id_ed25519",
    ]);
    expect(fs.readFileSync(path.join(c.home, ".config", "gh", "hosts.yml"), "utf8")).toContain(
      "PERSONOWN",
    );
    expect(fs.existsSync(path.join(c.home, ".aws", "sso", "cache", "x.json"))).toBe(false);
    expect(fs.existsSync(path.join(c.home, ".ssh", "id_ed25519"))).toBe(false);
    expect(fs.readFileSync(path.join(c.home, ".bashrc"), "utf8")).toContain("B=2");
    expect(fs.existsSync(path.join(c.home, ".newtool", "prefs.json"))).toBe(true);
    const rest = allBytes(c.home) + allBytes(c.sealed);
    expect(rest).not.toContain(GH_TOKEN);
    expect(rest).not.toContain("AWSSSOSECRET");
    expect(rest).not.toContain("OPENSSH PRIVATE KEY");
  });
});

describe("the ssh agent", () => {
  const haveAgent =
    spawnSync("ssh-agent", ["-s"], { encoding: "utf8" }).status === 0 &&
    spawnSync("ssh-keygen", ["-?"]).error === undefined;
  it.skipIf(!haveAgent)(
    "removes an identity added during the session and keeps the person's",
    () => {
      const d = path.join(root, "agent");
      fs.mkdirSync(d, { mode: 0o700 });
      const sock = path.join(d, "a.sock");
      const ag = spawnSync("ssh-agent", ["-a", sock, "-s"], { encoding: "utf8" });
      const pid = /SSH_AGENT_PID=(\d+)/.exec(ag.stdout)?.[1];
      const env = { SSH_AUTH_SOCK: sock, PATH: process.env.PATH };
      try {
        for (const k of ["mine", "session"]) {
          spawnSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", path.join(d, k)]);
        }
        spawnSync("ssh-add", [path.join(d, "mine")], { env });
        const before = sshAgentIdentities(env);
        expect(before).toHaveLength(1);
        spawnSync("ssh-add", [path.join(d, "session")], { env });
        expect(sshAgentIdentities(env)).toHaveLength(2);
        const r = removeAddedSshIdentities(env, before);
        expect(r.removed).toHaveLength(1);
        expect(sshAgentIdentities(env)).toEqual(before);
      } finally {
        if (pid) {
          process.kill(Number(pid));
        }
      }
    },
  );
});
