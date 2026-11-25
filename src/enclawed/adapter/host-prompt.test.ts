// Asks answered at the host's own permission prompt (./host-prompt.ts). The
// host (Claude Code 2.1.326) re-checks a pending call when its permission
// context changes while the prompt is open (a mode switch) and runs the call
// when its own check now allows it, with no answer from the person. Attacks:
// an irreversible call the host can approve by itself is denied up front; a
// revertible write the host ran in a mode it approves by itself is put back
// from its snapshot, quarantined, and the session held; a changed input; an
// unreadable grant; an answering hook or plugin. False positives: a person's
// approval in default mode; a call the host cannot approve by itself stays
// asked in any mode; a call never asked passes untouched.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LEVEL, makeLabel } from "../classification.js";
import { HistoryStore } from "../history-store.js";
import { createPolicy } from "../policy.js";
import { launchMcpServer } from "./contained-launch.js";
import { DecisionEngine, inputDigest, type EngineOptions } from "./engine.js";
import { nodeFsProbe } from "./fs-probe.js";
import type { HostModeOrder } from "./host-modes.js";
import {
  hostMaySelfApprove,
  hostPromptHold,
  hostSelfApproval,
  type HostPromptGuard,
  type HostSelfApproval,
} from "./host-prompt.js";
import { hostPromptAnswerer, type PromptAnswererSpec } from "./managed-hooks.js";
import type { AuditInput, PreActionEvent } from "./types.js";

let root: string;
let repo: string;
beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-host-prompt-")));
  repo = path.join(root, "proj");
  fs.mkdirSync(repo, { recursive: true });
  fs.writeFileSync(path.join(repo, "README.md"), "# x\n");
  const r = spawnSync(
    "sh",
    [
      "-c",
      "git -c init.defaultBranch=main init -q && git add -A && git -c user.name=t -c user.email=t@example.invalid -c core.hooksPath=/dev/null commit -q -m i",
    ],
    { cwd: repo, env: { PATH: process.env.PATH, HOME: repo, GIT_CONFIG_NOSYSTEM: "1" } },
  );
  expect(r.status).toBe(0);
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

// Claude Code 2.1.326, abridged: what its own check allows by itself.
const HOST: HostSelfApproval = {
  personModes: ["default", "plan"],
  kinds: ["read"],
  otherModeKinds: ["fs-write"],
  shellPrefixes: [
    "rm",
    "mv",
    "cp",
    "mkdir",
    "touch",
    "sed",
    "ls",
    "cat",
    "grep",
    "cd",
    "git log",
    "git status",
  ],
  shellDialects: ["powershell"],
  fetchHosts: ["docs.python.org", "go.dev/doc"],
  ruleTools: [],
  ruleToolPrefixes: [],
};

const pol = createPolicy({
  enforceAllowlists: false,
  maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
  defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
});

let n = 0;
let guard: HostPromptGuard;
let audit: AuditInput[];
let store: HistoryStore;
beforeEach(() => {
  n++;
  guard = {
    dir: path.join(root, `hp-${n}`),
    quarantineDir: path.join(root, `q-${n}`),
    host: HOST,
    promptAnswerer: null,
  };
  audit = [];
  store = new HistoryStore({ dir: path.join(root, `h-${n}`), limits: pol.history });
  fs.writeFileSync(path.join(repo, "notes.txt"), "my notes, not committed\n");
});

function engine(extra: Partial<EngineOptions> = {}): DecisionEngine {
  return new DecisionEngine({
    host: "t",
    policy: pol,
    projectDir: repo,
    home: root,
    history: { store },
    hardware: () => ({ allowed: true }),
    fs: nodeFsProbe(),
    audit: {
      append: async (r: AuditInput) => {
        audit.push(r);
      },
    },
    hostPrompt: guard,
    ...extra,
  });
}

