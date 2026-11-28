// The classes of standard Unix commands (docs/security/command-classes.md):
// host read-only, reversible project writes run contained with history,
// contained runners, and the irreversible-consequential forms a person
// decides; privilege escalation is denied; redirections to the console or to
// new files need nobody, overwriting a file outside what history keeps asks.

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
import { escalationIn } from "./privilege.js";
import { parseCompound } from "./shell-compound.js";
import { resolveShellDefinitions, NO_SHELL_DEFINITIONS } from "./shell-definitions.js";
import { classifyArgv } from "./shell-readonly.js";
import type { PreActionEvent } from "./types.js";

let root: string;
let proj: string;
let home: string;
let outside: string;

function git(cwd: string, ...args: string[]) {
  const r = spawnSync(
    "git",
    [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.invalid",
      "-c",
      "init.defaultBranch=main",
      "-c",
      "core.hooksPath=/dev/null",
      ...args,
    ],
    { cwd, encoding: "utf8", env: { PATH: process.env.PATH, HOME: cwd, GIT_CONFIG_NOSYSTEM: "1" } },
  );
  expect(r.status, r.stderr).toBe(0);
}
const put = (rel: string, s: string, base = proj) => {
  fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
  fs.writeFileSync(path.join(base, rel), s);
};

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-command-classes-")));
  proj = path.join(root, "proj");
  home = path.join(root, "home");
  outside = path.join(root, "outside");
  put("README.md", "# readme\n");
  put("src/a.txt", "a\n");
  put("src/b.txt", "b\n");
  put("data.csv", "x,y\n1,2\n");
  put(".gitignore", "local.db\n");
  git(proj, "init", "-q");
  git(proj, "add", "-A");
  git(proj, "commit", "-q", "-m", "initial");
  put("local.db", "precious rows\n");
  put("notes.txt", "untracked notes\n");
  put(".ssh/id_ed25519", "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n", home);
  put("existing.txt", "outside\n", outside);
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
    containScripts: async (req) => ({ ok: true, command: `ENCLAWED_CONTAIN=test ${req.command}` }),
    ...extra,
  };
}
const sh = (text: string): PreActionEvent => ({
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
});
const decide = (text: string, o = opts()) => decidePreAction(sh(text), o);

