// The window between a decision and the run: a process outside the agent
// changes what an allowed call touches after it was checked and before (or
// while) it runs. Attack cases: a file the call reads is swapped for a link to
// a credential store, its content is replaced by a secret, a secret is put
// where nothing was; each change is recorded as outside the agent (never
// credited to the call), the call's output is withheld from the model, and
// every later use is decided by the file-integrity rule. Legitimate cases: an
// unchanged read shows its output, a command's own decided writes are its own,
// a change elsewhere does not withhold an output that does not read it.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { LEVEL, makeLabel } from "../classification.js";
import { HistoryStore } from "../history-store.js";
import { createPolicy } from "../policy.js";
import { auditedActionScope } from "./action-scope.js";
import { DecisionEngine, type EngineOptions } from "./engine.js";
import {
  FILE_CHANGED_CODE,
  FILE_CHANGED_EXEC_CODE,
  fileIntegrityLedger,
  type FileIntegrityLedger,
} from "./file-integrity.js";
import { nodeFsProbe } from "./fs-probe.js";
import { projectSecretValues } from "./project-secrets.js";
import { redactSecretAssignments } from "./secret-content.js";
import { NO_SHELL_DEFINITIONS } from "./shell-definitions.js";
import type { AuditInput, PreActionEvent } from "./types.js";

const CANARY = "CANARYwindow7f3a9c";
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-action-window-")));
afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

let proj: string;
let home: string;
let n = 0;
let ledger: FileIntegrityLedger;

function put(rel: string, content: string, root = proj) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
const awsCreds = () => path.join(home, ".aws", "credentials");

beforeEach(() => {
  n++;
  proj = path.join(base, `p${n}`);
  home = path.join(base, `h${n}`);
  put("README.md", "# project\n");
  put("notes.txt", "plain notes\n");
  put("src/a.js", "export const a = 1;\n");
  put(
    ".aws/credentials",
    `[default]\naws_access_key_id = AKIAIOSFODNN7EXAMPLE\naws_secret_access_key = ${CANARY}wJalrXUtnFEMI\n`,
    home,
  );
  ledger = fileIntegrityLedger(path.join(base, `state${n}`, "ledger.json"), proj);
  ledger.compareAtLaunch(ledger.snapshot());
});

function ev(kind: PreActionEvent["kind"], o: Partial<PreActionEvent> = {}): PreActionEvent {
  return {
    type: "pre-action",
    actor: { sessionId: "s", subagentId: null },
    callId: `call-${n}-${Math.random().toString(36).slice(2)}`,
    tool: kind === "shell" ? "Bash" : "Read",
    policyIds: [kind === "shell" ? "exec" : "read"],
    kind,
    params: {},
    cwd: proj,
    approvalRoute: "person",
    ...o,
  };
}
const sh = (text: string) =>
  ev("shell", { command: { text, dialect: "posix" }, params: { command: text } });
const rd = (rel: string) =>
  ev("read", {
    reads: [{ path: path.join(proj, rel) }],
    params: { file_path: path.join(proj, rel) },
  });

function engine(audit: AuditInput[] = []): DecisionEngine {
  const pol = createPolicy({
    enforceAllowlists: false,
    maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
  });
  const o: EngineOptions = {
    host: "test-host",
    shellDefinitions: NO_SHELL_DEFINITIONS,
    policy: pol,
    projectDir: proj,
    home,
    hardware: () => ({ allowed: true }),
    history: { store: new HistoryStore({ dir: path.join(base, `hist${n}`), limits: pol.history }) },
    fs: nodeFsProbe(),
    fileIntegrity: ledger,
    audit: { append: async (r: AuditInput) => void audit.push(r) },
  };
  return new DecisionEngine(o);
}

const post = (e: PreActionEvent, stdout: string) => ({
  type: "post-action" as const,
  actor: e.actor,
  callId: e.callId,
  tool: e.tool,
  kind: e.kind,
  params: e.params,
  result: e.kind === "shell" ? { stdout, stderr: "", interrupted: false } : stdout,
  modelReads: true,
});
const readNow = (rel: string) => {
  try {
    return fs.readFileSync(path.join(proj, rel), "utf8");
  } catch (err) {
    return `cat: ${rel}: ${(err as NodeJS.ErrnoException).code}`;
  }
};
const swapToLink = (rel: string) => {
  fs.rmSync(path.join(proj, rel), { force: true });
  fs.symlinkSync(awsCreds(), path.join(proj, rel));
};