function ev(kind: PreActionEvent["kind"], o: Partial<PreActionEvent> = {}): PreActionEvent {
  return {
    type: "pre-action",
    actor: { sessionId: "s", subagentId: null },
    callId: `call-${n}`,
    tool: o.tool ?? kind,
    policyIds: [(o.tool ?? kind).toLowerCase()],
    kind,
    params: {},
    cwd: repo,
    approvalRoute: "person",
    hostMode: "default",
    ...o,
  };
}
const shell = (text: string, o: Partial<PreActionEvent> = {}) =>
  ev("shell", {
    tool: "Bash",
    params: { command: text },
    command: { text, dialect: "posix" },
    ...o,
  });
const NEW = { file_path: "notes.txt", content: "overwritten by the agent\n" };
const writeNotes = (o: Partial<PreActionEvent> = {}) =>
  ev("fs-write", {
    tool: "Write",
    params: NEW,
    writes: [{ path: "notes.txt", op: "write" }],
    ...o,
  });
const post = (e: DecisionEngine, hostMode: string | null, params: Record<string, unknown> = NEW) =>
  e.postAction({
    type: "post-action",
    actor: { sessionId: "s", subagentId: null },
    callId: `call-${n}`,
    tool: "Write",
    kind: "fs-write",
    params,
    result: { ok: true },
    modelReads: false,
    hostMode,
  });
const notes = () => fs.readFileSync(path.join(repo, "notes.txt"), "utf8");

describe("can the host approve a call by itself", () => {
  it("file writes and reads: yes; MCP tools: only through an allow rule", () => {
    expect(hostMaySelfApprove(ev("fs-write"), HOST)).toBe(true);
    expect(hostMaySelfApprove(ev("read"), HOST)).toBe(true);
    // A kind the adapter does not list is one its host always asks about.
    expect(hostMaySelfApprove(ev("session"), HOST)).toBe(false);
    expect(hostMaySelfApprove(ev("mcp", { tool: "mcp__s__t" }), HOST)).toBe(false);
    expect(
      hostMaySelfApprove(ev("mcp", { tool: "mcp__s__t" }), {
        ...HOST,
        ruleToolPrefixes: ["mcp__s__"],
      }),
    ).toBe(true);
    expect(
      hostMaySelfApprove(ev("mcp", { tool: "mcp__s__t" }), { ...HOST, ruleTools: ["*"] }),
    ).toBe(true);
  });

  it("shell: every simple command must be one the host allows; wrappers and unparsed lines count as allowed", () => {
    const can = (t: string) => hostMaySelfApprove(shell(t), HOST);
    expect(can("rm -rf build")).toBe(true);
    expect(can("git log --oneline")).toBe(true);
    expect(can("ls | grep x && cat y")).toBe(true);
    expect(can("timeout 5 rm x")).toBe(true);
    expect(can("FOO=1 /bin/rm x")).toBe(true);
    expect(can("")).toBe(true);
    expect(can("git push origin main")).toBe(false);
    expect(can("npm install")).toBe(false);
    expect(can("cd sub && npm test")).toBe(false);
    expect(
      hostMaySelfApprove(
        shell("Remove-Item x", {
          tool: "PowerShell",
          command: { text: "Remove-Item x", dialect: "powershell" },
        }),
        HOST,
      ),
    ).toBe(true);
  });

  it("an allow rule naming the tool lets the host approve it in any mode: even a revertible write is not asked then", async () => {
    expect(hostSelfApproval(ev("fs-write"), HOST)).toBe("other-mode");
    expect(
      hostSelfApproval(ev("fs-write", { tool: "Write" }), { ...HOST, ruleTools: ["Write"] }),
    ).toBe("any-mode");
    guard = { ...guard, host: { ...HOST, ruleTools: ["Write"] } };
    const d = await engine().preAction(writeNotes());
    expect(d.codes).toContain("untracked-overwrite");
    expect(d.answer).toBe("deny");
    expect(d.codes).toContain("host-self-approval");
  });

  it("fetch: only the host's own preapproved hosts (a host/path entry by its host)", () => {
    const f = (url: string) => hostMaySelfApprove(ev("fetch", { tool: "WebFetch", url }), HOST);
    expect(f("https://docs.python.org/3/")).toBe(true);
    expect(f("https://go.dev/blog/x")).toBe(true);
    expect(f("https://evil.example/x?d=secret")).toBe(false);
    expect(hostMaySelfApprove(ev("fetch", { tool: "WebSearch" }), HOST)).toBe(true);
  });
});