describe("class (a): host read-only", () => {
  it("text, number and system readers run with no person", async () => {
    for (const text of [
      "seq 1 10",
      "seq -w 5",
      "expr 3 + 4",
      "yes | head -3",
      "factor 12",
      "tac README.md",
      "rev README.md",
      "expand -t 4 README.md",
      "unexpand -a README.md",
      "fold -w 40 README.md",
      "fmt -w 60 README.md",
      "column -t -s, data.csv",
      "paste -sd, data.csv",
      "join -t, data.csv data.csv",
      "strings -n 8 README.md",
      "base64 README.md",
      "base64 -d README.md",
      "base32 README.md",
      "sum README.md",
      "tty",
      "logname",
      "who -b",
      "top -b -n 1",
      "top -bn1",
      "ss -ltnp",
      "findmnt -n -o TARGET",
      "bc -l",
      "sed 's/a/b/g' README.md",
      "grep x README.md | sed 's|x|y|' | head",
      "time ls",
      "time (ls; pwd)",
      "until true; do sleep 1; done; cat README.md",
      "while false; do ls; done",
      "systemctl --user status --no-pager",
      "journalctl --user -n 5 --no-pager",
      "kpsewhich article.cls",
    ]) {
      const d = await decide(text);
      expect(d.outcome, text).toBe("allow");
      expect(d.codes, text).toEqual(["read-only-command"]);
    }
  });

  it("an option that writes, runs a program, waits on input forever or kills is not read-only", () => {
    for (const argv of [
      ["top"],
      ["top", "-n", "1"],
      ["ss", "-K", "dst", "1.2.3.4"],
      ["ss", "-D", "out.bin"],
      ["ss", "-N", "other", "-l"],
      ["strings", "@opts"],
      ["base64", "in", "out"],
      ["tac", "--output=x"],
      ["column", "--bogus"],
      ["systemctl", "show", "x"],
      ["systemctl", "restart", "x"],
      ["journalctl", "--vacuum-size=1M"],
      ["journalctl", "--rotate"],
      ["kpsewhich", "-must-exist", "x.tfm"],
      ["sed", "s/a/b/e"],
      ["sed", "s/a/b/w", "out"],
    ]) {
      expect(classifyArgv(argv).readOnly, argv.join(" ")).toBe(false);
    }
  });

  it("the owner's disk-usage line, a brace group of du/echo/ls over patterns, asks nothing", async () => {
    const text =
      "{ du -xs /tmp/* /tmp/.[!.]* 2>/dev/null; echo ---; du -xsc /tmp/claude-1000/isohome.* 2>/dev/null | tail -1; ls -d /tmp/claude-1000/isohome.* | wc -l; }";
    const d = await decide(text);
    expect(d.outcome).toBe("allow");
    expect(d.codes).toEqual(["read-only-command"]);
  });

  it("metadata readers name credential paths without a prompt; content readers still ask", async () => {
    for (const text of [
      `du -s ${home}/.ssh`,
      `ls -la ${home}/.ssh`,
      `stat ${home}/.ssh/id_ed25519`,
      `realpath ${home}/.ssh/id_ed25519`,
      `readlink -f ${home}/.ssh/id_ed25519`,
      `basename ${home}/.ssh/id_ed25519`,
      `df -h ${home}/.ssh`,
      `{ du -s ${home}/.ssh/*; ls ${home}/.ssh; }`,
    ]) {
      expect((await decide(text)).outcome, text).toBe("allow");
    }
    for (const text of [
      `cat ${home}/.ssh/id_ed25519`,
      `tac ${home}/.ssh/id_ed25519`,
      `strings ${home}/.ssh/id_ed25519`,
      `base64 ${home}/.ssh/id_ed25519`,
      `{ cat ${home}/.ssh/id_ed25519; }`,
      `{ cd ${home}/.ssh; cat id_ed25519; }`,
    ]) {
      const d = await decide(text);
      expect(d.outcome, text).toBe("ask");
      expect(d.codes, text).toEqual(["credential-path"]);
    }
  });
});

describe("brace groups", () => {
  it("are read like the shell: their cd reaches what follows, not after a pipe", () => {
    const ctx = { cwd: proj, home };
    const p = parseCompound("{ cd src; ls; }; cat a.txt", ctx, { fileRedirects: true });
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.commands.map((c) => [c.argv[0], c.cwd])).toEqual([
        ["cd", proj],
        ["ls", path.join(proj, "src")],
        ["cat", path.join(proj, "src")],
      ]);
    }
    const piped = parseCompound("{ cd src; ls; } | cat; cat a.txt", ctx, { fileRedirects: true });
    expect(piped.ok).toBe(true);
    if (piped.ok) {
      expect(piped.commands[piped.commands.length - 1].cwd).toBe(proj);
    }
    for (const text of ["ls | { head; }", "{ ls }", "{ ls; } > out.txt", "{ ls; "]) {
      expect(parseCompound(text, ctx, { fileRedirects: true }).ok, text).toBe(false);
    }
    // `{` and `}` as arguments are text.
    const echo = parseCompound("echo { }", ctx, { fileRedirects: true });
    expect(echo.ok && echo.commands[0].argv).toEqual(["echo", "{", "}"]);
  });
});

