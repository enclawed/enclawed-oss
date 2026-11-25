// The strict read-only shell allowlist (ported from codenclawed's
// shell-readonly.mjs with its tests: shell.test.mjs, regressions F1 and R1),
// and its use as the engine's default classifier.

import { describe, expect, it } from "vitest";
import {
  abbreviatesRefused,
  classifyPowerShellCommand,
  classifyShellCommand,
  splitSimpleCommand,
  strictShellClassifier,
} from "./shell-readonly.js";

// False positives: ordinary read-only commands must run without a prompt.
const READ_ONLY = [
  "ls -la",
  "ls",
  "pwd",
  "cat README.md",
  "head -n 20 src/a.ts",
  "tail -n 5 'log file.txt'",
  'grep -rn "TODO" src',
  "rg -n foo src",
  "wc -l *.ts",
  "find . -name '*.ts' -type f",
  "git status",
  "git -C sub log --oneline -5",
  "git diff HEAD~1",
  "git --no-pager show HEAD",
  "git branch -a",
  "git config --get user.name",
  "git stash list",
  "node --version",
  "date +%Y-%m-%d",
  "env",
  "sort -n numbers.txt",
  "uniq data.txt",
  "command -v node",
  "stat -c %s file",
  "git cat-file -p HEAD:a.txt",
  "git cat-file blob HEAD:a.txt",
  "git cat-file -t HEAD",
  "git log --text",
  "git rev-parse --show-toplevel",
  "git ls-files --others",
  "git describe --tags",
  "jq -r .name package.json",
  "jq --arg x 1 .a f.json",
  "du -sh src",
  "ls --color=auto",
];

// Attacks: each is not read-only, with its reason code.
const NOT_READ_ONLY: ReadonlyArray<readonly [string, string]> = [
  ["rm -rf /", "command-not-allowlisted"],
  ["ls | sh", "shell-metacharacter"],
  ["cat a > b", "shell-metacharacter"],
  ["cat a >> b", "shell-metacharacter"],
  ["ls; rm x", "shell-metacharacter"],
  ["ls && rm x", "shell-metacharacter"],
  ["ls || rm x", "shell-metacharacter"],
  ["echo $(rm x)", "shell-metacharacter"],
  ["echo `rm x`", "shell-metacharacter"],
  ['echo "$(rm x)"', "shell-expansion"],
  ["echo $HOME", "shell-metacharacter"],
  ["cat < /etc/passwd", "shell-metacharacter"],
  ["(rm x)", "shell-metacharacter"],
  ["ls & rm x", "shell-metacharacter"],
  ["ls\nrm x", "shell-metacharacter"],
  ["cat a\\ b", "shell-metacharacter"],
  ["FOO=1 ls", "env-assignment"],
  ["find . -delete", "argument-not-read-only"],
  ["find . -exec rm {} ;", "shell-metacharacter"],
  ["find . -exec rm x", "argument-not-read-only"],
  ["sort -o out.txt in.txt", "argument-not-read-only"],
  ["uniq in out", "argument-not-read-only"],
  ["git push", "argument-not-read-only"],
  ["git commit -m x", "argument-not-read-only"],
  ["git -c core.pager=sh log", "argument-not-read-only"],
  ["git log --output=x", "argument-not-read-only"],
  ["git branch -D main", "argument-not-read-only"],
  ["git config user.name x", "argument-not-read-only"],
  ["env rm x", "argument-not-read-only"],
  ["date -s 2020-01-01", "argument-not-read-only"],
  ["hostname evil", "argument-not-read-only"],
  ["rg --pre sh foo", "argument-not-read-only"],
  ["node script.js", "argument-not-read-only"],
  ["./ls", "command-not-allowlisted"],
  ["/bin/rm -rf x", "command-not-allowlisted"],
  ["sed -i s/a/b/ f", "command-not-allowlisted"],
  ["awk 'BEGIN{system(\"rm x\")}'", "command-not-allowlisted"],
  ["curl https://example.com", "command-not-allowlisted"],
  ["'unterminated", "unbalanced-quote"],
  ["", "no-command"],
  ["ls !x", "shell-metacharacter"],
  ["ls # comment", "shell-metacharacter"],
  ["echo {a,b}", "shell-metacharacter"],
];