describe("attack: the call's file changes between the decision and the run", () => {
  for (const [name, command, rel, change] of [
    [
      "an existing clean file swapped for a link to a credential store",
      "cat notes.txt",
      "notes.txt",
      swapToLink,
    ],
    [
      "an existing clean file's content replaced by a secret",
      "cat notes.txt",
      "notes.txt",
      (r: string) => put(r, `API_TOKEN=${CANARY}x9\n`),
    ],
    [
      "a missing secret path created as a link to a credential store",
      "cat .env",
      ".env",
      swapToLink,
    ],
    [
      "a missing secret path created as a plain file",
      "cat .env",
      ".env",
      (r: string) => put(r, `AWS_SECRET_ACCESS_KEY=${CANARY}\n`),
    ],
  ] as const) {
    it(`${name}: recorded as outside the agent, the output withheld, later use blocked`, async () => {
      const audit: AuditInput[] = [];
      const e = engine(audit);
      const call = sh(command);
      const d = await e.preAction(call);
      expect(d.answer).toBe("allow"); // checked: nothing there yet, or a clean plain file
      change(rel); // the process outside the agent, before the command runs
      const out = await e.postAction(post(call, readNow(rel)));
      expect(JSON.stringify(out.output)).not.toContain(CANARY);
      expect(out.changed).toBe(true);
      expect(JSON.stringify(out.output)).toContain("withheld by Enclawed");
      expect(out.note).toContain(FILE_CHANGED_CODE);
      expect(audit.some((r) => r.type === "test-host.tool.output-withheld")).toBe(true);
      // Never credited to the call: flagged, and no agent-action names it.
      const s = ledger.state();
      expect(s.changed[rel]).toBeTruthy();
      expect(s.events.some((x) => x.type === "agent-action" && x.paths.includes(rel))).toBe(false);
      // Every later use is decided by the file-integrity rule.
      const next = await e.preAction(sh(`grep -c . ${rel}`));
      expect(next.answer).not.toBe("allow");
      expect(
        next.codes.some(
          (c) => c === FILE_CHANGED_CODE || c === FILE_CHANGED_EXEC_CODE || c === "credential-path",
        ),
      ).toBe(true);
      const nextRead = await e.preAction(rd(rel));
      expect(nextRead.answer).not.toBe("allow");
    });
  }

  it("a read tool's file swapped for a link before it runs: withheld", async () => {
    const e = engine();
    const call = rd("notes.txt");
    expect((await e.preAction(call)).answer).toBe("allow");
    swapToLink("notes.txt");
    const out = await e.postAction(post(call, readNow("notes.txt")));
    expect(JSON.stringify(out.output)).not.toContain(CANARY);
    expect(out.note).toContain(FILE_CHANGED_CODE);
  });

  it("a swap reverted before the call ends is still caught when the watcher saw it", async () => {
    const e = engine();
    const call = sh("cat notes.txt");
    expect((await e.preAction(call)).answer).toBe("allow");
    swapToLink("notes.txt");
    ledger.noteOutsideChange("notes.txt"); // the watcher, while the command runs
    const shown = readNow("notes.txt");
    fs.rmSync(path.join(proj, "notes.txt"));
    put("notes.txt", "plain notes\n"); // put back
    ledger.noteOutsideChange("notes.txt");
    const out = await e.postAction(post(call, shown));
    expect(JSON.stringify(out.output)).not.toContain(CANARY);
    expect(out.note).toContain(FILE_CHANGED_CODE);
  });

  it("decision time: a path that resolves into a credential store is the credential store", async () => {
    const e = engine();
    // No credential format in it (no key id): only where it resolves to says what it is.
    put(
      ".aws/credentials",
      `[default]\nregion = us-east-1\naws_secret_access_key = ${CANARY}wJalrXUtnFEMI\n`,
      home,
    );
    swapToLink("notes.txt");
    ledger.acceptByPerson(
      ["notes.txt"],
      "test: the link is accepted, so only the path rule decides",
    );
    const d = await e.preAction(sh("cat notes.txt"));
    expect(d.answer).not.toBe("allow");
    expect(d.codes).toContain("credential-path");
    const r = await e.preAction(rd("notes.txt"));
    expect(r.answer).not.toBe("allow");
  });
});

