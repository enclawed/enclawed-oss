// 2.0.3, second round from a real-world corpus: sleep, pgrep/pidof, wrappers
// (timeout, nice, stdbuf, env CMD), ${NAME:-WORD}, NAME=$(...) read as unknown,
// export NAME=VALUE, find -print0 | xargs -0 READER, PDF inspection and
// converters whose output file is decided as the equivalent Write. Each
// allowed form with its refused neighbors, end to end through the engine.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEVEL, makeLabel } from "../classification.js";
import { HistoryStore } from "../history-store.js";
import { createPolicy } from "../policy.js";
import { decidePreAction, type EngineOptions } from "./engine.js";
import { nodeFsProbe } from "./fs-probe.js";
import { NO_SHELL_DEFINITIONS } from "./shell-definitions.js";
import { classifyCompound } from "./shell-readonly.js";
import type { PreActionEvent } from "./types.js";

let root: string;
let proj: string;
let home: string;
// A minimal PDF (one empty page) the poppler and mutool forms read.
const PDF =
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 72 72]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-shell-forms-")));
  proj = path.join(root, "proj");
  home = path.join(root, "home");
  for (const [rel, s] of [
    ["proj/src/a.cpp", "int a;\n"],
    ["proj/paper.pdf", PDF],
    ["home/.ssh/id_rsa", "-----BEGIN OPENSSH PRIVATE KEY-----\nx\n"],
    ["home/.aws/credentials", "[default]\naws_secret_access_key=x\n"],
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), s);
  }
  const g = (...a: string[]) =>
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@e", ...a], {
      cwd: proj,
      env: { PATH: process.env.PATH, HOME: proj, GIT_CONFIG_NOSYSTEM: "1" },
    });
  g("init", "-q", "-b", "main");
  g("add", "-A");
  g("commit", "-qm", "i");
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

let n = 0;
function opts(extra: Partial<EngineOptions> = {}): EngineOptions {
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
    home,
    hardware: () => ({ allowed: true }),
    history: {
      store: new HistoryStore({ dir: path.join(root, `h${n++}`), limits: policy.history }),
    },
    fs: nodeFsProbe(),
    environment: {
      PATH: "/usr/local/bin:/usr/bin:/bin",
      HOME: home,
      USER: "u",
      AWS_SECRET_ACCESS_KEY: "abc",
    },
    // Without containment: a form that is not read-only asks instead of running contained.
    containScripts: null,
    ...extra,
  };
}
const decide = (text: string, o: EngineOptions = opts()) =>
  decidePreAction(
    {
      type: "pre-action",
      actor: { sessionId: "s", subagentId: null },
      callId: `c${n++}`,
      tool: "Bash",
      policyIds: ["bash", "exec"],
      kind: "shell",
      params: { command: text },
      cwd: proj,
      command: { text, dialect: "posix" },
      approvalRoute: "person",
      hostMode: "default",
    } satisfies PreActionEvent,
    o,
  );
const expectAll = async (texts: readonly string[], outcome: "allow" | "not-allow") => {
  for (const text of texts) {
    const d = await decide(text);
    if (outcome === "allow") {
      expect(d.outcome, `${text}: ${d.reason}`).toBe("allow");
    } else {
      expect(d.outcome, `${text}: ${d.reason}`).not.toBe("allow");
    }
  }
};

describe("sleep, pgrep, pidof", () => {
  it("only wait or print process ids", async () => {
    await expectAll(
      [
        "sleep 5",
        "sleep 0.5 && grep -n a src/a.cpp",
        "sleep 1m; ls",
        "pgrep -fa node",
        "pgrep -f 'enclawed gateway' | head",
        "pgrep -c -u root sshd",
        "pidof node",
      ],
      "allow",
    );
    await expectAll(
      [
        "sleep 5 &",
        "sleep $(cat x)",
        "sleep x",
        "pgrep -F /tmp/pidfile",
        "pgrep --signal KILL node",
        "pkill node",
        "kill 1",
      ],
      "not-allow",
    );
  });
});

describe("wrappers are the command they run", () => {
  it("timeout, nice, stdbuf and env CMD around a read-only command", async () => {
    await expectAll(
      [
        "timeout 10 grep -rn a src",
        "timeout -s KILL -k 2 5 cat src/a.cpp",
        "timeout --preserve-status 1.5 ls",
        "nice -n 10 wc -l src/a.cpp",
        "nice ls",
        "stdbuf -oL grep a src/a.cpp",
        "env cat src/a.cpp",
        "timeout 5 nice -n 5 head src/a.cpp",
      ],
      "allow",
    );
    await expectAll(
      [
        "timeout 5 cat ~/.ssh/id_rsa",
        "env cat ~/.aws/credentials",
        "nice cat ~/.ssh/id_rsa",
        "timeout 10 git status",
        "timeout 10 find . -exec cat {} ;",
        "timeout 10 xargs cat",
        "timeout 5 sh -c 'ls'",
        "timeout 5 rm -rf src",
        "nice -n 5 rm -rf src",
        "env FOO=1 cat src/a.cpp",
        "env -i ls",
        "env -u HOME ls",
        "timeout --foo 5 ls",
        "timeout ls",
        "stdbuf -x ls",
        "nohup ls",
        // (`time ls` is the shell's reserved word around a read-only command: read-only, ./command-classes.test.ts.)
        "time -x ls",
      ],
      "not-allow",
    );
  });
});

