// A held conflict in repository configuration, resolved with no launcher
// prompt (the host's managed mode): the one write of the conflicted file is
// asked at the host's own prompt (a grant in the file-backed
// ApprovalGrantLedger, bound to the path, the file and its conflicted
// content, and the call), the host's post-tool event spends it, and the file
// is admitted again before the session goes on. Attacks: any other call, a
// changed, linked or replaced file, no person, a forged or replayed post-tool
// event, an expired grant, an unresolved or inadmissible result.

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LEVEL, makeLabel } from "../classification.js";
import { HistoryStore } from "../history-store.js";
import { createPolicy } from "../policy.js";
import { APPROVAL_TIMEOUT_MS } from "./approval.js";
import { decidePreAction } from "./engine.js";
import { nodeFsProbe } from "./fs-probe.js";
import {
  completeConflictResolution,
  fileHoldStore,
  type ConflictGrants,
  type HoldStore,
} from "./repo-config-hold.js";
import type { PreActionEvent } from "./types.js";

let root: string;
let session: string;
beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-conflict-")));
  session = path.join(root, "session");
  fs.mkdirSync(session, { mode: 0o700 });
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const sha = (p: string) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const settings = () => path.join(root, ".claude", "settings.json");
const CONFLICT = '<<<<<<< ours\n{"a":1}\n=======\n{"a":2}\n>>>>>>> theirs\n';

let hold: HoldStore;
let grants: ConflictGrants;
beforeEach(async () => {
  fs.rmSync(settings(), { force: true });
  fs.writeFileSync(settings(), CONFLICT);
  for (const f of fs.readdirSync(session)) {
    fs.rmSync(path.join(session, f), { force: true });
  }
  hold = fileHoldStore(path.join(session, "hold.json"));
  grants = {
    file: path.join(session, "conflict-grants.json"),
    personModes: ["default", "plan"],
  };
  await hold.set({
    reason: "repo-config-changed",
    since: Date.now(),
    paths: [{ path: settings(), sha256: sha(settings()), state: "conflicted" }],
    refusals: ["a checkout left a conflict"],
  });
});

const pol = createPolicy({
  enforceAllowlists: false,
  maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
  defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
});
const decide = (
  e: Partial<PreActionEvent> & Pick<PreActionEvent, "tool" | "kind">,
  withGrants = true,
) =>
  decidePreAction(
    {
      type: "pre-action",
      actor: { sessionId: "s", subagentId: null },
      callId: "call-1",
      policyIds: [e.tool.toLowerCase()],
      params: {},
      cwd: root,
      approvalRoute: "person",
      hostMode: "default",
      ...e,
    } as PreActionEvent,
    {
      host: "t",
      policy: pol,
      projectDir: root,
      home: root,
      history: { store: new HistoryStore({ dir: path.join(root, ".h"), limits: pol.history }) },
      hardware: () => ({ allowed: true }),
      fs: nodeFsProbe(),
      repoConfigHold: hold,
      ...(withGrants ? { conflictGrants: grants } : {}),
    },
  );
const writeSettings = (callId = "call-1", extra: Partial<PreActionEvent> = {}) =>
  decide({
    tool: "Write",
    kind: "fs-write",
    callId,
    params: { file_path: ".claude/settings.json" },
    writes: [{ path: ".claude/settings.json", op: "write" }],
    ...extra,
  });
const admitOk = async () => ({ ok: true as const });