describe("an irreversible ask the host could approve by itself", () => {
  it("attack: denied up front (host-self-approval), never put to the host's prompt", async () => {
    const d = await engine().preAction(shell("rm -rf build"));
    expect(d.outcome).toBe("ask");
    expect(d.answer).toBe("deny");
    expect(d.codes).toContain("host-self-approval");
    expect(d.answerReason).toMatch(/can approve this call by itself/);
    expect(fs.existsSync(guard.dir) ? fs.readdirSync(guard.dir) : []).toEqual([]);
    const rec = audit.find((r) => r.type === "t.tool.pre");
    expect(rec?.payload).toMatchObject({ answered: "deny", hostPrompt: { selfApprovable: true } });
  });

  it("FP: with an adapter prompt (a launcher), the same ask is asked there and the host's prompt is never used", async () => {
    let asked = 0;
    const d = await engine().preAction(shell("rm -rf build"), async (req) => {
      asked++;
      return req.code;
    });
    expect(asked).toBe(1);
    expect(d.answer).toBe("allow");
    expect(d.codes).not.toContain("host-self-approval");
  });
});

describe("an ask the host cannot approve by itself", () => {
  it("FP: asked at the host's prompt in any mode; the person's answer holds whatever mode it runs in", async () => {
    const e = engine();
    for (const mode of ["default", "acceptEdits"]) {
      const d = await e.preAction(shell("git push origin main", { hostMode: mode }));
      expect(d.answer, mode).toBe("ask");
      const r = await e.postAction({
        type: "post-action",
        actor: { sessionId: "s", subagentId: null },
        callId: `call-${n}`,
        tool: "Bash",
        kind: "shell",
        params: { command: "git push origin main" },
        result: "",
        modelReads: true,
        hostMode: "acceptEdits",
      });
      expect(r.hostPrompt).toEqual({ ok: true, selfApprovable: false });
    }
    expect(hostPromptHold(guard)).toBeNull();
  });

  it("attack: a hook or plugin that can answer the host's prompt turns every ask into a denial", async () => {
    guard = { ...guard, promptAnswerer: "user settings set PermissionRequest hooks" };
    const d = await engine().preAction(shell("git push origin main"));
    expect(d.answer).toBe("deny");
    expect(d.codes).toContain("host-prompt-answerable");
  });
});