describe("strict read-only shell allowlist", () => {
  it("recognizes ordinary read-only commands (no false positive)", () => {
    for (const cmd of READ_ONLY) {
      expect(classifyShellCommand(cmd).readOnly, cmd).toBe(true);
      expect(strictShellClassifier.classify(cmd, "posix").readOnly, cmd).toBe(true);
    }
  });

  it("refuses everything else, with a reason code", () => {
    for (const [cmd, code] of NOT_READ_ONLY) {
      const v = classifyShellCommand(cmd);
      expect(v.readOnly, cmd).toBe(false);
      expect(!v.readOnly && v.code, cmd).toBe(code);
    }
    expect(classifyShellCommand(undefined).readOnly).toBe(false);
    expect(classifyShellCommand({ cmd: "ls" }).readOnly).toBe(false);
  });

  it("F1: attached option values cannot smuggle an exec or a write through", () => {
    for (const cmd of [
      "git grep -Orm secret",
      "git grep -O/tmp/evil.sh pat",
      "git grep --open=sh pat",
      "tree -oout.txt",
      "date -s2020-01-01",
      "hostname -Fname.txt",
      "sort -oout in",
      "sort --out=x in",
      "git log --out=x",
      "ls --al",
    ]) {
      expect(classifyShellCommand(cmd).readOnly, cmd).toBe(false);
    }
    const v = classifyShellCommand("git grep -Orm secret");
    expect(!v.readOnly && v.detail).toMatch(/option -O/);
  });

  it("R1: git abbreviations of refused options are refused for every allowlisted git subcommand", () => {
    for (const cmd of [
      "git cat-file --te HEAD:a.txt",
      "git cat-file --fi HEAD:a.txt",
      "git cat-file --t HEAD:a.txt",
      "git cat-file --textconv HEAD:a.txt",
      "git cat-file --batch",
      "git cat-file --ba",
      "git cat-file --path=a.txt HEAD",
      "git rev-parse --ou=/tmp/x",
      "git ls-files --e",
      "git ls-tree --fi HEAD",
      "git reflog show --ext",
      "git grep --textc foo",
      "git log --te",
      "git rev-list --no-",
    ]) {
      expect(classifyShellCommand(cmd).readOnly, cmd).toBe(false);
    }
    expect(abbreviatesRefused("t")).toBe("textconv");
    expect(abbreviatesRefused("text", new Set(["text"]))).toBeNull();
  });

  it("reports the git -C directories (the engine checks that repository's config)", () => {
    const v = strictShellClassifier.classify("git -C a -C b log", "posix");
    expect(v.readOnly && v.git?.cdirs).toEqual(["a", "b"]);
    expect(strictShellClassifier.classify("ls", "posix")).toEqual({ readOnly: true });
  });

  it("quoting keeps metacharacters literal only inside single quotes", () => {
    expect(splitSimpleCommand("grep 'a|b;c' f")).toEqual({
      ok: true,
      argv: ["grep", "a|b;c", "f"],
    });
    expect(splitSimpleCommand('grep "a`b" f').ok).toBe(false);
  });

  it("PowerShell: a minimal read-only set, one simple command", () => {
    expect(classifyPowerShellCommand("Get-ChildItem -Recurse").readOnly).toBe(true);
    expect(classifyPowerShellCommand("Get-Content a.txt").readOnly).toBe(true);
    expect(classifyPowerShellCommand("Remove-Item a.txt").readOnly).toBe(false);
    expect(classifyPowerShellCommand("Get-Content a | Out-File b").readOnly).toBe(false);
    expect(classifyPowerShellCommand("gc $env:SECRET").readOnly).toBe(false);
    expect(strictShellClassifier.classify("Get-Content a.txt", "powershell").readOnly).toBe(true);
    expect(strictShellClassifier.classify("Remove-Item a.txt", "powershell").readOnly).toBe(false);
  });
});
