// Credential custody coverage ported from codenclawed (credential-reads.mjs):
// other processes' environments through ps, assignments before env, deploy
// keys in ~/.ssh by any name, per-thread /proc environ, more home credential
// stores, credential JSON by name, and search arguments with control
// characters or program-running flags anywhere. False positives: printenv of
// ordinary names, env running a command, public keys and certificates, listings.

import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { commandReachesCredential, credentialPathOf, dumpsEnvironment } from "./credentials.js";
import { nodeFsProbe } from "./fs-probe.js";

const home = path.join(os.tmpdir(), "enclawed-cred-home");
const cwd = path.join(home, "proj");
const reaches = (c: string) =>
  commandReachesCredential(nodeFsProbe(), c, cwd, home) ??
  (dumpsEnvironment(c, "posix") ? "env" : null);

describe("credential coverage", () => {
  it("attack: process environments, deploy keys, per-thread environ and further credential stores are reached", () => {
    for (const c of [
      "ps eww",
      "ps auxe",
      "ps -E",
      "FOO=1 env",
      "env -u PATH",
      "env -0",
      "printenv AWS_SECRET_ACCESS_KEY",
      "cat ~/.ssh/deploy_rsa",
      "cat ~/.ssh/github",
      "cat /proc/self/task/12/environ",
      "cat /proc/*/environ",
      "cat ~/.vault-token",
      "cat ~/.cargo/credentials.toml",
      "cat ~/.config/op/config",
      "cat gcp/service-account-prod.json",
      "cat keyfile.json",
    ]) {
      expect(reaches(c), c).not.toBeNull();
    }
  });

  it("false positive: ordinary printenv, env running a command, public keys, certificates and listings", () => {
    for (const c of [
      "printenv PATH",
      "printenv HOME LANG",
      "env FOO=1 ls",
      "env -i PATH=/bin ls",
      "env --version",
      "cat ~/.ssh/id_ed25519.pub",
      "cat ~/.ssh/known_hosts",
      "cat ~/.ssh/config",
      "cat certs/fullchain.pem",
      "cat ca-bundle.pem",
      "cat certs/public.pem",
      "ls ~/.ssh",
      "ls -la ~/.ssh/id_rsa",
      "stat ~/.aws/credentials",
      "ls certs/*.pem",
      "ps aux",
      "ps -ef",
    ]) {
      expect(reaches(c), c).toBeNull();
    }
    expect(credentialPathOf(path.join(home, ".ssh", "authorized_keys"), home)).toBeNull();
    expect(credentialPathOf(path.join(cwd, "certs", "server.pem"), home)).not.toBeNull();
  });
});

describe("search arguments", async () => {
  const { decidePreAction } = await import("./engine.js");
  const { createPolicy } = await import("../policy.js");
  const { HistoryStore } = await import("../history-store.js");
  const { LEVEL, makeLabel } = await import("../classification.js");
  const pol = createPolicy({
    enforceAllowlists: false,
    maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
  });
  const opts = {
    host: "t",
    policy: pol,
    projectDir: cwd,
    home,
    hardware: () => ({ allowed: true }) as const,
    history: { store: new HistoryStore({ dir: path.join(home, "h"), limits: pol.history }) },
  };
  const grep = (params: Record<string, unknown>) =>
    decidePreAction(
      {
        type: "pre-action",
        actor: { sessionId: "s", subagentId: null },
        callId: "c",
        tool: "Grep",
        policyIds: ["grep"],
        kind: "read",
        params,
        reads: [{ path: typeof params.path === "string" ? params.path : cwd, recursive: true }],
        literalParams: ["pattern"],
        cwd,
        approvalRoute: "person",
      },
      opts,
    );

  it("attack: a control character or a program-running flag anywhere in an argument is refused", async () => {
    for (const p of [
      { pattern: "x", path: "src --pre=/tmp/evil" },
      { pattern: "x", glob: "*.js\n--pre=sh" },
      { pattern: "x\0--pre", path: "src" },
      { pattern: "x", type: "js -z" },
    ]) {
      expect((await grep(p)).codes, JSON.stringify(p)).toEqual(["read-argument-injection"]);
    }
  });

  it("false positive: plain searches and a pattern that begins with - (passed as data)", async () => {
    for (const p of [
      { pattern: "TODO", path: "src", glob: "*.ts", type: "js" },
      { pattern: "--verbose" },
      { pattern: "-[0-9]+ --pre", glob: "!*.min.js" },
    ]) {
      expect((await grep(p)).outcome, JSON.stringify(p)).toBe("allow");
    }
  });
});

describe("glob listings", () => {
  const probe = nodeFsProbe();
  it("attack: a listing inside a credential store reaches it; a glob that names a credential path, read, reaches it", async () => {
    const { readReachesCredential } = await import("./credentials.js");
    expect(
      readReachesCredential(probe, path.join(home, ".aws", "*"), home, true, true),
    ).not.toBeNull();
    expect(readReachesCredential(probe, "/proc/*/environ", home, false)).not.toBeNull();
    expect(readReachesCredential(probe, path.join(cwd, ".env*"), home, false)).not.toBeNull();
  });

  it("false positive: listing names that match .env, or the home directory's names, reaches nothing", async () => {
    const { readReachesCredential } = await import("./credentials.js");
    expect(readReachesCredential(probe, path.join(cwd, "**", ".env"), home, true, true)).toBeNull();
    expect(readReachesCredential(probe, path.join(home, "*"), home, true, true)).toBeNull();
  });
});
