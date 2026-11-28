// Approvals that cannot be rubber-stamped (./approval-effect.ts,
// ./approval.ts): the prompt states the call's effect in plain words, and
// what approves is derived from it (the target's name, then a random code).
// A reflexive answer (the code alone, a yes, the previous prompt's answer)
// denies; the right answer approves in any case and with any separators.

import { describe, expect, it } from "vitest";
import {
  CONSEQUENCE,
  approvalConfirmation,
  approvalEffect,
  effectWord,
  normalizeConfirmation,
} from "./approval-effect.js";
import { ApprovalLedger, askWithinTimeout } from "./approval.js";
import type { PreActionEvent } from "./types.js";

const ev = (o: Partial<PreActionEvent>): PreActionEvent =>
  ({
    type: "pre-action",
    actor: { kind: "agent", id: "a" },
    callId: "c1",
    tool: "Bash",
    policyIds: ["bash"],
    kind: "shell",
    params: {},
    cwd: "/p",
    approvalRoute: "host",
    ...o,
  }) as PreActionEvent;

describe("the effect, in plain words", () => {
  it("a file change that cannot be taken back names the file and says so", () => {
    const e = approvalEffect(
      ev({
        tool: "Write",
        kind: "fs-write",
        writes: [{ path: "/p/deploy/config.yaml", op: "write" }],
      }),
      {
        reversible: false,
        targets: [
          {
            path: "/p/deploy/config.yaml",
            realPath: "/p/deploy/config.yaml",
            op: "write",
            reversible: false,
            code: "no-history",
          } as never,
        ],
      },
    );
    expect(e.irreversible).toBe(true);
    expect(e.summary).toBe(
      "changes files with no copy kept: overwrites or creates /p/deploy/config.yaml",
    );
    expect(effectWord(e.target)).toBe("config");
  });

  it("a deletion, a host reached by a command or a fetch, a program, an MCP tool", () => {
    const del = approvalEffect(ev({ tool: "Bash", writes: [{ path: "/p/.env", op: "delete" }] }), {
      reversible: false,
      targets: [],
    });
    expect(del.summary).toContain("deletes /p/.env");
    expect(effectWord(del.target)).toBe("env");
    const curl = approvalEffect(
      ev({
        command: { text: "curl -d @x https://upload.files.example.co.uk/in", dialect: "posix" },
      }),
      { reversible: false, targets: [] },
    );
    expect(curl.summary).toContain("reaches upload.files.example.co.uk");
    expect(effectWord(curl.target)).toBe("example");
    const fetch = approvalEffect(
      ev({ tool: "WebFetch", kind: "fetch", url: "https://api.github.com/x" }),
    );
    expect(effectWord(fetch.target)).toBe("github");
    const prog = approvalEffect(
      ev({ command: { text: "FOO=1 terraform apply", dialect: "posix" } }),
    );
    expect(effectWord(prog.target)).toBe("terrafor");
    const mcp = approvalEffect(
      ev({
        tool: "mcp__mail__send_email",
        kind: "mcp",
        mcp: { server: "mail", tool: "send_email" },
      }),
    );
    expect(mcp.summary).toContain("send_email");
    expect(effectWord(mcp.target)).toBe("sendemai");
  });

  it("names cannot carry terminal escapes onto the prompt", () => {
    const e = approvalEffect(
      ev({
        tool: "Write",
        kind: "fs-write",
        writes: [{ path: "/p/a\u001b[2Jb.txt", op: "write" }],
      }),
    );
    expect(e.summary).not.toContain("\u001b");
  });
});