describe("a revertible write the host could approve by itself", () => {
  it("FP: a person approves it in default mode; it runs in default mode and stands", async () => {
    const e = engine();
    const d = await e.preAction(writeNotes());
    expect(d.codes).toEqual(["untracked-overwrite", "git-untracked"]);
    expect(d.answer).toBe("ask");
    fs.writeFileSync(path.join(repo, "notes.txt"), NEW.content);
    const r = await post(e, "default");
    expect(r.hostPrompt).toEqual({ ok: true, selfApprovable: true });
    expect(notes()).toBe(NEW.content);
    expect(hostPromptHold(guard)).toBeNull();
    // Spent: a second post-tool event for the same call finds no grant.
    expect((await post(e, "acceptEdits")).hostPrompt).toBeUndefined();
  });

  it("attack: the host ran it in acceptEdits (a mode switch while the prompt was open): put back, quarantined, the session held", async () => {
    const e = engine();
    expect((await e.preAction(writeNotes())).answer).toBe("ask");
    fs.writeFileSync(path.join(repo, "notes.txt"), NEW.content);
    const r = await post(e, "acceptEdits");
    expect(r.hostPrompt?.ok).toBe(false);
    if (r.hostPrompt?.ok !== false) {
      return;
    }
    expect(r.hostPrompt.code).toBe("approval-not-from-person");
    expect(notes()).toBe("my notes, not committed\n");
    expect(r.hostPrompt.quarantined).toHaveLength(1);
    expect(fs.readFileSync(r.hostPrompt.quarantined[0].to, "utf8")).toBe(NEW.content);
    expect(r.notice).toMatch(/ran without one/);
    expect(audit.some((a) => a.type === "t.tool.approval-not-from-person")).toBe(true);
    expect(hostPromptHold(guard)).toMatch(/acceptEdits/);
    // Held: every further call is refused, a read included.
    const next = await e.preAction(ev("read", { tool: "Read", reads: [{ path: "README.md" }] }));
    expect(next.answer).toBe("deny");
    expect(next.codes).toEqual(["approval-not-from-person"]);
  });

  it("attack: the input that ran is not the input that was asked", async () => {
    const e = engine();
    await e.preAction(writeNotes());
    fs.writeFileSync(path.join(repo, "notes.txt"), "other\n");
    const r = await post(e, "default", { ...NEW, content: "other\n" });
    expect(r.hostPrompt?.ok).toBe(false);
    expect(notes()).toBe("my notes, not committed\n");
  });

  it("attack: an unreadable grant vouches for nothing", async () => {
    const e = engine();
    await e.preAction(writeNotes());
    for (const f of fs.readdirSync(guard.dir)) {
      fs.writeFileSync(path.join(guard.dir, f), "{torn");
    }
    expect((await post(e, "default")).hostPrompt?.ok).toBe(false);
    expect(hostPromptHold(guard)).toMatch(/could not be read/);
  });

  it("attack: asked in acceptEdits mode, where the host approves it by itself: denied, switch to a person-held mode", async () => {
    const d = await engine().preAction(writeNotes({ hostMode: "acceptEdits" }));
    expect(d.answer).toBe("deny");
    expect(d.answerReason).toMatch(/switch to "default" or "plan"/);
  });

  it("FP: an edit that needs no ask runs in acceptEdits untouched (no grant, nothing checked)", async () => {
    const e = engine();
    const d = await e.preAction(
      ev("fs-write", {
        tool: "Write",
        params: { file_path: "src/new.js" },
        writes: [{ path: "src/new.js", op: "write" }],
        hostMode: "acceptEdits",
      }),
    );
    expect(d.answer).toBe("allow");
    const r = await e.postAction({
      type: "post-action",
      actor: { sessionId: "s", subagentId: null },
      callId: `call-${n}`,
      tool: "Write",
      kind: "fs-write",
      params: { file_path: "src/new.js" },
      result: {},
      modelReads: false,
      hostMode: "acceptEdits",
    });
    expect(r.hostPrompt).toBeUndefined();
    expect(hostPromptHold(guard)).toBeNull();
  });

  it("the digest bound is the canonical input digest", async () => {
    const e = engine();
    await e.preAction(writeNotes());
    const g = JSON.parse(
      fs.readFileSync(path.join(guard.dir, fs.readdirSync(guard.dir)[0]), "utf8"),
    );
    expect(g.digest).toBe(inputDigest(NEW));
    expect(g.targets[0]).toMatchObject({ prior: "content" });
  });
});