describe("expansions whose value the kit knows, or that only print", () => {
  it("${NAME:-WORD}, NAME=$(...) read as unknown, export NAME=VALUE", async () => {
    await expectAll(
      [
        "echo ${HOME:-/x}",
        "cat ${MISSING:-src/a.cpp}",
        "ls ${S:-.}",
        'S=src && ls "${S:-.}"',
        'X=$(git rev-parse HEAD) && echo "$X"',
        'N=$(wc -l < src/a.cpp) && echo "lines $N"',
        "export S=src && ls $S",
        "export A=src B=paper.pdf && ls $A $B",
      ],
      "allow",
    );
    await expectAll(
      [
        "echo ${AWS_SECRET_ACCESS_KEY:-x}",
        "cat ${HOME:-/x}/.ssh/id_rsa",
        "ls ${S:-a b}",
        "ls ${S:-$(id)}",
        "X=$(ls src) && cat $X",
        "X=$(cat ~/.ssh/id_rsa) && echo $X",
        "X=$(ls) cat a",
        'd="$(date -s 2020-01-01)" && echo $d',
        'd="$(date +%a)" && mkdir -p "$d"',
        "export K=~/.ssh/id_rsa && cat $K",
        "export PATH=/tmp && ls",
        "export LESSOPEN='|x %s' && ls",
        "export GCONV_PATH=. && ls",
        "export LD_PRELOAD=x.so && ls",
        "export RIPGREP_CONFIG_PATH=x && ls",
        "export TOOL_CONFIG=x && ls",
        "export FOO && ls",
        "export -n FOO && ls",
        "export AWS_SECRET_ACCESS_KEY=y && ls",
      ],
      "not-allow",
    );
  });
});

describe("xargs over exactly the files a find lists", () => {
  it("find ... -print0 | xargs -0 READER checks every listed file", async () => {
    await expectAll(
      [
        "find src -name '*.cpp' -print0 | xargs -0 grep -n a",
        "find src -type f -print0 | xargs -0 head -3",
        "find . -name '*.pdf' -print0 | xargs -0 wc -c",
      ],
      "allow",
    );
    await expectAll(
      [
        "find ~ -name id_rsa -print0 | xargs -0 head",
        "find ~/.ssh -print0 | xargs -0 grep -n x",
        "find src -name '*.cpp' | xargs grep -n a",
        "find src -print0 | xargs -0 -d x grep a",
        "find src -print0 | xargs -0 cat",
        "find src -print0 | xargs -0 sed -i s/a/b/",
        "find -L src -print0 | xargs -0 grep a",
        "ls -1 | xargs -0 grep a",
        "find src -print0 | sort -z | xargs -0 grep a",
      ],
      "not-allow",
    );
  });
});

describe("PDF inspection and converters", () => {
  it("read-only forms print; an output file is decided as the equivalent Write", async () => {
    await expectAll(
      [
        "pdfinfo paper.pdf",
        "pdfinfo -f 1 -l 1 -box paper.pdf",
        "pdfimages -list paper.pdf",
        "pdftotext paper.pdf -",
        "pdftotext -layout -f 1 -l 1 paper.pdf - | head",
        "mutool show paper.pdf trailer",
        "mutool info -F paper.pdf",
        "mutool pages paper.pdf 1",
      ],
      "allow",
    );
    const o = opts();
    for (const text of [
      "pdftotext -layout paper.pdf out.txt",
      "pdftotext paper.pdf",
      "pdftoppm -png -r 50 -f 1 -l 1 -singlefile paper.pdf page1",
      "mutool draw -o p1.png -r 50 paper.pdf 1",
    ]) {
      const d = await decide(text, o);
      expect(d.outcome, `${text}: ${d.reason}`).toBe("allow");
      expect(d.codes, text).toContain("redirect-write");
    }
    await expectAll(
      [
        "pdftotext paper.pdf .envrc",
        "pdftotext paper.pdf .git/config",
        "pdftotext ~/.ssh/id_rsa -",
        "pdftotext -foo paper.pdf x.txt",
        "pdftoppm -png paper.pdf pg",
        "pdfimages paper.pdf img",
        "mutool draw -o p%d.png paper.pdf",
        "mutool draw paper.pdf",
        "mutool run x.js",
        "mutool show -o out.txt paper.pdf trailer",
        "mutool clean paper.pdf out.pdf",
        "mutool convert -o .mcp.json paper.pdf",
      ],
      "not-allow",
    );
  });
});

describe("classifyCompound", () => {
  it("a wrapped command keeps its git-free classification; nested wrappers too", () => {
    const ctx = { cwd: proj, home, env: { PATH: "/usr/bin" } };
    expect(classifyCompound("timeout 5 nice -n 3 grep a src/a.cpp", ctx).readOnly).toBe(true);
    expect(classifyCompound("timeout 5 git log", ctx).readOnly).toBe(false);
    expect(classifyCompound("env env cat x", ctx).readOnly).toBe(true);
  });
});