describe("class (b): reversible project writes, contained with history", () => {
  it("mkdir, touch, cp, mv, ln -s, chmod, truncate, compressors and dos2unix in the project need no person", async () => {
    for (const text of [
      "mkdir -p build/out",
      "touch new.txt",
      "cp README.md copy.md",
      "mv src/a.txt src/c.txt",
      "mv notes.txt notes-old.txt",
      "mv src moved",
      "ln -s README.md readme-link",
      "touch run-new.sh && chmod u+x run-new.sh",
      "touch run-new2.sh && chmod 755 run-new2.sh",
      "truncate -s 0 README.md",
      "gzip README.md",
      "gzip -k notes.txt",
      "bzip2 -k data.csv",
      "xz -k data.csv",
      "zstd data.csv",
      "dos2unix README.md",
      "tar czf src.tgz src README.md",
      "rm README.md",
      "rm -r src",
    ]) {
      const d = await decide(text);
      expect(d.outcome, text).toBe("allow");
      expect(d.codes, text).toEqual(["contained-execution"]);
      expect(d.contain, text).toBeTruthy();
    }
  });

  it("deleting what git does not keep, writing outside the project, hard links and exec-config ask", async () => {
    for (const text of [
      // Untracked user data: nothing outside this machine holds it.
      "rm local.db",
      "rm -f notes.txt",
      "gzip -d local.db.gz",
      `mv README.md ${outside}/r.md`,
      `cp README.md ${outside}/r.md`,
      `chmod 600 ${outside}/existing.txt`,
      // An existing file's mode is kept by no history; set-ID, sticky and group/other write never.
      "chmod 644 README.md",
      "chmod +x src/a.txt",
      "touch n.sh && chmod 4755 n.sh",
      "touch n.sh && chmod 775 n.sh",
      "touch n.sh && chmod g+w n.sh",
      "touch n.sh && chmod +w n.sh",
      "touch n.sh && chmod u+s n.sh",
      "chown u README.md",
      "ln README.md hard-link",
      "mv README.md .git/hooks/pre-commit",
      "ln -s /bin/sh .git/hooks/pre-commit",
      "rm .gitignore -f && rm -rf .git",
      "truncate README.md",
      "gzip -r src",
      "tar xzf src.tgz",
      "tar -I zstd -cf a.tar README.md",
      "tar --to-command=sh -cf a.tar README.md",
      "tar czhf a.tgz src",
      "tar czf host:/a.tgz README.md",
      `tar czf a.tgz ${home}`,
    ]) {
      expect((await decide(text)).outcome, text).not.toBe("allow");
    }
  });
});

describe("chmod of a file that existed before the line", () => {
  it("runs contained only for a file this session created, named to the containment; any other asks", async () => {
    const o = opts();
    const w = await decidePreAction(
      {
        type: "pre-action",
        actor: { sessionId: "s", subagentId: null },
        callId: `w${n++}`,
        tool: "Write",
        policyIds: ["write"],
        kind: "fs-write",
        params: { file_path: path.join(proj, "made.sh") },
        cwd: proj,
        writes: [{ path: path.join(proj, "made.sh"), op: "write" }],
        approvalRoute: "person",
        hostMode: "default",
      },
      o,
    );
    expect(w.outcome).toBe("allow");
    put("made.sh", "#!/bin/sh\necho made\n");
    const d = await decide("chmod +x made.sh && sh made.sh", o);
    expect(d.outcome, d.reason).toBe("allow");
    expect(d.contain?.code?.modeChanges).toEqual([path.join(proj, "made.sh")]);
    const other = await decide("chmod +x README.md && sh made.sh", o);
    expect(other.outcome).not.toBe("allow");
    fs.rmSync(path.join(proj, "made.sh"));
  });
});