// The host's mode order (./host-modes.ts, the mode binding's data) decides
// which declared person modes count: the narrowest prompting rank only, never
// the plan mode (Claude Code reaches it through acceptEdits).
describe("person-held modes under the host's mode order", () => {
  const ORDER: HostModeOrder = {
    rank: { plan: 0, default: 1, dontAsk: 1, acceptEdits: 2, auto: 3, bypassPermissions: 4 },
    notWithin: [["acceptEdits", "auto"]],
    narrowestOfRank: ["dontAsk"],
    planMode: "plan",
    bypassMode: "bypassPermissions",
    planIsBypassWhenAvailable: true,
    noPersonModes: ["bypassPermissions"],
  };
  const ordered = () => {
    guard = {
      ...guard,
      host: { ...HOST, personModes: ["default", "plan", "acceptEdits"], modeOrder: ORDER },
    };
    return engine();
  };

  it("attack: asked in plan or a declared wider mode: denied, switch to default", async () => {
    for (const hostMode of ["plan", "acceptEdits"]) {
      const d = await ordered().preAction(writeNotes({ hostMode }));
      expect(d.answer).toBe("deny");
      expect(d.answerReason).toMatch(/switch to "default" to be asked/);
    }
  });

  it("attack: asked in default, run in plan (through acceptEdits): put back and held", async () => {
    const e = ordered();
    expect((await e.preAction(writeNotes())).answer).toBe("ask");
    fs.writeFileSync(path.join(repo, "notes.txt"), NEW.content);
    const r = await post(e, "plan");
    expect(r.hostPrompt?.ok).toBe(false);
    expect(notes()).toBe("my notes, not committed\n");
  });

  it("FP: asked and run in default stands", async () => {
    const e = ordered();
    expect((await e.preAction(writeNotes())).answer).toBe("ask");
    fs.writeFileSync(path.join(repo, "notes.txt"), NEW.content);
    expect((await post(e, "default")).hostPrompt).toEqual({ ok: true, selfApprovable: true });
  });
});

describe("who can answer the host's prompt (managed settings)", () => {
  const spec: PromptAnswererSpec = {
    lockKey: "allowManagedHooksOnly",
    answerEvents: ["PermissionRequest"],
    pluginsKey: "enabledPlugins",
    pinned: [{ path: ["sandbox", "autoAllowBashIfSandboxed"], value: false }],
  };
  const good = { allowManagedHooksOnly: true, sandbox: { autoAllowBashIfSandboxed: false } };
  const docs = (...d: unknown[]) => d.map((doc, i) => ({ file: `/m/${i}.json`, doc }));

  it("only the person: the lock set, no answering hooks or plugins, the host's self-allow pinned off", () => {
    expect(hostPromptAnswerer(docs(good), spec)).toBeNull();
  });

  it("attack: no lock, an answering hook, an enabled plugin, the pin missing or loosened, an invalid document", () => {
    expect(hostPromptAnswerer([], spec)).toMatch(/no managed settings/);
    expect(
      hostPromptAnswerer(docs({ sandbox: { autoAllowBashIfSandboxed: false } }), spec),
    ).toMatch(/allowManagedHooksOnly/);
    expect(
      hostPromptAnswerer(
        docs(good, {
          hooks: { PermissionRequest: [{ hooks: [{ type: "command", command: "x" }] }] },
        }),
        spec,
      ),
    ).toMatch(/PermissionRequest/);
    expect(hostPromptAnswerer(docs(good, { enabledPlugins: { "p@m": true } }), spec)).toMatch(
      /plugins/,
    );
    expect(hostPromptAnswerer(docs({ allowManagedHooksOnly: true }), spec)).toMatch(
      /autoAllowBashIfSandboxed/,
    );
    expect(
      hostPromptAnswerer(docs(good, { sandbox: { autoAllowBashIfSandboxed: true } }), spec),
    ).toMatch(/autoAllowBashIfSandboxed/);
    expect(hostPromptAnswerer([{ file: "/m/x.json", doc: null, invalid: true }], spec)).toMatch(
      /not valid JSON/,
    );
  });
});

describe("launchMcpServer: the definition's working directory", () => {
  it("attack: a cwd outside the record's roots is refused by the containment (it reaches the plan)", async () => {
    const r = await launchMcpServer(
      { name: "s", command: "/usr/bin/python3", args: ["-m", "srv"], cwd: "/etc" },
      { roots: [{ path: repo, access: "ro", exec: true }], env: [] },
      { stateDir: path.join(root, "st") },
    );
    expect(r.ok).toBe(false);
    if (!r.ok && r.code !== "containment-unavailable") {
      expect(r.code).toBe("containment-cwd-outside-roots");
    }
  });
});