describe("a held conflict, resolved at the host's prompt", () => {
  it("false positive: the write is asked, the host runs it, the file is admitted and the session resumes", async () => {
    const d = await writeSettings();
    expect(d.outcome).toBe("ask");
    expect(d.codes).toEqual(["repo-config-conflict-resolution"]);
    expect(d.reason).toMatch(/conflict in .*settings\.json/);
    fs.writeFileSync(settings(), '{"a":2}\n');
    const r = await completeConflictResolution({
      hold,
      grants,
      callId: "call-1",
      hostMode: "default",
      admit: admitOk,
    });
    expect(r).toMatchObject({ action: "resumed" });
    expect(await hold.get()).toBeNull();
    expect(
      (await decide({ tool: "Read", kind: "read", reads: [{ path: settings() }] })).outcome,
    ).toBe("allow");
  });

  it("attack: every other call is still denied while held", async () => {
    expect(
      (await decide({ tool: "Bash", kind: "shell", command: { text: "ls", dialect: "posix" } }))
        .codes,
    ).toEqual(["repo-config-held"]);
    const other = await decide({
      tool: "Write",
      kind: "fs-write",
      writes: [{ path: "src/x.ts", op: "write" }],
    });
    expect(other.codes).toEqual(["repo-config-held"]);
    const both = await decide({
      tool: "MultiWrite",
      kind: "fs-write",
      writes: [
        { path: ".claude/settings.json", op: "write" },
        { path: ".claude/other.json", op: "write" },
      ],
    });
    expect(both.codes).toEqual(["repo-config-held"]);
    // Without the host-prompt route (a launcher session), the hold's denial stands.
    expect(
      (
        await decide(
          {
            tool: "Write",
            kind: "fs-write",
            writes: [{ path: ".claude/settings.json", op: "write" }],
          },
          false,
        )
      ).codes,
    ).toEqual(["repo-config-held"]);
  });

  it("attack: no person to ask, or a file that is not the conflicted one, is denied", async () => {
    expect((await writeSettings("c", { approvalRoute: "no-person" })).outcome).toBe("deny");
    fs.appendFileSync(settings(), "x");
    expect((await writeSettings("c2")).outcome).toBe("deny");
    // Same content, but a hard link or a symlink: not the file git left.
    fs.writeFileSync(settings(), CONFLICT);
    fs.linkSync(settings(), path.join(root, "linked"));
    expect((await writeSettings("c3")).outcome).toBe("deny");
    fs.rmSync(path.join(root, "linked"));
    const elsewhere = path.join(root, "elsewhere.json");
    fs.writeFileSync(elsewhere, CONFLICT);
    fs.rmSync(settings());
    fs.symlinkSync(elsewhere, settings());
    expect((await writeSettings("c4")).outcome).toBe("deny");
    expect(fs.existsSync(grants.file)).toBe(false);
  });

  it("attack: a post-tool event for a call nobody was asked about, or a replay, releases nothing", async () => {
    expect((await writeSettings()).outcome).toBe("ask");
    fs.writeFileSync(settings(), '{"a":2}\n');
    expect(
      await completeConflictResolution({
        hold,
        grants,
        callId: "forged",
        hostMode: "default",
        admit: admitOk,
      }),
    ).toBeNull();
    expect(
      await completeConflictResolution({
        hold,
        grants,
        callId: null,
        hostMode: "default",
        admit: admitOk,
      }),
    ).toBeNull();
    expect(await hold.get()).not.toBeNull();
    // A grant file another process wrote by hand is not a grant of the ledger.
    fs.writeFileSync(
      grants.file,
      JSON.stringify({
        ledger: [],
        calls: { x: { id: "nope", path: settings(), sha256: "0", resource: {} } },
      }),
    );
    expect(
      await completeConflictResolution({
        hold,
        grants,
        callId: "x",
        hostMode: "default",
        admit: admitOk,
      }),
    ).toMatchObject({
      action: "refused",
      code: "unknown-grant",
    });
    expect(await hold.get()).not.toBeNull();
  });

  it("attack: the grant is spent once; a second post-tool event for the same call does nothing", async () => {
    fs.writeFileSync(settings(), CONFLICT);
    expect((await writeSettings()).outcome).toBe("ask");
    fs.writeFileSync(settings(), '{"a":2}\n');
    const admits: number[] = [];
    const admit = async () => {
      admits.push(1);
      return { ok: false as const, refusals: ["inadmissible: a hook it adds is not granted"] };
    };
    const r = await completeConflictResolution({
      hold,
      grants,
      callId: "call-1",
      hostMode: "default",
      admit,
    });
    expect(r).toMatchObject({ action: "held", code: "repo-config-inadmissible" });
    expect(await hold.get()).not.toBeNull();
    expect(
      await completeConflictResolution({
        hold,
        grants,
        callId: "call-1",
        hostMode: "default",
        admit: admitOk,
      }),
    ).toBeNull();
    expect(admits).toHaveLength(1);
    expect(await hold.get()).not.toBeNull();
  });

  it("attack: an expired grant, or a write that left the conflict, resolves nothing", async () => {
    const t0 = Date.now();
    expect((await writeSettings()).outcome).toBe("ask");
    fs.writeFileSync(settings(), '{"a":2}\n');
    expect(
      await completeConflictResolution({
        hold,
        grants,
        callId: "call-1",
        hostMode: "default",
        admit: admitOk,
        now: () => t0 + APPROVAL_TIMEOUT_MS + 60_000,
      }),
    ).toMatchObject({ action: "refused", code: "expired" });
    expect(await hold.get()).not.toBeNull();
    fs.writeFileSync(settings(), CONFLICT);
    expect((await writeSettings("call-2")).outcome).toBe("ask");
    expect(
      await completeConflictResolution({
        hold,
        grants,
        callId: "call-2",
        hostMode: "default",
        admit: admitOk,
      }),
    ).toMatchObject({
      action: "refused",
      code: "not-resolved",
    });
    expect(await hold.get()).not.toBeNull();
  });

  it("attack: a host mode whose prompt the host may answer itself is never asked", async () => {
    // acceptEdits (and bypass / auto): a mode switch or context change while
    // the prompt is open re-checks the call and may approve it with no answer.
    for (const hostMode of ["acceptEdits", "bypassPermissions", "auto", "dontAsk", null]) {
      const d = await writeSettings(`m-${String(hostMode)}`, { hostMode });
      expect(d.outcome, String(hostMode)).toBe("deny");
      expect(d.reason).toMatch(/can approve the write without the person/);
    }
    expect(fs.existsSync(grants.file)).toBe(false);
  });

  it("attack: asked in default mode, but the host ran it after a switch to acceptEdits: not admitted, quarantined, still held", async () => {
    expect((await writeSettings()).outcome).toBe("ask");
    fs.writeFileSync(settings(), '{"a":2}\n');
    const quarantined: string[] = [];
    const r = await completeConflictResolution({
      hold,
      grants,
      callId: "call-1",
      hostMode: "acceptEdits",
      admit: admitOk,
      onInadmissible: (paths) => {
        quarantined.push(...paths);
      },
    });
    expect(r).toMatchObject({ action: "refused", code: "no-person-answer" });
    expect(quarantined).toEqual([settings()]);
    expect(await hold.get()).not.toBeNull();
    // The grant was spent: a replay in default mode releases nothing.
    expect(
      await completeConflictResolution({
        hold,
        grants,
        callId: "call-1",
        hostMode: "default",
        admit: admitOk,
      }),
    ).toBeNull();
  });

  it("false positive: plan mode is a person-held mode too", async () => {
    expect((await writeSettings("p1", { hostMode: "plan" })).outcome).toBe("ask");
  });

  it("attack: with the host's mode order (Claude Code's), a declared plan mode is not the person's (reached through acceptEdits); default still is", async () => {
    grants = {
      ...grants,
      modeOrder: {
        rank: { plan: 0, default: 1, dontAsk: 1, acceptEdits: 2, auto: 3, bypassPermissions: 4 },
        notWithin: [["acceptEdits", "auto"]],
        narrowestOfRank: ["dontAsk"],
        planMode: "plan",
        bypassMode: "bypassPermissions",
        planIsBypassWhenAvailable: true,
        noPersonModes: ["bypassPermissions"],
      },
    };
    const d = await writeSettings("p2", { hostMode: "plan" });
    expect(d.outcome).toBe("deny");
    expect(d.reason).toMatch(/switch to "default" to resolve it/);
    expect((await writeSettings("p3", { hostMode: "default" })).outcome).toBe("ask");
  });
});