describe("what approves is derived from the effect", () => {
  const effect = approvalEffect(
    ev({
      tool: "Write",
      kind: "fs-write",
      writes: [{ path: "/p/deploy/config.yaml", op: "edit" }],
    }),
    { reversible: false, targets: [] },
  );

  it("the target's word and the random code, separators and case ignored", () => {
    const c = approvalConfirmation(effect, "kqr");
    expect(c.answer).toBe("configkqr");
    expect(c.prompt).toContain("type config kqr");
    for (const typed of ["config kqr", "Config-KQR", " configkqr ", "CONFIG_kqr"]) {
      expect(normalizeConfirmation(typed)).toBe(c.answer);
    }
  });

  it("the ledger: the code alone, the word alone, a yes, or another target's answer deny; the derived answer approves", () => {
    const ledger = new ApprovalLedger({ code: () => "kqr" });
    const params = { file_path: "/p/deploy/config.yaml" };
    const ask = () => ledger.request({ callId: "c1", tool: "Write", params, reason: "r", effect });
    const answer = (id: string, typed: string) =>
      ledger.answer({
        type: "approval-answer",
        requestId: id,
        typed,
        callId: "c1",
        tool: "Write",
        params,
      });
    for (const typed of ["kqr", "config", "y", "yes", "", "secretskqr"]) {
      const r = ask();
      expect(r.effect.summary).toContain("/p/deploy/config.yaml");
      expect([typed, answer(r.id, typed).code]).toEqual([typed, "wrong-code"]);
    }
    const r = ask();
    expect(answer(r.id, "config kqr").approved).toBe(true);
  });

  it("the answer's length follows the target (not a constant-length code)", () => {
    const lengths = new Set(
      ["/p/a.txt", "/p/Makefile", "/p/src/index.ts", "/p/.env"].map(
        (p) =>
          approvalConfirmation(
            approvalEffect(
              ev({ tool: "Write", kind: "fs-write", writes: [{ path: p, op: "write" }] }),
            ),
            "kqr",
          ).answer.length,
      ),
    );
    expect(lengths.size).toBeGreaterThan(2);
  });

  it("askWithinTimeout compares the same way", async () => {
    const yes = await askWithinTimeout({
      code: "configkqr",
      read: async () => ({ answer: "Config KQR" }),
    });
    expect(yes.approved).toBe(true);
    const no = await askWithinTimeout({ code: "configkqr", read: async () => ({ answer: "kqr" }) });
    expect(no.code).toBe("wrong-code");
  });
});

describe("a prompt names the consequence, never only that it cannot be undone", () => {
  it('every lead reads after "it ", has no colon and fits Enclawed Code\'s lead (40 characters)', () => {
    for (const lead of Object.values(CONSEQUENCE)) {
      expect(lead.length, lead).toBeLessThanOrEqual(40);
      expect(lead, lead).not.toMatch(/:/);
      expect(lead, lead).not.toMatch(/cannot be undone|may not be undoable/);
    }
  });

  it("the decision's codes pick the consequence; with none known, it says what Enclawed cannot tell", () => {
    const cmd = (text: string) => ev({ command: { text, dialect: "posix" } });
    const of = (text: string, codes: string[], reversible: boolean | null = false) =>
      approvalEffect(cmd(text), { reversible, targets: [], codes }).summary;
    expect(of("cat ~/.aws/credentials", ["credential-path"])).toMatch(
      /^can put a secret in the conversation: /,
    );
    expect(of("npm install x", ["package-install"])).toMatch(/^installs code from the network: /);
    expect(of("make t", ["shell:command-not-allowlisted", "project-script"])).toMatch(
      /^runs project code Enclawed can't read: /,
    );
    expect(of("terraform apply", ["shell:command-not-allowlisted"])).toMatch(
      /^runs code Enclawed can't check: /,
    );
    expect(of("curl https://x.example/", [])).toMatch(/^can send data off this machine: /);
    for (const s of [
      of("terraform apply", []),
      of("terraform apply", [], null),
      approvalEffect(ev({ writes: [{ path: "/p/a", op: "write" }] })).summary,
      approvalEffect(ev({ tool: "mcp__m__send", kind: "mcp", mcp: { server: "m", tool: "send" } }))
        .summary,
    ]) {
      expect(s).not.toMatch(/cannot be undone|may not be undoable/);
    }
  });
});