describe("file operations in the session's scratch directory", () => {
  it("run on the host with no person; anything else on the line, or a route out of scratch, does not", async () => {
    const scratch = path.join(root, "scratch");
    fs.mkdirSync(path.join(scratch, "old"), { recursive: true });
    fs.writeFileSync(path.join(scratch, "f.txt"), "x\n");
    fs.writeFileSync(path.join(scratch, "old", "g.txt"), "y\n");
    const policy = createPolicy({
      enforceAllowlists: false,
      maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
      defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
      scratchPaths: [scratch],
    });
    const o = () => opts({ policy });
    for (const text of [
      `mkdir -p ${scratch}/a/b`,
      `cp README.md ${scratch}/`,
      `cp ${scratch}/f.txt ${scratch}/h.txt`,
      `rm -rf ${scratch}/old`,
      `rm ${scratch}/f.txt`,
      `mv ${scratch}/f.txt ${scratch}/k.txt`,
      `sed -i s/x/y/ ${scratch}/f.txt`,
      `cd ${scratch} && mkdir -p w && cp f.txt w/`,
      `tar czf ${scratch}/p.tgz README.md`,
    ]) {
      const d = await decide(text, o());
      expect(d.outcome, text).toBe("allow");
      expect(d.codes, text).toEqual(["scratch-file-operations"]);
      expect(d.contain, text).toBeUndefined();
    }
    for (const text of [
      `mkdir -p ${scratch}/y && node -e 1`,
      `ln -s /etc ${scratch}/etc && cp README.md ${scratch}/etc/x`,
      `cp README.md ${scratch}/../escape.txt`,
      `rm -rf /tmp/zz-not-scratch ${scratch}/old`,
      `cp ${home}/.ssh/id_ed25519 ${scratch}/k`,
      `cp /etc/hostname ${scratch}/`,
      "rm local.db",
    ]) {
      const d = await decide(text, o());
      expect(d.codes, text).not.toContain("scratch-file-operations");
      expect(d.outcome === "allow" && !d.contain, text).toBe(false);
    }
  });
});

describe("class (d): privilege escalation is denied", () => {
  it("sudo, su, doas, pkexec, run0 and the account helpers, through every wrapper", async () => {
    for (const text of [
      "sudo ls",
      "sudo -n true",
      "/usr/bin/sudo id",
      "sudoedit /etc/hosts",
      "su -c id",
      "su - root",
      "doas id",
      "pkexec ls",
      "run0 ls",
      "sg docker -c id",
      "newgrp docker",
      "passwd",
      "chsh -s /bin/sh",
      "chfn -f x",
      "gpasswd -a u docker",
      "machinectl shell root@",
      "systemd-run ls",
      "systemd-run --user --uid=0 ls",
      "env sudo ls",
      "env -u X sudo ls",
      "nohup sudo ls &",
      "timeout 5 sudo ls",
      "nice -n 5 sudo ls",
      "xargs sudo rm < list.txt",
      "xargs -I{} sudo rm {} < list.txt",
      "find . -name x -exec sudo rm {} \\;",
      "find . -execdir doas rm {} +",
      'sh -c "sudo id"',
      "bash -lc 'doas id'",
      "ls && sudo rm -rf /var/x",
      "echo $(sudo cat /etc/shadow)",
      "sudo printenv",
      `sudo cat ${home}/.ssh/id_ed25519`,
      "FOO=1 sudo ls",
      "command sudo ls",
      "exec sudo ls",
      "stdbuf -o0 sudo ls",
    ]) {
      const d = await decide(text);
      expect(d.outcome, text).toBe("deny");
      expect(d.codes, text).toEqual(["privilege-escalation"]);
      expect(d.reason, text).toMatch(/run it yourself in your own terminal/);
    }
  });

  it("an alias of the shell that stands for sudo is sudo", async () => {
    const defs = resolveShellDefinitions({ aliases: { please: "sudo" }, functions: [] }, {});
    expect(escalationIn("please ls", defs)?.program).toBe("sudo");
    const d = await decide(
      "please ls",
      opts({ shellDefinitions: { aliases: { please: "sudo" }, functions: [] } }),
    );
    expect(d.outcome).toBe("deny");
  });

  it("naming sudo as data is not escalation", async () => {
    for (const text of [
      "command -v sudo",
      "which sudo",
      "grep sudo README.md",
      'echo "run sudo yourself"',
      "ls /etc/sudoers.d",
      "systemd-run --user ls",
    ]) {
      expect(escalationIn(text), text).toBeNull();
    }
    expect((await decide("which sudo")).outcome).toBe("allow");
  });
});

