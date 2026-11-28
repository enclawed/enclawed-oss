// A secret recognized by what a file holds, wherever it is (./secret-content.ts):
// reads of it wait for a person (refused with none), commands that print it
// too, counts and listings do not show it, and provider key formats are
// removed from results like the framework's credential formats.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEVEL, makeLabel } from "../classification.js";
import { HistoryStore } from "../history-store.js";
import { createPolicy } from "../policy.js";
import { CREDENTIAL_PLACEHOLDER, credentialFindings, redactCredentials } from "./credentials.js";
import { decidePreAction, type EngineOptions } from "./engine.js";
import { nodeFsProbe } from "./fs-probe.js";
import { secretInText } from "./secret-content.js";
import { NO_SHELL_DEFINITIONS } from "./shell-definitions.js";
import type { PreActionEvent } from "./types.js";

let root: string;
let proj: string;
const GH = `ghp_${"a1B2c3D4e5".repeat(4)}`;

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-secret-content-")));
  proj = path.join(root, "proj");
  const put = (rel: string, s: string) => {
    fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true });
    fs.writeFileSync(path.join(proj, rel), s);
  };
  put("config/railway-token.txt", "railway-CANARY-4e025c6264f1\n");
  put("notes.txt", `deploy notes\nuse ${GH} for the bot\n`);
  put("src/a.js", "export const a = 1;\n");
  put("VERSION", "1.2.3\n");
  put("docs/tokens.md", "# Tokens\n\nThis page explains how we rotate tokens every 90 days.\n");
  put("config/auth.env", "API_TOKEN=Zx81kq0PpL2mV7tR\n");
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

let n = 0;
function opts(): EngineOptions {
  const policy = createPolicy({
    enforceAllowlists: false,
    maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
  });
  return {
    host: "test-host",
    shellDefinitions: NO_SHELL_DEFINITIONS,
    policy,
    projectDir: proj,
    home: path.join(root, "home"),
    hardware: () => ({ allowed: true }),
    history: {
      store: new HistoryStore({ dir: path.join(root, `h${n++}`), limits: policy.history }),
    },
    fs: nodeFsProbe(),
  };
}

const base = (o: Partial<PreActionEvent>): PreActionEvent => ({
  type: "pre-action",
  actor: { sessionId: "s", subagentId: null },
  callId: `c${n++}`,
  tool: "Read",
  policyIds: ["read"],
  kind: "read",
  params: {},
  cwd: proj,
  approvalRoute: "person",
  ...o,
});
const read = (rel: string, route: PreActionEvent["approvalRoute"] = "person") =>
  base({
    reads: [{ path: path.join(proj, rel) }],
    params: { file_path: path.join(proj, rel) },
    approvalRoute: route,
  });
const sh = (text: string) =>
  base({
    tool: "Bash",
    policyIds: ["bash", "exec"],
    kind: "shell",
    params: { command: text },
    command: { text, dialect: "posix" },
  });

describe("a secret recognized by content", () => {
  it("a read of a token file anywhere in the project asks, and is refused with no person", async () => {
    for (const rel of ["config/railway-token.txt", "notes.txt", "config/auth.env"]) {
      const d = await decidePreAction(read(rel), opts());
      expect(d.outcome, rel).toBe("ask");
      expect(d.codes, rel).toEqual(["credential-path"]);
      expect(d.reason, rel).toMatch(/a file that holds/);
    }
    const headless = await decidePreAction(read("config/railway-token.txt", "no-person"), opts());
    expect(headless.outcome).toBe("deny");
  });

  it("ordinary files run: code, a version file, a page about tokens", async () => {
    for (const rel of ["src/a.js", "VERSION", "docs/tokens.md"]) {
      expect((await decidePreAction(read(rel), opts())).outcome, rel).toBe("allow");
    }
  });

  it("a command that prints the file asks; one that counts or lists it does not", async () => {
    for (const text of [
      "cat config/railway-token.txt",
      "head -1 notes.txt",
      "wc --files0-from=config/railway-token.txt",
    ]) {
      expect((await decidePreAction(sh(text), opts())).outcome, text).toBe("ask");
    }
    for (const text of [
      "wc -c config/railway-token.txt && git log --oneline -5",
      "ls -la config",
    ]) {
      expect((await decidePreAction(sh(text), opts())).outcome, text).toBe("allow");
    }
  });

  it("names and shapes: a token-named file of prose or a short value is not a secret", () => {
    const none = () => [];
    expect(secretInText("railway-CANARY-4e025c6264f1\n", "railway-token.txt", none)).toMatch(
      /token/,
    );
    expect(secretInText("hello world, see the docs\n", "token-guide.txt", none)).toBeNull();
    expect(secretInText("abc\n", "secret.txt", none)).toBeNull();
    expect(secretInText("railway-CANARY-4e025c6264f1\n", "notes.txt", none)).toBeNull();
    expect(secretInText("-----BEGIN OPENSSH PRIVATE KEY-----\nx\n", "anything", none)).toBe(
      "a private key",
    );
  });

  it("provider key formats are credential findings, so results lose them and outbound arguments refuse them", () => {
    // A Hugging Face token: not a format the framework's DLP scanner knows.
    const HF = `hf_${"Qw3rTy7uIo".repeat(4)}`;
    expect(credentialFindings(`token ${HF} end`).map((f) => f.id)).toContain("huggingface-token");
    expect(redactCredentials(`use ${HF} now`).text).toBe(`use ${CREDENTIAL_PLACEHOLDER} now`);
  });
});