describe("the record credits a call only with its decided writes", () => {
  it("read-only: a change during it is outside the agent (and the watcher is not held back)", () => {
    ledger.beginAuditedAction("c1", { writes: "none", reads: [path.join(proj, "README.md")] });
    put("notes.txt", "changed by someone else\n");
    expect(ledger.noteOutsideChange("notes.txt").map((c) => c.path)).toEqual(["notes.txt"]);
    const end = ledger.endAuditedAction("c1");
    expect(end.outside).toEqual(["notes.txt"]);
    expect(end.outsideReads).toEqual([]); // not in its read set: its output stands
  });

  it("a redirect: exactly its targets are its own; anything else is outside", () => {
    ledger.beginAuditedAction("c2", { writes: [path.join(proj, "out.txt")], reads: [] });
    put("out.txt", "written by the command\n");
    put("src/a.js", "export const a = 2; // someone else\n");
    const end = ledger.endAuditedAction("c2");
    expect(end.outside).toEqual(["src/a.js"]);
    const s = ledger.state();
    expect(s.changed["out.txt"]).toBeUndefined();
    expect(s.changed["src/a.js"]).toBeTruthy();
  });

  it("contained execution (any write): what changes is its own, as before", () => {
    ledger.beginAuditedAction("c3", { writes: "any", reads: "any" });
    put("dist/out.js", "built\n");
    ledger.noteOutsideChange("dist/out.js");
    const end = ledger.endAuditedAction("c3");
    expect(end.outside).toEqual([]);
    expect(ledger.state().changed).toEqual({});
  });

  it("the agent's own gated write seen by the watcher during a read is not outside", () => {
    ledger.beginAuditedAction("c4", { writes: "none", reads: "any" });
    put("notes.txt", "the agent's Write\n");
    ledger.noteOutsideChange("notes.txt");
    ledger.noteGatedWrite(path.join(proj, "notes.txt"), "write");
    const end = ledger.endAuditedAction("c4");
    expect(end.outsideReads).toEqual([]);
    expect(ledger.state().changed).toEqual({});
  });

  it("a second end does nothing; a dropped action credits nothing", () => {
    ledger.beginAuditedAction("c5", { writes: "none", reads: "any" });
    put("notes.txt", "outside\n");
    expect(ledger.endAuditedAction("c5").outsideReads).toEqual(["notes.txt"]);
    expect(ledger.endAuditedAction("c5")).toEqual({ ended: false, outside: [], outsideReads: [] });
    ledger.beginAuditedAction("c6", { writes: "any", reads: "any" });
    ledger.dropAuditedAction("c6");
    put("README.md", "# changed\n");
    expect(ledger.endAuditedAction("c6").ended).toBe(false);
    expect(ledger.rescan().map((c) => c.path)).toEqual(["README.md"]);
  });
});

describe("false positives: the window rules leave ordinary calls alone", () => {
  it("an unchanged read shows its output; a change elsewhere does not withhold it", async () => {
    const e = engine();
    const call = sh("cat README.md");
    expect((await e.preAction(call)).answer).toBe("allow");
    put("src/a.js", "export const a = 3;\n"); // someone edits another file meanwhile
    const out = await e.postAction(post(call, readNow("README.md")));
    expect(out.changed).toBe(false);
    const call2 = rd("notes.txt");
    expect((await e.preAction(call2)).answer).toBe("allow");
    expect((await e.postAction(post(call2, readNow("notes.txt")))).changed).toBe(false);
  });

  it("the scope a decision gives: read-only, redirect, contained", () => {
    const o = { projectDir: proj, home };
    expect(auditedActionScope(sh("cat notes.txt"), { codes: ["read-only-command"] }, o)).toEqual({
      writes: "none",
      reads: [path.join(proj, "cat"), path.join(proj, "notes.txt")],
    });
    expect(
      auditedActionScope(sh("grep -r x"), { codes: ["read-only-command"] }, o).reads,
    ).toContain(proj);
    expect(auditedActionScope(sh("git diff"), { codes: ["read-only-command"] }, o).reads).toContain(
      proj,
    );
    expect(
      auditedActionScope(sh("cat src/*.js"), { codes: ["read-only-command"] }, o).reads,
    ).toContain(path.join(proj, "src"));
    expect(
      auditedActionScope(sh("cd src && cat a.js"), { codes: ["read-only-command"] }, o).reads,
    ).toContain(path.join(proj, "src", "a.js"));
    expect(auditedActionScope(sh("npm test"), { codes: ["contained-execution"] }, o).writes).toBe(
      "any",
    );
    expect(
      auditedActionScope(
        sh("rm x"),
        { codes: ["shell:command-not-allowlisted"] },
        { ...o, asked: true },
      ).writes,
    ).toBe("any");
    expect(auditedActionScope(sh("echo hi 'unclosed"), { codes: ["shell:x"] }, o).writes).toBe(
      "any",
    );
    expect(auditedActionScope(sh("a 'b"), { codes: ["read-only-command"] }, o).reads).toBe("any");
  });
});

describe("output cleaner: secrets by content and through links", () => {
  it("credential-shaped assignments lose their values; ordinary ones stay", () => {
    const t = `[default]\naws_secret_access_key = ${CANARY}wJalr\n"api_token": "${CANARY}abc"\nPORT=3000\nsha256: ${"ab12".repeat(16)}\nversion = 1.2.3-beta45678\n`;
    const r = redactSecretAssignments(t);
    expect(r.text).not.toContain(CANARY);
    expect(r.removed).toBe(2);
    expect(r.text).toContain("PORT=3000");
    expect(r.text).toContain("ab12ab12");
    expect(r.text).toContain("1.2.3-beta45678");
  });

  it("a link in the project to a credential store: its values are removed from any output", () => {
    swapToLink("notes.txt");
    expect(projectSecretValues(proj, home)).toContain(`${CANARY}wJalrXUtnFEMI`);
  });
});