describe("redirections", () => {
  it("to the console or to a new file need nobody; to the person's terminal, other descriptors or /proc ask", async () => {
    for (const text of [
      "ls >/dev/stdout",
      "ls 2>/dev/stderr",
      "ls >/dev/fd/1 2>/dev/fd/2",
      "ls > /dev/null 2>&1",
      "ls >| /dev/stdout",
    ]) {
      const d = await decide(text);
      expect(d.outcome, text).toBe("allow");
      expect(d.codes, text).toEqual(["read-only-command"]);
    }
    for (const text of [
      "echo hi > brand-new.txt",
      "echo hi >> brand-new2.txt",
      "ls &> brand-new3.txt",
    ]) {
      const d = await decide(text);
      expect(d.outcome, text).toBe("allow");
      expect(d.codes, text).toContain("redirect-write");
      expect(d.exclusiveCreate, text).toBe(true);
    }
    // Run by the host with noclobber: a file that appears before it runs is not overwritten.
    const { DecisionEngine } = await import("./engine.js");
    const r = await new DecisionEngine(opts()).preAction(sh("echo hi > brand-new4.txt"));
    expect(r.answer).toBe("allow");
    expect(r.rewrite?.command).toBe("set -C; echo hi > brand-new4.txt");
    const bash = spawnSync(
      "bash",
      [
        "-c",
        `cd ${JSON.stringify(proj)} && echo keep > raced.txt && ${r.rewrite?.command.replace("brand-new4", "raced")}`,
      ],
      { encoding: "utf8" },
    );
    expect(bash.status).not.toBe(0);
    expect(fs.readFileSync(path.join(proj, "raced.txt"), "utf8")).toBe("keep\n");
    fs.rmSync(path.join(proj, "raced.txt"));
    // A new file in the system's temporary directory is created exclusively too.
    const tmpNew = await decide(`echo hi > ${root}/tmp-new-file.txt`);
    expect(tmpNew.outcome).toBe("allow");
    expect(tmpNew.exclusiveCreate).toBe(true);
    // An overwrite (history keeps the old content) runs as written.
    const over = await decide("echo hi > README.md");
    expect(over.outcome).toBe("allow");
    expect(over.exclusiveCreate).toBeUndefined();
    for (const text of [
      "ls >/dev/tty",
      "ls >/dev/fd/3",
      "ls >/proc/self/fd/1",
      `ls > ${outside}/existing.txt`,
      `ls >> ${outside}/existing.txt`,
      `ls | tee ${outside}/existing.txt`,
      "echo hi > notes.txt",
      "ls > *.txt",
      'ls > "$X"',
      "exec > out.log",
      "ls <> rw.txt",
      "{ ls; } > grouped.txt",
    ]) {
      expect((await decide(text)).outcome, text).not.toBe("allow");
    }
  });

  it("a target from a variable or a pattern is refused (the line's own variables included)", () => {
    for (const text of [
      "f=out.txt; echo hi > $f",
      "f=$(date); echo hi > $f",
      "if true; then f=x.txt; fi; echo hi > $f",
      "echo hi > *.txt",
      "echo hi > out.{a,b}",
    ]) {
      expect(parseCompound(text, { cwd: proj, home }, { fileRedirects: true }).ok, text).toBe(
        false,
      );
    }
  });

  it("a here-string is the command's input, not a file", async () => {
    for (const text of [
      "cat <<< hello",
      "bc <<< '1+2'",
      'wc -l <<< "a b"',
      "jq . <<< '{\"a\":1}'",
    ]) {
      const d = await decide(text);
      expect(d.outcome, text).toBe("allow");
    }
    const p = parseCompound("cat <<< 'x y'", { cwd: proj, home }, { fileRedirects: true });
    expect(p.ok && p.commands[0].stdin).toBe("x y\n");
    expect((await decide("bash <<< 'rm -rf /'")).outcome).not.toBe("allow");
  });
});
